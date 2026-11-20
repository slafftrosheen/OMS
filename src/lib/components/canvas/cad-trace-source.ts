import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { mapContours } from './cad-curves';
import { assertCadEditable, makeCadPlan } from './cad-plans';
import { cadMmPerPixel, type CadPoint, type CadSettings } from './cad-settings';
import { prepareVectorImport, validVectorPaint, vectorPaint, type VectorDocument } from './cad-vector';
import { transformAppearance, validRasterReference } from './cad-appearance';
import { safeCanvasDocumentUrl } from './toolkit-media-url';
import { drawingObjectName } from './drawing-operations';

export type TraceResolution = 1024 | 2048;
export interface DecodedTraceRaster {
  image: ImageData;
  preview: string;
  originalWidth: number;
  originalHeight: number;
  reduced: boolean;
}
export const MAX_TRACE_FILE_BYTES = 12 * 1024 * 1024;

/** Decode once into the explicit working resolution. The preview and worker
 * receive the same pixels; original dimensions remain visible to the user. */
export async function decodeTraceRaster(blob: Blob, resolution: TraceResolution, signal: AbortSignal): Promise<DecodedTraceRaster> {
  if (signal.aborted) throw new Error('cancelled');
  if (![1024, 2048].includes(resolution) || blob.size > MAX_TRACE_FILE_BYTES ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('limit');
  const bitmap = await createImageBitmap(blob).catch(() => { throw new Error('image'); });
  try {
    if (signal.aborted) throw new Error('cancelled');
    if (![bitmap.width, bitmap.height].every(n => Number.isSafeInteger(n) && n > 0) || bitmap.width * bitmap.height > 50e6) throw new Error('limit');
    const scale = Math.min(1, resolution / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('image');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (signal.aborted) throw new Error('cancelled');
    return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), preview: canvas.toDataURL('image/png'),
      originalWidth: bitmap.width, originalHeight: bitmap.height, reduced: scale < 1 };
  } finally { bitmap.close(); }
}

export function selectedRasterTraceSource(editor: Editor) {
  const source = editor.getOnlySelectedShape();
  const rasterPaint = source?.type === 'cad-bezier' ? vectorPaint(source.meta) : undefined;
  if (!source || (source.type !== 'image' && !rasterPaint?.raster) || (source.props as any).crop || editor.getShapeMask(source.id)) throw new Error('image');
  assertCadEditable(editor, [source.id]);
  if (rasterPaint?.raster?.repeat) throw new Error('trace-repeat');
  let opacity = source.opacity, parentId = source.parentId;
  const seen = new Set<string>([source.id]);
  while (parentId !== editor.getCurrentPageId()) {
    const parent = editor.getShape(parentId as TLShapeId);
    if (!parent || seen.has(parent.id)) throw new Error('image');
    seen.add(parent.id); opacity *= parent.opacity; parentId = parent.parentId;
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('image');
  return { source, rasterPaint, opacity };
}

/** Attachment cards are a file reference, not an image-sized drawing object.
 * Their header, crop, frame mask and display opacity never enter the trace. */
export function selectedAttachedRasterTraceSource(editor: Editor) {
  const source = editor.getOnlySelectedShape(), props = source?.props as Record<string, unknown> | undefined;
  if (source?.type !== 'document' || props?.kind !== 'image' ||
      props.mime && !['image/png', 'image/jpeg', 'image/webp'].includes(String(props.mime))) throw new Error('trace-attachment');
  assertCadEditable(editor, [source.id]);
  const url = safeCanvasDocumentUrl(props.url) ?? (validRasterReference(props.url, props.fileId) ? String(props.url) : null);
  if (!url) throw new Error('trace-attachment');
  return { source, url, name: drawingObjectName(source) };
}

type OriginalTraceSize = Pick<DecodedTraceRaster, 'originalWidth' | 'originalHeight'>;
/** The integer working size can distort very thin images. Restore the original
 * pixel frame only for placement, leaving worker/review pixels untouched. */
function traceAtOriginalSize(doc: VectorDocument, original: OriginalTraceSize): VectorDocument {
  const { originalWidth: width, originalHeight: height } = original;
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || width * height > 50e6 ||
      ![doc.width, doc.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 2048)) throw new Error('geometry');
  const sx = width / doc.width, sy = height / doc.height;
  return { ...doc, width, height, warnings: [...doc.warnings], paths: doc.paths.map(path => ({ ...path,
    contours: mapContours(path.contours, point => ({ x: point.x * sx, y: point.y * sy })),
    paint: transformAppearance(path.paint, [sx, 0, 0, sy, 0, 0]),
  })) };
}

