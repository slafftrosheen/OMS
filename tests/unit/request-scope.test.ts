import { describe, it, expect } from 'vitest';
import { RequestScope } from '../../src/lib/state/request-scope';

describe('account-owned concurrent reads', () => {
  it('shares an in-flight read and allows a fresh read after completion', async () => {
    const scope = new RequestScope();
    let finish!: () => void;
    let calls = 0;
    const operation = async () => { calls++; await new Promise<void>(done => { finish = done; }); };
    const first = scope.run('room', operation);
    const second = scope.run('room', operation);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(first).toBe(second);
    finish();
    await first;
    expect(scope.size).toBe(0);
    await scope.run('room', async () => { calls++; });
    expect(calls).toBe(2);
  });

  it('aborts old account work and fences late results without deleting a new read', async () => {
    const scope = new RequestScope();
    let completeOld!: () => void;
    let completeNew!: () => void;
    let oldSignal!: AbortSignal;
    const published: string[] = [];
    const old = scope.run('directory', async ({ signal, isCurrent }) => {
      oldSignal = signal;
      await new Promise<void>(done => { completeOld = done; });
      if (isCurrent()) published.push('old-account');
    });
    await Promise.resolve();
    scope.reset();
    const current = scope.run('directory', async ({ isCurrent }) => {
      await new Promise<void>(done => { completeNew = done; });
      if (isCurrent()) published.push('new-account');
    });
    await Promise.resolve();
    completeOld();
    await old;
    expect(oldSignal.aborted).toBe(true);
    expect(scope.size).toBe(1);
    expect(published).toEqual([]);
    completeNew();
    await current;
    expect(published).toEqual(['new-account']);
    expect(scope.size).toBe(0);
  });

  it('does not start abandoned reads and releases rejected reads for retry', async () => {
    const scope = new RequestScope();
    let calls = 0;
    const abandoned = scope.run('rooms', async () => { calls++; });
    scope.reset();
    await abandoned;
    expect(calls).toBe(0);
    await scope.run('rooms', async () => { throw new Error('offline'); }).catch(() => {});
    expect(scope.size).toBe(0);
    await scope.run('rooms', async () => { calls++; });
    expect(calls).toBe(1);
  });
});
