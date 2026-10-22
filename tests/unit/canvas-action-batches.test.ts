import { describe, expect, it } from 'vitest';
import { canvasActionsRequireBatch, normalizeCanvasActions } from '../../src/lib/components/canvas/toolkit-actions';
import { applyToolkitAction, applyToolkitActions } from '../../src/lib/components/canvas/toolkit-action-executor';
import { captureToolkitScene } from '../../src/lib/components/canvas/toolkit-scene';
import { parseToolkitModelResponse } from '../../src/lib/server/toolkit/ai-response';

const shape = (id: string, type = 'geo', extra: any = {}) => ({
  id: `shape:${id}`, type, x: 0, y: 0, rotation: 0, opacity: 1, index: `a${id}`,
  parentId: 'page:board', isLocked: false, props: { w: 160, h: 100, text: id }, ...extra
});
const create = (ref: string, x = 0, y = 0) => ({
  kind: 'create', ref, shape: { type: 'geo', x, y, props: { w: 160, h: 100, text: ref } }
});

/** Deliberately models native grouping's select-tool gate and real record
 * changes. The browser regression separately uses the installed tldraw editor. */
function editorFixture(initial: any[] = [], initialTool = 'select') {
  let records = structuredClone(initial);
  let bindings: any[] = [];
  let tool = initialTool;
  const marks = new Map<string, { records: any[]; bindings: any[] }>();
  const calls: string[] = [];
  const editor: any = {
    calls,
    getCurrentPageShapes: () => records,
    getSelectedShapeIds: () => [],
    getCurrentPageId: () => 'page:board',
    getInstanceState: () => ({ isReadonly: false }),
    getShape: (id: string) => records.find((item: any) => item.id === id),
    getShapePageBounds: (id: string) => {
      const record = editor.getShape(id);
      return record ? { x: record.x, y: record.y, w: record.props.w ?? 160, h: record.props.h ?? 100,
        center: { x: record.x + (record.props.w ?? 160) / 2, y: record.y + (record.props.h ?? 100) / 2 } } : null;
    },
    getShapeGeometry: (id: string) => ({ bounds: editor.getShapePageBounds(id) }),
    getViewportPageBounds: () => ({ x: 0, y: 0, w: 1200, h: 800, center: { x: 600, y: 400 } }),
    getBindingsFromShape: (id: string) => bindings.filter(item => item.fromId === id),
    getAllBindings: () => bindings,
    getCurrentToolId: () => tool,
    complete: () => { calls.push('complete'); },
    setCurrentTool: (value: string) => { calls.push(`tool:${value}`); tool = value; },
    createShape: (value: any) => {
      calls.push('create');
      records.push({ ...shape(value.id.slice(6), value.type), ...value,
        props: { w: 160, h: 100, ...value.props } });
    },
    createBindings: (values: any[]) => { calls.push('bindings'); bindings.push(...structuredClone(values)); },
    updateShape: (patch: any) => {
      calls.push('update');
      const current = editor.getShape(patch.id);
      if (!current) throw new Error('Missing shape');
      Object.assign(current, { ...patch, props: { ...current.props, ...patch.props } });
    },
    updateShapes: (patches: any[]) => patches.forEach(editor.updateShape),
    nudgeShapes: (ids: string[], delta: any) => ids.forEach(id => {
      const current = editor.getShape(id);
      editor.updateShape({ id, x: current.x + delta.x, y: current.y + delta.y });
    }),
    resizeShape: (id: string, scale: any) => {
      const current = editor.getShape(id);
      editor.updateShape({ id, props: { w: current.props.w * scale.x, h: current.props.h * scale.y } });
    },
    alignShapes: (ids: string[], alignment: string) => {
      calls.push('align');
      if (alignment !== 'top') throw new Error('Unexpected fixture alignment');
      const top = Math.min(...ids.map(id => editor.getShape(id).y));
      ids.forEach(id => editor.updateShape({ id, y: top }));
    },
    groupShapes: (ids: string[], { groupId }: { groupId: string }) => {
      calls.push('group');
      if (tool !== 'select') return;
      editor.createShape({ id: groupId, type: 'group', parentId: 'page:board', x: 0, y: 0, props: {} });
      ids.forEach(id => editor.updateShape({ id, parentId: groupId }));
    },
    ungroupShapes: (ids: string[]) => {
      calls.push('ungroup');
      if (tool !== 'select') return;
      for (const id of ids) {
        const group = editor.getShape(id);
        records.filter((item: any) => item.parentId === id).forEach((item: any) => {
          item.parentId = group.parentId; item.x += group.x; item.y += group.y;
        });
      }
      records = records.filter((item: any) => !ids.includes(item.id));
    },
    deleteShapes: (ids: string[]) => { calls.push('delete'); records = records.filter((item: any) => !ids.includes(item.id)); },
    mark: (id: string) => { calls.push('mark'); marks.set(id, structuredClone({ records, bindings })); },
    run: (fn: () => void) => { calls.push('run'); fn(); },
    bailToMark: (id: string) => {
      calls.push('rollback');
      ({ records, bindings } = structuredClone(marks.get(id)!));
    }
  };
  return editor;
}

