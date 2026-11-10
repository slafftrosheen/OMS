import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { DEFAULT_CAD_SETTINGS as settings, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import { nodeAt, contourSegments, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { shapeCadContours, breakCadCurveAtNode, setCadSegmentKind } from '../../src/lib/components/canvas/cad-editing';
import { prepareCadJoin, type CadJoinPair } from '../../src/lib/components/canvas/cad-join';
import { applyCadPlan } from '../../src/lib/components/canvas/cad-plans';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const path = (x = 0): CadContour => ({ closed: false, nodes: [
  { ...nodeAt({ x, y: 0 }), outX: 20, outY: -40 },
  { ...nodeAt({ x: x + 100, y: 30 }), inX: -30, inY: 20, outX: 15, outY: 50 },
  { ...nodeAt({ x: x + 160, y: 80 }), inX: 10, inY: -30 }
] });
const points = (c: CadContour) => [...contourSegments(c)].map(ps => ps.map(p => ({ x: p.x, y: p.y })));
function add(f: ReturnType<typeof fixture>, id: string, contours: CadContour[], extra = {}) {
  f.editor.createShape({ id: `shape:${id}`, type: 'cad-bezier', props: { contours }, ...extra });
  return `shape:${id}`;
}
const bridge = { mode: 'bridge' as const, pairing: 'end-start' as const, toleranceMm: 0.01 };

describe('CAD endpoint joins', () => {
  it('bridges exact cubics in world coordinates through rotated parents with physical gap reporting', () => {
    const f = fixture();
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 80, y: 130, rotation: 0.43 });
    const a = add(f, 'a', [path()], { parentId: 'shape:group', x: 20, rotation: 0.7 });
    const b = add(f, 'b', [path()], { x: 400, y: -50, rotation: -0.6 });
    f.editor.setSelectedShapes([a, b]);
    const [first, second] = [a, b].map(id => shapeCadContours(f.editor, f.editor.getShape(id))[0]);
    const scaled = { ...settings, unit: 'in' as const, scale: 5, originX: 500, originY: 400 };
    const plan = prepareCadJoin(f.editor, scaled, bridge), result = points(plan.contours[0]);
    assert.deepEqual(result.slice(0, 2), points(first));
    assert.deepEqual(result.slice(3), points(second));
    assert.deepEqual(result[2], [first.nodes[2], first.nodes[2], second.nodes[0], second.nodes[0]].map(p => ({ x: p.x, y: p.y })));
    near(plan.gapMm, Math.hypot(first.nodes[2].x - second.nodes[0].x, first.nodes[2].y - second.nodes[0].y) * cadMmPerPixel(scaled));
    assert.equal(applyCadPlan(f.editor, plan), true);
    assert.equal(f.marks.length, 2);
    const dxf = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', scaled).text)!;
    assert.equal(dxf.entities.length, 1);
    assert.equal(dxf.entities[0].type, 'SPLINE');
    assert.equal(dxf.entities[0].layer, 'OMS_OPEN');
    f.editor.bailToMark(f.marks[0].id);
    assert.deepEqual(f.editor.getSelectedShapeIds(), [a, b]);
  });
  it('supports all endpoint pairs without distorting reversed segments and picks a deterministic nearest pair', () => {
    const f = fixture(), first = path(), second = path(300);
    f.editor.setSelectedShapes([add(f, 'a', [first]), add(f, 'b', [second])]);
    for (const pairing of ['end-start', 'start-start', 'end-end', 'start-end'] as CadJoinPair[]) {
      const plan = prepareCadJoin(f.editor, settings, { ...bridge, pairing });
      const a = points(first), b = points(second), joined = points(plan.contours[0]);
      assert.deepEqual(joined.slice(0, 2), pairing.startsWith('start') ? a.reverse().map(p => p.reverse()) : a);
      assert.deepEqual(joined.slice(3), pairing.endsWith('end') ? b.reverse().map(p => p.reverse()) : b);
    }
    assert.equal(prepareCadJoin(f.editor, settings, { ...bridge, pairing: 'nearest' }).pairing, 'end-start');
  });
  it('merges only inside the physical tolerance, retaining adjacent absolute control points', () => {
    const f = fixture(), first = path(), second = path(160.1);
    second.nodes = second.nodes.map(n => ({ ...n, y: n.y + 80 }));
    f.editor.setSelectedShapes([add(f, 'a', [first]), add(f, 'b', [second])]);
    const scaled = { ...settings, scale: 10 };
    assert.throws(() => prepareCadJoin(f.editor, scaled, { ...bridge, mode: 'merge', toleranceMm: 0.1 }), /join-gap/);
    const plan = prepareCadJoin(f.editor, scaled, { ...bridge, mode: 'merge', toleranceMm: 0.3 });
    assert.equal(plan.contours[0].nodes.length, 5);
    const joint = plan.contours[0].nodes[2], a = first.nodes[2], b = second.nodes[0];
    near(joint.x, (a.x + b.x) / 2); near(joint.y, 80);
    near(joint.x + joint.inX, a.x + a.inX); near(joint.y + joint.inY, a.y + a.inY);
    near(joint.x + joint.outX, b.x + b.outX); near(joint.y + joint.outY, b.y + b.outY);
    near(Math.abs(joint.x - a.x) * cadMmPerPixel(scaled), plan.gapMm / 2);
    assert.throws(() => prepareCadJoin(f.editor, settings, { ...bridge, mode: 'merge', toleranceMm: NaN }), /geometry/);
  });
  it('rejects closed, excessive and ambiguous selections; discloses circular-arc conversion', () => {
    const f = fixture(); const a = add(f, 'a', [path()]), b = add(f, 'b', [{ ...path(300), closed: true }]);
    f.editor.setSelectedShapes([a, b]);
    assert.throws(() => prepareCadJoin(f.editor, settings, bridge), /join-selection/);
    f.editor.updateShape({ id: b, props: { contours: [path(300)], fillRule: 'nonzero' } });
    assert.throws(() => prepareCadJoin(f.editor, settings, bridge), /fill-rule/);
    const c = add(f, 'c', [path(600)]); f.editor.setSelectedShapes([a, b, c]);
    assert.throws(() => prepareCadJoin(f.editor, settings, bridge), /join-selection/);
    f.editor.createShape({ id: 'shape:arc', type: 'cad-arc', props: { radius: 30, startAngle: 0, endAngle: 90 } });
    f.editor.setSelectedShapes([a, 'shape:arc']);
    assert.deepEqual(prepareCadJoin(f.editor, settings, bridge).warnings, ['join-arc-approximation']);
  });
  it('fences stale, bound and locked sources, and rolls back failed replacement', () => {
    const f = fixture(), a = add(f, 'a', [path()]), b = add(f, 'b', [path(300)]);
    f.editor.setSelectedShapes([a, b]);
    const stale = prepareCadJoin(f.editor, settings, bridge);
    f.editor.updateShape({ id: a, x: 1 }); assert.equal(applyCadPlan(f.editor, stale), false);
    const plan = prepareCadJoin(f.editor, settings, bridge);
    f.state.bindings = [{}]; assert.equal(applyCadPlan(f.editor, plan), false); f.state.bindings = [];
    f.editor.updateShape({ id: a, isLocked: true });
    assert.throws(() => prepareCadJoin(f.editor, settings, bridge), /locked/);
    f.editor.updateShape({ id: a, isLocked: false });
    f.state.isReadonly = true; assert.throws(() => prepareCadJoin(f.editor, settings, bridge), /readonly/); f.state.isReadonly = false;
    const before = structuredClone([...f.shapes.values()]); f.state.failCreation = true;
    assert.equal(applyCadPlan(f.editor, prepareCadJoin(f.editor, settings, bridge)), false);
    assert.deepEqual([...f.shapes.values()], before); assert.equal(f.marks.length, 0);
  });
});

