import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { applyArtworkClip, canReleaseArtworkClip, isArtworkClipGuide, releaseArtworkClip, reviewArtworkClip } from '../../src/lib/components/canvas/cad-artwork-clip';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
import { VECTOR_DEFAULT_PAINT, type VectorPaint } from '../../src/lib/components/canvas/cad-paint';
import type { CadPoint } from '../../src/lib/components/canvas/cad-settings';
import { cadPaintClipTest } from '../../src/lib/components/canvas/cad-shape-appearance';

const artworkId = 'shape:artwork' as TLShapeId, pathId = 'shape:path' as TLShapeId;
const guideId = 'shape:guide' as TLShapeId;
const page = { id: 'page:clip', meta: {} };
function rectangle(x: number, y: number, w: number, h: number) {
  return { closed: true, nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => nodeAt({ x: px, y: py })) };
}

interface Shape {
  id: TLShapeId; parentId: string; type: string; x: number; y: number; rotation: number;
  props: Record<string, unknown>;
  meta: { omsVectorPaint?: VectorPaint; omsProductionLayer?: string };
}

function fixture() {
  const base = { parentId: page.id, x: 30, y: 40, rotation: Math.PI / 2 };
  const paint: VectorPaint = { ...VECTOR_DEFAULT_PAINT, fill: '#123456', dash: [3, 2],
    gradient: { type: 'linear', matrix: [1, 0, 0, 1, 2, 3], start: [0, 0], end: [20, 0], r0: 0, r1: 0,
      stops: [{ offset: 0, color: '#123456' }, { offset: 1, color: '#FFFFFF' }] } };
  const artwork: Shape = { ...base, id: artworkId, type: 'cad-bezier',
    props: { color: 'black', fillRule: 'nonzero', contours: [rectangle(0, 0, 20, 20)] },
    meta: { omsVectorPaint: paint, omsProductionLayer: 'print' } };
  const path: Shape = { ...base, id: pathId, type: 'cad-path', x: 0, y: 0, rotation: 0,
    props: { color: 'black', closed: false, points: [{ x: 2, y: 45 }, { x: 42, y: 45 }] }, meta: {} };
  const guide: Shape = { ...base, id: guideId, type: 'cad-bezier', x: 20, rotation: 0,
    props: { color: 'black', fillRule: 'evenodd', contours: [rectangle(0, 0, 10, 20), rectangle(2, 6, 6, 8)] },
    meta: {} };
  const shapes = new Map([artwork, path, guide].map(shape => [shape.id, shape]));
  let selected = [artworkId, pathId, guideId], readOnly = false, failPath = false;
  let saved: { shapes: Array<[TLShapeId, Shape]>; selection: TLShapeId[] } | undefined;
  const rotate = ({ x, y }: CadPoint, angle: number) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) });
  const editor = {
    getSelectedShapeIds: () => selected,
    getSelectedShapes: () => selected.map(id => shapes.get(id)!),
    setSelectedShapes: (ids: TLShapeId[]) => { selected = ids; },
    getCurrentPage: () => page,
    getCurrentPageShapesSorted: () => [...shapes.values()],
    getShape: (id: TLShapeId) => shapes.get(id),
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
    getInstanceState: () => ({ isReadonly: readOnly }),
    isShapeOrAncestorLocked: () => false,
    getShapeMask: () => undefined,
    getShapePageTransform: (shape: Shape) => ({ applyToPoint: (point: CadPoint) => {
      const p = rotate(point, shape.rotation);
      return { x: p.x + shape.x, y: p.y + shape.y };
    } }),
    getPointInShapeSpace: (shape: Shape, point: CadPoint) => rotate({ x: point.x - shape.x, y: point.y - shape.y }, -shape.rotation),
    user: { getIsDarkMode: () => false },
    mark: (name: string) => { if (!name.endsWith('-complete')) saved = { shapes: structuredClone([...shapes]), selection: [...selected] }; },
    run: (fn: () => void) => fn(),
    bailToMark: () => {
      shapes.clear();
      for (const [id, shape] of saved!.shapes) shapes.set(id, shape);
      selected = saved!.selection;
    },
    updateShapes: (updates: Shape[]) => {
      for (const changes of updates) {
        if (!failPath || changes.id !== pathId) shapes.set(changes.id, { ...shapes.get(changes.id)!, ...changes });
      }
    },
    complete: () => {}, setCurrentTool: () => {},
  };
  return { editor: editor as unknown as Editor, shapes, guide, artwork, paint,
    selected: () => selected, failPath: () => { failPath = true; },
    readOnly: () => { readOnly = true; } };
}

