import { writable, derived, get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { supabase } from '$lib/supabase-client';

export interface ChatMessage {
  id: string;
  order_id: string;
  user_id: string;
  message: string;
  created_at: string;
  user?: {
    id: string;
    email: string;
    profiles?: {
      full_name: string;
      avatar_url?: string;
    };
  };
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  orderId: string | null;
}

function createChatStore() {
  const initialState: ChatState = {
    messages: [],
    loading: false,
    error: null,
    orderId: null
  };

  const store: Writable<ChatState> = writable(initialState);
  const { subscribe, update, set } = store;

  let realtimeChannel: any = null;

  return {
    subscribe,

    // Load messages for an order
    async load(orderId: string) {
      update(state => ({ ...state, loading: true, error: null, orderId }));

      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select(`
            *,
            user:user_id (
              id,
              email,
              profiles (full_name, avatar_url)
            )
          `)
          .eq('order_id', orderId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        update(state => ({
          ...state,
          messages: data || [],
          loading: false
        }));
      } catch (err: any) {
        update(state => ({
          ...state,
          loading: false,
          error: err.message
        }));
      }
    },

    // Subscribe to real-time messages
    subscribe_realtime(orderId: string) {
      realtimeChannel = supabase
        .channel(`chat:${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `order_id=eq.${orderId}`
          },
          async (payload) => {
            // Fetch complete message with user data
            const { data } = await supabase
              .from('chat_messages')
              .select(`
                *,
                user:user_id (
                  id,
                  email,
                  profiles (full_name, avatar_url)
                )
              `)
              .eq('id', payload.new.id)
              .single();

            if (data) {
              update(state => ({
                ...state,
                messages: [...state.messages, data as ChatMessage]
              }));
            }
          }
        )
        .subscribe();

      return () => {
        if (realtimeChannel) {
          realtimeChannel.unsubscribe();
        }
      };
    },

    // Send message
    async send(orderId: string, userId: string, message: string) {
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .insert({
            order_id: orderId,
            user_id: userId,
            message: message.trim()
          })
          .select(`
            *,
            user:user_id (
              id,
              email,
              profiles (full_name, avatar_url)
            )
          `)
          .single();

        if (error) throw error;

        // Message will be added via realtime subscription
        return data;
      } catch (err: any) {
        console.error('Failed to send message:', err);
        throw err;
      }
    },

    // Clear chat
    clear() {
      set(initialState);
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
      }
    }
  };
}

export const chatStore = createChatStore();
