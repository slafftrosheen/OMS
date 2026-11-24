import { Box, getSvgAsImage, type Editor } from '@tldraw/tldraw';
import { validRasterReference, type VectorRaster } from './cad-appearance';
import { CAD_APPEARANCE_TYPES, cadShapePaint } from './cad-shape-appearance';
import { cadMmPerPixel, readCadSettings } from './cad-settings';
import { cadRevision } from './cad-plans';
import { drawingPngSize, planDrawingExport, type DrawingExportOptions } from './drawing-operations';
import { readDrawingPageSize } from './drawing-pages';

import { readOriginalDrawingRaster, decodeOriginalDrawingRaster, DRAWING_EXPORT_ASSET_BYTES,
  DRAWING_EXPORT_TOTAL_ASSET_BYTES, DRAWING_EXPORT_TOTAL_ASSET_PIXELS } from './drawing-raster-original';
export { DRAWING_EXPORT_ASSET_BYTES, DRAWING_EXPORT_TOTAL_ASSET_BYTES } from './drawing-raster-original';

function revision(editor: Editor) {
  return JSON.stringify([cadRevision(editor), editor.getAssets()]);
}

async function originalRaster(raster: VectorRaster, signal: AbortSignal, remaining: number, check: () => void) {
  const { blob, bytes } = await readOriginalDrawingRaster(raster, signal, remaining, check);
  // Validate the original before embedding it. Preserve its PNG bytes.
  const bitmap = await decodeOriginalDrawingRaster(blob, raster, check);
  bitmap.close();
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('asset-fetch'));
    reader.onerror = () => reject(new Error('asset-fetch'));
    reader.readAsDataURL(blob);
  });
  check();
  return { data: encoded, bytes };
}

/** Native rendering keeps fonts, masks, opacity and grouping. Only its detached
 * export is hydrated; source records and private asset references stay intact. */
export async function prepareDrawingArtworkSvg(editor: Editor, format: 'svg' | 'png', options: DrawingExportOptions, signal: AbortSignal) {
  const sourceRevision = revision(editor);
  const check = () => {
    if (signal.aborted) throw new Error('cancelled');
    if (revision(editor) !== sourceRevision) throw new Error('stale');
  };
  check();
  const result = planDrawingExport(editor, format, options);
  if (result.ok === false) throw new Error(result.error);
  const plan = result.value, settings = readCadSettings(editor), references = new Map<string, VectorRaster>();
  for (const id of plan.ids) {
    const shape = editor.getShape(id)!;
    const raster = CAD_APPEARANCE_TYPES.has(shape.type) ? cadShapePaint(shape).raster : undefined;
    if (raster?.external) {
      if (!validRasterReference(raster.png, raster.fileId)) throw new Error('asset-fetch');
      const previous = references.get(raster.png);
      if (previous && (previous.width !== raster.width || previous.height !== raster.height)) throw new Error('asset-fetch');
      references.set(raster.png, raster);
    }
    if (shape.type === 'image') {
      const assetId = (shape.props as { assetId: string | null }).assetId;
      if (!assetId || !editor.getAsset(assetId as any)?.props.src) throw new Error('asset-fetch');
    }
  }
  const native = await editor.getSvgString(plan.ids, {
    background: options.background, padding: options.scope === 'page' ? 0 : options.padding, scale: plan.nativeScale,
    bounds: new Box(plan.bounds.x, plan.bounds.y, plan.bounds.w, plan.bounds.h)
  });
  check();
  if (!native) throw new Error('exportFailed');
  const doc = new DOMParser().parseFromString(native.svg, 'image/svg+xml'), root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('exportFailed');
  const cache = new Map<string, string>(), embedded = new Set<string>();
  let totalBytes = 0, pixels = 0;
  for (const image of root.querySelectorAll('image')) {
    const href = image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
    if (href.startsWith('data:image/')) {
      // Native image shapes already inline their originals. Count each unique
      // image once, and reject oversized output before SVG/PNG allocation.
      if (!embedded.has(href)) {
        const comma = href.indexOf(','), base64 = href.slice(0, comma).endsWith(';base64');
        const bytes = base64 ? Math.ceil((href.length - comma - 1) * 3 / 4) : href.length - comma - 1;
        if (comma < 0 || bytes <= 0) throw new Error('asset-fetch');
        totalBytes += bytes; embedded.add(href);
        if (bytes > DRAWING_EXPORT_ASSET_BYTES || totalBytes > DRAWING_EXPORT_TOTAL_ASSET_BYTES) throw new Error('limit');
      }
      continue;
    }
    const raster = references.get(href);
    if (!raster) throw new Error('asset-fetch');
    let data = cache.get(href);
    if (!data) {
      pixels += raster.width * raster.height;
      if (pixels > DRAWING_EXPORT_TOTAL_ASSET_PIXELS) throw new Error('limit');
      const original = await originalRaster(raster, signal, DRAWING_EXPORT_TOTAL_ASSET_BYTES - totalBytes, check);
      data = original.data; totalBytes += original.bytes; cache.set(href, data);
    }
    image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
    image.setAttribute('href', data);
  }
  if (options.scope === 'page') {
    // Keep the trim when the SVG is imported into another vector editor.
    const element = (name: string) => doc.createElementNS(root.namespaceURI, name);
    const defs = Array.from(root.children).find(child => child.localName === 'defs') ?? element('defs');
    if (!defs.parentNode) root.prepend(defs);
    const clip = element('clipPath'), rect = element('rect'), group = element('g');
    clip.setAttribute('id', 'oms-export-page');
    rect.setAttribute('width', String(plan.bounds.w));
    rect.setAttribute('height', String(plan.bounds.h));
    clip.append(rect);
    defs.append(clip);
    group.setAttribute('clip-path', 'url(#oms-export-page)');
    for (const child of Array.from(root.children)) {
      if (child !== defs) group.append(child);
    }
    root.append(group);
  }
  // A calibrated document exports real model-space dimensions. The existing
  // user padding remains canvas-space padding and scales with the artwork.
  // Legacy boards without omsCad, and all PNG output, retain pixel dimensions.
  const pageSize = options.scope === 'page' ? readDrawingPageSize(editor) : null;
  const physical = format === 'svg' && settings ? pageSize ?? {
    widthMm: native.width * cadMmPerPixel(settings), heightMm: native.height * cadMmPerPixel(settings)
  } : undefined;
  if (physical) {
    root.setAttribute('width', `${physical.widthMm}mm`);
    root.setAttribute('height', `${physical.heightMm}mm`);
  }
  check();
  return { svg: new XMLSerializer().serializeToString(root), width: native.width, height: native.height, plan, physical, check };
}

/** Use tldraw's public rasterizer, including its browser canvas limits and PNG
 * resolution metadata. The same hydrated SVG backs download and production. */
export async function exportDrawingArtwork(editor: Editor, format: 'svg' | 'png', options: DrawingExportOptions, signal: AbortSignal) {
  const prepared = await prepareDrawingArtworkSvg(editor, format, options, signal);
  const blob = format === 'svg' ? new Blob([prepared.svg], { type: 'image/svg+xml' }) : await getSvgAsImage(editor, prepared.svg, {
    type: 'png', quality: 1, scale: 2, width: prepared.width, height: prepared.height
  });
  prepared.check();
  if (!blob) throw new Error('exportFailed');
  const output = format === 'png' ? await drawingPngSize(blob) : prepared.plan;
  prepared.check();
  return { blob, plan: prepared.plan, physical: prepared.physical, width: output.width, height: output.height,
    reduced: format === 'png' && (output.width < prepared.plan.width - 1 || output.height < prepared.plan.height - 1) };
}
