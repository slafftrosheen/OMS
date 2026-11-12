import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';
import { fixture } from '../helpers/cad-editor';
import { nodeAt, cubicAt, cubicPoints, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS as settings } from '../../src/lib/components/canvas/cad-settings';
import { getCadCurveSelection, setCadStraightSegment, splitCadCurveSegment } from '../../src/lib/components/canvas/cad-editing';
import { getSelectedCadNode, selectCadNode, inspectCadNodeEvent, installCadNodeSelection, setCadNodeEditing, isCadNodeEditing } from '../../src/lib/components/canvas/cad-node-selection';
import { buildCadDxf } from '../../src/lib/components/canvas/cad-dxf';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function setup(contours: CadContour[] = [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }].map(nodeAt) }]) {
  const f = fixture();
  f.editor.createShape({ id: 'shape:curve', type: 'cad-bezier', props: { contours }, meta: { retained: true } });
  f.editor.setSelectedShapes(['shape:curve']);
  return f;
}

describe('precise outgoing segment edits', () => {
  it('sets length and direction in document units through nested rotations and keeps adjoining relative controls', () => {
    const f = setup(), s = { ...settings, unit: 'in' as const, scale: 10, originX: 300, originY: -200 };
    f.editor.createShape({ id: 'shape:group', type: 'group', x: 400, y: -500, rotation: 0.7 });
    const contours = structuredClone(f.only().props.contours);
    contours[0].nodes[0].inX = -17; contours[0].nodes[1].outY = -20;
    f.editor.updateShape({ id: 'shape:curve', parentId: 'shape:group', rotation: 0.4, props: { contours } });
    const before = getCadCurveSelection(f.editor, s)!;
    assert.equal(setCadStraightSegment(f.editor, s, 0, 0, 2, 90), true);
    const after = getCadCurveSelection(f.editor, s)!.contours[0].nodes;
    near(after[0].x, before.contours[0].nodes[0].x); near(after[0].y, before.contours[0].nodes[0].y);
    near(after[1].x, after[0].x); near(after[1].y - after[0].y, 2);
    assert.deepEqual(after[2], before.contours[0].nodes[2]);
    assert.equal(f.only().props.contours[0].nodes[0].inX, -17);
    assert.equal(f.only().props.contours[0].nodes[1].outY, -20);
    assert.deepEqual(f.only().meta, { retained: true }); assert.equal(f.marks.length, 2);
    assert.equal(f.marks[1].id, `${f.marks[0].id}-complete`);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(getCadCurveSelection(f.editor, s), before);
  });
  it('moves the first node when editing the closing segment and exports physical DXF coordinates', () => {
    const f = setup(); f.only().props.contours[0].closed = true;
    assert.equal(setCadStraightSegment(f.editor, settings, 0, 2, 40, 180), true);
    const nodes = getCadCurveSelection(f.editor, settings)!.contours[0].nodes;
    near(nodes[0].x, nodes[2].x - 40); near(nodes[0].y, nodes[2].y);
    const dxf = new DxfParser().parseSync(buildCadDxf(f.editor, 'selected', settings).text)!;
    const vertices = (dxf.entities[0] as any).vertices;
    near(vertices[0].x, nodes[0].x); near(vertices[0].y, nodes[0].y);
  });
  it('rejects curved segments, missing successors and invalid dimensions without changing the document', () => {
    const f = setup(), before = structuredClone(f.only());
    for (const [length, angle] of [[0, 0], [-1, 0], [NaN, 90], [1, Infinity], [1, 361], [1e12, 0]])
      assert.equal(setCadStraightSegment(f.editor, settings, 0, 0, length, angle), false);
    assert.equal(setCadStraightSegment(f.editor, settings, 0, 2, 10, 0), false);
    assert.equal(setCadStraightSegment(f.editor, settings, 9, 0, 10, 0), false);
    assert.equal(setCadStraightSegment(f.editor, { ...settings, scale: 0 }, 0, 0, 10, 0), false);
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    f.only().props.contours[0].nodes[0].outX = 10;
    assert.equal(setCadStraightSegment(f.editor, settings, 0, 0, 10, 0), false);
  });
  it('blocks readonly, locked ancestors and protected order form descendants', () => {
    for (const guard of ['readonly', 'locked', 'form']) {
      const f = setup();
      if (guard === 'readonly') f.state.isReadonly = true;
      else {
        f.editor.createShape({ id: 'shape:parent', type: guard === 'form' ? 'order-details' : 'group', isLocked: guard === 'locked' });
        f.editor.updateShape({ id: 'shape:curve', parentId: 'shape:parent' });
      }
      const before = structuredClone(f.only());
      assert.equal(setCadStraightSegment(f.editor, settings, 0, 0, 10, 0), false);
      assert.equal(splitCadCurveSegment(f.editor, 0, 0, 0.3), false);
      assert.equal(f.utils['cad-bezier'].onHandleDrag(f.only(), { handle: { id: '0:1:node', x: 30, y: 40 } }), undefined);
      assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    }
  });
});

