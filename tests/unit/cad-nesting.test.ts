import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_NEST_PARTS, nestMaterial, nestParts, validateNestOptions, type NestOptions, type NestPlacement } from '../../src/lib/components/canvas/cad-nesting';
import { applyNest } from '../../src/lib/components/canvas/cad-nest-apply';

const sheet: NestOptions = { sheetW: 1000, sheetH: 500, margin: 10, gap: 5, allowRotate: true };
const overlaps = (a: NestPlacement, b: NestPlacement, gap: number) =>
  a.sheet === b.sheet && a.x < b.x + b.w + gap - 1e-6 && b.x < a.x + a.w + gap - 1e-6 && a.y < b.y + b.h + gap - 1e-6 && b.y < a.y + a.h + gap - 1e-6;

describe('sheet nesting', () => {
  it('keeps every part inside the margin and apart by the gap', () => {
    const parts = Array.from({ length: 23 }, (_, i) => ({ id: `p${i}`, w: 60 + (i % 5) * 37, h: 40 + (i % 3) * 51 }));
    const result = nestParts(parts, sheet);
    assert.ok(typeof result === 'object');
    assert.equal(result.placements.length + result.unplaced.length + result.oversized.length, parts.length);
    for (const p of result.placements) {
      assert.ok(p.x >= 10 - 1e-6 && p.y >= 10 - 1e-6, 'inside margin');
      assert.ok(p.x + p.w <= 990 + 1e-6 && p.y + p.h <= 490 + 1e-6, 'inside far margin');
    }
    for (let i = 0; i < result.placements.length; i++)
      for (let j = i + 1; j < result.placements.length; j++)
        assert.ok(!overlaps(result.placements[i], result.placements[j], 5), `${result.placements[i].id} vs ${result.placements[j].id}`);
  });

  it('packs a perfect grid exactly, edge to edge with the gap', () => {
    // 4 × 2 parts of 240 × 235 with 5 gap fill 980 × 475 usable exactly.
    const parts = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, w: 241.25, h: 237.5 }));
    const result = nestParts(parts, { ...sheet, margin: 10, gap: 5, allowRotate: false });
    assert.ok(typeof result === 'object');
    assert.equal(result.sheets, 1);
    assert.equal(result.placements.length, 8);
  });

  it('turns a part 90° only when that is what makes it fit', () => {
    const result = nestParts([{ id: 'tall', w: 300, h: 700 }], sheet);
    assert.ok(typeof result === 'object');
    assert.equal(result.placements[0].rotated, true);
    assert.deepEqual([result.placements[0].w, result.placements[0].h], [700, 300]);
    const locked = nestParts([{ id: 'tall', w: 300, h: 700 }], { ...sheet, allowRotate: false });
    assert.ok(typeof locked === 'object');
    assert.deepEqual(locked.oversized, ['tall']);
  });

  it('opens new sheets and stops at the sheet limit', () => {
    const parts = Array.from({ length: 5 }, (_, i) => ({ id: `big${i}`, w: 900, h: 400 }));
    const result = nestParts(parts, { ...sheet, maxSheets: 3 });
    assert.ok(typeof result === 'object');
    assert.equal(result.sheets, 3);
    assert.equal(result.placements.length, 3);
    assert.equal(result.unplaced.length, 2);
    assert.ok(result.utilisation.every(u => u > 0.7 && u <= 1));
  });

  it('is repeatable for the same input', () => {
    const parts = [{ id: 'b', w: 100, h: 50 }, { id: 'a', w: 100, h: 50 }, { id: 'c', w: 80, h: 80 }];
    assert.deepEqual(nestParts(parts, sheet), nestParts([...parts].reverse(), sheet));
  });

  it('reports parts above the preview limit as unplaced', () => {
    const parts = Array.from({ length: MAX_NEST_PARTS + 1 }, (_, i) => ({ id: `p${i}`, w: 1, h: 1 }));
    const result = nestParts(parts, { ...sheet, gap: 0 });
    assert.ok(typeof result === 'object');
    assert.equal(result.placements.length, MAX_NEST_PARTS);
    assert.deepEqual(result.unplaced, [`p${MAX_NEST_PARTS}`]);
  });

  it('rejects impossible sheets and empty selections', () => {
    assert.equal(validateNestOptions({ ...sheet, margin: 260 }), 'nestSpacing');
    assert.equal(nestParts([], sheet), 'nestNoParts');
    assert.equal(nestParts([{ id: 'x', w: 1, h: 1 }], { ...sheet, sheetW: 0 }), 'nestSheetSize');
    assert.equal(nestParts([{ id: 'x', w: 1, h: 1 }], { ...sheet, gap: -1 }), 'nestSpacing');
  });
});

