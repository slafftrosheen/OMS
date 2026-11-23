import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import type { VectorClip } from './cad-appearance';
import { curveBounds, curvePathData, mapContours, validContours } from './cad-curves';
import { convertedCurvePaint, shapeCadContours } from './cad-editing';
import { validVectorPaint, type VectorPaint } from './cad-paint';
import { assertCadEditable, cadRevision, CadOperationError } from './cad-plans';
import { cadMmPerPixel, DEFAULT_CAD_SETTINGS, readCadSettings } from './cad-settings';
import { CAD_APPEARANCE_TYPES, cadAppearanceGeometry } from './cad-shape-appearance';
import { paintMetadata, vectorPaint } from './cad-vector';
import { drawingTransaction } from './drawing-commands';
import type { CadBezierShape } from './shapes/CadBezierShape';

const MAX_ARTWORK = 200;

export interface ArtworkClipReview {
  revision: string;
  guideId: TLShapeId;
  outline: string;
  fillRule: VectorClip['fillRule'];
  count: number;
}

interface PaintEdit {
  shape: TLShape;
  paint: VectorPaint;
}

function guideClip(editor: Editor, shape: TLShape): VectorClip {
  const paint = shape.meta.omsVectorPaint;
  if (paint != null && (!validVectorPaint(paint) || paint.clips?.length ||
      paint.raster && paint.raster.usage !== 'material') || editor.getShapeMask(shape.id))
    throw new CadOperationError('clipGuide');

  const tolerance = 0.005 / cadMmPerPixel(readCadSettings(editor) ?? DEFAULT_CAD_SETTINGS);
  const contours = shapeCadContours(editor, shape, tolerance);
  const fillRule = shape.type === 'cad-bezier' ? (shape as CadBezierShape).props.fillRule : 'evenodd';
  if (!validContours(contours) || contours.some(contour => !contour.closed) ||
      !['evenodd', 'nonzero'].includes(fillRule)) throw new CadOperationError('clipGuide');
  const { w, h } = curveBounds(contours);
  if (!(w > 0 && h > 0)) throw new CadOperationError('clipGuide');
  return { contours, fillRule };
}

export function isArtworkClipGuide(editor: Editor, shape: TLShape): boolean {
  try { guideClip(editor, shape); return true; } catch { return false; }
}

function artworkSources(editor: Editor, shapes: TLShape[]): PaintEdit[] {
  if (!shapes.length || shapes.length > MAX_ARTWORK) throw new CadOperationError('clipArtwork');
  if (shapes.some(shape => !CAD_APPEARANCE_TYPES.has(shape.type))) throw new CadOperationError('clipArtwork');
  assertCadEditable(editor, shapes.map(shape => shape.id));
  return shapes.map(shape => {
    cadAppearanceGeometry(shape);
    const authored = shape.meta.omsVectorPaint;
    if (authored != null && !validVectorPaint(authored)) throw new CadOperationError('clipArtwork');
    const paint = shape.type === 'cad-bezier' || authored != null
      ? vectorPaint(shape.meta, (shape.props as { color?: string }).color)
      : convertedCurvePaint(editor, shape);
    if (paint.raster && paint.raster.usage !== 'material') throw new CadOperationError('clipArtwork');
    return { shape, paint };
  });
}

function prepareArtworkClip(editor: Editor, guideId: TLShapeId) {
  const selected = editor.getSelectedShapes();
  const guide = selected.find(shape => shape.id === guideId);
  if (!guide) throw new CadOperationError('clipGuide');
  const mask = guideClip(editor, guide);
  const edits = artworkSources(editor, selected.filter(shape => shape.id !== guideId)).map(({ shape, paint }) => {
    const contours = mapContours(mask.contours, point => editor.getPointInShapeSpace(shape, point));
    const next = { ...paint, clips: [...(paint.clips ?? []), { contours, fillRule: mask.fillRule }] };
    if (!validVectorPaint(next)) throw new CadOperationError('clipLimit');
    return { shape, paint: next };
  });
  return { mask, edits };
}

export function reviewArtworkClip(editor: Editor, guideId: TLShapeId): ArtworkClipReview {
  const { mask, edits } = prepareArtworkClip(editor, guideId);
  return { revision: cadRevision(editor), guideId, outline: curvePathData(mask.contours), fillRule: mask.fillRule, count: edits.length };
}

function updateArtworkPaint(editor: Editor, edits: PaintEdit[], selectArtwork = false): boolean {
  const updates = edits.map(({ shape, paint }) => ({
    id: shape.id, type: shape.type, meta: { ...shape.meta, omsVectorPaint: paintMetadata(paint) },
  }));
  if (!updates.length) return false;
  const growth = updates.reduce((total, update, i) => total + JSON.stringify(update.meta).length - JSON.stringify(edits[i].shape.meta).length, 0);
  if (growth > 0 && editor.store && JSON.stringify(editor.store.getStoreSnapshot()).length + growth > 1_900_000)
    throw new CadOperationError('clipLimit');
  return drawingTransaction(editor, () => {
    editor.updateShapes(updates);
    for (const [i, update] of updates.entries()) {
      const expected = { ...edits[i].shape, ...update };
      if (JSON.stringify(editor.getShape(update.id)) !== JSON.stringify(expected)) throw new CadOperationError('clipFailed');
    }
    if (selectArtwork) editor.setSelectedShapes(updates.map(update => update.id));
  });
}

export function applyArtworkClip(editor: Editor, review: ArtworkClipReview): boolean {
  if (review.revision !== cadRevision(editor)) return false;
  editor.complete();
  editor.setCurrentTool('select');
  if (review.revision !== cadRevision(editor)) return false;
  return updateArtworkPaint(editor, prepareArtworkClip(editor, review.guideId).edits, true);
}

export function canReleaseArtworkClip(editor: Editor): boolean {
  try { return artworkSources(editor, editor.getSelectedShapes()).some(({ paint }) => !!paint.clips?.length); }
  catch { return false; }
}

export function releaseArtworkClip(editor: Editor): boolean {
  editor.complete();
  editor.setCurrentTool('select');
  const edits = artworkSources(editor, editor.getSelectedShapes()).filter(({ paint }) => paint.clips?.length);
  for (const { paint } of edits) {
    if (paint.clips!.length === 1) delete paint.clips;
    else paint.clips = paint.clips!.slice(0, -1);
  }
  return updateArtworkPaint(editor, edits);
}
