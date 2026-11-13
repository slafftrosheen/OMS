import type { Editor, TLShapeId } from '@tldraw/tldraw';
import { curveBounds, mapContours } from './cad-curves';
import { multiplyMatrix, transformAppearance, type VectorMatrix } from './cad-appearance';
import { type VectorPaint, type VectorPath, validVectorPaint } from './cad-paint';
import { paintMetadata } from './cad-vector';
import { materialTextureSource } from './material-texture';
import { readCadSettings } from './cad-settings';
import { cadRevision } from './cad-plans';
import { rasterTileMatrices } from './cad-raster-tiles';
import { drawingObjectName } from './drawing-operations';
import { drawingTransaction } from './drawing-commands';

const MAX_SELECTION = 50;
const MAX_NODES = 12000;
const MAX_PLACEMENTS = 10000;
const MAX_SNAPSHOT = 1_900_000;
type MaterialSource = ReturnType<typeof materialTextureSource>;
type Change = { id: TLShapeId; paint: VectorPaint };
export interface MaterialAlignmentPlan {
  revision: string;
  sourceId: TLShapeId;
  targetIds: TLShapeId[];
  paths: VectorPath[];
  tileCount: number;
  changes: Change[];
}

function selectedSources(editor: Editor): MaterialSource[] {
  const ids = editor.getSelectedShapeIds();
  if (ids.length < 2) throw new Error('material-align-selection');
  if (ids.length > MAX_SELECTION) throw new Error('material-align-limit');
  const sources = ids.map(id => materialTextureSource(editor, id));
  if (sources.some(s => s.contours.some(c => !c.closed) || curveBounds(s.contours).w <= 0 || curveBounds(s.contours).h <= 0))
    throw new Error('material-align-selection');
  if (sources.reduce((n, s) => n + s.contours.reduce((sum, c) => sum + c.nodes.length, 0), 0) > MAX_NODES)
    throw new Error('material-align-limit');
  return sources;
}

export function materialAlignmentSelection(editor: Editor): { count: number; sources: { id: TLShapeId; name: string }[]; error?: string } {
  const count = editor.getSelectedShapeIds().length;
  try {
    const selected = selectedSources(editor);
    const sources = selected.filter(s => s.paint.raster?.repeat).map(s => ({ id: s.shape.id, name: drawingObjectName(s.shape) }));
    return { count, sources, ...(!sources.length ? { error: 'material-align-source' } : {}) };
  } catch (error) {
    const code = (error as Error).message;
    return { count, sources: [], error: code === 'material-selection' ? 'material-align-selection' : code };
  }
}

function pageMatrix(editor: Editor, source: MaterialSource): VectorMatrix {
  const t = editor.getShapePageTransform(source.shape);
  if (!t) throw new Error('material-align-selection');
  const origin = t.applyToPoint({ x: 0, y: 0 });
  const x = t.applyToPoint({ x: 1, y: 0 }), y = t.applyToPoint({ x: 0, y: 1 });
  return [x.x-origin.x, x.y-origin.y, y.x-origin.x, y.y-origin.y, origin.x, origin.y];
}
function inverse([a,b,c,d,e,f]: VectorMatrix): VectorMatrix {
  const det = a*d-b*c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) throw new Error('material-align-selection');
  return [d/det, -b/det, -c/det, a/det, (c*f-d*e)/det, (b*e-a*f)/det];
}

function updates(editor: Editor, changes: Change[]) {
  return changes.map(({ id, paint }) => {
    const shape = editor.getShape(id)!;
    // Explicit null clears the old control settings through tldraw's shallow
    // metadata merge. Physical tile controls are derived from the new matrix.
    return { id, type: shape.type, meta: { ...shape.meta, omsVectorPaint: paintMetadata(paint), omsMaterialTexture: null } };
  });
}
function assertSaveBudget(editor: Editor, changes: Change[]) {
  const current = JSON.stringify(editor.store?.getStoreSnapshot() ?? editor.getCurrentPageShapesSorted()).length;
  const delta = updates(editor, changes).reduce((n, u) => n + JSON.stringify(u.meta).length - JSON.stringify(editor.getShape(u.id)!.meta).length, 0);
  if (current + delta > MAX_SNAPSHOT && delta > 0) throw new Error('save-limit');
}

