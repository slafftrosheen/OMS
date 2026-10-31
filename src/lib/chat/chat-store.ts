import { writable, get } from 'svelte/store';
import type { Room, Message, Attachment, SystemMessageEvent, VoiceDraft } from './types';
import { postVoiceMessage } from './voice';
import { currentUser } from '$lib/auth/authState.svelte';
import { base } from '$app/paths';
import { notify } from '$lib/notifications/store';
import { toasts } from '$lib/stores/toast';
import { env } from '$env/dynamic/public';
import { supabase } from '$lib/supabase-client';
import { RequestScope } from '$lib/state/request-scope';
import { createId } from '$lib/utils/id';
import { compareChatPosition, emptyConversationHistory, validHistoryPage, type ConversationHistory } from './history';
import { roomDraftSession } from './room-drafts.svelte';

const isBrowser = typeof window !== 'undefined';

// State
export const isChatOpen = writable<boolean>(false);
export const unreadCount = writable<number>(0);
export const rooms = writable<Room[]>([]);

export const messages = writable<Message[]>([]);
export const chatLoading = writable<boolean>(false);
export const realtimeConnected = writable<boolean>(false);
export const roomHistory = writable<Record<string, ConversationHistory>>({});

// Sound
const notificationSound = isBrowser ? new Audio('data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA') : null;

export function playSound() {
  if (isBrowser && notificationSound) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(e => console.warn('Audio play failed', e));
  }
}

/**
 * Toggle chat sidebar
 */
export function toggleChat() {
  isChatOpen.update(v => {
    const newState = !v;
    if (newState) {
      unreadCount.set(0); // Clear unread when opening
    }
    return newState;
  });
}

