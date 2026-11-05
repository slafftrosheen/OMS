import type { Attachment } from '$lib/chat/types';
import { compareChatPosition } from '$lib/chat/history';

export interface OrderChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  historyTimestamp?: string;
  edited?: boolean;
  replyTo?: string;
  attachments?: string[];
  voiceAttachments?: Attachment[];
}

export function parseOrderChatMessage(value: unknown): OrderChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id || typeof item.userId !== 'string'
    || typeof item.username !== 'string' || typeof item.message !== 'string') return null;
  if (!(item.timestamp instanceof Date) && typeof item.timestamp !== 'string') return null;
  const timestamp = new Date(item.timestamp instanceof Date ? item.timestamp.getTime() : item.timestamp);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return {
    id: item.id, userId: item.userId, username: item.username, message: item.message, timestamp,
    historyTimestamp: typeof item.timestamp === 'string' ? item.timestamp : timestamp.toISOString(),
    edited: item.edited === true,
    replyTo: typeof item.replyTo === 'string' ? item.replyTo : undefined,
    attachments: Array.isArray(item.attachments) ? item.attachments.filter((url): url is string => typeof url === 'string') : undefined,
    voiceAttachments: Array.isArray(item.voiceAttachments) ? item.voiceAttachments.filter((value): value is Attachment =>
      !!value && typeof value === 'object' && typeof value.id === 'string' && value.kind === 'voice') : undefined
  };
}

/** A read started before a confirmed local send/edit/delete cannot undo it. */
export function reconcileOrderMessages(server: OrderChatMessage[], changes: Map<string, OrderChatMessage | null>) {
  const byId = new Map(server.map(message => [message.id, message]));
  for (const [id, message] of changes) {
    if (message) byId.set(id, message);
    else byId.delete(id);
  }
  return [...byId.values()].sort(compareOrderChatPosition);
}

export function compareOrderChatPosition(a: OrderChatMessage, b: OrderChatMessage): number {
  return compareChatPosition({ id: a.id, ts: a.historyTimestamp ?? a.timestamp.toISOString() }, { id: b.id, ts: b.historyTimestamp ?? b.timestamp.toISOString() });
}

/** Realtime updates carry table columns, while attachment/player metadata stays in the read DTO. */
export function orderRealtimePatch(row: Record<string, unknown>): Partial<OrderChatMessage> {
  const patch: Partial<OrderChatMessage> = {};
  const text = row.content ?? row.text;
  if (typeof text === 'string') patch.message = text;
  if (typeof row.is_edited === 'boolean') patch.edited = row.is_edited;
  if (typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))) {
    patch.timestamp = new Date(row.created_at); patch.historyTimestamp = row.created_at;
  }
  return patch;
}

/** A successful POST/PATCH can acknowledge a version superseded by realtime. */
export function resolveOrderAcknowledgement(
  confirmed: OrderChatMessage,
  startedRevision: number,
  log: { changes: Map<string, OrderChatMessage | null>; changeRevisions: Map<string, number>; remotePatches: Map<string, Partial<OrderChatMessage>> }
): OrderChatMessage | null {
  if ((log.changeRevisions.get(confirmed.id) ?? 0) <= startedRevision) return confirmed;
  const change = log.changes.get(confirmed.id);
  if (change === null) return null;
  return {
    ...confirmed, ...change,
    attachments: change?.attachments ?? confirmed.attachments,
    voiceAttachments: change?.voiceAttachments ?? confirmed.voiceAttachments,
    ...log.remotePatches.get(confirmed.id)
  };
}
