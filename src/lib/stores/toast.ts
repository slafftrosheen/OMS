import { writable } from 'svelte/store';

export type Toast = {
  id: string;
  title?: string;
  message: string;
  kind?: 'info' | 'success' | 'warning' | 'error';
  ttl?: number; // ms
};

function createToasts() {
  const { subscribe, update } = writable<Toast[]>([]);

  function push(t: Omit<Toast, 'id'>) {
    const id = crypto.randomUUID();
    const toast = { id, ttl: 3500, kind: 'info', ...t };
    update((arr) => [...arr, toast]);
    if (toast.ttl) {
      setTimeout(() => dismiss(id), toast.ttl);
    }
    return id;
  }
  function dismiss(id: string) {
    update((arr) => arr.filter((t) => t.id !== id));
  }

  return { subscribe, push, dismiss };
}

export const toasts = createToasts();

// Convenience function for announce-style toasts
export function announce(text: string, level: 'success' | 'warning' | 'error' = 'success') {
  // Map level to kind
  const kind = level === 'warning' ? 'warning' : level === 'error' ? 'error' : 'success';
  toasts.push({ message: text, kind });
}
