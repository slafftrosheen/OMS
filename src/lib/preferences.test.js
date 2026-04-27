import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('loadPreferences', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    // @ts-expect-error stubbed for tests
    global.window = {};
  });

  it('deduplicates concurrent preference loads', async () => {
    const { resetPreferencesCache } = await import('$lib/preferences');
    resetPreferencesCache();
    const response = { ok: true, json: vi.fn().mockResolvedValue({ theme: 'DarkVim' }) };
    /** @type {(value: any) => void} */
    let resolveFetch = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = vi.fn(() => fetchPromise);

    const { loadPreferences } = await import('$lib/preferences');

    const first = loadPreferences();
    const second = loadPreferences();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(response);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult).toEqual({ theme: 'DarkVim' });
  });

  it('returns cached preferences on subsequent calls', async () => {
    const { resetPreferencesCache } = await import('$lib/preferences');
    resetPreferencesCache();
    const response = { ok: true, json: vi.fn().mockResolvedValue({ locale: 'en' }) };
    global.fetch = vi.fn().mockResolvedValue(response);

    const { loadPreferences } = await import('$lib/preferences');

    const first = await loadPreferences();
    const second = await loadPreferences();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ locale: 'en' });
    expect(second).toEqual({ locale: 'en' });
  });
});
