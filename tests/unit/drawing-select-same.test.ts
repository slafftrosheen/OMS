import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { TLShapeId } from '@tldraw/tldraw';
import { prepareSelectSame, applySelectSame, selectSameRevision, type SelectSameFields } from '../../src/lib/components/canvas/drawing-select-same';
import { VECTOR_DEFAULT_PAINT } from '../../src/lib/components/canvas/cad-paint';

const fields = (values: Partial<SelectSameFields>): SelectSameFields => ({ type: false, fill: false, outline: false, opacity: false, ...values });
function shape(id: string, type = 'geo', props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): any {
  return { id, type, parentId: 'page:a', x: 0, y: 0, rotation: 0, opacity: 1, meta: {}, isLocked: false,
    props: { geo: 'rectangle', color: 'red', fill: 'solid', dash: 'draw', size: 'm', ...props }, ...extra };
}
function canvas(shapes: any[], selected = [shapes[0]?.id]) {
  const records = new Map(shapes.map(s => [s.id, structuredClone(s)]));
  let ids = [...selected], readonly = false, idle = true, page = 'page:a', rejectOnce = false;
  const editor: any = {
    getShape: (id: string) => records.get(id),
    getCurrentPageId: () => page,
    getCurrentPageShapesSorted: () => [...records.values()].filter(s => s.parentId !== 'page:b'),
    getSelectedShapeIds: () => [...ids], getInstanceState: () => ({ isReadonly: readonly }),
    isIn: () => idle,
    setSelectedShapes: (next: string[]) => { if (rejectOnce) { rejectOnce = false; ids = [next[0]]; } else ids = [...next]; },
  };
  return { editor, records, selection: () => [...ids], setSelection: (next: string[]) => { ids = [...next]; },
    setReadonly: () => { readonly = true; idle = false; }, busy: () => { idle = false; },
    page: () => { page = 'page:b'; }, reject: () => { rejectOnce = true; } };
}
function plan(editor: any, options: SelectSameFields) {
  const result = prepareSelectSame(editor, options);
  assert.equal(result.ok, true);
  return result.value;
}
const paintShape = (id: string, type = 'cad-bezier', paint: Record<string, unknown> = {}, props: Record<string, unknown> = {}) =>
  shape(id, type, { w: 100, h: 100, radius: 100, startAngle: 0, endAngle: 90, closed: true,
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    contours: [{ closed: true, nodes: [{ x: 0, y: 0, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' },
      { x: 100, y: 0, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' },
      { x: 100, y: 100, inX: 0, inY: 0, outX: 0, outY: 0, mode: 'corner' }] }], ...props }, { meta: { omsVectorPaint: { ...structuredClone(VECTOR_DEFAULT_PAINT), fill: '#FF0000', ...paint } } });

describe('Select Same artwork', () => {
  it('matches geometric subtype and searches group members without selecting forms, files, frames or other pages', () => {
    const c = canvas([shape('source'), shape('rect'), shape('ellipse', 'geo', { geo: 'ellipse' }),
      shape('group', 'group'), shape('child', 'geo', {}, { parentId: 'group' }),
      shape('frame', 'frame'), shape('in-frame', 'geo', {}, { parentId: 'frame' }),
      shape('form', 'profile-7st'), shape('in-form', 'geo', {}, { parentId: 'form' }),
      shape('document', 'document'), shape('other', 'geo', {}, { parentId: 'page:b' })]);
    const p = plan(c.editor, fields({ type: true }));
    assert.deepEqual(p.ids, ['source', 'rect', 'child']);
    assert.equal(p.inspected, 4);
    assert.deepEqual(c.selection(), ['source']);
  });
  it('requires every checked native property and leaves text/font/geometry untouched', () => {
    const c = canvas([shape('source'), shape('same'), shape('blue', 'geo', { color: 'blue' }),
      shape('thin', 'geo', { size: 's' }), shape('faint', 'geo', {}, { opacity: 0.5 })]);
    const before = structuredClone([...c.records.values()]);
    const p = plan(c.editor, fields({ fill: true, outline: true, opacity: true }));
    assert.deepEqual(p.ids, ['source', 'same']);
    assert.deepEqual(applySelectSame(c.editor, p, 'replace'), { ok: true, value: 2 });
    assert.deepEqual([...c.records.values()], before);
  });
  it('permits read-only and locked artwork selection with no record or history mutation', () => {
    const c = canvas([shape('source'), shape('locked', 'geo', {}, { isLocked: true })]);
    c.setReadonly(); const revision = selectSameRevision(c.editor);
    assert.deepEqual(applySelectSame(c.editor, plan(c.editor, fields({ type: true })), 'replace'), { ok: true, value: 2 });
    assert.equal(selectSameRevision(c.editor), revision);
    assert.deepEqual(c.selection(), ['source', 'locked']);
  });
  it('compares CAD hex colors case-insensitively and separates CAD from native style tokens', () => {
    const c = canvas([paintShape('source'), paintShape('ellipse', 'cad-ellipse', { fill: '#ff0000' }),
      shape('native'), paintShape('blue', 'cad-bezier', { fill: '#0000ff' })]);
    assert.deepEqual(plan(c.editor, fields({ fill: true })).ids, ['source', 'ellipse']);
  });
  it('uses effective open-curve paint and exact CAD outline widths and dashes', () => {
    const c = canvas([paintShape('source', 'cad-arc', { strokeWidth: 3, dash: [4, 2] }),
      paintShape('path', 'cad-path', { fill: '#0000ff', strokeWidth: 3, dash: [4, 2] }, { closed: false }),
      paintShape('thin', 'cad-arc', { strokeWidth: 1, dash: [4, 2] }),
      paintShape('dash', 'cad-arc', { strokeWidth: 3, dash: [2, 2] })]);
    assert.deepEqual(plan(c.editor, fields({ fill: true, outline: true })).ids, ['source', 'path']);
  });
  it('matches device hairlines regardless of fallback width without matching an equal numeric stroke', () => {
    const c = canvas([paintShape('source', 'cad-path', { hairline: true, strokeWidth: .04 }),
      paintShape('hairline', 'cad-path', { hairline: true, strokeWidth: .02 }),
      paintShape('numeric', 'cad-path', { strokeWidth: .04 })]);
    assert.deepEqual(plan(c.editor, fields({ outline: true })).ids, ['source', 'hairline']);
  });
  it('matches the same gradient definition independent of property insertion order', () => {
    const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [100, 0], r0: 0, r1: 1,
      stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const reversed = Object.fromEntries(Object.entries(gradient).reverse());
    const c = canvas([paintShape('source', 'cad-bezier', { gradient }),
      paintShape('same', 'cad-bezier', { gradient: reversed }),
      paintShape('other', 'cad-bezier', { gradient: { ...gradient, end: [200, 0] } })]);
    assert.deepEqual(plan(c.editor, fields({ fill: true })).ids, ['source', 'same']);
  });
  it('normalizes fitted gradient mapping across differently sized analytic shapes', () => {
    const gradient = { type: 'linear', matrix: [1, 0, 0, 1, 0, 0], start: [0, 0], end: [100, 0], r0: 0, r1: 1,
      stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
    const c = canvas([paintShape('source', 'cad-ellipse', { gradient }),
      paintShape('larger', 'cad-ellipse', { gradient: { ...gradient, matrix: [2, 0, 0, 3, 0, 0] } }, { w: 200, h: 300 }),
      paintShape('unaligned', 'cad-ellipse', { gradient }, { w: 200, h: 300 })]);
    assert.deepEqual(plan(c.editor, fields({ fill: true })).ids, ['source', 'larger']);
  });
  it('ignores inactive fill colors and hidden CAD outline attributes', () => {
    const c = canvas([paintShape('source', 'cad-ellipse', { fillOpacity: 0, strokeWidth: 0 }),
      paintShape('none', 'cad-ellipse', { fill: 'none', stroke: 'none', strokeWidth: 30 }),
      paintShape('visible', 'cad-ellipse')]);
    assert.deepEqual(plan(c.editor, fields({ fill: true, outline: true })).ids, ['source', 'none']);
    const n = canvas([shape('red', 'geo', { fill: 'none' }), shape('blue', 'geo', { fill: 'none', color: 'blue' })]);
    assert.deepEqual(plan(n.editor, fields({ fill: true })).ids, ['red', 'blue']);
  });
  it('rejects unsupported image/text criteria and an empty property set without clearing selection', () => {
    const image = canvas([shape('image', 'image'), shape('image2', 'image')]);
    assert.deepEqual(plan(image.editor, fields({ type: true })).ids, ['image', 'image2']);
    assert.deepEqual(prepareSelectSame(image.editor, fields({ fill: true })), { ok: false, error: 'unsupported' });
    assert.deepEqual(prepareSelectSame(image.editor, fields({})), { ok: false, error: 'fieldsRequired' });
    const text = canvas([shape('text', 'text')]);
    assert.deepEqual(prepareSelectSame(text.editor, fields({ outline: true })), { ok: false, error: 'unsupported' });
    assert.deepEqual(image.selection(), ['image']); assert.deepEqual(text.selection(), ['text']);
  });
  it('keeps the reviewed reference while adding matches to a later selection', () => {
    const c = canvas([shape('source'), shape('same'), shape('ellipse', 'geo', { geo: 'ellipse' })]);
    const p = plan(c.editor, fields({ type: true }));
    c.setSelection(['ellipse']);
    assert.deepEqual(applySelectSame(c.editor, p, 'add'), { ok: true, value: 3 });
    assert.deepEqual(c.selection(), ['ellipse', 'source', 'same']);
  });
  it('recomputes reviewed matches rather than trusting modified cached ids', () => {
    const c = canvas([shape('source'), shape('same'), shape('form', 'order-details')]);
    const p = plan(c.editor, fields({ type: true })); p.ids = ['form' as TLShapeId];
    assert.deepEqual(applySelectSame(c.editor, p, 'replace'), { ok: true, value: 2 });
    assert.deepEqual(c.selection(), ['source', 'same']);
  });
  it('rejects document and page changes with selection preserved', () => {
    const c = canvas([shape('source'), shape('same')]);
    const p = plan(c.editor, fields({ fill: true }));
    c.records.get('same').props.color = 'blue'; c.setSelection(['same']);
    assert.deepEqual(applySelectSame(c.editor, p, 'replace'), { ok: false, error: 'changed' });
    assert.deepEqual(c.selection(), ['same']);
    const p2 = plan(c.editor, fields({ type: true })); c.page();
    assert.deepEqual(applySelectSame(c.editor, p2, 'replace'), { ok: false, error: 'changed' });
    assert.deepEqual(c.selection(), ['same']);
  });
  it('refuses a live drawing gesture without completing or changing tools', () => {
    const c = canvas([shape('source'), shape('same')]);
    const p = plan(c.editor, fields({ type: true })); c.busy();
    assert.deepEqual(applySelectSame(c.editor, p, 'replace'), { ok: false, error: 'pickRequired' });
    assert.deepEqual(c.selection(), ['source']);
  });
  it('restores the previous selection if the editor rejects part of the result', () => {
    const c = canvas([shape('source'), shape('same'), shape('old', 'geo', { geo: 'ellipse' })]);
    const p = plan(c.editor, fields({ type: true })); c.setSelection(['old']); c.reject();
    assert.deepEqual(applySelectSame(c.editor, p, 'replace'), { ok: false, error: 'failed' });
    assert.deepEqual(c.selection(), ['old']);
  });
});
