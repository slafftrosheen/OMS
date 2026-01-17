import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timeout?: number;
  sound?: boolean;
}

function createNotificationStore() {
  const { subscribe, update } = writable<Notification[]>([]);

  const add = (
    message: string,
    type: NotificationType = 'info',
    timeout = 5000,
    sound = true
  ) => {
    const id = crypto.randomUUID();
    const notification: Notification = { id, type, message, timeout, sound };

    update((n) => [...n, notification]);

    if (sound) {
      playSound(type);
    }

    if (timeout > 0) {
      setTimeout(() => {
        remove(id);
      }, timeout);
    }
  };

  const remove = (id: string) => {
    update((n) => n.filter((i) => i.id !== id));
  };

  return {
    subscribe,
    add,
    remove,
    success: (msg: string, timeout?: number) => add(msg, 'success', timeout),
    error: (msg: string, timeout?: number) => add(msg, 'error', timeout),
    info: (msg: string, timeout?: number) => add(msg, 'info', timeout),
    warning: (msg: string, timeout?: number) => add(msg, 'warning', timeout),
  };
}

// Simple sound synthesizer using Web Audio API to avoid external assets
function playSound(type: NotificationType) {
  if (typeof window === 'undefined') return;

  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;

  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'success') {
    // Pleasant major chime (C5 -> E5)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } else if (type === 'error') {
    // Low buzz/thud
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'warning') {
    // Two quick beeps
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.setValueAtTime(0, now + 0.1);
    gain.gain.setValueAtTime(0.05, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } else {
    // Info: soft ping
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}

export const notifications = createNotificationStore();
