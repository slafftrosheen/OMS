// src/routes/api/settings/+server.ts
import type { RequestHandler } from './$types';

type Prefs = { theme: 'LightVim'|'DarkVim'|'HighContrast'; lang: 'en'|'ru'|'lv'; scale?: 'sm'|'md'|'lg'|'xl' };

let inMem: Prefs = { theme: 'DarkVim', lang: 'en', scale: 'md' }; // replace with DB later

export const GET: RequestHandler = async () => {
  return new Response(JSON.stringify(inMem), { headers: { 'content-type':'application/json' } });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as Partial<Prefs>;
  inMem = { ...inMem, ...body };
  return new Response(JSON.stringify(inMem), { headers: { 'content-type':'application/json' } });
};
