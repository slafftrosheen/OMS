import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { cornerAtNode, prepareNodeCorner, applyNodeCorner, NODE_FILLET_TOLERANCE_MM } from '../../src/lib/components/canvas/cad-node-corners';
import { nodeAt, cubicAt, cubicPoints, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { selectCadNode, getSelectedCadNode } from '../../src/lib/components/canvas/cad-node-selection';
import { DEFAULT_CAD_SETTINGS as settings, cadMmPerPixel } from '../../src/lib/components/canvas/cad-settings';
import { cadRevision } from '../../src/lib/components/canvas/cad-plans';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';

const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const path = (points: number[][], closed = false): CadContour => ({ closed, nodes: points.map(([x, y]) => nodeAt({ x, y })) });
const elbow = () => path([[-100, 0], [0, 0], [0, 100]]);
function setup(contours = [elbow()]) {
  const f = fixture(); f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', props: { contours } });
  f.editor.setSelectedShapes(['shape:curve']); selectCadNode(f.editor, 0, 1); return f;
}
const code = (expected: string) => (error: any) => error.code === expected;

describe('fillet and chamfer at a chosen node', () => {
  for (const sign of [-1, 1]) it(`creates tangent circular geometry for turn ${sign}`, () => {
    const source = path([[-100, 0], [0, 0], [0, sign * 100]]), before = structuredClone(source);
    const result = cornerAtNode([source], 0, 1, 10, 'fillet', 0.005).contours[0];
    assert.deepEqual(source, before); assert.equal(result.closed, false); assert.equal(result.nodes.length, 4);
    const [a, b] = result.nodes.slice(1, 3); near(a.x, -10); near(a.y, 0); near(b.x, 0); near(b.y, sign * 10);
    near(a.outY, 0); near(b.inX, 0); assert.ok(a.outX > 0); assert.ok(b.inY * sign < 0);
    for (let i = 0; i <= 100; i++) {
      const p = cubicAt(cubicPoints(a, b), i / 100);
      assert.ok(Math.abs(Math.hypot(p.x + 10, p.y - sign * 10) - 10) <= 0.005);
    }
  });
  it('subdivides a large acute fillet to meet the physical radius tolerance', () => {
    const r = 5000, turn = 150 * Math.PI / 180, source = path([[-100000, 0], [0, 0], [100000 * Math.cos(turn), 100000 * Math.sin(turn)]]);
    const tolerance = 0.0001, result = cornerAtNode([source], 0, 1, r, 'fillet', tolerance).contours[0];
    const cut = r * Math.tan(turn / 2), center = { x: -cut, y: r }, nodes = result.nodes.slice(1, -1);
    assert.ok(nodes.length > 3);
    for (let j = 1; j < nodes.length; j++) for (let i = 0; i <= 100; i++) {
      const p = cubicAt(cubicPoints(nodes[j - 1], nodes[j]), i / 100);
      assert.ok(Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - r) < tolerance);
    }
    near(nodes[0].x, -cut); near(nodes.at(-1)!.x, Math.cos(turn) * cut); near(nodes.at(-1)!.y, Math.sin(turn) * cut);
  });
  it('chamfers both sides by the requested setback without changing other controls or contours', () => {
    const outer = path([[-100, 0], [0, 0], [0, 100], [100, 150]]);
    outer.nodes[0].inX = -12; outer.nodes[2].outX = 20; outer.nodes[3].inY = -30;
    const hole = path([[200, 200], [220, 200], [210, 210]], true), input = [outer, hole];
    const result = cornerAtNode(input, 0, 1, 12, 'chamfer', 0.005).contours;
    assert.deepEqual(result[0].nodes[0], outer.nodes[0]); assert.deepEqual(result[0].nodes.slice(3), outer.nodes.slice(2));
    assert.deepEqual(result[1], hole); assert.deepEqual(result[0].nodes[1], nodeAt({ x: -12, y: 0 }));
    assert.deepEqual(result[0].nodes[2], nodeAt({ x: 0, y: 12 }));
  });
  it('rounds a concave node and preserves the surrounding contour winding and order', () => {
    const source = path([[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]], true);
    const result = cornerAtNode([source], 0, 3, 10, 'fillet', 0.005).contours[0];
    assert.deepEqual(result.nodes.slice(0, 3), source.nodes.slice(0, 3));
    assert.deepEqual(result.nodes.slice(5), source.nodes.slice(4)); assert.equal(result.closed, true);
    near(result.nodes[3].x, 50); near(result.nodes[3].y, 40); near(result.nodes[4].x, 40); near(result.nodes[4].y, 50);
    const p = cubicAt(cubicPoints(result.nodes[3], result.nodes[4]), 0.5); near(Math.hypot(p.x - 50, p.y - 50), 10);
  });
  it('edits the closed seam without dropping the closing segment or reordering other nodes', () => {
    const source = path([[0, 0], [100, 0], [100, 100], [0, 100]], true);
    const result = cornerAtNode([source], 0, 0, 10, 'chamfer', 0.005).contours[0];
    assert.equal(result.closed, true); assert.deepEqual(result.nodes.slice(2), source.nodes.slice(1));
    assert.deepEqual(result.nodes[0], nodeAt({ x: 0, y: 10 })); assert.deepEqual(result.nodes[1], nodeAt({ x: 10, y: 0 }));
  });
  it('can round another corner after a previous fillet while retaining every existing cubic exactly', () => {
    const source = path([[0, 0], [100, 0], [100, 100], [0, 100]], true);
    const first = cornerAtNode([source], 0, 0, 10, 'fillet', 0.005).contours;
    const result = cornerAtNode(first, 0, 2, 15, 'fillet', 0.005).contours;
    assert.deepEqual(result[0].nodes.slice(0, 2), first[0].nodes.slice(0, 2));
    assert.deepEqual(result[0].nodes.slice(4), first[0].nodes.slice(3));
  });
  it('rejects endpoints, degenerate corners, curves at the corner and oversized dimensions without mutating input', () => {
    const source = [elbow()], before = structuredClone(source);
    for (const node of [0, 2, -1, 12]) assert.throws(() => cornerAtNode(source, 0, node, 10, 'fillet', 0.005), code('corner-node'));
    for (const amount of [0, -1, NaN, Infinity, 100, 101, 1e7]) assert.throws(() => cornerAtNode(source, 0, 1, amount, 'chamfer', 0.005), code('corner-size'));
    for (const c of [path([[-100, 0], [0, 0], [100, 0]]), path([[-100, 0], [0, 0], [-50, 0]]), path([[0, 0], [0, 0], [100, 0]])])
      assert.throws(() => cornerAtNode([c], 0, 1, 10, 'fillet', 0.005), code('corner-node'));
    assert.deepEqual(source, before); source[0].nodes[0].outX = 1;
    assert.throws(() => cornerAtNode(source, 0, 1, 10, 'fillet', 0.005), code('corner-neighbours'));
    assert.throws(() => cornerAtNode(source, 0, 1, 10, 'invalid' as any, 0.005), code('corner-size'));
  });
  it('refuses a nearby crossing line, an enclosed hole and a curved intrusion into the edit region', () => {
    const curve = path([[-20, 20], [20, 20]]); curve.nodes[0].outY = -25; curve.nodes[1].inY = -25;
    for (const obstacle of [path([[-20, 5], [10, 5]]), path([[-3, 1], [-2, 1], [-2, 2]], true), curve])
      assert.throws(() => cornerAtNode([elbow(), obstacle], 0, 1, 10, 'fillet', 0.005), code('corner-intersection'));
    assert.doesNotThrow(() => cornerAtNode([elbow(), path([[-20, 11], [10, 11]])], 0, 1, 10, 'fillet', 0.005));
  });
  it('checks nonadjacent segments of the same contour and the complete compound node budget', () => {
    const crossing = path([[-100, 0], [0, 0], [0, 100], [-20, 5], [10, 5]]);
    assert.throws(() => cornerAtNode([crossing], 0, 1, 10, 'chamfer', 0.005), code('corner-intersection'));
    const input = [elbow(), path(Array.from({ length: 4093 }, (_, i) => [1000 + i, 1000]))];
    assert.throws(() => cornerAtNode(input, 0, 1, 10, 'chamfer', 0.005), code('limit'));
  });
});