describe('parameter splits without geometric drift', () => {
  for (const t of [0.01, 0.25, 0.75, 0.99]) it(`preserves every sampled point of a cubic split at ${t}`, () => {
    const a = { ...nodeAt({ x: -80, y: 10 }), inX: -30, inY: 100, outX: 30, outY: -100, mode: 'symmetric' as const };
    const b = { ...nodeAt({ x: 70, y: 40 }), inX: -120, inY: -90, outX: 120, outY: 90, mode: 'symmetric' as const };
    const f = setup([{ closed: false, nodes: [a, b] }]), original = cubicPoints(a, b);
    assert.equal(splitCadCurveSegment(f.editor, 0, 0, t), true);
    const n = f.only().props.contours[0].nodes;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, old = cubicAt(original, u);
      const current = cubicAt(u <= t ? cubicPoints(n[0], n[1]) : cubicPoints(n[1], n[2]), u <= t ? u / t : (u - t) / (1 - t));
      near(current.x, old.x); near(current.y, old.y);
    }
    assert.equal(n[0].inX, a.inX); assert.equal(n[2].outY, b.outY);
    assert.equal(n[0].mode, 'smooth'); assert.equal(n[2].mode, 'smooth');
    assert.equal(f.marks.length, 2);
    assert.equal(f.marks[1].id, `${f.marks[0].id}-complete`);
  });
  it('splits straight segments by distance and keeps them straight and numerically editable', () => {
    const f = setup(); assert.equal(splitCadCurveSegment(f.editor, 0, 0, 0.25), true);
    const n = f.only().props.contours[0].nodes;
    assert.deepEqual(n[1], nodeAt({ x: 25, y: 0 }));
    assert.ok(n.every((p: any) => !p.inX && !p.inY && !p.outX && !p.outY));
    assert.equal(setCadStraightSegment(f.editor, settings, 0, 1, 20, -90), true);
  });
  it('splits the closed seam without reordering its starting node or changing the closing cubic', () => {
    const f = setup(); const c = f.only().props.contours[0]; c.closed = true;
    c.nodes[2].outX = -20; c.nodes[0].inY = 70;
    const before = cubicPoints(c.nodes[2], c.nodes[0]);
    assert.equal(splitCadCurveSegment(f.editor, 0, 2, 0.3), true);
    const n = f.only().props.contours[0].nodes;
    near(n[0].x, 0); near(n[0].y, 0);
    for (const u of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
      const p = cubicAt(before, u), q = cubicAt(u <= 0.3 ? cubicPoints(n[2], n[3]) : cubicPoints(n[3], n[0]), u <= 0.3 ? u / 0.3 : (u - 0.3) / 0.7);
      near(p.x, q.x); near(p.y, q.y);
    }
  });
  it('rejects endpoint splits, invalid indices and the node limit atomically', () => {
    const f = setup(), before = structuredClone(f.only());
    for (const t of [0, 1, -0.1, 1.1, NaN, Infinity]) assert.equal(splitCadCurveSegment(f.editor, 0, 0, t), false);
    for (const [ci, ni] of [[0, 2], [-1, 0], [0, -1], [0.1, 0], [0, 9]]) assert.equal(splitCadCurveSegment(f.editor, ci, ni), false);
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0);
    f.only().props.contours[0].nodes = Array.from({ length: 4096 }, (_, x) => nodeAt({ x, y: 0 }));
    assert.equal(splitCadCurveSegment(f.editor, 0, 0), false);
    assert.equal(f.only().props.contours[0].nodes.length, 4096); assert.equal(f.marks.length, 0);
  });
});

