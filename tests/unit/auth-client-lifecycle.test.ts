import { describe, it, expect } from 'vitest';

const user = (id: string) => ({ id, username: id, displayName: id, role: 'RD' as const, stations: [] });

async function browser(run: (State: typeof import('../../src/lib/auth/authState.svelte').AuthState) => Promise<void>, fetcher: typeof fetch) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = {} as Window & typeof globalThis;
  globalThis.fetch = fetcher;
  try {
    const { AuthState } = await import('../../src/lib/auth/authState.svelte');
    await run(AuthState);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else globalThis.window = previousWindow;
  }
}

describe('authentication request lifecycle', () => {
  it('has no constructor request and shares one concurrent session check', async () => {
    let calls = 0;
    let resolve!: (response: Response) => void;
    await browser(async (AuthState) => {
      const state = new AuthState();
      expect(calls).toBe(0);
      const first = state.load();
      const second = state.load();
      await Promise.resolve();
      expect(calls).toBe(1);
      resolve(Response.json({ user: user('one') }));
      expect((await first)?.id).toBe('one');
      expect((await second)?.id).toBe('one');
      expect(state.loading).toBe(false);
    }, async () => { calls++; return new Promise<Response>(done => { resolve = done; }); });
  });

  it('cannot replace an explicit sign-in with an older session response', async () => {
    let resolve!: (response: Response) => void;
    await browser(async (AuthState) => {
      const state = new AuthState();
      const pending = state.load();
      await Promise.resolve();
      state.setUser(user('new-session'));
      resolve(Response.json({ user: user('old-session') }));
      await pending;
      expect(state.user?.id).toBe('new-session');
      expect(state.loading).toBe(false);
    }, async () => new Promise<Response>(done => { resolve = done; }));
  });

  it('aborts a timed-out request and ignores a late successful response', async () => {
    let resolve!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    await browser(async (AuthState) => {
      const state = new AuthState();
      expect(await state.load(10)).toBe(null);
      expect(signal?.aborted).toBe(true);
      resolve(Response.json({ user: user('late') }));
      await new Promise(done => setTimeout(done, 0));
      expect(state.user).toBe(null);
      expect(state.error).toBe('Auth check timeout');
      expect(state.loading).toBe(false);
    }, async (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>(done => { resolve = done; });
    });
  });

  it('releases completed requests so a later session refresh can run', async () => {
    let calls = 0;
    await browser(async (AuthState) => {
      const state = new AuthState();
      expect(await state.load()).toBe(null);
      expect(state.error).toBe(null);
      expect((await state.load())?.id).toBe('refreshed');
      expect(calls).toBe(2);
    }, async () => ++calls === 1 ? new Response(null, { status: 401 }) : Response.json({ user: user('refreshed') }));
  });
});
