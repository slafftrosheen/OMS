import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

function createToastStore() {
  const { subscribe, update }: Writable<Toast[]> = writable([]);

  return {
    subscribe,
    add: (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newToast = { ...toast, id };
      update((all) => [newToast, ...all]);

      if (toast.duration !== 0) {
        setTimeout(() => {
          update((all) => all.filter((t) => t.id !== id));
        }, toast.duration || 3000);
      }
    },
    dismiss: (id: string) => {
      update((all) => all.filter((t) => t.id !== id));
    }
  };
}

export const toasts = createToastStore();
