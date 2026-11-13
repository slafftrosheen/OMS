import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTLStore, defaultShapeUtils, HistoryManager, type TLShapeId } from '@tldraw/tldraw';
import { fixture } from '../helpers/cad-editor';
import { applySelectedDrawingTextStyle } from '../../src/lib/components/canvas/drawing-text-style';
import { editDrawingText } from '../../src/lib/components/canvas/workbench-operations';
import { DrawingTextShapeUtil } from '../../src/lib/components/canvas/shapes/DrawingTextShape';
import { drawingTextBaseline, getDrawingTextSpacing, withDrawingTextSpacing } from '../../src/lib/components/canvas/drawing-text-spacing';
import { glyphRunContours, prepareCadText, readCadFont } from '../../src/lib/components/canvas/cad-text';
import { curveBounds, curvePathData, mapContours, type CadContour } from '../../src/lib/components/canvas/cad-curves';
import { DEFAULT_CAD_SETTINGS } from '../../src/lib/components/canvas/cad-settings';

const id = 'shape:spacing' as TLShapeId;
const raw = readFileSync('static/tldraw/2.4.6/fonts/IBMPlexSans-Medium.woff2');
function setup() {
  const f = fixture();
  f.editor.createShape({ id, type: 'text', meta: { keep: true }, props: { text: 'Rīga\nРЕКЛАМА', font: 'sans', size: 'm', scale: 2, w: 240, autoSize: true, textAlign: 'middle', color: 'blue' } });
  f.editor.setSelectedShapes([id]);
  return f;
}
function measurement(f: ReturnType<typeof setup>) {
  const values = new Map<string, string>(), priorities = new Map<string, string>();
  const style = { getPropertyValue: (key: string) => values.get(key) ?? '', getPropertyPriority: (key: string) => priorities.get(key) ?? '',
    setProperty: (key: string, value: string, priority = '') => { values.set(key, value); priorities.set(key, priority); }, removeProperty: (key: string) => { values.delete(key); priorities.delete(key); } };
  f.editor.textMeasure = { baseElm: { style }, measureText: (_text: string, opts: any) => ({ w: 100 + 5 * parseFloat(style.getPropertyValue('letter-spacing') || '0'), h: opts.fontSize * opts.lineHeight * 2 }),
    measureTextSpans: (_text: string, opts: any) => [{ text: 'Rīga', box: { x: 10, y: 6, w: 60, h: 24 } }, { text: 'РЕКЛАМА', box: { x: 3, y: 6 + opts.fontSize * opts.lineHeight, w: 120, h: 24 } }] };
  return style;
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

describe('editable text spacing', () => {
  it('keeps legacy defaults and sanitizes invalid saved metadata', () => {
    for (const value of [undefined, null, 'bad', [], { letterSpacing: Infinity, lineHeight: -1 }, { letterSpacing: '20', lineHeight: null }])
      assert.deepEqual(getDrawingTextSpacing({ meta: { omsTextSpacing: value } } as any), { letterSpacing: 0, lineHeight: 1.35 });
    assert.deepEqual(getDrawingTextSpacing({ meta: { omsTextSpacing: { letterSpacing: -12.5, lineHeight: 2 } } }), { letterSpacing: -12.5, lineHeight: 2 });
  });
  it('changes spacing atomically while preserving font, content, physical size and unrelated metadata', () => {
    const f = setup(), before = structuredClone(f.editor.getShape(id));
    assert.equal(applySelectedDrawingTextStyle(f.editor, [id], { letterSpacing: 12.5, lineHeight: 1.8 }), true);
    const after = f.editor.getShape(id);
    assert.deepEqual(after.props, before.props); assert.equal(after.meta.keep, true);
    assert.deepEqual(getDrawingTextSpacing(after), { letterSpacing: 12.5, lineHeight: 1.8 });
    const marks = f.marks.length;
    assert.equal(applySelectedDrawingTextStyle(f.editor, [id], { letterSpacing: 12.5 }), true); assert.equal(f.marks.length, marks);
    assert.equal(editDrawingText(f.editor, id, { text: 'New text', font: 'mono', pointSize: 36, autoSize: false, textAlign: 'end', lineHeight: 2 }), true);
    assert.deepEqual(getDrawingTextSpacing(f.editor.getShape(id)), { letterSpacing: 12.5, lineHeight: 2 });
    assert.equal(f.editor.getShape(id).props.lineHeight, undefined);
  });
  it('rejects invalid, readonly, locked and stale spacing edits without partial changes', () => {
    const f = setup(), before = JSON.stringify([...f.shapes.values()]);
    for (const patch of [{ letterSpacing: NaN }, { letterSpacing: 201 }, { letterSpacing: -51 }, { lineHeight: undefined }, { lineHeight: 0.49 }, { lineHeight: 5.1 }])
      assert.equal(applySelectedDrawingTextStyle(f.editor, [id], patch), false);
    f.state.isReadonly = true; assert.equal(applySelectedDrawingTextStyle(f.editor, [id], { letterSpacing: 10 }), false);
    f.state.isReadonly = false; f.editor.setSelectedShapes([]); assert.equal(applySelectedDrawingTextStyle(f.editor, [id], { letterSpacing: 10 }), false);
    assert.equal(JSON.stringify([...f.shapes.values()]), before); assert.equal(f.marks.length, 0);
    f.editor.setSelectedShapes([id]); f.editor.updateShape({ id, isLocked: true });
    assert.equal(applySelectedDrawingTextStyle(f.editor, [id], { lineHeight: 2 }), false);
  });
  it('detects silently refused metadata and rolls back the entire selection', () => {
    const f = setup(), second = 'shape:second' as TLShapeId;
    f.editor.createShape({ ...f.editor.getShape(id), id: second }); f.editor.setSelectedShapes([id, second]);
    const before = structuredClone([...f.shapes.values()]), update = f.editor.updateShape;
    f.editor.updateShape = (patch: any) => { if (patch.id === second) update({ ...patch, meta: f.editor.getShape(second).meta }); else update(patch); };
    assert.equal(applySelectedDrawingTextStyle(f.editor, [id, second], { lineHeight: 2 }), false);
    assert.deepEqual([...f.shapes.values()], before);
  });
  it('scopes text measurement and restores the template after nested measurement and failures', () => {
    const f = setup(), style = measurement(f);
    style.setProperty('letter-spacing', '3px', 'important');
    assert.throws(() => withDrawingTextSpacing(f.editor, { letterSpacing: 20, lineHeight: 2 }, 24, () => {
      assert.equal(style.getPropertyValue('letter-spacing'), '4.8px');
      withDrawingTextSpacing(f.editor, { letterSpacing: 0, lineHeight: 1.35 }, 24, () => assert.equal(style.getPropertyValue('letter-spacing'), '0px'));
      assert.equal(style.getPropertyValue('letter-spacing'), '4.8px'); throw new Error('measure failure');
    }), /measure failure/);
    assert.equal(style.getPropertyValue('letter-spacing'), '3px'); assert.equal(style.getPropertyPriority('letter-spacing'), 'important');
    assert.equal(style.getPropertyValue('font-variant-ligatures'), '');
  });
  it('recalculates auto width and keeps the rotated alignment anchor in place', () => {
    const f = setup(); measurement(f); const util = new DrawingTextShapeUtil(f.editor);
    const prev = { ...f.editor.getShape(id), rotation: Math.PI / 2 }, incoming = { ...prev, meta: { ...prev.meta, omsTextSpacing: { letterSpacing: 25, lineHeight: 2 } } };
    const next = util.onBeforeUpdate(prev, incoming)!;
    const a = util.getGeometry(prev).bounds, b = util.getGeometry(next).bounds;
    assert.ok(b.w > a.w && b.h > a.h);
    close(next.x - b.h / 2, prev.x - a.h / 2); close(next.y + b.w / 2, prev.y + a.w / 2);
    assert.notEqual(next.props, prev.props);
    const fixed = { ...incoming, props: { ...incoming.props, autoSize: false } };
    const fixedNext = util.onBeforeUpdate({ ...prev, props: { ...prev.props, autoSize: false } }, fixed)!;
    assert.equal(fixedNext.x, fixed.x); assert.equal(fixedNext.y, fixed.y); assert.notEqual(fixedNext.props, fixed.props);
  });
  it('adds tracking between letters without moving accents away from their base', async () => {
    const font = await readCadFont(Uint8Array.from(raw).buffer);
    const plain = curveBounds(glyphRunContours(font, 'AB', 0, 0, 100)), tracked = curveBounds(glyphRunContours(font, 'AB', 0, 0, 100, 20));
    close(tracked.w - plain.w, 20);
    const tight = curveBounds(glyphRunContours(font, 'AB', 0, 0, 100, -10)); close(tight.w - plain.w, -10);
    assert.deepEqual(glyphRunContours(font, 'A\u0301', 0, 0, 100, 20), glyphRunContours(font, 'A\u0301', 0, 0, 100));
    const run = font.layout('ffi', { liga: false, clig: false }); assert.equal(run.glyphs.length, 3);
    const trackedLigature = curveBounds(glyphRunContours(font, 'ffi', 0, 0, 100, 20));
    assert.ok(trackedLigature.w > curveBounds(glyphRunContours(font, 'ffi', 0, 0, 100)).w + 30);
    assert.ok(glyphRunContours(font, 'B'.repeat(600), 0, 0, 24, 10).length > 600);
  });
  it('uses the same spaced glyph paths for SVG and curve conversion with page transforms', async () => {
    const f = setup(); measurement(f); applySelectedDrawingTextStyle(f.editor, [id], { letterSpacing: 20, lineHeight: 2 });
    f.editor.updateShape({ id, x: 40, y: 60, rotation: 0.3 });
    const shape = f.editor.getShape(id), util = new DrawingTextShapeUtil(f.editor);
    f.editor.getShapeGeometry = (s: any) => util.getGeometry(s);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(Uint8Array.from(raw));
    try {
      const svg = await util.toSvg(shape, { isDarkMode: false } as any);
      const plan = await prepareCadText(f.editor, DEFAULT_CAD_SETTINGS, { sourceId: id, text: '', font: 'sans', height: 10, x: 0, y: 0, keepSource: false });
      const contours = plan.shapes[0].props.contours as CadContour[];
      const inverse = f.editor.getShapePageTransform(shape).clone().invert();
      const local = mapContours(contours, p => { const q = inverse.applyToPoint(p); return { x: q.x / shape.props.scale, y: q.y / shape.props.scale }; });
      const actual = curvePathData(local).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number), expected = svg.props.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
      assert.equal(actual.length, expected.length); actual.forEach((value, i) => close(value, expected[i])); assert.equal(svg.type, 'path');
      const font = await readCadFont(Uint8Array.from(raw).buffer), spacing = getDrawingTextSpacing(shape);
      close(drawingTextBaseline(font, 24, spacing, 6) + 6, drawingTextBaseline(font, 24, spacing, 0));
    } finally { globalThis.fetch = originalFetch; }
  });
  it('persists spacing in native records and restores it with real undo/redo', () => {
    const store = createTLStore({ shapeUtils: defaultShapeUtils }), f = setup();
    store.put([{ ...f.editor.getShape(id), typeName: 'shape', index: 'a1', parentId: 'page:page', opacity: 1, isLocked: false }]);
    const history = new HistoryManager({ store });
    const editor: any = { ...f.editor, store, getShape: (key: any) => store.get(key), run: history.batch, mark: history.mark.bind(history), bailToMark: history.bailToMark,
      updateShapes: (updates: any[]) => store.put(updates.map(patch => { const current: any = store.get(patch.id); return { ...current, ...patch, props: { ...current.props, ...patch.props } }; })) };
    try {
      assert.equal(applySelectedDrawingTextStyle(editor, [id], { letterSpacing: -10, lineHeight: 1.8 }), true);
      const saved = JSON.parse(JSON.stringify(store.serialize())); assert.equal(saved[id].meta.omsTextSpacing.lineHeight, 1.8);
      history.undo(); assert.deepEqual(getDrawingTextSpacing(editor.getShape(id)), { letterSpacing: 0, lineHeight: 1.35 });
      history.redo(); assert.deepEqual(getDrawingTextSpacing(editor.getShape(id)), { letterSpacing: -10, lineHeight: 1.8 });
    } finally { history.dispose(); }
  });
});
