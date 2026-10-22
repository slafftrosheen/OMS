import { describe, expect, it } from 'vitest';
import { applyToolkitToolbarAction, captureToolkitControls } from '../../src/lib/components/canvas/toolkit-controls';

type Shape = { id: string; type: string; parentId?: string; isLocked?: boolean; props: Record<string, unknown> };
function fixture(shapes: Shape[], selected = shapes.map(shape => shape.id)) {
  const state = { isReadonly: false, tool: 'select' };
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const byId = new Map(shapes.map(shape => [shape.id, shape]));
  const editor: any = {
    getSelectedShapes: () => selected.map(id => byId.get(id)).filter(Boolean),
    getSelectedShapeIds: () => selected,
    getCurrentPageShapeIds: () => new Set(byId.keys()),
    getShape: (id: string) => byId.get(id),
    getShapeAndDescendantIds: (ids: string[]) => {
      const found = new Set(ids);
      for (const id of found) for (const shape of shapes) if (shape.parentId === id) found.add(shape.id);
      return found;
    },
    isShapeOrAncestorLocked: (shape: Shape) => {
      let current: Shape | undefined = shape;
      while (current) { if (current.isLocked) return true; current = byId.get(current.parentId ?? ''); }
      return false;
    },
    getInstanceState: () => state,
    getCurrentToolId: () => state.tool,
    getCanUndo: () => true, getCanRedo: () => false,
    complete: record('complete'),
    setCurrentTool: (tool: string) => { state.tool = tool; record('tool')(tool); },
    zoomToFit: record('fit'), zoomToSelection: record('fit-selection'), resetZoom: record('zoom-reset'),
    undo: record('undo'), redo: record('redo'), mark: record('mark'), bailToMark: record('bail'),
    run: (operation: () => void) => operation(), focus: record('focus'),
    duplicateShapes: record('duplicate'), deleteShapes: record('delete'), bringToFront: record('front'),
    sendToBack: record('back'), groupShapes: record('group'), ungroupShapes: record('ungroup'),
    alignShapes: record('align'), distributeShapes: record('distribute')
  };
  return { editor, state, calls, byId, setSelected: (ids: string[]) => { selected = ids; } };
}
const shape = (id: string, type = 'geo', props: Record<string, unknown> = {}): Shape => ({ id, type, props });