describe('canvas node inspection and handle targets', () => {
  it('syncs node and both control handle presses without document writes or changing tools', () => {
    const f = setup(), before = structuredClone(f.only());
    for (const kind of ['node', 'in', 'out']) {
      inspectCadNodeEvent(f.editor, { type: 'pointer', name: 'pointer_down', button: 0, target: 'handle', shape: f.only(), handle: { id: `0:1:${kind}` } } as any);
      assert.deepEqual(getSelectedCadNode(f.editor), { shapeId: 'shape:curve', contourIndex: 0, nodeIndex: 1 });
      selectCadNode(f.editor, 0, 0);
    }
    assert.deepEqual(f.only(), before); assert.equal(f.marks.length, 0); assert.equal(f.state.tool, 'select');
  });
  it('ignores unrelated or stale presses, isolates editors and safely resolves undo/deletion/selection changes', () => {
    const f = setup(), other = setup(); selectCadNode(f.editor, 0, 2);
    for (const extra of [{ button: 2 }, { name: 'pointer_move' }, { target: 'shape' }, { handle: { id: '0:99:node' } }, { handle: { id: 'top_left' } }, { shape: { ...f.only(), id: 'shape:other' } }])
      inspectCadNodeEvent(f.editor, { type: 'pointer', name: 'pointer_down', button: 0, target: 'handle', shape: f.only(), handle: { id: '0:1:node' }, ...extra } as any);
    assert.equal(getSelectedCadNode(f.editor)!.nodeIndex, 2); assert.equal(getSelectedCadNode(other.editor)!.nodeIndex, 0);
    f.only().props.contours[0].nodes.pop(); assert.equal(getSelectedCadNode(f.editor)!.nodeIndex, 0);
    assert.equal(selectCadNode(f.editor, -1, 0), false); assert.equal(selectCadNode(f.editor, 0, 1.5), false);
    f.editor.selectNone(); assert.equal(getSelectedCadNode(f.editor), null);
    f.editor.deleteShapes(['shape:curve']); assert.equal(getSelectedCadNode(f.editor), null);
  });
  it('unregisters the event listener and allows readonly inspection without mutation', () => {
    const f = setup(); const listeners = new Set<(event: any) => void>();
    f.editor.on = (_: string, listener: any) => listeners.add(listener); f.editor.off = (_: string, listener: any) => listeners.delete(listener);
    const cleanup = installCadNodeSelection(f.editor); assert.equal(listeners.size, 1);
    f.state.isReadonly = true; assert.equal(selectCadNode(f.editor, 0, 1), true); assert.equal(f.marks.length, 0);
    cleanup(); assert.equal(listeners.size, 0);
  });
  it('keeps collapsed controls off the anchor hit target and supports large compounds through the selector', () => {
    const f = setup(), util = f.utils['cad-bezier'];
    assert.deepEqual(util.getHandles(f.only()), []); assert.equal(util.hideResizeHandles(), false);
    setCadNodeEditing(f.editor, true);
    assert.equal(util.hideResizeHandles(), true); assert.equal(util.hideRotateHandle(), true); assert.equal(util.hideSelectionBoundsFg(), true);
    assert.deepEqual(util.getHandles(f.only()).map((h: any) => h.id), ['0:0:node', '0:1:node', '0:2:node']);
    f.only().props.contours[0].nodes[1].inX = -10;
    assert.ok(util.getHandles(f.only()).some((h: any) => h.id === '0:1:in'));
    const change = util.onHandleDrag(f.only(), { handle: { id: '0:1:node', x: 120, y: 20 } });
    assert.equal(change.props.contours[0].nodes[1].x, 120); assert.equal(change.props.contours[0].nodes[1].inX, -10);
    f.only().props.contours[0].nodes = Array.from({ length: 129 }, (_, x) => nodeAt({ x, y: 0 }));
    assert.deepEqual(util.getHandles(f.only()), []); assert.equal(selectCadNode(f.editor, 0, 128), true);
    assert.equal(getSelectedCadNode(f.editor)!.nodeIndex, 128);
  });
  it('returns from node editing to normal selection with V, Escape or a different native tool', () => {
    const f = setup(); let listener: (event: any) => void;
    f.editor.on = (_: string, callback: any) => { listener = callback; }; f.editor.off = () => {};
    const cleanup = installCadNodeSelection(f.editor);
    for (const key of ['v', 'Escape']) {
      setCadNodeEditing(f.editor, true); assert.equal(isCadNodeEditing(f.editor), true);
      listener!({ type: 'keyboard', name: 'key_down', key }); assert.equal(isCadNodeEditing(f.editor), false);
    }
    setCadNodeEditing(f.editor, true); f.state.tool = 'draw'; listener!({ type: 'pointer', name: 'pointer_move' });
    f.state.tool = 'select'; assert.equal(isCadNodeEditing(f.editor), false); cleanup();
  });
});
