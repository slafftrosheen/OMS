import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import type { Message } from '../../src/lib/chat/types';

type Chat = typeof import('../../src/lib/chat/chat-store');
const user = (id: string) => ({ id, username: id, displayName: id, role: 'RD' as const, stations: [] });
const message = (id: string, changes: Partial<Message> = {}): Message => ({
  id, roomId: 'general', authorId: 'user-a', text: id, ts: '2026-10-22T12:00:00Z', ...changes
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function browser(run: (context: {
  chat: Chat;
  setUser: (id: string) => void;
  notices: () => unknown[];
  realtime: () => { emit: (row: Record<string, unknown>, eventType?: string) => void; stop: () => void };
}) => Promise<void>) {
  const oldWindow = globalThis.window;
  const oldAudio = globalThis.Audio;
  const oldFetch = globalThis.fetch;
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.Audio = class { currentTime = 0; play() { return Promise.resolve(); } } as unknown as typeof Audio;
  const chat = await import('../../src/lib/chat/chat-store');
  const { currentUser } = await import('../../src/lib/auth/authState.svelte');
  const { notifications } = await import('../../src/lib/notifications/store');
  const { supabase } = await import('../../src/lib/supabase-client');
  const { env } = await import('../../tests/mocks/env-dynamic-public');
  const originalChannel = supabase.channel;
  const originalRemove = supabase.removeChannel;
  const oldUrl = env.PUBLIC_SUPABASE_URL;
  const oldKey = env.PUBLIC_SUPABASE_ANON_KEY;
  const stops: Array<() => void> = [];
  currentUser.set(user('user-a'));
  chat.resetChatState();
  notifications.set([]);
  try {
    await run({
      chat,
      setUser: id => currentUser.set(user(id)),
      notices: () => get(notifications),
      realtime() {
        let emit!: (payload: { new?: Record<string, unknown>; old?: Record<string, unknown>; eventType?: string }) => void;
        const channel: any = {
          on(_event: string, _filter: unknown, callback: typeof emit) { emit = callback; return channel; },
          subscribe() { return channel; }
        };
        env.PUBLIC_SUPABASE_URL = 'https://db.example.test';
        env.PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon-key';
        supabase.channel = (() => channel) as any;
        supabase.removeChannel = (async () => 'ok') as any;
        const stop = chat.initChatRealtime(); stops.push(stop);
        return { emit: (row, eventType = 'INSERT') => emit(eventType === 'DELETE' ? { old: row, eventType } : { new: row, eventType }), stop };
      }
    });
  } finally {
    for (const stop of stops) stop();
    chat.resetChatState();
    currentUser.set(null);
    notifications.set([]);
    supabase.channel = originalChannel;
    supabase.removeChannel = originalRemove;
    env.PUBLIC_SUPABASE_URL = oldUrl;
    env.PUBLIC_SUPABASE_ANON_KEY = oldKey;
    globalThis.fetch = oldFetch;
    if (oldWindow === undefined) delete (globalThis as any).window; else globalThis.window = oldWindow;
    if (oldAudio === undefined) delete (globalThis as any).Audio; else globalThis.Audio = oldAudio;
  }
}

describe('chat history and acknowledgement races', () => {
  it('hydrates a voice arriving during an older read and reruns when another arrives during hydration', async () => {
    await browser(async ({ chat, realtime }) => {
      const first = deferred<Response>(), second = deferred<Response>(), third = deferred<Response>();
      let calls = 0;
      globalThis.fetch = async () => { calls++; return calls === 1 ? first.promise : calls === 2 ? second.promise : third.promise; };
      const initial = chat.loadMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      const rt = realtime();
      rt.emit({ id: 'voice-a', room_id: 'general', user_id: 'user-b', content: '', created_at: '2026-10-31T12:00:00Z' });
      first.resolve(Response.json({ success: true, messages: [] })); await initial;
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(calls).toBe(2);
      rt.emit({ id: 'voice-b', room_id: 'general', user_id: 'user-b', content: '', created_at: '2026-10-31T12:00:01Z' });
      const attached = (id: string) => message(id, { text: '', attachments: [{ id: `${id}-file`, kind: 'voice', fileName: 'voice.webm', fileType: 'audio/webm', fileSize: 500, url: `/api/chat/voice/${id}-file` }] });
      second.resolve(Response.json({ success: true, messages: [attached('voice-a')] }));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(calls).toBe(3);
      third.resolve(Response.json({ success: true, messages: [attached('voice-a'), attached('voice-b')] }));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(get(chat.messages).find(row => row.id === 'voice-b')?.attachments?.[0].kind).toBe('voice');
    });
  });
  it('refreshes old history while retaining new arrivals, other rooms and one copy of duplicate IDs', async () => {
    await browser(async ({ chat }) => {
      chat.messages.set([message('old'), message('removed'), message('other', { roomId: 'station-cad' })]);
      const reply = deferred<Response>();
      let calls = 0;
      globalThis.fetch = async () => { calls++; return reply.promise; };
      const first = chat.loadMessages('general');
      const second = chat.loadMessages('general');
      await Promise.resolve();
      chat.messages.update(items => [...items, message('arrived'), message('echo')]);
      reply.resolve(Response.json({ success: true, messages: [message('old', { text: 'refreshed' }), message('echo')] }));
      await Promise.all([first, second]);
      expect(calls).toBe(1);
      expect(get(chat.messages).map(item => item.id).sort()).toEqual(['arrived', 'echo', 'old', 'other']);
      expect(get(chat.messages).find(item => item.id === 'old')?.text).toBe('refreshed');
    });
  });

  it('keeps an optimistic send through refresh and deduplicates realtime before and after its POST acknowledgement', async () => {
    await browser(async ({ chat, realtime }) => {
      const ack = deferred<Response>();
      globalThis.fetch = async (_url, init) => init?.method === 'POST' ? ack.promise
        : Response.json({ success: true, messages: [] });
      const sent = chat.sendMessage('general', 'Hello');
      const optimistic = get(chat.messages)[0];
      await chat.loadMessages('general');
      expect(get(chat.messages).map(item => item.id)).toEqual([optimistic.id]);
      const channel = realtime();
      const echo = { id: 'saved', room_id: 'general', user_id: 'user-a', content: 'Hello', created_at: '2026-10-22T12:00:01Z' };
      channel.emit(echo);
      ack.resolve(Response.json({ success: true, message: message('saved', { text: 'Hello' }) }));
      await sent;
      channel.emit(echo);
      expect(get(chat.messages).map(item => item.id)).toEqual(['saved']);
    });
  });

  it('gives simultaneous sends different optimistic IDs and removes a rejected send without removing the other', async () => {
    await browser(async ({ chat, notices }) => {
      const first = deferred<Response>(); const second = deferred<Response>(); let calls = 0;
      globalThis.fetch = async () => ++calls === 1 ? first.promise : second.promise;
      const one = chat.sendMessage('general', 'First');
      const two = chat.sendMessage('general', 'Second');
      expect(new Set(get(chat.messages).map(item => item.id)).size).toBe(2);
      first.resolve(Response.json({ error: 'offline' }, { status: 503 }));
      second.resolve(Response.json({ success: true, message: message('second', { text: 'Second' }) }));
      await Promise.all([one, two]);
      expect(get(chat.messages).map(item => item.id)).toEqual(['second']);
      expect(notices()).toHaveLength(1);
    });
  });
});

describe('chat account-owned writes', () => {
  it('aborts reads, send, upload and creation on reset and ignores their late old-account responses', async () => {
    await browser(async ({ chat, setUser, notices }) => {
      const pending: Array<{ resolve: (response: Response) => void; signal: AbortSignal | null | undefined; url: string }> = [];
      globalThis.fetch = async (url, init) => new Promise<Response>(resolve => pending.push({ resolve, signal: init?.signal, url: String(url) }));
      const read = chat.loadMessages('general');
      await Promise.resolve();
      const sent = chat.sendMessage('general', 'Old account');
      const room = chat.ensureRoom({ id: 'old-room', name: 'Old room' });
      const upload = chat.uploadAttachment('general', new File(['test'], 'file.txt', { type: 'text/plain' }));
      expect(pending).toHaveLength(4);
      chat.resetChatState(); setUser('user-b');
      chat.messages.set([message('new-account', { authorId: 'user-b' })]);
      chat.rooms.set([{ id: 'new-room', name: 'New room' }]);
      expect(pending.every(item => item.signal?.aborted)).toBe(true);
      pending[0].resolve(Response.json({ success: true, messages: [message('old-history')] }));
      pending[1].resolve(Response.json({ success: true, message: message('old-send') }));
      pending[2].resolve(Response.json({ success: true, room: { id: 'old-room', name: 'Old room' } }));
      pending[3].resolve(Response.json({ success: true, attachment: { id: 'old-upload' } }));
      await Promise.all([read, sent]);
      expect(await room).toBe(false);
      expect(await upload).toBe(null);
      expect(get(chat.messages).map(item => item.id)).toEqual(['new-account']);
      expect(get(chat.rooms).map(item => item.id)).toEqual(['new-room']);
      expect(notices()).toHaveLength(0);
    });
  });

  it('checks account identity even before the shell processes its reset callback', async () => {
    await browser(async ({ chat, setUser, notices }) => {
      const response = deferred<Response>();
      globalThis.fetch = async () => response.promise;
      const pending = chat.ensureRoom({ id: 'old-room', name: 'Old room' });
      setUser('user-b');
      response.resolve(Response.json({ success: true, room: { id: 'old-room', name: 'Old room' } }));
      expect(await pending).toBe(false);
      expect(get(chat.rooms)).toEqual([]);
      expect(notices()).toHaveLength(0);
    });
  });

  it('keeps failed or malformed room creation out of the room list and confirms successful metadata', async () => {
    await browser(async ({ chat, notices }) => {
      const replies = [Response.json({ error: 'denied' }, { status: 403 }), Response.json({ success: true }),
        Response.json({ success: true, room: { id: 'station-cad', name: 'CAD', kind: 'station', station: 'CAD' } })];
      globalThis.fetch = async () => replies.shift()!;
      expect(await chat.ensureRoom({ id: 'station-cad', name: 'Client label' })).toBe(false);
      expect(get(chat.rooms)).toEqual([]);
      expect(await chat.ensureRoom({ id: 'station-cad', name: 'Client label' })).toBe(false);
      expect(get(chat.rooms)).toEqual([]);
      expect(await chat.ensureRoom({ id: 'station-cad', name: 'Client label' })).toBe(true);
      expect(get(chat.rooms)).toEqual([{ id: 'station-cad', name: 'CAD', kind: 'station', station: 'CAD' }]);
      expect(notices()).toHaveLength(2);
    });
  });

  it('retains a newly confirmed room when an older room listing finishes', async () => {
    await browser(async ({ chat }) => {
      const listing = deferred<Response>();
      globalThis.fetch = async (_url, init) => init?.method === 'POST'
        ? Response.json({ success: true, room: { id: 'new', name: 'New room' } }) : listing.promise;
      const pending = chat.loadRooms(); await Promise.resolve();
      expect(await chat.ensureRoom({ id: 'new', name: 'New room' })).toBe(true);
      listing.resolve(Response.json([{ id: 'general', name: 'General' }]));
      await pending;
      expect(get(chat.rooms).map(item => item.id)).toEqual(['general', 'new']);
    });
  });

  it('retains a confirmed direct room with one POST and reports failures without a phantom channel', async () => {
    await browser(async ({ chat, notices }) => {
      const calls: string[] = [];
      const room = { id: 'dm-user-a-user-b', name: 'B ↔ A', kind: 'direct', peer: { id: 'user-b', displayName: 'B' } };
      globalThis.fetch = async (url, init) => { calls.push(String(url)); expect(init?.method).toBe('POST'); return Response.json({ success: true, room }); };
      expect(await chat.openDirectRoom('user-b')).toEqual(room);
      expect(calls).toEqual(['/api/chat/dm']);
      expect(get(chat.rooms)).toEqual([room]);
      globalThis.fetch = async () => Response.json({ error: 'denied' }, { status: 403 });
      expect(await chat.openDirectRoom('user-c')).toBe(null);
      expect(get(chat.rooms)).toEqual([room]);
      expect(notices()).toHaveLength(1);
    });
  });

  it('cancels direct-message creation when its drawer lifetime ends without late state or error feedback', async () => {
    await browser(async ({ chat, notices }) => {
      const reply = deferred<Response>(); const lifetime = new AbortController();
      let requestSignal: AbortSignal | null | undefined;
      globalThis.fetch = async (_url, init) => { requestSignal = init?.signal; return reply.promise; };
      const pending = chat.openDirectRoom('user-b', lifetime.signal);
      lifetime.abort();
      expect(requestSignal?.aborted).toBe(true);
      reply.resolve(Response.json({ success: true, room: { id: 'dm-old', name: 'Old DM', kind: 'direct' } }));
      expect(await pending).toBe(null);
      expect(get(chat.rooms)).toEqual([]);
      expect(notices()).toHaveLength(0);
    });
  });
});

describe('chat earlier history and visible failures', () => {
  it('retains earlier pages during latest refresh, including edits and deletion in the latest page', async () => {
    await browser(async ({ chat }) => {
      const old = message('old', { ts: '2026-10-01T12:00:00Z' });
      const recent = message('recent', { ts: '2026-10-20T12:00:00Z' });
      const deleted = message('deleted', { ts: '2026-10-21T12:00:00Z' });
      globalThis.fetch = async url => String(url).includes('cursor=page-two')
        ? Response.json({ success: true, messages: [old], hasMore: false, nextCursor: null })
        : Response.json({ success: true, messages: [recent, deleted], hasMore: true, nextCursor: 'page-two' });
      await chat.loadMessages('general');
      await chat.loadOlderMessages('general');
      expect(get(chat.messages).map(row => row.id)).toEqual(['old', 'recent', 'deleted']);
      expect(get(chat.roomHistory).general.hasMore).toBe(false);
      globalThis.fetch = async () => Response.json({ success: true, messages: [{ ...recent, text: 'Edited' }], hasMore: true, nextCursor: 'page-two' });
      await chat.loadMessages('general');
      expect(get(chat.messages).map(row => row.id)).toEqual(['old', 'recent']);
      expect(get(chat.messages).find(row => row.id === 'recent')?.text).toBe('Edited');
      expect(get(chat.roomHistory).general.hasMore).toBe(false);
    });
  });
  it('coalesces earlier reads, preserves their cursor after a concurrent latest refresh and ignores old-account completion', async () => {
    await browser(async ({ chat, setUser }) => {
      const recent = message('recent', { ts: '2026-10-20T12:00:00Z' });
      globalThis.fetch = async () => Response.json({ success: true, messages: [recent], hasMore: true, nextCursor: 'page-two' });
      await chat.loadMessages('general');
      const earlier = deferred<Response>(), latest = deferred<Response>(); let olderCalls = 0;
      globalThis.fetch = async url => {
        if (String(url).includes('cursor=')) { olderCalls++; return earlier.promise; }
        return latest.promise;
      };
      const one = chat.loadOlderMessages('general'), two = chat.loadOlderMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      const refresh = chat.loadMessages('general');
      earlier.resolve(Response.json({ success: true, messages: [message('older', { ts: '2026-10-01T12:00:00Z' })], hasMore: true, nextCursor: 'page-three' }));
      await Promise.all([one, two]);
      latest.resolve(Response.json({ success: true, messages: [recent], hasMore: true, nextCursor: 'page-two' }));
      await refresh;
      expect(olderCalls).toBe(1);
      expect(get(chat.roomHistory).general.cursor).toBe('page-three');
      expect(get(chat.messages).map(row => row.id)).toEqual(['older', 'recent']);
      const stale = deferred<Response>(); globalThis.fetch = async () => stale.promise;
      const pending = chat.loadOlderMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      chat.resetChatState(); setUser('user-b');
      stale.resolve(Response.json({ success: true, messages: [message('private-old')], hasMore: false }));
      await pending;
      expect(get(chat.messages)).toEqual([]);
      expect(get(chat.roomHistory)).toEqual({});
    });
  });
  it('reports history errors without disguising them as empty success and permits a retry', async () => {
    await browser(async ({ chat }) => {
      chat.messages.set([message('retained')]);
      globalThis.fetch = async () => Response.json({ success: false, messages: [] }, { status: 503 });
      await chat.loadMessages('general');
      expect(get(chat.roomHistory).general.failed).toBe(true);
      expect(get(chat.roomHistory).general.loading).toBe(false);
      expect(get(chat.messages).map(row => row.id)).toEqual(['retained']);
      globalThis.fetch = async () => Response.json({ success: true, messages: [message('current')], hasMore: true, nextCursor: 'next' });
      await chat.loadMessages('general');
      expect(get(chat.roomHistory).general.failed).toBe(false);
      globalThis.fetch = async () => Response.json({ error: 'Unavailable' }, { status: 503 });
      await chat.loadOlderMessages('general');
      expect(get(chat.roomHistory).general.olderFailed).toBe(true);
      expect(get(chat.roomHistory).general.cursor).toBe('next');
      expect(get(chat.messages).map(row => row.id)).toEqual(['current']);
    });
  });
  it('reports send acknowledgement explicitly so a composer can retain an unconfirmed draft', async () => {
    await browser(async ({ chat }) => {
      globalThis.fetch = async () => Response.json({ error: 'Unavailable' }, { status: 503 });
      expect(await chat.sendMessage('general', 'Keep this')).toBe(false);
      globalThis.fetch = async () => Response.json({ success: true, message: message('confirmed', { text: 'Keep this' }) });
      expect(await chat.sendMessage('general', 'Keep this')).toBe(true);
      expect(get(chat.messages).map(row => row.id)).toEqual(['confirmed']);
    });
  });
});

describe('chat continuity after long offline intervals', () => {
  it('reopens paging when the newest window leaves an unseen middle interval', async () => {
    await browser(async ({ chat }) => {
      const row = (n: number) => message(`row-${String(n).padStart(3, '0')}`, { ts: new Date(Date.UTC(2026, 9, 1, 12, 0, n)).toISOString() });
      const rows = (start: number, end: number) => Array.from({ length: end - start }, (_, n) => row(start + n));
      globalThis.fetch = async url => String(url).includes('cursor=old-page')
        ? Response.json({ success: true, messages: rows(0, 100), hasMore: false })
        : Response.json({ success: true, messages: rows(100, 200), hasMore: true, nextCursor: 'old-page' });
      await chat.loadMessages('general'); await chat.loadOlderMessages('general');
      expect(get(chat.messages)).toHaveLength(200);
      expect(get(chat.roomHistory).general.hasMore).toBe(false);
      globalThis.fetch = async url => String(url).includes('cursor=middle-page')
        ? Response.json({ success: true, messages: rows(200, 300), hasMore: true, nextCursor: 'old-page' })
        : Response.json({ success: true, messages: rows(300, 400), hasMore: true, nextCursor: 'middle-page' });
      await chat.loadMessages('general');
      expect(get(chat.messages)).toHaveLength(300);
      expect(get(chat.roomHistory).general.hasMore).toBe(true);
      expect(get(chat.roomHistory).general.cursor).toBe('middle-page');
      await chat.loadOlderMessages('general');
      expect(get(chat.messages)).toHaveLength(400);
      expect(get(chat.messages).some(row => row.id === 'row-250')).toBe(true);
    });
  });
  it('does not let an earlier read replace the restarted cursor after a disjoint refresh', async () => {
    await browser(async ({ chat }) => {
      globalThis.fetch = async () => Response.json({ success: true, messages: [message('old-head', { ts: '2026-10-01T12:00:00Z' })], hasMore: true, nextCursor: 'old-page' });
      await chat.loadMessages('general');
      const delayed = deferred<Response>();
      globalThis.fetch = async url => String(url).includes('cursor=') ? delayed.promise
        : Response.json({ success: true, messages: [message('new-head', { ts: '2026-10-31T12:00:00Z' })], hasMore: true, nextCursor: 'gap-page' });
      const earlier = chat.loadOlderMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      await chat.loadMessages('general');
      delayed.resolve(Response.json({ success: true, messages: [message('obsolete-page')], hasMore: false }));
      await earlier;
      expect(get(chat.roomHistory).general.cursor).toBe('gap-page');
      expect(get(chat.roomHistory).general.hasMore).toBe(true);
      expect(get(chat.messages).some(row => row.id === 'obsolete-page')).toBe(false);
    });
  });
});

describe('remote changes in earlier chat history', () => {
  it('updates and removes loaded older messages and fences a pending stale history page', async () => {
    await browser(async ({ chat, realtime }) => {
      const older = message('older-edit', { ts: '2026-10-01T10:00:00Z', attachments: [{ id: 'audio', kind: 'voice', fileName: 'voice.webm', fileType: 'audio/webm', fileSize: 1000, url: '/api/chat/voice/audio' }] });
      const removed = message('older-delete', { ts: '2026-10-01T10:00:01Z' });
      const recent = message('recent', { ts: '2026-10-20T10:00:00Z' });
      globalThis.fetch = async () => Response.json({ success: true, messages: [recent], hasMore: true, nextCursor: 'older-page' });
      await chat.loadMessages('general');
      chat.messages.update(rows => [...rows, older, removed]);
      const delayed = deferred<Response>(); globalThis.fetch = async () => delayed.promise;
      const reading = chat.loadOlderMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      const rt = realtime();
      rt.emit({ id: older.id, room_id: 'general', user_id: 'user-a', content: 'Remote edit', created_at: older.ts }, 'UPDATE');
      rt.emit({ id: removed.id }, 'DELETE');
      expect(get(chat.messages).find(row => row.id === older.id)?.text).toBe('Remote edit');
      expect(get(chat.messages).some(row => row.id === removed.id)).toBe(false);
      delayed.resolve(Response.json({ success: true, messages: [older, removed], hasMore: false }));
      await reading;
      expect(get(chat.messages).find(row => row.id === older.id)?.text).toBe('Remote edit');
      expect(get(chat.messages).find(row => row.id === older.id)?.attachments?.[0].id).toBe('audio');
      expect(get(chat.messages).some(row => row.id === removed.id)).toBe(false);
    });
  });
  it('does not resurrect an unseen message deleted while an earlier page is in flight', async () => {
    await browser(async ({ chat, realtime }) => {
      globalThis.fetch = async () => Response.json({ success: true, messages: [message('recent')], hasMore: true, nextCursor: 'earlier' });
      await chat.loadMessages('general');
      const delayed = deferred<Response>(); globalThis.fetch = async () => delayed.promise;
      const pending = chat.loadOlderMessages('general');
      await new Promise(resolve => setTimeout(resolve, 0));
      realtime().emit({ id: 'deleted-before-display' }, 'DELETE');
      delayed.resolve(Response.json({ success: true, messages: [message('deleted-before-display')], hasMore: false }));
      await pending;
      expect(get(chat.messages).some(row => row.id === 'deleted-before-display')).toBe(false);
    });
  });
});

describe('late chat send acknowledgements', () => {
  for (const action of ['edit', 'delete'] as const) {
    it(`confirms text delivery without undoing a newer remote ${action}`, async () => {
      await browser(async ({ chat, realtime }) => {
        const original = message('committed', { text: 'Original text', ts: '2026-10-31T12:00:00Z' });
        let persisted: Message[] = [original];
        const ack = deferred<Response>();
        globalThis.fetch = async (_url, init) => init?.method === 'POST' ? ack.promise
          : Response.json({ success: true, messages: persisted });
        const pending = chat.sendMessage('general', 'Original text');
        const rt = realtime();
        rt.emit({ id: original.id, room_id: 'general', user_id: 'user-a', content: original.text, created_at: original.ts });
        // Hydration has finished; only the pending write keeps its change fence alive.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (action === 'edit') {
          persisted = [{ ...original, text: 'Newer edit' }];
          rt.emit({ id: original.id, room_id: 'general', user_id: 'user-a', content: 'Newer edit', created_at: original.ts }, 'UPDATE');
        } else {
          persisted = [];
          rt.emit({ id: original.id }, 'DELETE');
        }
        // A completed authoritative read must not discard a pending write's fence.
        await chat.loadMessages('general');
        ack.resolve(Response.json({ success: true, message: original }));
        expect(await pending).toBe(true);
        if (action === 'edit') expect(get(chat.messages).map(row => row.text)).toEqual(['Newer edit']);
        else expect(get(chat.messages)).toEqual([]);
      });
    });
    it(`confirms voice delivery without undoing a newer remote ${action}`, async () => {
      await browser(async ({ chat, realtime }) => {
        const audio = { id: 'voice-audio', kind: 'voice' as const, fileName: 'voice.webm', fileType: 'audio/webm', fileSize: 100,
          url: '/api/chat/voice/voice-audio', duration: 1, expiresAt: '2099-01-01T00:00:00Z' };
        const original = message('voice-committed', { text: '', ts: '2026-10-31T12:00:00Z', attachments: [audio] });
        let persisted: Message[] = [original];
        const ack = deferred<Response>();
        globalThis.fetch = async (_url, init) => init?.method === 'POST' ? ack.promise
          : Response.json({ success: true, messages: persisted });
        const pending = chat.sendVoiceMessage('general', { file: new File(['fixture'], 'voice.webm', { type: 'audio/webm' }), durationMs: 1000,
          clientRequestId: '00000000-0000-4000-8000-000000000001' }, new AbortController().signal);
        const rt = realtime();
        rt.emit({ id: original.id, room_id: 'general', user_id: 'user-a', content: '', created_at: original.ts });
        await new Promise(resolve => setTimeout(resolve, 0));
        if (action === 'edit') {
          persisted = [{ ...original, text: 'Newer caption' }];
          rt.emit({ id: original.id, room_id: 'general', user_id: 'user-a', content: 'Newer caption', created_at: original.ts }, 'UPDATE');
        } else { persisted = []; rt.emit({ id: original.id }, 'DELETE'); }
        await chat.loadMessages('general');
        ack.resolve(Response.json({ success: true, message: original, attachment: audio }));
        expect(await pending).toBe(true);
        if (action === 'edit') {
          expect(get(chat.messages).map(row => row.text)).toEqual(['Newer caption']);
          expect(get(chat.messages)[0].attachments?.[0].id).toBe(audio.id);
        } else expect(get(chat.messages)).toEqual([]);
      });
    });
  }
});
