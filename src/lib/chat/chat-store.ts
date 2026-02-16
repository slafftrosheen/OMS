import { writable, get } from 'svelte/store';
import type { Room, Message, SystemMessageEvent } from './types';
import { currentUser } from '$lib/auth/authState';
import { users } from '$lib/users/user-store';
import { createId } from '$lib/utils/id';
import { base } from '$app/paths';
import { notify } from '$lib/notifications/store';
import { browser } from '$app/environment';

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
export const realtimeConnected = writable<boolean>(false);

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

/**
 * Supabase Realtime Subscription (replaces WebSocket)
 * This works on Vercel because it uses Supabase's infrastructure
 */
let realtimeChannel: any = null;
let supabaseClient: any = null;

export function initChatRealtime() {
  if (!isBrowser) return () => {};
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not configured, realtime chat disabled');
    return () => {};
  }

  // Dynamic import to avoid SSR issues
  import('@supabase/supabase-js').then(({ createClient }) => {
    supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Subscribe to chat_messages table for real-time updates
    realtimeChannel = supabaseClient
      .channel('chat-messages')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'chat_messages' 
        },
        (payload: any) => {
          const newMessage = payload.new;
          const me = get(currentUser);
          
          // Transform to Message format
          const message: Message = {
            id: newMessage.id,
            roomId: newMessage.room_id,
            authorId: newMessage.user_id || 'system',
            text: newMessage.content,
            ts: newMessage.created_at,
            mentions: [],
            variant: newMessage.user_id ? 'user' : 'system'
          };

          // Update store (check for duplicates)
          messages.update(msgs => {
            if (msgs.some(m => m.id === message.id)) return msgs;
            return [...msgs, message];
          });

          // Notification logic (only if not sent by me)
          if (me?.id && newMessage.user_id && String(newMessage.user_id) !== String(me.id)) {
            if (!get(isChatOpen)) {
              unreadCount.update(n => n + 1);
              playSound();
              
              notify('New chat message', {
                urgency: 'normal'
              });
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log('Chat realtime status:', status);
        realtimeConnected.set(status === 'SUBSCRIBED');
      });
  }).catch(err => {
    console.error('Failed to initialize Supabase realtime:', err);
  });

  return () => {
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeConnected.set(false);
    }
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
      if (Array.isArray(data) && data.length > 0) {
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
      if (data.success && Array.isArray(data.messages)) {
        // Replace messages for this room
        messages.update(current => {
          const otherRoomMessages = current.filter(m => m.roomId !== roomId);
          return [...otherRoomMessages, ...data.messages];
        });
      }
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

  // Optimistic UI update
  const tempId = `temp_${Date.now()}`;
  const optimisticMessage: Message = {
    id: tempId,
    roomId,
    authorId: options.authorId ?? (me?.id ? String(me.id) : 'anonymous'),
    ts: new Date().toISOString(),
    text: payload,
    mentions,
    variant: options.variant ?? 'user',
    event: options.event
  };

  messages.update((value) => [...value, optimisticMessage]);

  // Persist to database
  if (isBrowser) {
    try {
      const res = await fetch(`${base}/api/chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId,
          text: payload,
          variant: options.variant ?? 'user',
          mentions,
          event: options.event
        })
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.message) {
          // Replace optimistic message with server response
          messages.update(msgs => 
            msgs.map(m => m.id === tempId ? result.message : m)
          );
        }
      } else {
        // Remove optimistic message on error
        messages.update(msgs => msgs.filter(m => m.id !== tempId));
        notify('Failed to send message', { urgency: 'urgent' });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      messages.update(msgs => msgs.filter(m => m.id !== tempId));
      notify('Failed to send message', { urgency: 'urgent' });
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