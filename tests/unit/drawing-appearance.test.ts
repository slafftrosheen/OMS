import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { applyDrawingAppearance, copyDrawingAppearance, getDrawingAppearance, inspectDrawingAppearanceTargets, subscribeDrawingAppearance } from '../../src/lib/components/canvas/drawing-appearance';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';

const fillOnly = { fill: true, outline: false, opacity: false };
const outlineOnly = { fill: false, outline: true, opacity: false };
const opacityOnly = { fill: false, outline: false, opacity: true };
const rect = (x = 0, y = 0, w = 100, h = 80) => [{ closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(nodeAt) }];
const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [10, 20], end: [110, 100], r0: 0, r1: 1, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
function fixture() {
  const shapes = new Map<string, any>(), marks: any[] = [];
  let selected: string[] = [], readOnly = false, skip: string | null = null;
  const editor: any = {
    getInstanceState: () => ({ isReadonly: readOnly }),
    getSelectedShapeIds: () => selected, getOnlySelectedShape: () => selected.length === 1 ? shapes.get(selected[0]) : null,
    getShape: (id: string) => shapes.get(id), getCurrentPageShapesSorted: () => [...shapes.values()],
    getShapeAndDescendantIds(ids: string[]) { const all = new Set(ids); for (const id of all) for (const shape of shapes.values()) if (shape.parentId === id) all.add(shape.id); return all; },
    isShapeOrAncestorLocked(shape: any): boolean { return !!shape && (!!shape.isLocked || editor.isShapeOrAncestorLocked(shapes.get(shape.parentId))); },
    complete() {}, setCurrentTool() {}, run(fn: () => void) { fn(); },
    mark(id: string) { marks.push({ id, shapes: structuredClone([...shapes]), selected: [...selected] }); },
    bailToMark(id: string) { const index = marks.findIndex(m => m.id === id), mark = marks[index]; shapes.clear(); mark.shapes.forEach(([key, shape]: any) => shapes.set(key, shape)); selected = mark.selected; marks.splice(index); },
    updateShapes(updates: any[]) { for (const update of updates) { if (update.id === skip) continue; const shape = shapes.get(update.id); shapes.set(update.id, { ...shape, ...update, props: { ...shape.props, ...update.props }, meta: { ...shape.meta, ...update.meta } }); } }
  };
  function add(id: string, type = 'geo', props: any = {}, meta: any = {}) {
    const shape = { id, type, parentId: 'page:one', x: 23, y: 41, rotation: .7, index: 'a1', opacity: 1, isLocked: false,
      props: type === 'cad-bezier' ? { contours: rect(), fillRule: 'evenodd', color: 'black', ...props } : { color: 'blue', fill: 'solid', dash: 'solid', size: 'm', w: 50, h: 80, text: 'Keep this text', ...props }, meta };
    shapes.set(id, shape); return shape;
  }
  return { editor, shapes, marks, add, select: (...ids: string[]) => { selected = ids; }, readonly: (value: boolean) => { readOnly = value; }, skip: (id: string) => { skip = id; } };
}
describe('copy and apply drawing appearance', () => {
  it('copies an immutable style snapshot and preserves all target geometry, text, font and metadata', () => {
    const f = fixture(), source = f.add('source', 'geo', { color: 'red', fill: 'pattern', dash: 'dashed', size: 'xl' });
    source.opacity = .5;
    const target = f.add('target', 'geo', { font: 'serif', text: 'Original lettering' }, { omsFontId: 'custom-font', custom: 'retained' });
    const before = structuredClone(target); let notifications = 0;
    const unsubscribe = subscribeDrawingAppearance(f.editor, () => { notifications++; });
    f.select('source'); assert.equal(copyDrawingAppearance(f.editor).ok, true); unsubscribe(); assert.equal(notifications, 1);
    source.props.color = 'green'; source.opacity = 1;
    f.select('target'); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: true, count: 1 });
    assert.deepEqual(f.shapes.get('target'), { ...before, opacity: .5, props: { ...before.props, color: 'red', fill: 'pattern', dash: 'dashed', size: 'xl' } });
    assert.equal(f.marks.length, 2); f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.shapes.get('target'), before);
  });
  it('applies chosen native properties without copying text size or fonts', () => {
    const f = fixture(); f.add('source', 'geo', { color: 'red', fill: 'pattern' }); const target = f.add('target', 'text', { font: 'serif', size: 'xl', text: 'Preserved' });
    const before = structuredClone(target); f.select('source'); copyDrawingAppearance(f.editor); f.select('target');
    assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'incompatible' });
    assert.deepEqual(applyDrawingAppearance(f.editor, fillOnly), { ok: true, count: 1 });
    assert.equal(f.shapes.get('target').props.size, before.props.size); assert.equal(f.shapes.get('target').props.font, before.props.font); assert.equal(f.shapes.get('target').props.text, before.props.text);
  });
  it('fits gradients to target local bounds and preserves target clips, contours and transforms', () => {
    const f = fixture(), source = f.add('source', 'cad-bezier', { contours: rect(10, 20, 100, 80) }, { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, fill: '#ff0000', gradient } });
    const clips = [{ contours: rect(50, 40, 200, 40), fillRule: 'evenodd' }];
    const target = f.add('target', 'cad-bezier', { contours: rect(50, 40, 200, 40) }, { custom: 'kept', omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, stroke: '#00ff00', strokeWidth: 7, clips } });
    const before = structuredClone(target), sourceBefore = structuredClone(source);
    f.select('source'); copyDrawingAppearance(f.editor); f.select('target'); assert.equal(applyDrawingAppearance(f.editor, fillOnly).ok, true);
    const after = f.shapes.get('target'); assert.deepEqual(after.props, before.props); assert.equal(after.rotation, before.rotation); assert.equal(after.x, before.x); assert.equal(after.y, before.y);
    assert.deepEqual(after.meta.omsVectorPaint.gradient.matrix, [2, 0, 0, .5, 30, 30]);
    assert.deepEqual(after.meta.omsVectorPaint.clips, clips); assert.equal(after.meta.omsVectorPaint.strokeWidth, 7); assert.equal(after.meta.omsVectorPaint.stroke, '#00ff00'); assert.equal(after.meta.custom, 'kept'); assert.deepEqual(source, sourceBefore);
  });
  it('supports curve outline independently of existing material fill without copying asset references', () => {
    const f = fixture(), raster = { usage: 'material', width: 1, height: 1, png: '/api/files/11111111-1111-1111-1111-111111111111/download', external: true, fileId: '11111111-1111-1111-1111-111111111111', hasAlpha: false, matrix: [100, 0, 0, 80, 0, 0] };
    f.add('source', 'cad-bezier', {}, { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, raster, stroke: '#ff0000', strokeWidth: 8, dash: [4, 2] } });
    f.add('target', 'cad-bezier', {}, { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, raster }, omsMaterialTexture: { scale: 300 } });
    f.select('source'); copyDrawingAppearance(f.editor); assert.equal(getDrawingAppearance(f.editor)?.available.fill, false); assert.equal(getDrawingAppearance(f.editor)?.paint?.raster, undefined);
    f.select('target'); assert.equal(applyDrawingAppearance(f.editor, outlineOnly).ok, true);
    const paint = f.shapes.get('target').meta.omsVectorPaint; assert.deepEqual(paint.raster, raster); assert.equal(paint.strokeWidth, 8); assert.deepEqual(f.shapes.get('target').meta.omsMaterialTexture, { scale: 300 });
    assert.deepEqual(applyDrawingAppearance(f.editor, fillOnly), { ok: false, error: 'incompatible' });
  });
  it('rejects locked descendants and read-only edits atomically while permitting copy', () => {
    const f = fixture(), source = f.add('source', 'geo', { color: 'red' }); source.isLocked = true;
    f.select('source'); f.readonly(true); assert.equal(copyDrawingAppearance(f.editor).ok, true); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'protected' });
    f.readonly(false); f.add('group', 'group'); const a = f.add('a'), b = f.add('b'); a.parentId = b.parentId = 'group'; b.isLocked = true;
    f.select('group'); const before = structuredClone([...f.shapes]); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'protected' }); assert.deepEqual([...f.shapes], before); assert.equal(f.marks.length, 0);
  });
  it('styles all compatible group members and rejects unsupported order forms with no partial edits', () => {
    const f = fixture(); f.add('source', 'geo', { color: 'red' }); f.select('source'); copyDrawingAppearance(f.editor);
    f.add('group', 'group'); const a = f.add('a'), b = f.add('b', 'draw'); a.parentId = b.parentId = 'group';
    f.select('group'); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: true, count: 2 }); assert.equal(f.shapes.get('a').props.color, 'red'); assert.equal(f.shapes.get('b').props.color, 'red');
    const form = f.add('form', 'order-details'); form.parentId = 'group'; const before = structuredClone([...f.shapes]); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'incompatible' }); assert.deepEqual([...f.shapes], before);
  });
  it('rolls back every target if the editor skips an update', () => {
    const f = fixture(); f.add('source', 'geo', { color: 'red' }); f.add('a'); f.add('b'); f.select('source'); copyDrawingAppearance(f.editor); f.select('a', 'b');
    const before = structuredClone([...f.shapes]); f.skip('b'); assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'failed' }); assert.deepEqual([...f.shapes], before); assert.equal(f.marks.length, 0);
  });
  it('checks selection again after completing the current tool', () => {
    const f = fixture(); f.add('source', 'geo', { color: 'red' }); f.add('a'); f.add('b'); f.select('source'); copyDrawingAppearance(f.editor); f.select('a'); f.editor.complete = () => f.select('b');
    assert.deepEqual(applyDrawingAppearance(f.editor), { ok: false, error: 'selectionChanged' }); assert.equal(f.marks.length, 0);
  });
  it('allows opacity across supported style families without changing paint or geometry', () => {
    const f = fixture(); f.add('source').opacity = .25; const target = f.add('target', 'cad-bezier', {}, { omsVectorPaint: VECTOR_DEFAULT_PAINT }); const before = structuredClone(target);
    f.select('source'); copyDrawingAppearance(f.editor); f.select('target'); assert.equal(applyDrawingAppearance(f.editor, opacityOnly).ok, true); assert.deepEqual(f.shapes.get('target'), { ...before, opacity: .25 });
  });
  it('does not add history for no-op and invalid property selection', () => {
    const f = fixture(); f.add('source'); f.add('target'); f.select('source'); copyDrawingAppearance(f.editor); f.select('target');
    assert.deepEqual(applyDrawingAppearance(f.editor), { ok: true, count: 0 }); assert.equal(f.marks.length, 0);
    assert.deepEqual(inspectDrawingAppearanceTargets(f.editor, { fill: false, outline: false, opacity: false }), { ok: false, error: 'fieldsRequired' });
  });
  it('enforces the snapshot save budget before creating undo marks', () => {
    const f = fixture(); f.add('source', 'cad-bezier', {}, { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, gradient } }); f.add('target', 'cad-bezier', {}, { omsVectorPaint: VECTOR_DEFAULT_PAINT });
    f.select('source'); copyDrawingAppearance(f.editor); f.select('target'); f.editor.store = { getStoreSnapshot: () => ({ data: 'x'.repeat(1_900_000) }) };
    assert.deepEqual(applyDrawingAppearance(f.editor, fillOnly), { ok: false, error: 'saveLimit' }); assert.equal(f.marks.length, 0);
  });
});