/** Copy the source's page-space tile mapping into each target's local space.
 * Shape geometry, selection, stroke styling and transforms remain untouched. */
export function prepareMaterialAlignment(editor: Editor, sourceId: TLShapeId): MaterialAlignmentPlan {
  const selected = selectedSources(editor);
  if (!readCadSettings(editor)) throw new Error('settings');
  const source = selected.find(s => s.shape.id === sourceId);
  if (!source?.paint.raster?.repeat) throw new Error('material-align-source');
  const shared = multiplyMatrix(pageMatrix(editor, source), source.paint.raster.matrix);
  const changes: Change[] = [], paths: VectorPath[] = [];
  let tileCount = 0;
  // Preview in the actual drawing order, independently of source selection.
  const order = new Map(editor.getCurrentPageShapesSorted().map((s, i) => [s.id, i]));
  selected.sort((a, b) => (order.get(a.shape.id) ?? 0) - (order.get(b.shape.id) ?? 0));
  for (const item of selected) {
    const matrix = pageMatrix(editor, item);
    const paint = item.shape.id === sourceId ? item.paint : {
      ...item.paint, gradient: undefined, fillOpacity: source.paint.fillOpacity,
      raster: { ...source.paint.raster, matrix: multiplyMatrix(inverse(matrix), shared) },
    };
    if (!validVectorPaint(paint)) throw new Error('material-align-selection');
    try { tileCount += rasterTileMatrices(paint.raster!, item.contours).length; }
    catch { throw new Error('material-align-tiles'); }
    if (tileCount > MAX_PLACEMENTS) throw new Error('material-align-tiles');
    if (item.shape.id !== sourceId) changes.push({ id: item.shape.id, paint: structuredClone(paint) });
    let opacity = item.shape.opacity ?? 1;
    let parent = editor.getShape(item.shape.parentId as TLShapeId);
    while (parent) { opacity *= parent.opacity ?? 1; parent = editor.getShape(parent.parentId as TLShapeId); }
    const previewPaint = transformAppearance(paint, matrix);
    previewPaint.fillOpacity *= opacity; previewPaint.strokeOpacity *= opacity;
    paths.push({
      contours: mapContours(item.contours, p => ({ x: matrix[0]*p.x+matrix[2]*p.y+matrix[4], y: matrix[1]*p.x+matrix[3]*p.y+matrix[5] })),
      fillRule: item.fillRule, paint: previewPaint,
    });
  }
  assertSaveBudget(editor, changes);
  return { revision: cadRevision(editor), sourceId, targetIds: changes.map(c => c.id), paths, tileCount, changes };
}

export function applyMaterialAlignment(editor: Editor, plan: MaterialAlignmentPlan): boolean {
  try {
    if (plan.revision !== cadRevision(editor)) return false;
    editor.complete(); editor.setCurrentTool('select');
    if (plan.revision !== cadRevision(editor)) return false;
    const fresh = prepareMaterialAlignment(editor, plan.sourceId);
    if (JSON.stringify(fresh) !== JSON.stringify(plan)) return false;
    const patches = updates(editor, fresh.changes);
    const geometry = patches.map(p => JSON.stringify(editor.getShape(p.id)!.props));
    return drawingTransaction(editor, () => {
      editor.updateShapes(patches);
      patches.forEach((p, i) => {
        const changed = editor.getShape(p.id);
        if (!changed || JSON.stringify(changed.meta) !== JSON.stringify(p.meta) || JSON.stringify(changed.props) !== geometry[i])
          throw new Error('material-failed');
      });
    });
  } catch { return false; }
}
