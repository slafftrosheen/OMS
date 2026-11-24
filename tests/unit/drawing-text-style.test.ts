import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { TLShapeId } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { applySelectedDrawingTextStyle, drawingTextPointSizeDisplay, type DrawingTextStylePatch } from '../../src/lib/components/canvas/drawing-text-style';
import { editDrawingText, textPointSize } from '../../src/lib/components/canvas/workbench-operations';
import { DEFAULT_CAD_SETTINGS, cadMmPerPixel, readCadSettings } from '../../src/lib/components/canvas/cad-settings';

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
  it('uses physical points at every CAD calibration and preserves fixed paragraph width', () => {
    for (const scale of [.1, 1, 10, 1000]) {
      const f = textFixture(), settings = { ...DEFAULT_CAD_SETTINGS, scale };
      f.editor.updatePage({ meta: { omsCad: settings } });
      for (const id of ids) f.editor.updateShape({ id, type: 'text', props: { size: 'm', scale: 1 / scale, w: 400 } });
      const before = snapshot(f);
      assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize: 36 }), true);
      ids.forEach((id, i) => {
        const shape = f.editor.getShape(id);
        assert.ok(Math.abs(textPointSize(shape, settings) - 36) < 1e-8);
        assert.ok(Math.abs(24 * shape.props.scale * cadMmPerPixel(settings) - 12.7) < 1e-8, '36 points has a 12.7 mm em');
        if (!shape.props.autoSize) assert.ok(Math.abs(shape.props.w * shape.props.scale - before[i].props.w * before[i].props.scale) < 1e-8);
      });
    }
  });
  it('changes calibrated text content without reinterpreting or rounding its scale', () => {
    const f = textFixture();
    f.editor.updatePage({ meta: { omsCad: { ...DEFAULT_CAD_SETTINGS, scale: 1000 } } });
    f.editor.setSelectedShapes([ids[0]]);
    const before = structuredClone(f.editor.getShape(ids[0]));
    assert.ok(textPointSize(before, readCadSettings(f.editor)) > 3000);
    assert.equal(editDrawingText(f.editor, ids[0], { text: 'Still editable', font: 'sans', textAlign: 'start', autoSize: true }), true);
    assert.equal(f.editor.getShape(ids[0]).props.scale, before.props.scale);
    assert.equal(f.editor.getShape(ids[0]).props.text, 'Still editable');
    assert.equal(editDrawingText(f.editor, ids[0], { text: 'Exact', font: 'sans', textAlign: 'start', autoSize: true, pointSize: 72 }), true);
    assert.ok(Math.abs(textPointSize(f.editor.getShape(ids[0]), readCadSettings(f.editor)) - 72) < 1e-8);
  });
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
      if (!s.props.autoSize) assert.ok(Math.abs(s.props.w * s.props.scale - before[i].props.w * before[i].props.scale) < 1e-8, 'fixed paragraph width stays fixed');
      assert.deepEqual({ ...s, props: { ...s.props, w: before[i].props.w, scale: before[i].props.scale } }, before[i]);
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
    // Fitted text can use the full point-size range. Fixed paragraphs also
    // require enough local layout width to keep their displayed box unchanged.
    f.editor.setSelectedShapes([ids[0]]);
    for (const pointSize of [1, 3000]) {
      assert.equal(applySelectedDrawingTextStyle(f.editor, [ids[0]], { pointSize }), true);
      assert.equal(textPointSize(f.editor.getShape(ids[0])), pointSize);
    }
    const count = f.marks.length;
    assert.equal(applySelectedDrawingTextStyle(f.editor, [ids[0]], { pointSize: 3000 }), true);
    assert.equal(f.marks.length, count);
  });
  it('rejects a whole typography batch when one fixed box would expand at the requested size', () => {
    const f = textFixture();
    f.editor.updateShape({ id: ids[1], type: 'text', props: { size: 'm', scale: 1, w: 64, autoSize: false } });
    const before = snapshot(f);
    assert.equal(applySelectedDrawingTextStyle(f.editor, ids, { pointSize: 96, font: 'mono', letterSpacing: 10 }), false);
    assert.deepEqual(snapshot(f), before); assert.equal(f.marks.length, 0);
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
