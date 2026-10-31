import { describe, it, expect } from 'vitest';
import { chatPage, chatCursorFilter, decodeChatCursor, encodeChatCursor } from '../../src/lib/server/chat/history';
import { compareChatPosition } from '../../src/lib/chat/history';
import { GET } from '../../src/routes/api/chat/messages/+server';
import { claimVoicePlayback, releaseVoicePlayback } from '../../src/lib/chat/voice-playback';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const ts = '2026-10-31T10:00:00.123456+00:00';

describe('stable chat history cursors', () => {
  it('preserves microseconds and validates values before using a PostgREST filter', () => {
    const cursor = decodeChatCursor(encodeChatCursor({ id: id(7), created_at: ts }));
    expect(cursor).toEqual({ id: id(7), timestamp: ts });
    expect(chatCursorFilter(cursor!)).toContain('created_at.eq.2026-10-31T10:00:00.123456+00:00');
    for (const value of ['', 'a'.repeat(257), 'not a cursor', Buffer.from('{"id":"x),room_id.neq.private","timestamp":"2026-10-31T10:00:00Z"}').toString('base64url')]) {
      expect(decodeChatCursor(value)).toBe(null);
    }
    expect(() => chatCursorFilter({ timestamp: ts, id: 'x),room_id.neq.private' })).toThrow();
  });
  it('uses the extra row solely to determine whether another page exists', () => {
    const rows = [3, 2, 1].map(value => ({ id: id(value), created_at: ts }));
    const first = chatPage(rows, 2);
    expect(first.rows.map(row => row.id)).toEqual([id(3), id(2)]);
    expect(first.hasMore).toBe(true);
    expect(decodeChatCursor(first.nextCursor!)?.id).toBe(id(2));
    expect(chatPage(rows.slice(0, 2), 2).hasMore).toBe(false);
    expect(chatPage([], 100).nextCursor).toBe(null);
  });
  it('sorts equal-millisecond messages by their real timestamp before their id', () => {
    const rows = [{ id: id(1), ts: '2026-10-31T10:00:00.123900Z' }, { id: id(2), ts: '2026-10-31T12:00:00.123100+02:00' }, { id: id(3), ts: '2026-10-31T10:00:00.123100Z' }];
    expect(rows.sort(compareChatPosition).map(row => row.id)).toEqual([id(2), id(3), id(1)]);
  });
  it('traverses tied timestamps exactly once and stays inside the selected room', async () => {
    const rows = Array.from({ length: 103 }, (_, index) => ({ id: id(index + 1), room_id: 'general', user_id: null, content: String(index + 1), attachments: [], created_at: ts, is_deleted: false }));
    rows.push({ ...rows[0], id: id(999), room_id: 'private' });
    const db = {
      from(table: string) {
        const filters: Array<[string, unknown]> = []; let limit = 1000, cursor: ReturnType<typeof decodeChatCursor>;
        const query: any = {
          select: () => query, in: () => query,
          eq(key: string, value: unknown) { filters.push([key, value]); return query; },
          order: () => query,
          limit(value: number) { limit = value; return query; },
          or(value: string) {
            const match = /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^()]+)\)$/.exec(value);
            if (!match || match[1] !== match[2]) throw new Error('Invalid filter');
            cursor = { timestamp: match[1], id: match[3] }; return query;
          },
          then(resolve: any) {
            const visible = table === 'chat_messages' ? rows.filter(row => filters.every(([key, value]) => row[key] === value)
              && (!cursor || row.created_at < cursor.timestamp || row.created_at === cursor.timestamp && row.id < cursor.id))
              .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, limit) : [];
            return Promise.resolve({ data: visible, error: null }).then(resolve);
          }
        }; return query;
      }
    };
    let cursor: string | null = null; const seen: string[] = [];
    for (let n = 0; n < 5; n++) {
      const query = new URLSearchParams({ roomId: 'general', limit: '25' }); if (cursor) query.set('cursor', cursor);
      const response = await GET({ url: new URL(`http://localhost/api/chat/messages?${query}`), locals: { user: { id: 'actor' }, supabase: db } } as any);
      expect(response.status).toBe(200);
      const page = await response.json(); seen.push(...page.messages.map((message: any) => message.id)); cursor = page.nextCursor;
      expect(page.hasMore).toBe(n < 4);
    }
    expect(new Set(seen).size).toBe(103);
    expect(seen).toHaveLength(103);
    expect(seen.includes(id(999))).toBe(false);
    expect(cursor).toBe(null);
  });
  it('rejects malformed and ambiguous history requests without querying storage', async () => {
    for (const search of ['roomId=general&cursor=broken', 'roomId=general&cursor=', 'roomId=general&orderId=other', 'roomId=general&before=bad,or(id.eq.secret)']) {
      const response = await GET({ url: new URL(`http://localhost/api/chat/messages?${search}`), locals: { user: { id: 'actor' }, supabase: { from: () => { throw new Error('Must not query'); } } } } as any);
      expect(response.status).toBe(400);
    }
  });
});

describe('voice playback coordination', () => {
  it('pauses the previous player and does not release a different active player on stale cleanup', () => {
    let aPaused = 0, bPaused = 0;
    const a = { pause: () => { aPaused++; releaseVoicePlayback(a); } };
    const b = { pause: () => { bPaused++; releaseVoicePlayback(b); } };
    claimVoicePlayback(a); claimVoicePlayback(a); expect(aPaused).toBe(0);
    claimVoicePlayback(b); expect(aPaused).toBe(1);
    releaseVoicePlayback(a); claimVoicePlayback(a); expect(bPaused).toBe(1);
    releaseVoicePlayback(a);
  });
});
