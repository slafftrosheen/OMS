import { describe, expect, it } from 'vitest';
import { findUpstreamIds, getRunnableShapeIds, registerNodeRunner, runShape } from '../../src/lib/components/canvas/node-runner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function editorWith(type: string) {
  const shapes = new Map<string, any>([['shape:tool', {
    id: 'shape:tool', type, props: { w: 360, h: 320, query: 'Before', status: 'idle', error: null, output: null }
  }]]);
  const writes: any[] = [];
  const editor: any = {
    shapes, writes,
    getShape: (id: string) => shapes.get(id),
    getSelectedShapeIds: () => [...shapes.keys()],
    getInstanceState: () => ({ isReadonly: false }),
    isShapeOrAncestorLocked: (shape: any) => !!shape.isLocked,
    getBindingsToShape: () => [],
    getBindingsFromShape: () => [],
    getCurrentPageShapes: () => [...shapes.values()],
    updateShape: (patch: any) => {
      writes.push(patch);
      const old = shapes.get(patch.id);
      if (!old) throw new Error('Cannot update a missing shape');
      shapes.set(patch.id, { ...old, ...patch, props: { ...old.props, ...patch.props } });
    }
  };
  return editor;
}

describe('Shared technical node execution', () => {
  it('preserves edits and resizing made while a successful request is pending', async () => {
    const response = deferred<{data: unknown}>();
    registerNodeRunner('test-success', () => response.promise);
    const editor = editorWith('test-success');
    const pending = runShape(editor, 'shape:tool');
    expect(editor.getShape('shape:tool').props.status).toBe('running');
    editor.updateShape({ id: 'shape:tool', props: { query: 'Edited during request', w: 540, h: 480 } });
    response.resolve({ data: { hits: ['result'] } });
    await pending;
    expect(editor.getShape('shape:tool').props).toEqual({
      query: 'Edited during request', w: 540, h: 480, output: { hits: ['result'] }, status: 'done', error: null
    });
  });

  it('preserves newer inputs on provider failure and allows a subsequent retry', async () => {
    const response = deferred<{data: unknown}>();
    registerNodeRunner('test-failure', () => response.promise);
    const editor = editorWith('test-failure');
    const pending = runShape(editor, 'shape:tool');
    editor.updateShape({ id: 'shape:tool', props: { query: 'Keep this input' } });
    response.reject(new Error('Provider unavailable'));
    await expect(pending).rejects.toThrow('Provider unavailable');
    expect(editor.getShape('shape:tool').props.query).toBe('Keep this input');
    expect(editor.getShape('shape:tool').props.status).toBe('error');
    registerNodeRunner('test-failure', async () => ({ data: 'Retried' }));
    await runShape(editor, 'shape:tool');
    expect(editor.getShape('shape:tool').props.output).toBe('Retried');
    expect(editor.getShape('shape:tool').props.error).toBeNull();
  });

  it('coalesces overlapping node-button and toolbar requests per editor and shape', async () => {
    let calls = 0;
    const response = deferred<{data: unknown}>();
    registerNodeRunner('test-overlap', () => { calls++; return response.promise; });
    const editor = editorWith('test-overlap');
    const first = runShape(editor, 'shape:tool', { useUpstream: false });
    const second = runShape(editor, 'shape:tool');
    expect(calls).toBe(1);
    response.resolve({ data: 'One result' });
    expect(await first).toEqual(await second);
    expect(editor.writes.filter((write: any) => write.props.status === 'done')).toHaveLength(1);
  });

  it('does not write a late response to a deleted node or a replacement of another type', async () => {
    for (const replacement of [undefined, { id: 'shape:tool', type: 'order-details', props: { title: 'Protected form' } }]) {
      const response = deferred<{data: unknown}>();
      registerNodeRunner('test-deletion', () => response.promise);
      const editor = editorWith('test-deletion');
      const pending = runShape(editor, 'shape:tool');
      editor.shapes.delete('shape:tool');
      if (replacement) editor.shapes.set('shape:tool', replacement);
      response.resolve({ data: 'Late' });
      await pending;
      expect(editor.writes).toHaveLength(1);
      expect(editor.getShape('shape:tool')).toEqual(replacement);
    }
  });

  it('only offers runnable unlocked nodes from a mixed selection', async () => {
    let calls = 0;
    registerNodeRunner('test-locked', async () => { calls++; return { data: true }; });
    const editor = editorWith('test-locked');
    editor.shapes.set('shape:note', { id: 'shape:note', type: 'text', props: { text: 'Ordinary text' } });
    editor.shapes.set('shape:locked', { id: 'shape:locked', type: 'test-locked', isLocked: true, props: {} });
    expect(getRunnableShapeIds(editor)).toEqual(['shape:tool']);
    await expect(runShape(editor, 'shape:locked')).rejects.toThrow('locked');
    editor.getInstanceState = () => ({ isReadonly: true });
    expect(getRunnableShapeIds(editor)).toEqual([]);
    await expect(runShape(editor, 'shape:tool')).rejects.toThrow('read-only');
    expect(calls).toBe(0);
  });

  it('retains arrow-fed toolbar inputs and explicit node-button input precedence', async () => {
    registerNodeRunner('test-inputs', async ({ shape, inputs }) => ({ data: inputs.document ?? shape.props }));
    const editor = editorWith('test-inputs');
    editor.shapes.set('shape:source', { id: 'shape:source', type: 'document', props: { content: 'Upstream brief' } });
    editor.getBindingsToShape = () => [{ fromId: 'shape:arrow', toId: 'shape:tool', props: { terminal: 'end' } }];
    editor.getBindingsFromShape = () => [{ fromId: 'shape:arrow', toId: 'shape:source', props: { terminal: 'start' } }];
    expect((await runShape(editor, 'shape:tool')).data).toEqual({ content: 'Upstream brief' });
    expect(((await runShape(editor, 'shape:tool', { useUpstream: false })).data as {query: string}).query).toBe('Before');
  });

  it('passes cancellation to the runner and does not persist an aborted result', async () => {
    const response = deferred<{data: unknown}>();
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    registerNodeRunner('test-abort', async ({ signal }) => { receivedSignal = signal; return response.promise; });
    const editor = editorWith('test-abort');
    const pending = runShape(editor, 'shape:tool', { signal: controller.signal });
    controller.abort();
    response.resolve({ data: 'Discard' });
    await expect(pending).rejects.toThrow();
    expect(receivedSignal).toBe(controller.signal);
    expect(editor.getShape('shape:tool').props.output).toBeNull();
  });
});

describe('Technical node graph lookup', () => {
  it('does not scan all page shapes when the native binding registry has no inputs', () => {
    const editor = editorWith('irrelevant');
    editor.getCurrentPageShapes = () => { throw new Error('Unnecessary page scan'); };
    expect(findUpstreamIds(editor, 'shape:tool')).toEqual([]);
  });

  it('still reads legacy arrow terminals when the bindings API is unavailable', () => {
    const editor = editorWith('irrelevant');
    editor.getBindingsToShape = undefined;
    editor.getBindingsFromShape = undefined;
    editor.shapes.set('shape:arrow', { id: 'shape:arrow', type: 'arrow', props: {
      start: { boundShapeId: 'shape:source' }, end: { boundShapeId: 'shape:tool' }
    } });
    expect(findUpstreamIds(editor, 'shape:tool')).toEqual(['shape:source']);
  });
});
