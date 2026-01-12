import { writable, get } from 'svelte/store';
import type { Room, Message, SystemMessageEvent } from './types';
import { currentUser } from '$lib/auth/user-store';
import { users } from '$lib/users/user-store';
import { createId } from '$lib/utils/id';
import { base } from '$app/paths';

const isBrowser = typeof window !== 'undefined';

export const rooms = writable<Room[]>([
  { id: 'general', name: 'General' },
  { id: 'workstations', name: 'Workstations' },
  { id: 'logistics', name: 'Logistics' }
]);

export const messages = writable<Message[]>([]);
export const chatLoading = writable<boolean>(false);

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

  const message: Message = {
    id: createId('chat'),
    roomId,
    authorId: options.authorId ?? (me?.id ? String(me.id) : 'anonymous'),
    ts: new Date().toISOString(),
    text: payload,
    mentions,
    variant: options.variant ?? 'user',
    event: options.event
  };

  // Optimistically add to store
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
        // Update with server-assigned ID
        messages.update(msgs => msgs.map(m => 
          m.id === message.id ? { ...m, id: saved.id } : m
        ));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
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