describe('Named Canvas proposal references', () => {
  it('keeps a complete create/edit/arrange/connect plan through model parsing and private persistence', () => {
    const editor = editorFixture([shape('existing')]);
    const raw = [create('start'), create('finish', 320, 80),
      { kind: 'update', target: '@start', patch: { props: { text: 'Ready', color: 'violet' } } },
      { kind: 'align', targets: ['@start', '@finish'], alignment: 'top' },
      { kind: 'connect', from: 'shape:existing', to: '@start' },
      { kind: 'connect', from: '@start', to: '@finish', label: 'Next' },
      { kind: 'group', targets: ['@start', '@finish'] }];
    const parsed = parseToolkitModelResponse(JSON.stringify({ reply: 'Review this diagram', actions: raw }), captureToolkitScene(editor), 'Fallback');
    expect(parsed.actions).toHaveLength(7);
    expect(parsed.actions[4].expected).toHaveProperty('shape:existing');
    expect(parsed.actions[5].expected).toEqual({});
    expect(normalizeCanvasActions([{ kind: 'task', title: 'Ordinary card' }, ...parsed.actions])).toEqual(parsed.actions);
    expect(canvasActionsRequireBatch(parsed.actions)).toBe(true);
    expect(canvasActionsRequireBatch(normalizeCanvasActions([create('unused')]))).toBe(false);
  });

  it('rejects duplicate, malformed, unresolved and forward references without keeping orphan creates', () => {
    for (const plan of [
      [create('same'), create('same')],
      [create('bad name')],
      [create('@start')],
      [create('start'), { kind: 'connect', from: '@start', to: '@absent' }],
      [{ kind: 'move', targets: ['@later'], dx: 10, dy: 0 }, create('later')],
      [create('start'), { kind: 'move', targets: ['@'], dx: 10, dy: 0 }],
      [create('start'), { kind: 'unsupported-operation', target: '@start' }],
      [create('start'), null]
    ]) expect(normalizeCanvasActions(plan, captureToolkitScene(editorFixture()))).toEqual([]);
  });

  it('uses each created type to reject invalid edits, ungrouping and unsafe media in a linked plan', () => {
    const scene = captureToolkitScene(editorFixture());
    for (const plan of [
      [create('start'), { kind: 'update', target: '@start', patch: { props: { fileId: 'invented' } } }],
      [create('start'), { kind: 'ungroup', targets: ['@start'] }],
      [{ kind: 'create', ref: 'link', shape: { type: 'document', x: 0, y: 0, props: { url: 'javascript:alert(1)' } } },
        { kind: 'move', targets: ['@link'], dx: 10, dy: 0 }],
      [create('start'), { kind: 'resize', target: '@start', width: Infinity, height: 120 }]
    ]) expect(normalizeCanvasActions(plan, scene)).toEqual([]);
  });

  it('enforces action and target limits for the complete linked batch', () => {
    const scene = captureToolkitScene(editorFixture());
    expect(normalizeCanvasActions(Array.from({ length: 13 }, (_, i) => create(`item_${i}`)), scene)).toEqual([]);
    expect(normalizeCanvasActions([create('one'), {
      kind: 'move', targets: Array.from({ length: 41 }, () => '@one'), dx: 1, dy: 0
    }], scene)).toEqual([]);
  });

  it('allows an explicit layout of newly-created idea cards without adding other cards', () => {
    const editor = editorFixture([shape('existing', 'idea-card')]);
    const raw = ['one','two'].map(ref => ({ kind: 'create', ref,
      shape: { type: 'idea-card', x: 0, y: 0, props: { title: ref } } }));
    const plan = normalizeCanvasActions([...raw, { kind: 'layout', layout: 'grid', targets: ['@one','@two'] }], captureToolkitScene(editor));
    expect(plan[2]).toMatchObject({ targets: ['@one','@two'], expected: {} });
    expect(applyToolkitActions(editor, plan).ok).toBe(true);
    expect(editor.getShape('shape:existing')).toMatchObject({ x: 0, y: 0 });
    expect(editor.getCurrentPageShapes().filter((item: any) => item.id !== 'shape:existing').map((item: any) => item.x)).toEqual([60,390]);
  });
});

