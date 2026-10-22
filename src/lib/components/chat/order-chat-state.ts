export interface OrderChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  edited?: boolean;
  replyTo?: string;
  attachments?: string[];
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
    edited: item.edited === true,
    replyTo: typeof item.replyTo === 'string' ? item.replyTo : undefined,
    attachments: Array.isArray(item.attachments) ? item.attachments.filter((url): url is string => typeof url === 'string') : undefined
  };
}

/** A read started before a confirmed local send/edit/delete cannot undo it. */
export function reconcileOrderMessages(server: OrderChatMessage[], changes: Map<string, OrderChatMessage | null>) {
  const byId = new Map(server.map(message => [message.id, message]));
  for (const [id, message] of changes) {
    if (message) byId.set(id, message);
    else byId.delete(id);
  }
  return [...byId.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.id.localeCompare(b.id));
}
