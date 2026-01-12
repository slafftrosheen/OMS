import { writable } from 'svelte/store';

export type DragItem = { type: 'po'; po: string };
export const dragging = writable<DragItem | null>(null);