describe('CAD node break and segment editing', () => {
  it('breaks at an interior node and rejoins coincident endpoints without losing any cubic', () => {
    const f = fixture(), original = path(), id = add(f, 'c', [original]); f.editor.setSelectedShapes([id]);
    assert.equal(breakCadCurveAtNode(f.editor, 0, 1), true);
    const broken = f.only().props.contours as CadContour[];
    assert.equal(broken.length, 2); assert.deepEqual(broken.flatMap(points), points(original));
    const plan = prepareCadJoin(f.editor, settings, { ...bridge, pairing: 'nearest' });
    assert.equal(plan.gapMm, 0); assert.equal(plan.contours[0].nodes.length, 3);
    assert.deepEqual(points(plan.contours[0]), points(original));
  });
  it('opens a closed contour at the selected node without deleting its closing segment', () => {
    const f = fixture(), original = { ...path(), closed: true }, id = add(f, 'c', [original]); f.editor.setSelectedShapes([id]);
    assert.equal(breakCadCurveAtNode(f.editor, 0, 1), true);
    const opened = f.only().props.contours[0], before = points(original);
    assert.equal(opened.closed, false); assert.equal(opened.nodes.length, 4);
    assert.deepEqual(points(opened), [before[1], before[2], before[0]]);
    assert.deepEqual(opened.nodes[0].x, opened.nodes[3].x);
    const dxf = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', settings).text)!;
    assert.equal(dxf.entities[0].layer, 'OMS_OPEN');
  });
  it('changes only the chosen segment and never straightens an existing cubic via To curve', () => {
    const f = fixture(), original = { ...path(), closed: true }, id = add(f, 'c', [original]); f.editor.setSelectedShapes([id]);
    assert.equal(setCadSegmentKind(f.editor, 0, 0, 'curve'), false);
    assert.equal(setCadSegmentKind(f.editor, 0, 0, 'line'), true);
    const straight = points(f.only().props.contours[0]), before = points(original);
    assert.deepEqual(straight.slice(1), before.slice(1));
    assert.deepEqual(straight[0], [before[0][0], before[0][0], before[0][3], before[0][3]]);
    assert.equal(setCadSegmentKind(f.editor, 0, 0, 'curve'), true);
    const curved = points(f.only().props.contours[0]);
    assert.deepEqual(curved.slice(1), before.slice(1));
    near(curved[0][1].x, 100 / 3); near(curved[0][1].y, 10);
    near(curved[0][2].x, 200 / 3); near(curved[0][2].y, 20);
  });
  it('guards endpoints, locks and node limits without partial edits', () => {
    const f = fixture(), id = add(f, 'c', [path()]); f.editor.setSelectedShapes([id]);
    assert.equal(breakCadCurveAtNode(f.editor, 0, 0), false);
    assert.equal(breakCadCurveAtNode(f.editor, 0, 2), false);
    assert.equal(setCadSegmentKind(f.editor, 0, 2, 'line'), false);
    f.editor.updateShape({ id, isLocked: true });
    assert.equal(breakCadCurveAtNode(f.editor, 0, 1), false); assert.equal(setCadSegmentKind(f.editor, 0, 0, 'line'), false);
    f.editor.updateShape({ id, isLocked: false, props: { contours: [{ closed: false, nodes: Array.from({ length: 4096 }, (_, i) => nodeAt({ x: i, y: 0 })) }] } });
    const before = structuredClone(f.only());
    assert.equal(breakCadCurveAtNode(f.editor, 0, 2000), false);
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
  });
});