/** widthMm describes the full original image frame, including transparent margin. */
export function prepareRasterTraceFilePlan(editor: Editor, settings: CadSettings, doc: VectorDocument, widthMm: number, name: string, original: OriginalTraceSize) {
  const output = traceAtOriginalSize(doc, original);
  const center = editor.getViewportPageBounds().center, width = widthMm / cadMmPerPixel(settings), height = width * output.height / output.width;
  const plan = prepareVectorImport(editor, settings, output, widthMm, { x: center.x - width / 2, y: center.y - height / 2 }, name);
  return { ...plan, shapes: plan.shapes?.map(shape => ({ ...shape, opacity: 1 })) };
}

export function prepareAttachedRasterTracePlan(editor: Editor, settings: CadSettings, doc: VectorDocument, widthMm: number, original: OriginalTraceSize) {
  const { source, name } = selectedAttachedRasterTraceSource(editor), bounds = editor.getShapePageBounds(source);
  if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite) || bounds.w <= 0 || bounds.h <= 0) throw new Error('geometry');
  const plan = prepareVectorImport(editor, settings, traceAtOriginalSize(doc, original), widthMm, { x: bounds.maxX + 24, y: bounds.minY }, name, [source.id]);
  return { ...plan, shapes: plan.shapes?.map(shape => ({ ...shape, opacity: 1 })) };
}

/** Trace geometry is in working-image pixels. Map anchors and Bézier handles
 * into the original parent. Its opacity and stacking context remain inherited;
 * only the source object's opacity is folded into the new path paint. */
export function prepareSelectedRasterTracePlan(editor: Editor, settings: CadSettings, doc: VectorDocument, replace: boolean) {
  const { source, rasterPaint } = selectedRasterTraceSource(editor), opacity = source.opacity;
  if (![doc.width, doc.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('geometry');
  const transform = editor.getShapePageTransform(source), raster = rasterPaint?.raster;
  const parentInverse = editor.getShapeParentTransform(source)?.clone().invert();
  const place = (point: CadPoint) => {
    const page = transform.applyToPoint(point);
    return parentInverse ? parentInverse.applyToPoint(page) : page;
  };
  const boundary = (source.props as any).contours;
  const corners = raster ? [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => ({
    x: raster.matrix[0] * x + raster.matrix[2] * y + raster.matrix[4],
    y: raster.matrix[1] * x + raster.matrix[3] * y + raster.matrix[5],
  })) : [];
  const originalBoundary = raster && boundary?.length === 1 && boundary[0].closed && boundary[0].nodes.length === 4 &&
    boundary[0].nodes.every((n: any) => !n.inX && !n.inY && !n.outX && !n.outY) &&
    corners.some((_, start) => [1, -1].some(direction => boundary[0].nodes.every((node: any, index: number) => {
      const point = corners[(start + direction * index + 4) % 4];
      return Math.hypot(point.x - node.x, point.y - node.y) < 1e-8;
    })));
  const paths = doc.paths.map(p => ({
    ...p,
    contours: mapContours(p.contours, q => {
      if (raster) {
        const m = raster.matrix, x = q.x / doc.width, y = q.y / doc.height;
        return place({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
      }
      return place({
        x: (((source.props as any).flipX ? doc.width - q.x : q.x) / doc.width) * (source.props as any).w,
        y: (((source.props as any).flipY ? doc.height - q.y : q.y) / doc.height) * (source.props as any).h,
      });
    }),
    paint: { ...p.paint, fillOpacity: p.paint.fillOpacity * opacity * (rasterPaint?.fillOpacity ?? 1),
      strokeOpacity: p.paint.strokeOpacity * opacity,
      ...(rasterPaint ? { clips: [...(rasterPaint.clips ?? []), ...(originalBoundary ? [] : [{ contours: boundary, fillRule: (source.props as any).fillRule }])]
        .map(c => ({ ...c, contours: mapContours(c.contours, place) })) } : {}) },
  }));
  if (paths.some(p => !validVectorPaint(p.paint))) throw new Error('limit');
  return makeCadPlan(editor, settings, paths.flatMap(p => p.contours), {
    name: 'Trace', sourceIds: [source.id], removeIds: replace ? [source.id] : [], warnings: doc.warnings,
    placement: { parentId: source.parentId, aboveId: source.id },
    shapes: paths.map((p, i) => ({ type: 'cad-bezier', x: 0, y: 0, opacity: 1,
      props: { contours: p.contours, fillRule: p.fillRule }, meta: { omsObjectName: `Trace · ${p.paint.fill} · ${i + 1}`, omsVectorPaint: p.paint } })),
  });
}