describe('Canvas dock selection capabilities', () => {
  it('reports the actual next geometry and only enables meaningful selection operations', () => {
    const single = fixture([shape('one')]);
    single.state.tool = 'geo';
    expect(captureToolkitControls(single.editor, 'ellipse').tool).toBe('ellipse');
    expect(captureToolkitControls(single.editor).canUngroup).toBe(false);
    expect(captureToolkitControls(single.editor).canGroup).toBe(false);
    expect(captureToolkitControls(single.editor).canAlign).toBe(false);
    const pair = fixture([shape('one'), shape('two')]);
    expect(captureToolkitControls(pair.editor).canGroup).toBe(true);
    expect(captureToolkitControls(pair.editor).canAlign).toBe(true);
    expect(captureToolkitControls(pair.editor).canDistribute).toBe(false);
    const group = fixture([shape('group', 'group')]);
    expect(captureToolkitControls(group.editor).canUngroup).toBe(true);
  });

  it('blocks changes to groups with locked descendants while retaining navigation', () => {
    const group = shape('group', 'group');
    const child = { ...shape('child'), parentId: group.id, isLocked: true };
    const { editor } = fixture([group, child], [group.id]);
    const controls = captureToolkitControls(editor);
    expect(controls.selectionLocked).toBe(true);
    expect(controls.canUngroup).toBe(false);
    expect(controls.canEditSelection).toBe(false);
    expect(controls.canStyle).toBe(false);
    expect(controls.canFitSelection).toBe(true);
    expect(applyToolkitToolbarAction(editor, 'delete')).toBe(false);
    expect(applyToolkitToolbarAction(editor, 'fit-selection')).toBe(true);
  });

  it('distinguishes an analyzable stored image/PDF from unsupported or missing assets', () => {
    const { editor } = fixture([
      shape('link', 'document', { kind: 'link', fileId: 'link-id' }),
      shape('external-image', 'document', { kind: 'image', fileId: '', url: 'https://example.com/photo.png' }),
      shape('pdf', 'document', { kind: 'pdf', fileId: 'stored-id', title: 'Specification.pdf' })
    ]);
    expect(captureToolkitControls(editor).analyzableFile).toEqual({ shapeId: 'pdf', fileId: 'stored-id', title: 'Specification.pdf', kind: 'pdf' });
    expect(captureToolkitControls(editor).selectedImage).toBe(true);
    const noAsset = fixture([shape('note', 'document', { kind: 'note' })]);
    expect(captureToolkitControls(noAsset.editor).analyzableFile).toBe(null);
  });

  it('rechecks live readonly state before commands rather than trusting a former enabled button', () => {
    const { editor, state, calls } = fixture([shape('one'), shape('two')]);
    expect(captureToolkitControls(editor).canAlign).toBe(true);
    state.isReadonly = true;
    expect(applyToolkitToolbarAction(editor, 'align-left')).toBe(false);
    expect(applyToolkitToolbarAction(editor, 'undo')).toBe(false);
    expect(calls).toEqual([]);
    expect(applyToolkitToolbarAction(editor, 'fit')).toBe(true);
    expect(captureToolkitControls(editor, 'rectangle', 2).runnable).toBe(0);
  });

  it('aligns/distributes only the current selection and brackets one command in history', () => {
    const { editor, calls } = fixture([shape('one'), shape('two'), shape('three'), shape('outside')], ['one', 'two', 'three']);
    expect(applyToolkitToolbarAction(editor, 'align-center')).toBe(true);
    expect(calls.find(call => call.name === 'align')?.args).toEqual([['one', 'two', 'three'], 'center-horizontal']);
    expect(calls.filter(call => call.name === 'mark')).toHaveLength(2);
    expect(applyToolkitToolbarAction(editor, 'distribute-vertical')).toBe(true);
    expect(calls.find(call => call.name === 'distribute')?.args).toEqual([['one', 'two', 'three'], 'vertical']);
    expect(applyToolkitToolbarAction(editor, 'unknown-command')).toBe(false);
  });

  it('rolls back a failed native mutation instead of leaving a partial edit', () => {
    const { editor, calls } = fixture([shape('one'), shape('two')]);
    editor.groupShapes = () => { throw new Error('Editor rejected group'); };
    expect(applyToolkitToolbarAction(editor, 'group')).toBe(false);
    expect(calls.filter(call => call.name === 'bail')).toHaveLength(1);
    expect(calls.filter(call => call.name === 'focus')).toHaveLength(0);
  });

  it('completes the drawing gesture before grouping the fresh selection in one history step', () => {
    const { editor, state, calls, byId, setSelected } = fixture([shape('one'), shape('two'), shape('three')], ['one', 'two']);
    state.tool = 'geo';
    editor.complete = () => { calls.push({ name: 'complete', args: [] }); setSelected(['two', 'three']); };
    editor.groupShapes = (ids: string[]) => {
      calls.push({ name: 'group', args: [ids] });
      if (state.tool !== 'select') return;
      byId.set('new-group', shape('new-group', 'group'));
      for (const id of ids) byId.get(id)!.parentId = 'new-group';
      setSelected(['new-group']);
    };
    expect(applyToolkitToolbarAction(editor, 'group')).toBe(true);
    expect(calls.map(call => call.name)).toEqual(['complete', 'tool', 'mark', 'group', 'mark', 'focus']);
    expect(calls.find(call => call.name === 'group')?.args).toEqual([['two', 'three']]);
    expect(byId.get('one')?.parentId).toBe(undefined);
  });

  it('detects silent native grouping refusal and preserves mixed selections when ungrouping', () => {
    const refused = fixture([shape('one'), shape('two')]);
    expect(applyToolkitToolbarAction(refused.editor, 'group')).toBe(false);
    expect(refused.calls.filter(call => call.name === 'bail')).toHaveLength(1);
    const mixed = fixture([shape('group', 'group'), shape('outside')]);
    mixed.editor.ungroupShapes = (ids: string[]) => {
      mixed.calls.push({ name: 'ungroup', args: [ids] });
      mixed.byId.delete('group');
    };
    expect(applyToolkitToolbarAction(mixed.editor, 'ungroup')).toBe(true);
    expect(mixed.calls.find(call => call.name === 'ungroup')?.args).toEqual([['group', 'outside']]);
    expect(mixed.byId.has('outside')).toBe(true);
    const refusedUngroup = fixture([shape('group', 'group')]);
    expect(applyToolkitToolbarAction(refusedUngroup.editor, 'ungroup')).toBe(false);
    expect(refusedUngroup.calls.filter(call => call.name === 'bail')).toHaveLength(1);
  });

  it('rechecks locks after completing a gesture before creating an edit history boundary', () => {
    const { editor, calls, byId } = fixture([shape('one'), shape('two')]);
    editor.complete = () => { byId.get('two')!.isLocked = true; };
    expect(applyToolkitToolbarAction(editor, 'group')).toBe(false);
    expect(calls.some(call => call.name === 'mark' || call.name === 'group')).toBe(false);
  });
});
