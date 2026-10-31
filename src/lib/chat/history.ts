export type ConversationHistory = {
  initialized: boolean;
  loading: boolean;
  failed: boolean;
  loadingOlder: boolean;
  olderFailed: boolean;
  hasMore: boolean;
  cursor: string | null;
  olderLoaded: boolean;
  latestPosition: { id: string; ts: string } | null;
};

export function emptyConversationHistory(): ConversationHistory {
  return { initialized: false, loading: false, failed: false, loadingOlder: false, olderFailed: false, hasMore: false, cursor: null, olderLoaded: false, latestPosition: null };
}

/** PostgreSQL timestamps can differ below JavaScript's millisecond precision. */
export function compareChatPosition(a: { id: string; ts: string }, b: { id: string; ts: string }): number {
  const milliseconds = Date.parse(a.ts) - Date.parse(b.ts);
  if (milliseconds) return milliseconds;
  const micros = (value: string) => Number((value.match(/\.(\d+)(?:Z|[+-])/i)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  return micros(a.ts) - micros(b.ts) || a.id.localeCompare(b.id);
}

export function validHistoryPage(value: unknown): value is { success: true; messages: unknown[]; hasMore?: boolean; nextCursor?: string | null } {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;
  return page.success === true && Array.isArray(page.messages)
    && (page.hasMore !== true || (typeof page.nextCursor === 'string' && page.nextCursor.length > 0));
}
