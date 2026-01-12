import { writable } from 'svelte/store';
export type Notice = { id:string; time:string; kind:'info'|'warn'|'critical'; text:string };
export const notices = writable<Notice[]>([]);
export function push(kind:Notice['kind'], text:string){
  const id = Math.random().toString(36).slice(2);
  notices.update(n => [{ id, time:new Date().toISOString(), kind, text }, ...n].slice(0, 100));
}
