import { describe, expect, it } from 'vitest';
import { createSaveQueue } from '../../src/lib/components/canvas/save-queue';

describe('canvas save ownership', () => {
  it('serializes edits during a save and shares the complete drain with every waiter', async () => {
    let localRevision = 1, savedRevision = 0, serverRevision = 0;
    let release!: () => void;
    const writes: Array<{ local: number; expected: number }> = [];
    const queue = createSaveQueue(() => savedRevision !== localRevision, async () => {
      const local = localRevision, expected = serverRevision;
      writes.push({ local, expected });
      if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
      serverRevision++;
      savedRevision = local;
      return true;
    });
    const first = queue.flush();
    await Promise.resolve();
    localRevision = 2;
    const second = queue.flush(), third = queue.flush();
    expect(first).toBe(second);
    expect(second).toBe(third);
    release();
    await Promise.all([first, second, third]);
    expect(writes).toEqual([{ local: 1, expected: 0 }, { local: 2, expected: 1 }]);
    expect(savedRevision).toBe(2);
  });

  it('retains unsaved work after failure and starts one fresh write on explicit retry', async () => {
    let dirty = true, fail = true, calls = 0;
    const queue = createSaveQueue(() => dirty, async () => {
      calls++;
      if (fail) return false;
      dirty = false;
      return true;
    });
    await Promise.all([queue.flush(), queue.flush()]);
    expect(calls).toBe(1);
    expect(dirty).toBe(true);
    fail = false;
    await queue.flush();
    expect(calls).toBe(2);
    expect(dirty).toBe(false);
  });

  it('does not write after the canvas is destroyed, even when a save was queued', async () => {
    let destroyed = false, calls = 0;
    const queue = createSaveQueue(() => !destroyed, async () => { calls++; return false; });
    const pending = queue.flush();
    destroyed = true;
    await pending;
    expect(calls).toBe(0);
  });

  it('releases rejected writers so recovery can retry', async () => {
    let fail = true, dirty = true;
    const queue = createSaveQueue(() => dirty, async () => {
      if (fail) throw new Error('write interrupted');
      dirty = false;
      return true;
    });
    await queue.flush().catch(() => {});
    fail = false;
    await queue.flush();
    expect(dirty).toBe(false);
  });
});
