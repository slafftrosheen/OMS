import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { DEFAULT_CAD_SETTINGS as settings } from '../../src/lib/components/canvas/cad-settings';
import { nodeAt, cubicAt, cubicPoints, curveBounds, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { shapeCadContours, reverseCadContour, setCadContourStart } from '../../src/lib/components/canvas/cad-editing';
import { prepareCadCompound, applyCadCompound } from '../../src/lib/components/canvas/cad-compound';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';

const curve = (closed = true): CadContour => ({ closed, nodes: [
  { ...nodeAt({ x: 0, y: 0 }), outX: 37, outY: -53, inX: -10, inY: 20 },
  { ...nodeAt({ x: 90, y: 40 }), inX: -21, inY: -33, outX: 14, outY: 60 },
  { ...nodeAt({ x: 80, y: 100 }), inX: 40, inY: 20, outX: -60, outY: -10 }
] });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function add(f: ReturnType<typeof fixture>, id: string, contours = [curve()], extra = {}) {
  f.editor.createShape({ id: `shape:${id}`, type: 'cad-bezier', props: { contours, color: 'red' }, ...extra });
  return `shape:${id}`;
}

describe('CAD compound operations', () => {
  it('combines exact world curves through rotated parents and splits them without losing controls or units', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 300, y: -100, rotation: 0.8 });
    const a = add(f, 'a', [curve()], { parentId: 'shape:group', x: 40, y: 70, rotation: 0.3 });
    const b = add(f, 'b', [curve(false)], { x: -80, y: 160, rotation: -0.4 });
    f.editor.setSelectedShapes([a, b]);
    const before = [a, b].flatMap(id => shapeCadContours(f.editor, f.editor.getShape(id)));
    const scaled = { ...settings, unit: 'cm' as const, scale: 10, originX: 42, originY: -19 };
    assert.equal(applyCadCompound(f.editor, scaled, 'combine'), true);
    assert.equal(f.marks.length, 2);
    assert.deepEqual(f.only().props.contours, before);
    assert.equal(f.only().props.color, 'red');
    const dxfBefore = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', scaled).text)!;
    assert.equal(applyCadCompound(f.editor, scaled, 'breakApart'), true);
    assert.equal(f.marks.length, 4);
    const after = f.editor.getSelectedShapes().flatMap((shape: any) => shape.props.contours);
    assert.deepEqual(after, before);
    assert.deepEqual(curveBounds(after), curveBounds(before));
    const dxfAfter = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', scaled).text)!;
    assert.deepEqual(dxfAfter.entities, dxfBefore.entities);
    assert.equal(dxfAfter.entities.filter(e => e.type === 'SPLINE').length, 2);
    f.editor.bailToMark(f.marks[2].id);
    assert.equal(f.only().props.contours.length, 2);
    f.editor.bailToMark(f.marks[0].id);
    assert.deepEqual(f.editor.getSelectedShapeIds(), [a, b]);
  });
  it('preserves nonzero font winding and refuses ambiguous mixed fill rules', () => {
    const f = fixture();
    const a = add(f, 'a', [curve()]), b = add(f, 'b', [curve()]);
    f.editor.setSelectedShapes([a, b]);
    f.editor.updateShape({ id: a, props: { fillRule: 'nonzero' } });
    assert.equal(applyCadCompound(f.editor, settings, 'combine'), false);
    assert.equal(f.marks.length, 0);
    f.editor.updateShape({ id: b, props: { fillRule: 'nonzero' } });
    assert.equal(applyCadCompound(f.editor, settings, 'combine'), true);
    assert.equal(f.only().props.fillRule, 'nonzero');
    assert.equal(applyCadCompound(f.editor, settings, 'breakApart'), true);
    assert.ok(f.editor.getSelectedShapes().every((s: any) => s.props.fillRule === 'nonzero'));
  });
  it('refuses stale, locked, read-only, connected, clipped and protected sources without mutation', () => {
    const f = fixture();
    const a = add(f, 'a'), b = add(f, 'b');
    f.editor.setSelectedShapes([a, b]);
    const plan = prepareCadCompound(f.editor, settings, 'combine');
    f.editor.updateShape({ id: a, x: 1 });
    assert.equal(applyCadPlan(f.editor, plan), false);
    for (const change of [
      () => { f.state.isReadonly = true; },
      () => { f.editor.updateShape({ id: a, isLocked: true }); },
      () => { f.state.bindings = [{}]; },
      () => { f.editor.getShape(a).mask = []; },
      () => { f.editor.updateShape({ id: b, type: 'order-details' }); }
    ]) {
      change();
      const before = structuredClone([...f.shapes.values()]);
      assert.equal(applyCadCompound(f.editor, settings, 'combine'), false);
      assert.deepEqual([...f.shapes.values()], before);
      f.state.isReadonly = false; f.state.bindings = [];
      f.editor.updateShape({ id: a, isLocked: false }); delete f.editor.getShape(a).mask;
    }
    assert.equal(f.marks.length, 0);
  });
  it('checks capacity and rolls back a failed creation with all original contours intact', () => {
    const f = fixture(); const id = add(f, 'compound', [curve(), curve(false)]);
    f.editor.setSelectedShapes([id]);
    const before = structuredClone([...f.shapes.values()]);
    f.editor.options.maxShapesPerPage = 2;
    assert.equal(applyCadCompound(f.editor, settings, 'breakApart'), false);
    f.editor.options.maxShapesPerPage = 4000; f.state.failCreation = true;
    assert.equal(applyCadCompound(f.editor, settings, 'breakApart'), false);
    assert.deepEqual([...f.shapes.values()], before);
    assert.deepEqual(f.editor.getSelectedShapeIds(), [id]);
    assert.equal(f.marks.length, 0);
  });
});

