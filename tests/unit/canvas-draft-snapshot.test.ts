import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createTLStore, defaultShapeUtils, getIndices, PageRecordType } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { captureCanvasDocument, registerCanvasDraft } from '../../src/lib/components/canvas/canvas-document';
import { CadPolylineTool } from '../../src/lib/components/canvas/CadPolylineTool';
import { CadBezierTool } from '../../src/lib/components/canvas/CadBezierTool';
import { CadCircleTool, CadDimensionTool } from '../../src/lib/components/canvas/CadTwoPointTool';
import { CadArcThreePointTool, CadCircleThreePointTool } from '../../src/lib/components/canvas/CadThreePointTool';
import { CadBezierShapeUtil } from '../../src/lib/components/canvas/shapes/CadBezierShape';
import { CadPathShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil } from '../../src/lib/components/canvas/shapes/CadShapes';

const shapeUtils = [...defaultShapeUtils, CadPathShapeUtil, CadBezierShapeUtil, CadEllipseShapeUtil, CadArcShapeUtil, CadDimensionShapeUtil];
function setup(Tool: any) {
  const f = fixture(), tool = new Tool(f.editor);
  f.editor.store = { getStoreSnapshot: () => {
    const native = createTLStore({ shapeUtils }), indices = getIndices(f.shapes.size);
    native.put([PageRecordType.create({ ...f.editor.getCurrentPage(), name: 'Draft save', index: getIndices(1)[0] }),
      ...[...f.shapes.values()].map((shape, i) => native.schema.types.shape.create({ ...shape, index: indices[i] }))]);
    return native.getStoreSnapshot();
  } };
  f.state.tool = Tool.id; tool.onEnter();
  const move = (x: number, y: number) => { f.editor.inputs.currentPagePoint = { x, y }; tool.onPointerMove?.(); };
  const click = (x: number, y: number) => { f.editor.inputs.currentPagePoint = { x, y }; tool.onPointerDown({ button: 0 }); tool.onPointerUp?.(); };
  const saved = () => {
    const snapshot = JSON.parse(JSON.stringify(captureCanvasDocument(f.editor))), native = createTLStore({ shapeUtils });
    native.loadStoreSnapshot(snapshot.document);
    return Object.values(snapshot.document.store).filter((record: any) => record.typeName === 'shape') as any[];
  };
  return { ...f, tool, click, move, saved };
}

describe('CAD drafts at the persistence boundary', () => {
  it('saves only committed polyline vertices without completing or changing the live preview', () => {
    const f = setup(CadPolylineTool); f.click(10, 20); f.click(110, 20); f.move(140, 80);
    const before = JSON.stringify([...f.shapes.values()]), marks = f.marks.length;
    assert.equal([...f.shapes.values()][0].props.points.length, 3);
    const [saved] = f.saved(); assert.deepEqual(saved.props.points, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    assert.equal(JSON.stringify([...f.shapes.values()]), before); assert.equal(f.marks.length, marks);
    assert.equal(f.state.tool, 'cad-polyline');
    f.click(110, 120); f.tool.onComplete();
    assert.equal(f.saved()[0].props.points.length, 3);
  });
  for (const Tool of [CadPolylineTool, CadBezierTool]) it(`omits the one-point ${Tool.id} placeholder and retains a completed curve`, () => {
    const f = setup(Tool); f.click(10, 20); assert.equal(f.shapes.size, 1); assert.equal(f.saved().length, 0);
    f.click(110, 20); assert.equal(f.saved().length, 1); f.tool.onComplete(); assert.equal(f.saved().length, 1);
  });
  it('preserves Bezier handles in a reloadable checkpoint and remains independent of later edits', () => {
    const f = setup(CadBezierTool); f.click(10, 20);
    f.editor.inputs.currentPagePoint = { x: 110, y: 20 }; f.tool.onPointerDown({ button: 0 }); f.move(130, 50); f.tool.onPointerUp();
    const saved = f.saved()[0]; assert.equal(saved.props.contours[0].nodes[1].outY, 30);
    f.click(210, 20); assert.equal(saved.props.contours[0].nodes.length, 2); assert.equal(f.saved()[0].props.contours[0].nodes.length, 3);
  });
  for (const Tool of [CadCircleTool, CadDimensionTool, CadArcThreePointTool, CadCircleThreePointTool]) it(`omits unconfirmed ${Tool.id} previews, then retains the confirmed shape`, () => {
    const f = setup(Tool); f.click(10, 20);
    if (Tool === CadArcThreePointTool || Tool === CadCircleThreePointTool) f.click(110, 20);
    f.move(110, 120); assert.equal(f.shapes.size, 1); assert.equal(f.saved().length, 0);
    f.click(110, 120); assert.equal(f.saved().length, 1);
  });
  it('keeps drafts isolated per editor and drops a canceled preview without touching other artwork', () => {
    const a = setup(CadPolylineTool), b = setup(CadPolylineTool);
    a.click(0, 0); a.click(100, 0); b.click(0, 0);
    assert.equal(a.saved().length, 1); assert.equal(b.saved().length, 0);
    a.tool.onCancel(); assert.equal(a.saved().length, 0); b.click(100, 100); assert.equal(b.saved().length, 1);
  });
  it('does not let a stale tool cleanup erase the next tool reader', () => {
    const f = setup(CadPolylineTool); f.click(0, 0); const id = [...f.shapes.keys()][0] as any;
    const old = registerCanvasDraft(f.editor, () => null);
    const next = registerCanvasDraft(f.editor, () => ({ id, props: null })); old();
    assert.equal(f.saved().length, 0); next(); assert.equal(f.saved().length, 1);
  });
  it('cancels a Bezier draft when editing becomes readonly before Backspace', () => {
    const f = setup(CadBezierTool); f.click(10, 20); f.click(110, 20); f.click(210, 20);
    f.state.isReadonly = true; f.tool.onKeyDown({ key: 'Backspace' });
    assert.equal(f.state.tool, 'select'); assert.equal(f.shapes.size, 0); assert.equal(f.saved().length, 0);
  });
});
