import { browser } from '$app/environment';
import { base } from '$app/paths';

type Preferences = Record<string, any>;

// cachedPreferences: undefined = not loaded, null = failed/empty, object = loaded data
let cachedPreferences: Preferences | null | undefined;
let inFlight: Promise<Preferences | null> | null = null;

export function resetPreferencesCache() {
  cachedPreferences = undefined;
  inFlight = null;
}

export async function loadPreferences(): Promise<Preferences | null> {
  if (!browser) return null;
  if (cachedPreferences !== undefined) {
    return cachedPreferences;
  }

  if (!inFlight) {
    inFlight = fetch(`${base}/api/preferences`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }

  const pending = inFlight;
  const result = await pending;
  cachedPreferences = result;

  if (inFlight === pending) {
    inFlight = null;
  }

  return cachedPreferences;
}