describe('reviewed corner edits in place', () => {
  it('preserves group, rotation, opacity, fill rule and metadata; exports full-size DXF and undoes once', () => {
    const f = setup(), s = { ...settings, unit: 'in' as const, scale: 10, originX: 240, originY: -150 };
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 100, y: 200, rotation: 0.5 });
    f.editor.updateShape({ id: 'shape:curve', parentId: 'shape:group', x: 20, y: -60, rotation: 0.3, opacity: 0.4,
      props: { fillRule: 'nonzero', color: 'red' }, meta: { omsObjectName: 'Letter rim', retained: { nested: true } } });
    const before = structuredClone(f.only()), plan = prepareNodeCorner(f.editor, s, 25.4, 'fillet');
    assert.deepEqual(f.only(), before); assert.equal(plan.warnings[0], 'node-corner-approximation');
    near(plan.nodeEdit.localContours[0].nodes[1].x, -25.4 / cadMmPerPixel(s));
    assert.equal(applyNodeCorner(f.editor, plan), true);
    assert.deepEqual({ ...f.only(), props: before.props }, before); assert.equal(f.shapes.size, 2);
    assert.equal(f.only().props.fillRule, 'nonzero'); assert.equal(f.only().props.color, 'red');
    assert.deepEqual(getSelectedCadNode(f.editor), { shapeId: 'shape:curve', contourIndex: 0, nodeIndex: 1 });
    const dxf = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', s).text)!;
    assert.equal(dxf.header.$INSUNITS, 4); assert.ok(dxf.entities.some(e => e.type === 'SPLINE'));
    assert.equal(f.marks.length, 2); assert.equal(f.marks[1].id, `${f.marks[0].id}-complete`);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.only(), before);
  });
  it('preserves untouched compound paths and previews the transformed chosen corner in a close-up', () => {
    const hole = path([[200, 200], [220, 200], [210, 210]], true), f = setup([elbow(), hole]);
    f.editor.updateShape({ id: 'shape:curve', x: 400, y: 500, rotation: Math.PI / 4 });
    const plan = prepareNodeCorner(f.editor, settings, 2, 'chamfer');
    assert.equal(plan.originalContours.length, 2); assert.ok(plan.previewBounds.w < 20 && plan.previewBounds.h < 20);
    assert.equal(applyNodeCorner(f.editor, plan), true); assert.deepEqual(f.only().props.contours[1], hole);
  });
  it('invalidates the preview when only the chosen node changes', () => {
    const f = setup([path([[0, 0], [100, 0], [100, 100], [0, 100]], true)]);
    const plan = prepareNodeCorner(f.editor, settings, 2, 'chamfer'), revision = cadRevision(f.editor);
    selectCadNode(f.editor, 0, 2); assert.equal(cadRevision(f.editor), revision);
    assert.equal(applyNodeCorner(f.editor, plan), false); assert.equal(f.marks.length, 0);
  });
  for (const change of ['geometry', 'readonly', 'locked', 'bound', 'selection', 'capacity']) it(`refuses ${change} changes after preview without a partial edit`, () => {
    const f = setup(), plan = prepareNodeCorner(f.editor, settings, 2, 'chamfer');
    if (change === 'geometry') f.editor.updateShape({ id: 'shape:curve', rotation: 0.2 });
    if (change === 'readonly') f.state.isReadonly = true;
    if (change === 'locked') f.only().isLocked = true;
    if (change === 'bound') f.state.bindings = [{}];
    if (change === 'selection') f.editor.selectNone();
    if (change === 'capacity') f.editor.store = { getStoreSnapshot: () => 'x'.repeat(1_900_001) };
    const before = structuredClone([...f.shapes.values()]);
    assert.equal(applyNodeCorner(f.editor, plan), false); assert.deepEqual([...f.shapes.values()], before); assert.equal(f.marks.length, 0);
  });
  it('refuses clipping and protected ancestry at preparation', () => {
    const f = setup(); f.only().mask = [{ x: 0, y: 0 }];
    assert.throws(() => prepareNodeCorner(f.editor, settings, 2, 'fillet'));
    delete f.only().mask;
    f.editor.createShape({ id: 'shape:form', type: 'order-details' }); f.editor.updateShape({ id: 'shape:curve', parentId: 'shape:form' });
    assert.throws(() => prepareNodeCorner(f.editor, settings, 2, 'fillet'));
    assert.equal(f.marks.length, 0);
  });
  it('rolls back the full transaction if shape updating fails', () => {
    const f = setup(), before = structuredClone(f.only()), plan = prepareNodeCorner(f.editor, settings, 2, 'chamfer');
    const update = f.editor.updateShapes;
    f.editor.updateShapes = (patches: any[]) => { update(patches); throw new Error('storage failure'); };
    assert.equal(applyNodeCorner(f.editor, plan), false); assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
  });
  it('uses the same physical tolerance at different document scales', () => {
    for (const scale of [0.01, 1, 100, 10000]) {
      const f = setup([path([[-100000, 0], [0, 0], [0, 100000]])]), s = { ...settings, scale };
      const radius = 1000 * cadMmPerPixel(s), plan = prepareNodeCorner(f.editor, s, radius, 'fillet');
      const nodes = plan.nodeEdit.localContours[0].nodes.slice(1, -1);
      for (let j = 1; j < nodes.length; j++) for (let i = 0; i <= 50; i++) {
        const p = cubicAt(cubicPoints(nodes[j - 1], nodes[j]), i / 50);
        assert.ok(Math.abs(Math.hypot(p.x + 1000, p.y - 1000) - 1000) * cadMmPerPixel(s) < NODE_FILLET_TOLERANCE_MM);
      }
    }
  });
});