describe('analytic CAD appearance', () => {
  it('fits copied gradients to exact ellipse bounds without changing analytic geometry', () => {
    const f = fixture();
    f.add('source', 'cad-bezier', { contours: rect(10, 20, 100, 80) }, { omsVectorPaint: { ...VECTOR_DEFAULT_PAINT, gradient } });
    const target = f.add('ellipse', 'cad-ellipse', { w: 300, h: 40 }, { custom: 'keep' }), before = structuredClone(target);
    f.select('source'); assert.equal(copyDrawingAppearance(f.editor).ok, true);
    f.select('ellipse'); assert.equal(applyDrawingAppearance(f.editor, fillOnly).ok, true);
    const result = f.shapes.get('ellipse');
    assert.deepEqual(result.props, before.props); assert.equal(result.type, 'cad-ellipse');
    assert.deepEqual(result.meta.omsVectorPaint.gradient.matrix, [3, 0, 0, .5, -30, -10]);
    assert.equal(result.meta.custom, 'keep'); assert.equal(result.rotation, before.rotation);
    f.editor.bailToMark(f.marks[0].id); assert.deepEqual(f.shapes.get('ellipse'), before);
  });
  it('copies all stroke attributes between closed paths, ellipses and arcs', () => {
    const f = fixture(), paint = { ...VECTOR_DEFAULT_PAINT, stroke: '#aabbcc', strokeWidth: 7, strokeOpacity: .4, dash: [3, 8], dashOffset: 2, lineCap: 'round', lineJoin: 'bevel', miterLimit: 12 };
    f.add('source', 'cad-path', { points: [{x:0,y:0},{x:10,y:0},{x:10,y:20}], closed:true }, { omsVectorPaint: paint });
    const arc = f.add('arc', 'cad-arc', { radius:50,startAngle:20,endAngle:250 }), before = structuredClone(arc);
    f.select('source'); assert.equal(copyDrawingAppearance(f.editor).ok, true); f.select('arc');
    assert.equal(applyDrawingAppearance(f.editor, outlineOnly).ok, true);
    assert.deepEqual(f.shapes.get('arc').props, before.props);
    for (const key of ['stroke','strokeWidth','strokeOpacity','dash','dashOffset','lineCap','lineJoin','miterLimit']) assert.deepEqual(f.shapes.get('arc').meta.omsVectorPaint[key], (paint as any)[key]);
  });
  it('refuses fill on open analytic geometry without losing existing paint metadata', () => {
    const f = fixture(); f.add('source','cad-ellipse',{w:100,h:80},{omsVectorPaint:{...VECTOR_DEFAULT_PAINT,fill:'#ff0000',stroke:'#ff0000'}});
    const target = f.add('open','cad-path',{points:[{x:0,y:0},{x:100,y:30}],closed:false},{omsVectorPaint:{...VECTOR_DEFAULT_PAINT,gradient}});
    f.select('source'); copyDrawingAppearance(f.editor); f.select('open');
    assert.equal(applyDrawingAppearance(f.editor,fillOnly).ok,false); assert.equal(f.marks.length,0);
    assert.equal(applyDrawingAppearance(f.editor,outlineOnly).ok,true);
    assert.deepEqual(f.shapes.get('open').meta.omsVectorPaint.gradient,target.meta.omsVectorPaint.gradient);
    f.select('open'); assert.equal(copyDrawingAppearance(f.editor).ok,true); assert.equal(getDrawingAppearance(f.editor)?.available.fill,false);
  });
});
