import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';

type Client = typeof import('../../src/lib/preferences');
const pause = () => new Promise(resolve => setTimeout(resolve, 550));

async function withBrowser(run: (client: Client) => Promise<void>, fetcher: typeof fetch) {
  const previous = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const storage = new Map<string, string>();
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.document = { documentElement: { dataset: {}, style: { setProperty() {} }, lang: '' } } as unknown as Document;
  globalThis.localStorage = {
    get length() { return storage.size; },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  };
  globalThis.fetch = fetcher;
  const client = await import('../../src/lib/preferences');
  await client.setPreferencesUser(null);
  client.resetPreferencesCache();
  try { await run(client); }
  finally {
    await client.setPreferencesUser(null);
    client.resetPreferencesCache();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete (globalThis as any)[key];
      else (globalThis as any)[key] = value;
    }
  }
}

describe('account-owned appearance preferences', () => {
  it('waits for authentication, coalesces reads and caches only for that account', async () => {
    let calls = 0;
    let finish!: (response: Response) => void;
    await withBrowser(async client => {
      expect(await client.loadPreferences()).toBe(null);
      expect(calls).toBe(0);
      const first = client.setPreferencesUser('one');
      const second = client.loadPreferences();
      expect(first).toBe(second);
      expect(calls).toBe(1);
      finish(Response.json({ theme: 'DarkVim' }));
      expect(await first).toEqual({ theme: 'DarkVim' });
      expect(await client.loadPreferences()).toEqual({ theme: 'DarkVim' });
      expect(calls).toBe(1);
    }, async () => { calls++; return new Promise<Response>(resolve => { finish = resolve; }); });
  });

  it('aborts old-account reads and fences late results without releasing the new request', async () => {
    const requests: Array<{ signal: AbortSignal; finish: (response: Response) => void }> = [];
    await withBrowser(async client => {
      const received: string[] = [];
      const unsubscribe = client.subscribePreferences(p => received.push(p.theme ?? ''));
      const old = client.setPreferencesUser('old');
      const current = client.setPreferencesUser('current');
      expect(requests[0].signal.aborted).toBe(true);
      requests[0].finish(Response.json({ theme: 'LightVim' }));
      expect(await old).toBe(null);
      expect(client.loadPreferences()).toBe(current);
      expect(received).toEqual([]);
      requests[1].finish(Response.json({ theme: 'HighContrastVim' }));
      await current;
      expect(received).toEqual(['HighContrastVim']);
      unsubscribe();
    }, async (_url, options) => new Promise<Response>(finish => requests.push({ signal: options!.signal!, finish })));
  });

  it('allows retry after an unauthorized or failed read instead of caching null forever', async () => {
    let calls = 0;
    await withBrowser(async client => {
      expect(await client.setPreferencesUser('one')).toBe(null);
      expect(await client.loadPreferences()).toEqual({ locale: 'lv' });
      expect(calls).toBe(2);
    }, async () => ++calls === 1 ? new Response(null, { status: 401 }) : Response.json({ locale: 'lv' }));
  });

  it('preserves explicit pre-login and in-flight edits while hydrating untouched settings', async () => {
    let finish!: (response: Response) => void;
    await withBrowser(async client => {
      client.queuePreferenceUpdate({ theme: 'HighContrastVim' });
      const loading = client.setPreferencesUser('one');
      client.queuePreferenceUpdate({ locale: 'ru', customSettings: { fontScale: 1.2 } });
      finish(Response.json({ theme: 'LightVim', locale: 'en', density: 'compact', customSettings: { fontScale: 0.9 } }));
      expect(await loading).toEqual({ theme: 'HighContrastVim', locale: 'ru', density: 'compact', customSettings: { fontScale: 1.2 } });
    }, async () => new Promise<Response>(resolve => { finish = resolve; }));
  });

  it('shares theme state across controls and writes theme, scale, font and language together', async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    await withBrowser(async client => {
      await client.setPreferencesUser('one');
      const { ui } = await import('../../src/lib/state/appState.svelte');
      const { theme } = await import('../../src/lib/stores/theme');
      const { scale } = await import('../../src/lib/stores/scale');
      const { setLocale, locale } = await import('../../src/lib/i18n');
      theme.set('HighContrast');
      expect(get(ui).theme).toBe('HighContrastVim');
      expect(document.documentElement.dataset.theme).toBe('HighContrastVim');
      ui.patch({ theme: 'LightVim', density: 'compact', fontScale: 1.15 });
      expect(get(theme)).toBe('LightVim');
      scale.set('lg');
      setLocale('lv-LV');
      expect(get(locale)).toBe('lv');
      expect(document.documentElement.lang).toBe('lv');
      expect(document.documentElement.dataset.scale).toBe('lg');
      await pause();
      const writes = requests.filter(r => r.options?.method === 'PUT');
      expect(writes).toHaveLength(1);
      expect(requests.every(r => r.url === '/api/preferences')).toBe(true);
      expect(JSON.parse(writes[0].options!.body as string)).toEqual({ theme: 'LightVim', density: 'compact', customSettings: { fontScale: 1.15 }, scale: 'lg', locale: 'lv' });
    }, async (url, options) => {
      requests.push({ url: String(url), options });
      return Response.json(options?.method === 'PUT' ? { success: true } : { theme: 'DarkVim', locale: 'en' });
    });
  });

  it('cancels pending writes at logout and aborts active writes when accounts change', async () => {
    const writes: Array<{ signal: AbortSignal; finish: (response: Response) => void }> = [];
    await withBrowser(async client => {
      await client.setPreferencesUser('one');
      client.queuePreferenceUpdate({ theme: 'LightVim' });
      await client.setPreferencesUser(null);
      await pause();
      expect(writes).toHaveLength(0);
      await client.setPreferencesUser('two');
      client.queuePreferenceUpdate({ locale: 'ru' });
      await pause();
      expect(writes).toHaveLength(1);
      await client.setPreferencesUser('three');
      expect(writes[0].signal.aborted).toBe(true);
      writes[0].finish(Response.json({ success: true }));
      await pause();
      expect(writes).toHaveLength(1);
      expect(await client.loadPreferences()).toEqual({ locale: 'en' });
    }, async (_url, options) => options?.method === 'PUT'
      ? new Promise<Response>(finish => writes.push({ signal: options.signal!, finish }))
      : Response.json({ locale: 'en' }));
  });
});
