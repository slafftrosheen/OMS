import { describe, it, expect } from 'vitest';
import { RoomDraftSession } from '../../src/lib/chat/room-drafts.svelte';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => resolve = done); return { promise, resolve }; }

describe('account-owned room drafts', () => {
  it('keeps the in-flight lock through room remounts, rejects duplicate submits and clears only the original room', async () => {
    const session = new RoomDraftSession();
    const a = session.ensure('account-a', 'a')!, b = session.ensure('account-a', 'b')!;
    a.text = 'A message'; a.mentions = ['teammate']; b.text = 'B draft';
    const ack = deferred<boolean>(); let calls = 0;
    const pending = session.submit('account-a', 'a', () => { calls++; return ack.promise; }, () => 'account-a');
    expect(session.ensure('account-a', 'a')?.sending).toBe(true);
    expect(await session.submit('account-a', 'a', async () => { calls++; return true; }, () => 'account-a')).toBe(false);
    expect(calls).toBe(1);
    ack.resolve(true); expect(await pending).toBe(true);
    expect(a.text).toBe(''); expect(a.mentions).toEqual([]); expect(a.sending).toBe(false);
    expect(b.text).toBe('B draft');
  });
  it('keeps failure text and status for a reopened composer', async () => {
    const session = new RoomDraftSession(); const draft = session.ensure('account-a', 'a')!; draft.text = 'Retry me';
    expect(await session.submit('account-a', 'a', async () => false, () => 'account-a')).toBe(false);
    const reopened = session.ensure('account-a', 'a')!;
    expect(reopened.failed).toBe(true); expect(reopened.text).toBe('Retry me'); expect(reopened.sending).toBe(false);
  });
  it('does not erase newer text or another account after an old acknowledgement', async () => {
    const session = new RoomDraftSession(); const old = session.ensure('account-a', 'a')!; old.text = 'Old';
    const ack = deferred<boolean>(); let owner = 'account-a';
    const pending = session.submit(owner, 'a', () => ack.promise, () => owner);
    owner = 'account-b'; const current = session.ensure(owner, 'a')!; current.text = 'Private B';
    ack.resolve(true); expect(await pending).toBe(false); expect(current.text).toBe('Private B');
    const newerAck = deferred<boolean>();
    const next = session.submit(owner, 'a', () => newerAck.promise, () => owner);
    current.text = 'A newer draft'; newerAck.resolve(true);
    expect(await next).toBe(true); expect(current.text).toBe('A newer draft'); expect(current.sending).toBe(false);
  });
});
