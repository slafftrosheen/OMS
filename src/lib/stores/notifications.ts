// src/lib/stores/notifications.ts
import { writable } from 'svelte/store';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    action_url?: string;
    read: boolean;
    created_at: string;
}

function createNotificationStore() {
    const { subscribe, set, update } = writable<Notification[]>([]);

    return {
        subscribe,
        set,
        add: (notification: Notification) => {
            update(notifications => [notification, ...notifications]);
        },
        markAsRead: (id: string) => {
            update(notifications => 
                notifications.map(n => 
                    n.id === id ? { ...n, read: true } : n
                )
            );
        },
        markAllAsRead: () => {
            update(notifications => 
                notifications.map(n => ({ ...n, read: true }))
            );
        },
        remove: (id: string) => {
            update(notifications => 
                notifications.filter(n => n.id !== id)
            );
        },
        clear: () => set([])
    };
}

export const notifications = createNotificationStore();

// Toast notifications (temporary UI messages)
export interface Toast {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
}

function createToastStore() {
    const { subscribe, update } = writable<Toast[]>([]);

    let nextId = 0;

    return {
        subscribe,
        show: (message: string, type: Toast['type'] = 'info', duration: number = 5000) => {
            const id = `toast-${nextId++}`;
            const toast: Toast = { id, message, type, duration };

            update(toasts => [...toasts, toast]);

            if (duration > 0) {
                setTimeout(() => {
                    update(toasts => toasts.filter(t => t.id !== id));
                }, duration);
            }

            return id;
        },
        dismiss: (id: string) => {
            update(toasts => toasts.filter(t => t.id !== id));
        },
        clear: () => update(() => [])
    };
}

export const toasts = createToastStore();