describe('editable artwork clipping', () => {
  it('maps a compound boundary with a hole into rotated artwork and leaves source geometry and paint intact', () => {
    const { editor, shapes, guide, artwork, paint, selected } = fixture();
    assert.ok(isArtworkClipGuide(editor, guide as unknown as TLShape));
    const review = reviewArtworkClip(editor, guideId);
    assert.equal(review.count, 2);
    assert.equal(review.fillRule, 'evenodd');
    assert.ok(applyArtworkClip(editor, review));
    const changed = shapes.get(artworkId)!;
    assert.equal(shapes.size, 3);
    assert.equal(shapes.get(guideId), guide);
    assert.equal(changed.props, artwork.props);
    assert.equal(changed.meta.omsProductionLayer, 'print');
    assert.deepEqual(selected(), [artworkId, pathId]);
    const { clips, ...unchangedPaint } = changed.meta.omsVectorPaint!;
    assert.deepEqual(unchangedPaint, paint);
    assert.equal(clips![0].contours.length, 2);
    const contains = cadPaintClipTest({ ...paint, clips });
    assert.equal(contains({ x: 2, y: 5 }), true);
    assert.equal(contains({ x: 10, y: 5 }), false);
    assert.equal(contains({ x: 2, y: 15 }), false);
    assert.equal(shapes.get(pathId)?.meta.omsVectorPaint?.clips?.length, 1);
  });

  it('releases the last mask and keeps any earlier clipping and paint', () => {
    const { editor, shapes, artwork, paint } = fixture();
    const existing = { contours: [rectangle(0, 0, 15, 15)], fillRule: 'nonzero' as const };
    artwork.meta.omsVectorPaint = { ...paint, clips: [existing] };
    assert.ok(applyArtworkClip(editor, reviewArtworkClip(editor, guideId)));
    assert.ok(canReleaseArtworkClip(editor));
    assert.ok(releaseArtworkClip(editor));
    assert.deepEqual(shapes.get(artworkId)!.meta.omsVectorPaint, { ...paint, clips: [existing] });
    assert.equal(shapes.get(pathId)!.meta.omsVectorPaint?.clips, undefined);
    assert.ok(releaseArtworkClip(editor));
    assert.deepEqual(shapes.get(artworkId)!.meta.omsVectorPaint, paint);
    assert.equal(canReleaseArtworkClip(editor), false);
  });

  it('rejects a stale review, an open guide and artwork changed to read-only', () => {
    const { editor, shapes, guide, readOnly } = fixture();
    assert.equal(isArtworkClipGuide(editor, shapes.get(pathId)! as unknown as TLShape), false);
    const review = reviewArtworkClip(editor, guideId);
    guide.x += 10;
    assert.equal(applyArtworkClip(editor, review), false);
    const fresh = reviewArtworkClip(editor, guideId);
    readOnly();
    assert.throws(() => applyArtworkClip(editor, fresh), /readonly/);
    assert.equal(shapes.get(artworkId)!.meta.omsVectorPaint?.clips, undefined);
  });

  it('rejects a clip over the existing count limit without modifying any object', () => {
    const { editor, artwork, paint, shapes } = fixture();
    const existing = { contours: [rectangle(0, 0, 4, 4)], fillRule: 'evenodd' as const };
    artwork.meta.omsVectorPaint = { ...paint, clips: Array.from({ length: 32 }, () => existing) };
    assert.throws(() => reviewArtworkClip(editor, guideId), /clipLimit/);
    assert.equal(artwork.meta.omsVectorPaint.clips?.length, 32);
    assert.equal(shapes.get(pathId)!.meta.omsVectorPaint, undefined);
  });

  it('rolls back other changes when one object refuses its paint update', () => {
    const { editor, shapes, artwork, failPath, selected } = fixture();
    const review = reviewArtworkClip(editor, guideId);
    failPath();
    assert.equal(applyArtworkClip(editor, review), false);
    assert.deepEqual(shapes.get(artworkId), artwork);
    assert.deepEqual(selected(), [artworkId, pathId, guideId]);
  });
});