describe('Atomic application of linked Canvas edits', () => {
  it('creates, edits, resizes, aligns, connects and groups real local IDs from a non-select tool', () => {
    const editor = editorFixture([], 'draw');
    const plan = normalizeCanvasActions([
      create('start', 80, 30), create('finish', 400, 90),
      { kind: 'update', target: '@start', patch: { props: { text: 'Ready', color: 'violet' } } },
      { kind: 'resize', target: '@finish', width: 220, height: 140 },
      { kind: 'align', targets: ['@start','@finish'], alignment: 'top' },
      { kind: 'connect', from: '@start', to: '@finish', label: 'Next' },
      { kind: 'group', targets: ['@start','@finish'] }
    ], captureToolkitScene(editor));
    expect(applyToolkitActions(editor, plan)).toMatchObject({ ok: true, count: 7 });
    const records = editor.getCurrentPageShapes();
    const start = records.find((item: any) => item.props.text === 'Ready');
    const finish = records.find((item: any) => item.props.text === 'finish');
    const group = records.find((item: any) => item.type === 'group');
    expect(records).toHaveLength(4);
    expect(start).toMatchObject({ y: 30, parentId: group.id, props: { color: 'violet' } });
    expect(finish).toMatchObject({ y: 30, parentId: group.id, props: { w: 220, h: 140 } });
    expect(editor.getAllBindings().map((item: any) => item.toId)).toEqual([start.id,finish.id]);
    expect(records.every((item: any) => item.id.startsWith('shape:') && !('ref' in item))).toBe(true);
    expect(editor.getCurrentToolId()).toBe('select');
    expect(editor.calls.filter((call: string) => call === 'run')).toHaveLength(1);
    expect(editor.calls.filter((call: string) => call === 'mark')).toHaveLength(2);
    expect(editor.calls.slice(0, 3)).toEqual(['complete','tool:select','mark']);
  });

  it('cannot apply a dependent action without its original create definitions', () => {
    const editor = editorFixture();
    const plan = normalizeCanvasActions([create('start'), { kind: 'move', targets: ['@start'], dx: 20, dy: 0 }], captureToolkitScene(editor));
    expect(applyToolkitAction(editor, plan[1]).messageKey).toBe('canvas.editResult.invalid');
    expect(editor.calls).toEqual([]);
  });

  it('checks existing target fingerprints and locks before creating any new record', () => {
    const editor = editorFixture([shape('existing')]);
    const plan = normalizeCanvasActions([create('new'), { kind: 'connect', from: 'shape:existing', to: '@new' }], captureToolkitScene(editor));
    editor.getShape('shape:existing').x = 50;
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.stale');
    editor.getShape('shape:existing').isLocked = true;
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.protected');
    expect(editor.calls).toEqual([]);
    expect(editor.getCurrentPageShapes()).toHaveLength(1);
  });

  it('does not grant a named reference permission to group an order form', () => {
    const editor = editorFixture([shape('order','order-details')]);
    const forged = normalizeCanvasActions([create('new'), { kind: 'group', targets: ['@new','shape:order'], expected: {} }]);
    expect(applyToolkitActions(editor, forged).messageKey).toBe('canvas.editResult.protected');
    expect(editor.calls).toEqual([]);
  });

  it('rechecks stale guards after completing a pending native gesture', () => {
    const editor = editorFixture([shape('one'),shape('two')], 'draw');
    const plan = normalizeCanvasActions([{ kind: 'group', targets: ['shape:one','shape:two'] }], captureToolkitScene(editor));
    editor.complete = () => { editor.getShape('shape:one').props.text = 'Just finished editing'; };
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.stale');
    expect(editor.calls).toEqual(['tool:select']);
    expect(editor.getCurrentPageShapes()).toHaveLength(2);
  });

  it('ungroups from a drawing tool and keeps its children', () => {
    const editor = editorFixture([shape('group','group'),shape('child','geo',{ parentId: 'shape:group' })], 'draw');
    const plan = normalizeCanvasActions([{ kind: 'ungroup', targets: ['shape:group'] }], captureToolkitScene(editor));
    expect(applyToolkitActions(editor, plan).ok).toBe(true);
    expect(editor.getShape('shape:group')).toBe(undefined);
    expect(editor.getShape('shape:child').parentId).toBe('page:board');
    expect(editor.getCurrentToolId()).toBe('select');
  });

  it('rolls back new shapes and bindings when native grouping silently refuses the operation', () => {
    const editor = editorFixture([], 'draw');
    const plan = normalizeCanvasActions([create('one'),create('two',320),
      { kind: 'connect', from: '@one', to: '@two' }, { kind: 'group', targets: ['@one','@two'] }
    ], captureToolkitScene(editor));
    editor.groupShapes = () => {};
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.failed');
    expect(editor.getCurrentPageShapes()).toEqual([]);
    expect(editor.getAllBindings()).toEqual([]);
    expect(editor.calls).toContain('rollback');
  });

  it('rejects duplicate links within one batch before creating orphan shapes', () => {
    const editor = editorFixture();
    const plan = normalizeCanvasActions([create('one'),create('two',320),
      { kind: 'connect', from: '@one', to: '@two' }, { kind: 'connect', from: '@one', to: '@two' }
    ], captureToolkitScene(editor));
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.duplicateConnection');
    expect(editor.calls).toEqual([]);
  });

  it('rejects later edits to a reference already deleted by the batch', () => {
    const editor = editorFixture();
    const plan = normalizeCanvasActions([create('one'),{ kind: 'delete', targets: ['@one'] },
      { kind: 'move', targets: ['@one'], dx: 10, dy: 0 }
    ], captureToolkitScene(editor));
    expect(applyToolkitActions(editor, plan).messageKey).toBe('canvas.editResult.missing');
    expect(editor.calls).toEqual([]);
  });
});
