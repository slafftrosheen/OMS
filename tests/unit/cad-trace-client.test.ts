import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { runRasterTrace } from '../../src/lib/components/canvas/cad-trace-client';
import { DEFAULT_TRACE_OPTIONS } from '../../src/lib/components/canvas/cad-trace';

function workers(run: (state: any) => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Worker'), instances: any[] = [];
  let postingError = false;
  class WorkerStub {
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = 0;
    posted: any;
    constructor(public url: URL, public options: unknown) { instances.push(this); }
    terminate() { this.terminated++; }
    postMessage(value: unknown) { if (postingError) throw new Error('clone failed'); this.posted = value; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: WorkerStub });
  return run({ instances, throwOnPost: () => { postingError = true; } }).finally(() => {
    if (previous) Object.defineProperty(globalThis, 'Worker', previous); else Reflect.deleteProperty(globalThis, 'Worker');
  });
}
const image = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) } as ImageData;

describe('raster trace worker lifecycle', () => {
  it('returns a successful result and releases worker, handlers and abort listener exactly once', async () => workers(async ({ instances }) => {
    const controller = new AbortController(), job = runRasterTrace(image, DEFAULT_TRACE_OPTIONS, controller.signal), worker = instances[0];
    const result = { width: 1, height: 1, paths: [], warnings: [] };
    assert.deepEqual(worker.options, { type: 'module' }); assert.equal(worker.posted.image, image);
    worker.onmessage({ data: { result } }); assert.equal(await job, result);
    assert.equal(worker.terminated, 1); assert.equal(worker.onmessage, null); assert.equal(worker.onerror, null);
    controller.abort(); assert.equal(worker.terminated, 1);
  }));

  it('does not allocate a worker for an already aborted request', async () => workers(async ({ instances }) => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(runRasterTrace(image, DEFAULT_TRACE_OPTIONS, controller.signal), /cancelled/);
    assert.equal(instances.length, 0);
  }));

  it('terminates on cancellation and ignores a queued late result', async () => workers(async ({ instances }) => {
    const controller = new AbortController(), job = runRasterTrace(image, DEFAULT_TRACE_OPTIONS, controller.signal), worker = instances[0];
    const late = worker.onmessage; controller.abort();
    await assert.rejects(job, /cancelled/); late({ data: { result: {} } });
    assert.equal(worker.terminated, 1);
  }));

  it('cleans up when posting the image fails to clone', async () => workers(async ({ instances, throwOnPost }) => {
    throwOnPost();
    await assert.rejects(runRasterTrace(image, DEFAULT_TRACE_OPTIONS, new AbortController().signal), /geometry/);
    assert.equal(instances[0].terminated, 1); assert.equal(instances[0].onmessage, null);
  }));

  it('propagates worker geometry failures and refuses malformed results', async () => workers(async ({ instances }) => {
    for (const data of [{ error: 'limit' }, {}, null]) {
      const job = runRasterTrace(image, DEFAULT_TRACE_OPTIONS, new AbortController().signal), worker = instances.at(-1);
      worker.onmessage({ data }); await assert.rejects(job, data?.error ? /limit/ : /geometry/); assert.equal(worker.terminated, 1);
    }
    const job = runRasterTrace(image, DEFAULT_TRACE_OPTIONS, new AbortController().signal), worker = instances.at(-1);
    worker.onerror(); await assert.rejects(job, /geometry/); assert.equal(worker.terminated, 1);
  }));

  it('enforces the processing timeout and cancels its timer on completion', async () => workers(async ({ instances }) => {
    const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
    let timeout: (() => void) | undefined, duration = 0, cleared: unknown;
    globalThis.setTimeout = ((callback: () => void, ms: number) => { timeout = callback; duration = ms; return 91; }) as any;
    globalThis.clearTimeout = ((id: unknown) => { cleared = id; }) as any;
    try {
      const job = runRasterTrace(image, DEFAULT_TRACE_OPTIONS, new AbortController().signal);
      assert.equal(duration, 30000); timeout!(); await assert.rejects(job, /timeout/);
      assert.equal(cleared, 91); assert.equal(instances[0].terminated, 1);
    } finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
  }));
});
