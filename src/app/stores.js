// Mock for $app/stores - used in tests
import { writable, readable } from 'svelte/store';

export const page = readable({
  url: new URL('http://localhost'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  form: null
});

export const navigating = readable(null);

export const updated = {
  check: async () => false,
  subscribe: writable(false).subscribe
};
