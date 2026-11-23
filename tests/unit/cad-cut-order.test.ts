import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { containmentDepths, entityEndpoints, optimiseCutOrder, rapidTravel } from '../../src/lib/components/canvas/cad-cut-order';
import { buildDxfPreview } from '../../src/lib/components/canvas/cad-dxf-preview';
import type { DxfEntity } from '../../src/lib/components/canvas/cad-dxf';

const rect = (x: number, y: number, w: number, h: number, productionLayer?: string): DxfEntity =>
  ({ type: 'polyline', closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], ...(productionLayer ? { productionLayer } : {}) });
const hole = (x: number, y: number, r = 5): DxfEntity => ({ type: 'circle', center: { x, y }, radius: r });

describe('cut order', () => {
  it('finds start and end points for every entity type', () => {
    assert.deepEqual(entityEndpoints(rect(0, 0, 10, 10)), { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } });
    assert.deepEqual(entityEndpoints({ type: 'polyline', closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }).end, { x: 5, y: 0 });
    const arc = entityEndpoints({ type: 'arc', center: { x: 0, y: 0 }, radius: 10, start: 0, end: 90 });
    assert.ok(Math.abs(arc.start.x - 10) < 1e-9 && Math.abs(arc.end.y - 10) < 1e-9);
    assert.deepEqual(entityEndpoints(hole(3, 4, 2)).start, { x: 5, y: 4 });
  });
  it('counts how many closed outlines hold each contour', () => {
    const depths = containmentDepths([rect(0, 0, 100, 100), rect(10, 10, 50, 50), hole(30, 30), hole(80, 80)]);
    assert.deepEqual(depths, [0, 1, 2, 1]);
  });
  it('cuts holes before the outline around them, and engraving first', () => {
    const outline = rect(0, 0, 100, 100, 'OMS_JOB_CUT');
    const engrave: DxfEntity = { type: 'polyline', closed: false, points: [{ x: 20, y: 90 }, { x: 80, y: 90 }], productionLayer: 'OMS_JOB_ENGRAVE' };
    const result = optimiseCutOrder([outline, hole(20, 20), hole(80, 20), engrave]);
    assert.equal(result.entities[0], engrave);
    assert.equal(result.entities[result.entities.length - 1], outline);
    assert.ok(result.reordered);
  });
  it('shortens rapid travel between scattered parts', () => {
    // Four parts in a row, drawn in a zig-zag order.
    const parts = [rect(0, 0, 10, 10), rect(300, 0, 10, 10), rect(100, 0, 10, 10), rect(200, 0, 10, 10)];
    const result = optimiseCutOrder(parts);
    assert.ok(result.after < result.before, `${result.after} < ${result.before}`);
    assert.deepEqual(result.entities.map(e => (e as any).points[0].x), [0, 100, 200, 300]);
    assert.equal(rapidTravel(result.entities, { x: 0, y: 0 }), 300);
  });
  it('uses the original production name when the DXF layer was sanitised', () => {
    const outline = rect(0, 0, 100, 100, 'OMS_JOB_CUT');
    const engrave = { ...hole(150, 150), productionLayer: 'OMS_JOB_LAYER' };
    const result = optimiseCutOrder([outline, engrave], undefined, new Map([['OMS_JOB_LAYER', 'Гравировка']]));
    assert.equal(result.entities[0], engrave);
  });
  it('is repeatable and leaves tiny jobs alone', () => {
    const parts = [rect(50, 0, 10, 10), rect(0, 0, 10, 10), hole(5, 5, 2)];
    assert.deepEqual(optimiseCutOrder(parts).entities, optimiseCutOrder(parts).entities);
    const single = optimiseCutOrder([rect(0, 0, 1, 1)]);
    assert.equal(single.reordered, false);
  });
  it('draws the tool travel in the preview in file order', () => {
    const entries = [rect(0, 0, 10, 10), rect(100, 0, 10, 10)].map(entity => ({ entity, layer: { name: 'OMS_CLOSED' } }));
    const preview = buildDxfPreview(entries, { minX: 0, minY: 0, maxX: 110, maxY: 10 });
    assert.equal(preview.travel?.moves, 1);
    assert.deepEqual(preview.travel?.start, { x: 0, y: 10 });
    assert.match(preview.travel!.path, /^M0,10 L100,10$/);
  });
});

describe('cut order · part by part', () => {
  it('finishes each part (holes, then its outline) before the next and starts outlines at the nearest corner', () => {
    const plate = (x: number) => [rect(x, 0, 300, 200), hole(x + 25, 25), hole(x + 275, 25), hole(x + 25, 175), hole(x + 275, 175)];
    const drawing = [...plate(0), ...plate(700), ...plate(350)];
    const result = optimiseCutOrder(drawing);
    const kinds = result.entities.map(e => e.type);
    assert.deepEqual(kinds, ['circle', 'circle', 'circle', 'circle', 'polyline', 'circle', 'circle', 'circle', 'circle', 'polyline', 'circle', 'circle', 'circle', 'circle', 'polyline']);
    assert.ok(result.after < result.before);
    // Outlines keep their shape: same vertices, rotated start.
    const outline = result.entities[4] as Extract<DxfEntity, { type: 'polyline' }>;
    assert.equal(outline.points.length, 4);
    assert.ok(outline.points.some(p => p.x === 0 && p.y === 0));
  });
  it('keeps holes first even when the drawing order was shorter', () => {
    const outline = rect(0, 0, 100, 100), inner = hole(99 - 5, 50, 4);
    const result = optimiseCutOrder([outline, inner]);
    assert.equal(result.entities[0], inner);
  });
});
