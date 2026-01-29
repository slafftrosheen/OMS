/**
 * Toast notification system
 */
import { writable, derived, get } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
  dismissible?: boolean;
  timestamp: number;
}

interface ToastStore {
  toasts: Toast[];
}

const toastStore = writable<ToastStore>({ toasts: [] });

// Maximum number of toasts to show at once
const MAX_TOASTS = 5;

// Default durations by type (ms)
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000
};

/**
 * Generate unique ID
 */
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add a toast notification
 */
export function addToast(
  type: ToastType,
  message: string,
  options: Partial<Pick<Toast, 'duration' | 'action' | 'dismissible'>> = {}
): string {
  const id = generateId();
  const duration = options.duration ?? DEFAULT_DURATIONS[type];
  
  const toast: Toast = {
    id,
    type,
    message,
    duration,
    action: options.action,
    dismissible: options.dismissible ?? true,
    timestamp: Date.now()
  };
  
  toastStore.update(state => {
    const toasts = [...state.toasts, toast];
    // Keep only the most recent MAX_TOASTS
    if (toasts.length > MAX_TOASTS) {
      toasts.shift();
    }
    return { toasts };
  });
  
  // Auto-dismiss after duration
  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
  
  return id;
}

/**
 * Dismiss a toast
 */
export function dismissToast(id: string) {
  toastStore.update(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  }));
}

/**
 * Clear all toasts
 */
export function clearToasts() {
  toastStore.update(() => ({ toasts: [] }));
}

/**
 * Convenience functions
 */
export function notifySuccess(message: string, options?: Partial<Pick<Toast, 'duration' | 'action'>>) {
  return addToast('success', message, options);
}

export function notifyError(message: string, options?: Partial<Pick<Toast, 'duration' | 'action'>>) {
  return addToast('error', message, options);
}

export function notifyWarning(message: string, options?: Partial<Pick<Toast, 'duration' | 'action'>>) {
  return addToast('warning', message, options);
}

export function notifyInfo(message: string, options?: Partial<Pick<Toast, 'duration' | 'action'>>) {
  return addToast('info', message, options);
}

/**
 * Store exports
 */
export const toasts = derived(toastStore, $store => $store.toasts);

/**
 * Get all toasts (for testing)
 */
export function getToasts(): Toast[] {
  return get(toasts);
}
