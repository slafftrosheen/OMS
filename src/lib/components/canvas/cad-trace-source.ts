import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { mapContours } from './cad-curves';
import { assertCadEditable, makeCadPlan } from './cad-plans';
import type { CadSettings } from './cad-settings';
import { validVectorPaint, vectorPaint, type VectorDocument } from './cad-vector';

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

/** Trace geometry is in working-image pixels. Map anchors and Bézier handles
 * together to the exact source placement; page-root output inherits the full
 * source/group opacity because it no longer lives inside those groups. */
export function prepareSelectedRasterTracePlan(editor: Editor, settings: CadSettings, doc: VectorDocument, replace: boolean) {
  const { source, rasterPaint, opacity } = selectedRasterTraceSource(editor);
  if (![doc.width, doc.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('geometry');
  const transform = editor.getShapePageTransform(source), raster = rasterPaint?.raster;
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
        return transform.applyToPoint({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
      }
      return transform.applyToPoint({
        x: (((source.props as any).flipX ? doc.width - q.x : q.x) / doc.width) * (source.props as any).w,
        y: (((source.props as any).flipY ? doc.height - q.y : q.y) / doc.height) * (source.props as any).h,
      });
    }),
    paint: { ...p.paint, fillOpacity: p.paint.fillOpacity * opacity * (rasterPaint?.fillOpacity ?? 1),
      strokeOpacity: p.paint.strokeOpacity * opacity,
      ...(rasterPaint ? { clips: [...(rasterPaint.clips ?? []), ...(originalBoundary ? [] : [{ contours: boundary, fillRule: (source.props as any).fillRule }])]
        .map(c => ({ ...c, contours: mapContours(c.contours, q => transform.applyToPoint(q)) })) } : {}) },
  }));
  if (paths.some(p => !validVectorPaint(p.paint))) throw new Error('limit');
  return makeCadPlan(editor, settings, paths.flatMap(p => p.contours), {
    name: 'Trace', sourceIds: [source.id], removeIds: replace ? [source.id] : [], warnings: doc.warnings,
    shapes: paths.map((p, i) => ({ type: 'cad-bezier', x: 0, y: 0,
      props: { contours: p.contours, fillRule: p.fillRule }, meta: { omsObjectName: `Trace · ${i + 1}`, omsVectorPaint: p.paint } })),
  });
}