/** The application shell owns one account-scoped realtime subscription. */
export function initChatRealtime() {
  const ownerId = get(currentUser)?.id;
  if (!isBrowser || !ownerId) return () => {};

  const supabaseUrl = env.PUBLIC_SUPABASE_URL;
  const supabaseKey = env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return () => {};
  }

  let active = true;

  // Subscribe to chat_messages table for real-time updates
  const channel = supabase
    .channel(`chat-messages:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      },
      (payload: any) => {
        if (!active || get(currentUser)?.id !== ownerId) return;
        if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          reconcileRoomRealtimeChange(payload);
          return;
        }
        const newMessage = payload.new;
        const me = get(currentUser);
        if (!newMessage || typeof newMessage.room_id !== 'string' || !newMessage.room_id) return;
        if (!active || me?.id !== ownerId || get(messages).some(message => message.id === newMessage.id)) return;

        // Transform to Message format
        const message: Message = {
          id: newMessage.id,
          roomId: newMessage.room_id,
          authorId: newMessage.user_id || 'system',
          text: newMessage.content ?? newMessage.text ?? '',
          ts: newMessage.created_at,
          mentions: [],
          variant: newMessage.user_id ? 'user' : 'system',
          attachments: [],
          replyToId: newMessage.reply_to_id ?? null,
        };

        // Update store (check for duplicates)
        messages.update(msgs => {
          if (msgs.some(m => m.id === message.id)) return msgs;
          return [...msgs, message];
        });
        // Realtime rows do not contain joined attachments. Hydrate through the same
        // authorized endpoint so a remote voice-only message gains its player.
        queueMessageHydration(message.roomId);

        // Notification logic (only if not sent by me)
        if (me?.id && newMessage.user_id && String(newMessage.user_id) !== String(me.id)) {
          if (!get(isChatOpen)) {
            unreadCount.update(n => n + 1);
            playSound();

            notify('New chat message', {
              urgency: 'normal'
            });

            toasts.push({
              title: 'New Message',
              message: newMessage.content || newMessage.text || 'You have a new message',
              kind: 'info'
            });
          }
        }
      }
    )
    .subscribe((status: string) => {
      if (active && get(currentUser)?.id === ownerId) realtimeConnected.set(status === 'SUBSCRIBED');
    });

  return () => {
    active = false;
    void Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
    realtimeConnected.set(false);
  };
}

const roomReads = new RequestScope();
const messageReads = new RequestScope();
const pendingWrites = new Set<AbortController>();
const optimisticIds = new Set<string>();
const historyReads = new Map<string, Promise<void>>();
const hydrationLanes = new Map<string, { dirty: boolean }>();
let sessionGeneration = 0;
let messageRevision = 0;
const snapshotReads = new Map<symbol, number>();
const messageChanges = new Map<string, { revision: number; deleted: boolean; patch: Partial<Message> }>();

function pruneMessageChanges() {
  const oldest = snapshotReads.size ? Math.min(...snapshotReads.values()) : messageRevision;
  for (const [id, change] of messageChanges) if (change.revision <= oldest) messageChanges.delete(id);
}
function beginMessageSnapshot() {
  const token = Symbol(), revision = messageRevision;
  snapshotReads.set(token, revision);
  return { revision, finish() { snapshotReads.delete(token); pruneMessageChanges(); } };
}
function applyMessageChanges(byId: Map<string, Message>, revision: number) {
  for (const [id, change] of messageChanges) {
    if (change.revision <= revision) continue;
    if (change.deleted) byId.delete(id);
    else { const existing = byId.get(id); if (existing) byId.set(id, { ...existing, ...change.patch }); }
  }
}

function resolveMessageAcknowledgement(confirmed: Message, startedRevision: number): Message | null {
  const candidate = new Map([[confirmed.id, confirmed]]);
  applyMessageChanges(candidate, startedRevision);
  return candidate.get(confirmed.id) ?? null;
}

/** UPDATE/DELETE events only patch known rows; they never import another conversation. */
function reconcileRoomRealtimeChange(payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
  if (!row || typeof row.id !== 'string') return;
  const existing = get(messages).find(message => message.id === row.id);
  const deleted = payload.eventType === 'DELETE' || row.is_deleted === true || (!!existing && row.room_id !== existing.roomId);
  if (!deleted && typeof row.room_id !== 'string') return;
  const patch: Partial<Message> = {};
  const text = row.content ?? row.text;
  if (typeof text === 'string') patch.text = text;
  if (typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))) patch.ts = row.created_at;
  if ('user_id' in row) {
    patch.authorId = typeof row.user_id === 'string' ? row.user_id : 'system';
    patch.variant = row.user_id ? 'user' : 'system';
    if (existing && patch.authorId !== existing.authorId) patch.author = null;
  }
  messageChanges.set(row.id, { revision: ++messageRevision, deleted, patch });
  messages.update(current => chronological(deleted ? current.filter(message => message.id !== row.id)
    : current.map(message => message.id === row.id ? { ...message, ...patch } : message)));
  pruneMessageChanges();
}

/** An arrival during a history read needs a read started after that arrival. */
function queueMessageHydration(roomId: string) {
  if (!roomId) return;
  const pending = hydrationLanes.get(roomId);
  if (pending) { pending.dirty = true; return; }
  const lane = { dirty: true }, generation = sessionGeneration, owner = get(currentUser)?.id;
  const current = () => generation === sessionGeneration && !!owner && owner === get(currentUser)?.id && hydrationLanes.get(roomId) === lane;
  hydrationLanes.set(roomId, lane);
  void (async () => {
    try {
      while (current() && lane.dirty) {
        lane.dirty = false;
        const previous = historyReads.get(roomId);
        if (previous) await previous;
        if (!current()) return;
        await loadMessages(roomId);
      }
    } finally { if (hydrationLanes.get(roomId) === lane) hydrationLanes.delete(roomId); }
  })();
}

function beginWrite(timeoutMs = 20000, parentSignal?: AbortSignal) {
  const ownerId = get(currentUser)?.id;
  if (!isBrowser || !ownerId || parentSignal?.aborted) return null;
  const generation = sessionGeneration;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  parentSignal?.addEventListener('abort', onAbort, { once: true });
  pendingWrites.add(controller);
  const timer = setTimeout(onAbort, timeoutMs);
  return {
    ownerId,
    signal: controller.signal,
    isCurrent: () => generation === sessionGeneration && get(currentUser)?.id === ownerId && !parentSignal?.aborted,
    finish() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onAbort);
      pendingWrites.delete(controller);
    }
  };
}

function isRoom(value: unknown): value is Room {
  return !!value && typeof value === 'object' && typeof (value as Room).id === 'string'
    && !!(value as Room).id && typeof (value as Room).name === 'string';
}

function keepRoom(room: Room) {
  rooms.update(current => [...current.filter(item => item.id !== room.id), room]);
}

function chronological(items: Message[]): Message[] {
  return items.sort(compareChatPosition);
}

function updateHistory(roomId: string, patch: Partial<ConversationHistory>) {
  roomHistory.update(states => ({ ...states, [roomId]: { ...emptyConversationHistory(), ...states[roomId], ...patch } }));
}

export function resetChatState() {
  sessionGeneration++;
  roomReads.reset();
  messageReads.reset();
  for (const controller of pendingWrites) controller.abort();
  pendingWrites.clear();
  optimisticIds.clear();
  historyReads.clear(); hydrationLanes.clear();
  snapshotReads.clear(); messageChanges.clear(); messageRevision = 0;
  messages.set([]);
  roomDraftSession.reset();
  roomHistory.set({});
  rooms.set([]);
  unreadCount.set(0);
  chatLoading.set(false);
  isChatOpen.set(false);
}

/** Shared by the chat page and drawer; concurrent reads use one request. */
export function loadRooms(): Promise<void> {
  const ownerId = get(currentUser)?.id;
  if (!isBrowser || !ownerId) return Promise.resolve();
  return roomReads.run('rooms', async ({ signal, isCurrent }) => {
    const initialIds = new Set(get(rooms).map(room => room.id));
    try {
      const response = await fetch(`${base}/api/chat`, { signal });
      if (!response.ok) return;
      const data = await response.json();
      if (isCurrent() && get(currentUser)?.id === ownerId && Array.isArray(data)) {
        rooms.update(current => {
          const byId = new Map<string, Room>(data.filter(isRoom).map(room => [room.id, room]));
          for (const room of current) if (!initialIds.has(room.id)) byId.set(room.id, room);
          return [...byId.values()];
        });
      }
    } catch (error) {
      if (isCurrent() && get(currentUser)?.id === ownerId) console.error('Failed to load chat rooms:', error);
    }
  });
}

export function loadMessages(roomId: string, limit = 100): Promise<void> {
  const ownerId = get(currentUser)?.id;
  if (!isBrowser || !ownerId || !roomId) return Promise.resolve();
  chatLoading.set(true);
  const request = messageReads.run(`${roomId}:${limit}`, async ({ signal, isCurrent }) => {
    const snapshot = beginMessageSnapshot();
    updateHistory(roomId, { loading: true, failed: false });
    const initialIds = new Set(get(messages).filter(message => message.roomId === roomId).map(message => message.id));
    try {
      const query = new URLSearchParams({ roomId, limit: String(limit) });
      const response = await fetch(`${base}/api/chat/messages?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
      const data = await response.json();
      if (!isCurrent() || get(currentUser)?.id !== ownerId) return;
      if (!response.ok || !validHistoryPage(data)) throw new Error('History unavailable');
      {
        const latest = data.messages as Message[];
        if (latest.some(message => !message || message.roomId !== roomId || typeof message.id !== 'string' || typeof message.ts !== 'string' || !Number.isFinite(Date.parse(message.ts)))) throw new Error('Invalid history');
        const oldest = latest[0];
        messages.update(current => {
          const byId = new Map<string, Message>(latest
            .map((message: Message) => [message.id, message]));
          // Refresh existing history while retaining realtime arrivals and unacknowledged sends.
          for (const message of current) {
            const isOlder = data.hasMore && oldest && compareChatPosition(message, oldest) < 0;
            if (message.roomId === roomId && (isOlder || !initialIds.has(message.id) || optimisticIds.has(message.id))) {
              byId.set(message.id, { ...message, ...byId.get(message.id) });
            }
          }
          applyMessageChanges(byId, snapshot.revision);
          return [...current.filter(message => message.roomId !== roomId), ...chronological([...byId.values()])];
        });
        const previous = get(roomHistory)[roomId];
        // A long offline interval can leave an unseen middle page. Cached old
        // messages are useful, but cannot prove continuity with a disjoint head.
        const continuous = !!oldest && !!previous?.latestPosition && compareChatPosition(oldest, previous.latestPosition) <= 0;
        const keepOlderCursor = !!data.hasMore && previous?.olderLoaded && continuous;
        const newest = latest[latest.length - 1];
        updateHistory(roomId, { initialized: true, hasMore: keepOlderCursor ? previous.hasMore : data.hasMore === true,
          cursor: keepOlderCursor ? previous.cursor : data.nextCursor ?? null, olderLoaded: !!keepOlderCursor,
          latestPosition: newest ? { id: newest.id, ts: newest.ts } : null });
      }
    } catch (error) {
      if (isCurrent() && get(currentUser)?.id === ownerId) updateHistory(roomId, { failed: true });
    } finally {
      snapshot.finish();
      if (isCurrent() && get(currentUser)?.id === ownerId) updateHistory(roomId, { loading: false });
    }
  });
  const completion = request.finally(() => chatLoading.set(messageReads.size > 0));
  historyReads.set(roomId, completion);
  return completion.finally(() => { if (historyReads.get(roomId) === completion) historyReads.delete(roomId); });
}

