import { writable, get } from 'svelte/store';
import type { Room, Message, SystemMessageEvent } from './types';
import { currentUser } from '$lib/auth/user-store';
import { users } from '$lib/users/user-store';
import { createId } from '$lib/utils/id';
import { base } from '$app/paths';
import { createClient } from '@supabase/supabase-js';
import { notify } from '$lib/notifications/store';

const isBrowser = typeof window !== 'undefined';

// State
export const isChatOpen = writable<boolean>(false);
export const unreadCount = writable<number>(0);
export const rooms = writable<Room[]>([
  { id: 'general', name: 'General' },
  { id: 'workstations', name: 'Workstations' },
  { id: 'logistics', name: 'Logistics' }
]);

export const messages = writable<Message[]>([]);
export const chatLoading = writable<boolean>(false);

// Sound
const notificationSound = isBrowser ? new Audio('data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQNrNwkd2c02+/+vXgSkqGTLLks4u8TdjDc1Ta/f/5mlu3/9dv/7//9532qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AAWMSLwUIYAAsYkXgoQwAAaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaAAihwMWm4G8QQRDiMcCBcH3Cc+CDv/7cV96+53/5//4iyF75v/5t///en/5//9//535qjTENEf/7kZAwAAuUEKHfacABCIgI4e94AADwAAAAAAAA') : null;

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

/**
 * Realtime Subscription
 */
let realtimeChannel: any = null;

export function initChatRealtime() {
  if (!isBrowser) return () => {};
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) return () => {};

  const supabase = createClient(supabaseUrl, supabaseKey);

  realtimeChannel = supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMessage = payload.new as Message;
      const me = get(currentUser);
      
      // Update store
      messages.update(msgs => {
        if (msgs.some(m => m.id === newMessage.id)) return msgs;
        return [...msgs, newMessage];
      });

      // Notification logic (only if not sent by me)
      if (me?.id && newMessage.authorId !== String(me.id)) {
        if (!get(isChatOpen)) {
          unreadCount.update(n => n + 1);
          playSound();
          
          const author = get(users).find(u => String(u.id) === newMessage.authorId);
          const authorName = author?.displayName || author?.username || 'User';
          
          notify(`New message from ${newMessage.authorId === 'system' ? 'System' : authorName}`, {
            urgency: 'normal'
          });
        }
      }
    })
    .subscribe();

  return () => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  };
}

/**
 * Load chat rooms from database
 */
export async function loadRooms(): Promise<void> {
  if (!isBrowser) return;
  
  try {
    const res = await fetch(`${base}/api/chat`);
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        rooms.set(data.map((r: any) => ({ id: r.id, name: r.name })));
      }
    }
  } catch (err) {
    console.error('Failed to load chat rooms:', err);
  }
}

/**
 * Load messages for a room from database
 */
export async function loadMessages(roomId: string, limit = 100): Promise<void> {
  if (!isBrowser) return;
  
  chatLoading.set(true);
  try {
    const res = await fetch(`${base}/api/chat/messages?roomId=${roomId}&limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      // Merge with existing messages (avoid duplicates)
      messages.update(current => {
        const existing = new Set(current.map(m => m.id));
        const newMsgs = data.filter((m: Message) => !existing.has(m.id));
        return [...current.filter(m => m.roomId !== roomId), ...data];
      });
    }
  } catch (err) {
    console.error('Failed to load messages:', err);
  } finally {
    chatLoading.set(false);
  }
}

type MessageOptions = {
  authorId?: string;
  variant?: Message['variant'];
  event?: SystemMessageEvent;
};

export async function sendMessage(
  roomId: string,
  text: string,
  mentions: string[] = [],
  options: MessageOptions = {}
) {
  const me = get(currentUser);
  const payload = text.trim();
  if (!payload) return;

  // Temporary ID until server confirmation (or let realtime handle it)
  // We'll add it optimistically, but realtime might duplicate if we don't dedup.
  // The 'loadMessages' dedups, and 'postgres_changes' handler dedups.
  // But to be safe, let's let realtime handle the UI update for consistency, 
  // OR we add a temporary one and replace it. 
  // For simplicity in this overhaul, we'll optimistically add it.
  
  const tempId = createId('msg_temp');
  const message: Message = {
    id: tempId,
    roomId,
    authorId: options.authorId ?? (me?.id ? String(me.id) : 'anonymous'),
    ts: new Date().toISOString(),
    text: payload,
    mentions,
    variant: options.variant ?? 'user',
    event: options.event
  };

  messages.update((value) => [...value, message]);

  // Persist to database
  if (isBrowser) {
    try {
      const res = await fetch(`${base}/api/chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId,
          authorId: me?.id || null,
          text: payload,
          variant: options.variant ?? 'user',
          mentions,
          event: options.event
        })
      });
      
      if (res.ok) {
        const saved = await res.json();
        // Update with server-assigned ID (this prevents dupes if we match by content/ts, but simplest is to swap ID)
        messages.update(msgs => msgs.map(m => 
          m.id === tempId ? { ...m, id: saved.id } : m
        ));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      // Ideally remove the optimistic message on error
    }
  }
}

export function postSystemEvent(
  roomId: string,
  text: string,
  event: SystemMessageEvent,
  mentions: string[] = []
) {
  sendMessage(roomId, text, mentions, { authorId: 'system', variant: 'system', event });
}

export async function ensureRoom(room: Room) {
  rooms.update((value) => {
    if (value.some((item) => item.id === room.id)) return value;
    return [...value, room];
  });

  // Persist to database
  if (isBrowser) {
    try {
      await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(room)
      });
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }
}

export async function deleteRoom(roomId: string) {
  rooms.update((value) => value.filter((room) => room.id !== roomId));
  messages.update((value) => value.filter((message) => message.roomId !== roomId));

  // Delete from database
  if (isBrowser) {
    try {
      await fetch(`${base}/api/chat?id=${roomId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete room:', err);
    }
  }
}

export function mentionsForMessage(message: Message) {
  const idSet = new Set(message.mentions || []);
  const lookup = get(users);
  return lookup.filter((user) => idSet.has(String(user.id)));
}