describe('applying a nest to the drawing', () => {
  function editor(locked = new Set<string>()) {
    const shapes = new Map<string, any>([
      ['shape:a', { id: 'shape:a', parentId: 'page:nest', type: 'geo', x: 500, y: 500, w: 100, h: 40, rot: false }],
      ['shape:b', { id: 'shape:b', parentId: 'page:nest', type: 'geo', x: -80, y: 30, w: 30, h: 200, rot: false }],
      ['shape:child', { id: 'shape:child', parentId: 'shape:b' }],
    ]);
    let snapshot: string | null = null;
    return {
      shapes,
      getInstanceState: () => ({ isReadonly: false }),
      mark: () => { snapshot = JSON.stringify([...shapes]); },
      run: (fn: () => void) => fn(),
      bailToMark: () => { for (const [k, v] of JSON.parse(snapshot!)) shapes.set(k, v); },
      getShape: (id: string) => shapes.get(id),
      getCurrentPageId: () => 'page:nest',
      getShapeAndDescendantIds: ([id]: string[]) => new Set([id, ...[...shapes.values()].filter(shape => shape.parentId === id).map(shape => shape.id)]),
      isShapeOrAncestorLocked: (shape: { id: string }) => locked.has(shape.id),
      rotateShapesBy: ([id]: string[]) => { const s = shapes.get(id); shapes.set(id, { ...s, rot: !s.rot, x: s.x + 7, y: s.y - 3 }); },
      getShapePageBounds: (id: string) => { const s = shapes.get(id); return { x: s.x, y: s.y, w: s.rot ? s.h : s.w, h: s.rot ? s.w : s.h }; },
      updateShapes: (rows: any[]) => rows.forEach(r => shapes.set(r.id, { ...shapes.get(r.id), x: r.x, y: r.y }))
    };
  }
  const result: any = {
    placements: [
      { id: 'shape:a', sheet: 0, x: 10, y: 10, w: 100, h: 40, rotated: false },
      { id: 'shape:b', sheet: 1, x: 10, y: 10, w: 200, h: 30, rotated: true }
    ], oversized: [], unplaced: [], sheets: 2, utilisation: [0.1, 0.1], partArea: 0
  };

  it('moves each object box onto its sheet slot, turning where planned', () => {
    const e = editor();
    assert.equal(applyNest(e as any, result, { x: 0, y: 0 }, 1000, 50), true);
    assert.deepEqual(e.getShapePageBounds('shape:a'), { x: 10, y: 10, w: 100, h: 40 });
    assert.deepEqual(e.getShapePageBounds('shape:b'), { x: 1060, y: 10, w: 200, h: 30 });
  });

  it('changes nothing when a descendant becomes locked', () => {
    const e = editor(new Set(['shape:child']));
    assert.equal(applyNest(e as any, result, { x: 0, y: 0 }, 1000, 50), false);
    assert.equal(e.shapes.get('shape:a').x, 500);
  });
});

describe('nest material bill', () => {
  it('counts whole sheets, area and cost per placed part', () => {
    const material = nestMaterial({ sheets: 2, placements: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, sheet: 0, x: 0, y: 0, w: 1, h: 1, rotated: false })) }, 2500, 1250, 42.5);
    assert.equal(material.sheets, 2);
    assert.equal(material.areaM2, 6.25);
    assert.equal(material.cost, 85);
    assert.equal(material.perPartCost, 10.63);
    assert.equal(nestMaterial({ sheets: 1, placements: [] }, 1000, 2000).cost, null);
    assert.equal(nestMaterial({ sheets: 1, placements: [] }, 1000, 2000, -5).cost, null);
  });
});
