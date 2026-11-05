import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { notifications } from '../../src/lib/notify/store';
import { toasts } from '../../src/lib/stores/toast';

function withoutUUID(run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
  try { run(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else delete (globalThis as any).crypto;
  }
}

describe('browser action notifications over local HTTP', () => {
  it('shows success and error even when randomUUID is unavailable', () => {
    withoutUUID(() => {
      notifications.success('Saved', 0);
      notifications.error('Upload rejected', 0);
      const rows = get(notifications);
      expect(rows.slice(-2).map(row => row.message)).toEqual(['Saved', 'Upload rejected']);
      expect(rows[rows.length - 1].id).not.toBe(rows[rows.length - 2].id);
      for (const row of rows) notifications.remove(row.id);
    });
  });
  it('creates and dismisses announcement toasts without randomUUID', () => {
    withoutUUID(() => {
      const id = toasts.push({ message: 'Saved', ttl: 0 });
      expect(get(toasts).some(row => row.id === id)).toBe(true);
      toasts.dismiss(id);
      expect(get(toasts)).toEqual([]);
    });
  });
});