/** Prepend an authorized earlier page without replacing newer messages or another room. */
export async function loadOlderMessages(roomId: string): Promise<void> {
  const ownerId = get(currentUser)?.id, generation = sessionGeneration;
  if (!isBrowser || !ownerId || !roomId) return;
  await historyReads.get(roomId);
  if (generation !== sessionGeneration || get(currentUser)?.id !== ownerId) return;
  const history = get(roomHistory)[roomId];
  if (!history?.hasMore || !history.cursor) return;
  const cursor = history.cursor;
  return messageReads.run(`older:${roomId}`, async ({ signal, isCurrent }) => {
    const snapshot = beginMessageSnapshot();
    updateHistory(roomId, { loadingOlder: true, olderFailed: false });
    try {
      const query = new URLSearchParams({ roomId, limit: '100', cursor });
      const response = await fetch(`${base}/api/chat/messages?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
      const data = await response.json();
      if (!isCurrent() || get(currentUser)?.id !== ownerId) return;
      if (get(roomHistory)[roomId]?.cursor !== cursor) return;
      if (!response.ok || !validHistoryPage(data) || (data.hasMore && data.nextCursor === cursor)) throw new Error('History unavailable');
      const older = data.messages as Message[];
      if (older.some(message => !message || message.roomId !== roomId || typeof message.id !== 'string' || typeof message.ts !== 'string' || !Number.isFinite(Date.parse(message.ts)))) throw new Error('Invalid history');
      messages.update(current => {
        const byId = new Map(older.map(message => [message.id, message]));
        // Current rows may contain a newer realtime/edit response than this earlier page.
        for (const message of current) if (message.roomId === roomId) byId.set(message.id, message);
        applyMessageChanges(byId, snapshot.revision);
        return [...current.filter(message => message.roomId !== roomId), ...chronological([...byId.values()])];
      });
      updateHistory(roomId, { olderLoaded: true, hasMore: data.hasMore === true, cursor: data.nextCursor ?? null });
    } catch {
      if (isCurrent() && get(currentUser)?.id === ownerId) updateHistory(roomId, { olderFailed: true });
    } finally {
      snapshot.finish();
      if (isCurrent() && get(currentUser)?.id === ownerId) updateHistory(roomId, { loadingOlder: false });
    }
  });
}

type MessageOptions = {
  authorId?: string;
  variant?: Message['variant'];
  event?: SystemMessageEvent;
  attachments?: Attachment[];
  replyToId?: string | null;
};

/** One atomic server request creates the voice attachment and its message. */
export async function sendVoiceMessage(roomId: string, draft: VoiceDraft, signal: AbortSignal, replyTo?: string): Promise<boolean> {
  if (!roomId || signal.aborted) return false;
  const write = beginWrite(60000, signal);
  if (!write) return false;
  const snapshot = beginMessageSnapshot();
  try {
    const result = await postVoiceMessage<Message>({ roomId }, draft, write.signal, { replyTo });
    if (!write.isCurrent() || write.signal.aborted || signal.aborted) return false;
    if (result.message.roomId !== roomId || result.message.authorId !== write.ownerId || typeof result.message.id !== 'string') throw new Error('Invalid voice message response');
    const confirmed = resolveMessageAcknowledgement({ ...result.message, attachments: result.message.attachments?.length ? result.message.attachments : [result.attachment] }, snapshot.revision);
    messages.update(current => chronological([...current.filter(message => message.id !== result.message.id), ...(confirmed ? [confirmed] : [])]));
    return true;
  } finally { snapshot.finish(); write.finish(); }
}

/**
 * Upload a file to a chat room and return the attachment record.
 * Call this before or after sending the text message; pass the
 * returned attachment ID as part of the message payload.
 */
export async function uploadAttachment(
  roomId: string,
  file: File,
  messageId?: string
): Promise<Attachment | null> {
  const write = beginWrite(60000);
  if (!write) return null;

  const form = new FormData();
  form.append('roomId', roomId);
  form.append('file', file);
  if (messageId) form.append('messageId', messageId);

  try {
    const res = await fetch(`${base}/api/chat/attachments`, {
      method: 'POST',
      body: form,
      signal: write.signal,
    });
    if (!write.isCurrent()) return null;
    if (!res.ok || write.signal.aborted) throw new Error('File upload failed');
    const data = await res.json();
    if (!write.isCurrent()) return null;
    if (write.signal.aborted || !data.success || typeof data.attachment?.id !== 'string') throw new Error('Invalid upload response');
    return data.attachment;
  } catch {
    if (write.isCurrent()) notify('File upload failed', { urgency: 'urgent' });
    return null;
  } finally {
    write.finish();
  }
}

export async function sendMessage(
  roomId: string,
  text: string,
  mentions: string[] = [],
  options: MessageOptions = {}
): Promise<boolean> {
  const payload = text.trim();
  if (!payload || !roomId) return false;
  const write = beginWrite();
  if (!write) return false;
  const snapshot = beginMessageSnapshot();

  // Optimistic UI update
  const tempId = `temp_${createId('message')}`;
  const optimisticMessage: Message = {
    id: tempId,
    roomId,
    authorId: options.authorId ?? write.ownerId,
    ts: new Date().toISOString(),
    text: payload,
    mentions,
    variant: options.variant ?? 'user',
    event: options.event,
    attachments: options.attachments ?? [],
    replyToId: options.replyToId ?? null,
  };

  optimisticIds.add(tempId);
  messages.update((value) => [...value, optimisticMessage]);

  // Persist to database
  try {
      const res = await fetch(`${base}/api/chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: write.signal,
        body: JSON.stringify({
          roomId,
          text: payload,
          variant: options.variant ?? 'user',
          mentions,
          event: options.event,
          attachments: options.attachments ?? [],
          replyToId: options.replyToId ?? null,
        })
      });

      if (!write.isCurrent()) return false;
      if (!res.ok || write.signal.aborted) throw new Error('Failed to send message');
      const result = await res.json();
      if (!write.isCurrent()) return false;
      if (write.signal.aborted || !result.success || typeof result.message?.id !== 'string'
        || result.message.roomId !== roomId) throw new Error('Invalid message response');
      // An edit/delete may arrive after INSERT but before this POST completes.
      // The send succeeded even when its returned row is already out of date.
      const confirmed = resolveMessageAcknowledgement({ ...optimisticMessage, ...result.message }, snapshot.revision);
      messages.update(current => chronological([
        ...current.filter(message => message.id !== tempId && message.id !== result.message.id),
        ...(confirmed ? [confirmed] : [])
      ]));
      return true;
  } catch {
    if (write.isCurrent()) {
      messages.update(msgs => msgs.filter(m => m.id !== tempId));
      notify('Failed to send message', { urgency: 'urgent' });
    }
    return false;
  } finally {
    optimisticIds.delete(tempId);
    snapshot.finish();
    write.finish();
  }
}

/** Add a room only after the server confirms its identity and metadata. */
export async function ensureRoom(room: Room, signal?: AbortSignal): Promise<boolean> {
  const write = beginWrite(20000, signal);
  if (!write) return false;
  try {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room), signal: write.signal
    });
    if (!write.isCurrent()) return false;
    if (!response.ok || write.signal.aborted) throw new Error('Failed to create room');
    const data = await response.json();
    if (!write.isCurrent()) return false;
    if (write.signal.aborted || !data.success || !isRoom(data.room) || data.room.id !== room.id) throw new Error('Invalid room response');
    keepRoom(data.room);
    return true;
  } catch {
    if (write.isCurrent()) notify('Failed to create room', { urgency: 'urgent' });
    return false;
  } finally {
    write.finish();
  }
}

/** The DM endpoint already creates the room; no second channel POST is needed. */
export async function openDirectRoom(peerId: string, signal?: AbortSignal): Promise<Room | null> {
  const write = beginWrite(20000, signal);
  if (!write) return null;
  try {
    const response = await fetch(`${base}/api/chat/dm`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peerId }), signal: write.signal
    });
    if (!write.isCurrent()) return null;
    if (!response.ok || write.signal.aborted) throw new Error('Failed to open direct message');
    const data = await response.json();
    if (!write.isCurrent()) return null;
    if (write.signal.aborted || !data.success || !isRoom(data.room)) throw new Error('Invalid direct message response');
    keepRoom(data.room);
    return data.room;
  } catch {
    if (write.isCurrent()) notify('Failed to open direct message', { urgency: 'urgent' });
    return null;
  } finally {
    write.finish();
  }
}