describe('CAD contour traversal', () => {
  it('reverses open cubics exactly and reverses back without geometric drift', () => {
    const f = fixture(); const original = curve(false); const id = add(f, 'curve', [original]);
    f.editor.setSelectedShapes([id]);
    assert.equal(reverseCadContour(f.editor, 0), true);
    const nodes = f.only().props.contours[0].nodes;
    for (let segment = 0; segment < 2; segment++) for (let i = 0; i <= 20; i++) {
      const a = cubicAt(cubicPoints(original.nodes[segment], original.nodes[segment + 1]), i / 20);
      const b = cubicAt(cubicPoints(nodes[1 - segment], nodes[2 - segment]), 1 - i / 20);
      near(a.x, b.x); near(a.y, b.y);
    }
    assert.equal(reverseCadContour(f.editor, 0), true);
    assert.deepEqual(f.only().props.contours, [original]);
  });
  it('preserves a closed seam while reversing, then rotates the start node without changing bounds', () => {
    const f = fixture(); const original = curve(); const id = add(f, 'curve', [original]);
    f.editor.setSelectedShapes([id]);
    assert.equal(reverseCadContour(f.editor, 0), true);
    const reversed = f.only().props.contours[0];
    assert.equal(reversed.nodes[0].x, original.nodes[0].x);
    assert.equal(reversed.nodes[0].y, original.nodes[0].y);
    const before = curveBounds([reversed]);
    assert.equal(setCadContourStart(f.editor, 0, 2), true);
    assert.deepEqual(f.only().props.contours[0].nodes, [reversed.nodes[2], reversed.nodes[0], reversed.nodes[1]]);
    assert.deepEqual(curveBounds(f.only().props.contours), before);
    assert.equal(setCadContourStart(f.editor, 0, 99), false);
    f.editor.updateShape({ id, isLocked: true });
    assert.equal(reverseCadContour(f.editor, 0), false);
    assert.equal(setCadContourStart(f.editor, 0, 1), false);
  });
  it('refuses moving the start of an open curve and invalid contour indices', () => {
    const f = fixture(); const id = add(f, 'curve', [curve(false)]); f.editor.setSelectedShapes([id]);
    assert.equal(setCadContourStart(f.editor, 0, 1), false);
    assert.equal(reverseCadContour(f.editor, 2), false);
    assert.equal(f.marks.length, 0);
  });
});
