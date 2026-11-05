/** Stable keyset paging. Retain PostgreSQL's microseconds rather than round-tripping through Date. */
export type ChatCursor = { timestamp: string; id: string };
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validChatTimestamp(value: unknown): value is string {
  return typeof value === 'string' && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

export function decodeChatCursor(value: string): ChatCursor | null {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return validChatTimestamp(cursor?.timestamp) && typeof cursor.id === 'string' && uuidPattern.test(cursor.id)
      ? { timestamp: cursor.timestamp, id: cursor.id } : null;
  } catch { return null; }
}

export function encodeChatCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify({ timestamp: row.created_at, id: row.id }), 'utf8').toString('base64url');
}

/** Both values are validated before entering PostgREST's filter expression. */
export function chatCursorFilter(cursor: ChatCursor): string {
  if (!validChatTimestamp(cursor.timestamp) || !uuidPattern.test(cursor.id)) throw new Error('Invalid chat cursor');
  return `created_at.lt.${cursor.timestamp},and(created_at.eq.${cursor.timestamp},id.lt.${cursor.id})`;
}

export function chatPage<T extends { created_at: string; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { rows: page, hasMore, nextCursor: hasMore && page.length ? encodeChatCursor(page[page.length - 1]) : null };
}
