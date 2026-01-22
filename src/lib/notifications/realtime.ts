import { writable } from 'svelte/store';
import { createClient } from '@supabase/supabase-js';

export const notifications = writable<any[]>([]);

// Using environment variables for Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function initNotificationsRealtime() {
  if (!supabaseUrl || !supabaseAnonKey) return;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const channel = supabase
    .channel('public:notifications')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'notifications' 
    }, (payload) => {
      notifications.update((current) => [payload.new, ...current]);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
