import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { TLShapeId } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { applySelectedDrawingTextStyle, drawingTextPointSizeDisplay, type DrawingTextStylePatch } from '../../src/lib/components/canvas/drawing-text-style';
import { textPointSize } from '../../src/lib/components/canvas/workbench-operations';

const ids = ['shape:one', 'shape:two'] as TLShapeId[];
function textFixture() {
  const f = fixture();
  ids.forEach((id, i) => f.editor.createShape({ id, type: 'text', x: i * 150, y: 20, rotation: i * 0.3,
    meta: { omsObjectName: `Label ${i}`, keep: true }, props: {
      text: i ? 'Реклама\nRīga' : 'BŪVE 123', size: i ? 'xl' : 's', scale: i ? 2 : 1,
      font: i ? 'serif' : 'sans', textAlign: i ? 'end' : 'start', autoSize: i === 0, w: 120, color: 'blue',
    } }));
  f.editor.setSelectedShapes(ids);
  return f;
}
const snapshot = (f: ReturnType<typeof fixture>) => structuredClone([...f.shapes.values()]);

describe('contextual text formatting', () => {
  it('shows equal point sizes consistently across native bases without rounding stored scale', () => {
    const f = textFixture();
    f.editor.updateShape({ id: ids[1], type: 'text', props: { size: 'm' } });
    for (const pointSize of [100, 12.345678]) {
      assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize }), true);
      ids.forEach(id => assert.equal(drawingTextPointSizeDisplay(textPointSize(f.editor.getShape(id))), pointSize));
      assert.equal(f.editor.getShape(ids[1]).props.scale, pointSize / 18);
    }
  });
  it('sets one exact point size across differently scaled native sizes without replacing content', () => {
    const f = textFixture(), before = snapshot(f);
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize: 36 }), true);
    ids.forEach((id, i) => {
      const s = f.editor.getShape(id);
      assert.equal(textPointSize(s), 36);
      assert.deepEqual({ ...s, props: { ...s.props, scale: before[i].props.scale } }, before[i]);
    });
    assert.equal(f.marks.length, 2); // One shared history boundary, not one per object.
  });
  it('changes only requested typography fields and retains each size and text', () => {
    const f = textFixture(), before = snapshot(f);
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { font: 'mono', textAlign: 'middle', autoSize: false }), true);
    ids.forEach((id, i) => {
      const s = f.editor.getShape(id);
      assert.equal(s.props.font, 'mono'); assert.equal(s.props.textAlign, 'middle'); assert.equal(s.props.autoSize, false);
      assert.equal(s.props.text, before[i].props.text); assert.equal(s.props.scale, before[i].props.scale);
      assert.deepEqual(s.meta, before[i].meta);
    });
  });
  it('accepts the same selection in a different order', () => {
    const f = textFixture();
    assert.equal(applySelectedDrawingTextStyle(f.editor, [...ids].reverse(), { font: 'draw' }), true);
  });
  it('rejects stale, partial, duplicate and empty selection snapshots without history entries', () => {
    const f = textFixture(), before = snapshot(f);
    for (const stale of [[], [ids[0]], [ids[0], ids[0]], ['shape:gone', ids[1]] as TLShapeId[]]) {
      assert.equal(applySelectedDrawingTextStyle(f.editor, stale, { pointSize: 72 }), false);
    }
    f.editor.setSelectedShapes([]);
    assert.equal(applySelectedDrawingTextStyle(f.editor, [], { pointSize: 72 }), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
  });
  it('does not apply a pending toolbar edit to a replacement selection', () => {
    const f = textFixture(); f.editor.setSelectedShapes([ids[0]]);
    const old = [ids[0]]; f.editor.setSelectedShapes([ids[1]]);
    const before = snapshot(f);
    assert.equal(applySelectedDrawingTextStyle(f.editor, old, { font: 'mono' }), false);
    assert.deepEqual(snapshot(f), before);
  });
  it('rejects a whole batch if a selected text or its ancestor is locked', () => {
    for (const ancestor of [false, true]) {
      const f = textFixture();
      if (ancestor) {
        f.editor.createShape({ id: 'shape:group', type: 'group', isLocked: true });
        f.editor.updateShape({ id: ids[1], parentId: 'shape:group' });
      } else f.editor.updateShape({ id: ids[1], isLocked: true });
      const before = snapshot(f);
      assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize: 72 }), false);
      assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
    }
  });
  it('rejects mixed text/geometry and group selections instead of silently skipping objects', () => {
    for (const type of ['cad-ellipse', 'group', 'profile-7st']) {
      const f = textFixture(); f.editor.createShape({ id: 'shape:other', type });
      const mixed = [ids[0], 'shape:other'] as TLShapeId[]; f.editor.setSelectedShapes(mixed);
      const before = snapshot(f);
      assert.equal(applySelectedDrawingTextStyle(f.editor, mixed, { font: 'mono' }), false);
      assert.deepEqual(snapshot(f), before);
    }
  });
  it('does not format an old selection while a drawing tool or read-only mode is active', () => {
    const f = textFixture(), before = snapshot(f);
    f.state.isReadonly = true;
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { font: 'mono' }), false);
    f.state.isReadonly = false; f.state.tool = 'text';
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { font: 'mono' }), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
  });
  it('validates each patch before writing and never accepts content through a style control', () => {
    const f = textFixture(), before = snapshot(f);
    const invalid: unknown[] = [{}, { pointSize: NaN }, { pointSize: Infinity }, { pointSize: 0 }, { pointSize: 3001 },
      { pointSize: undefined }, { font: 'unavailable font' }, { font: undefined }, { textAlign: 'justify' },
      { autoSize: 'false' }, { font: 'mono', text: 'must not overwrite' }];
    for (const patch of invalid) assert.equal(applySelectedDrawingTextStyle(f.editor, ids, patch as DrawingTextStylePatch), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
  });
  it('accepts supported point size limits and does not record a no-op', () => {
    const f = textFixture();
    for (const pointSize of [1, 3000]) {
      assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize }), true);
      ids.forEach(id => assert.equal(textPointSize(f.editor.getShape(id)), pointSize));
    }
    const count = f.marks.length;
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize: 3000 }), true);
    assert.equal(f.marks.length, count);
  });
  it('rolls the entire batch back when an editor update throws', () => {
    const f = textFixture(), before = snapshot(f), update = f.editor.updateShape;
    f.editor.updateShape = (shape: { id: string }) => { if (shape.id === ids[1]) throw new Error('rejected'); update(shape); };
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { font: 'mono' }), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
  });
  it('detects a silently refused update and restores earlier members', () => {
    const f = textFixture(), before = snapshot(f), update = f.editor.updateShape;
    f.editor.updateShape = (shape: { id: string }) => { if (shape.id !== ids[1]) update(shape); };
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { font: 'mono' }), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
  });
});
