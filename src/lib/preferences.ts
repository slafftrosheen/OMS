import { browser } from '$app/environment';
import { base } from '$app/paths';

export type Preferences = {
  theme?: string;
  locale?: string;
  scale?: string;
  density?: string;
  pdfZoom?: number;
  sidebarCollapsed?: boolean;
  notificationsEnabled?: boolean;
  customSettings?: {
    fontScale?: number;
  };
};

type ReadRequest = { controller: AbortController; promise: Promise<Preferences | null> };

let userId: string | null = null;
let generation = 0;
let cachedPreferences: Preferences | undefined;
let inFlight: ReadRequest | null = null;
let writing: AbortController | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let localChanges: Preferences = {};
let pendingChanges: Preferences = {};
const listeners = new Set<(preferences: Preferences) => void>();

function mergePreferences(previous: Preferences, next: Preferences): Preferences {
  const result = { ...previous, ...next };
  if (previous.customSettings || next.customSettings) {
    result.customSettings = { ...previous.customSettings, ...next.customSettings };
  }
  return result;
}

/** Cancel account-owned work before clearing the cached response. */
export function resetPreferencesCache() {
  generation++;
  inFlight?.controller.abort();
  writing?.abort();
  if (syncTimer) clearTimeout(syncTimer);
  inFlight = null;
  writing = null;
  syncTimer = null;
  cachedPreferences = undefined;
  localChanges = {};
  pendingChanges = {};
}

/** Called by the session lifecycle; stores never start anonymous preference reads. */
export function setPreferencesUser(nextUserId: string | null): Promise<Preferences | null> {
  if (!browser) return Promise.resolve(null);
  if (nextUserId !== userId) {
    // Explicit query/control choices made before login still take precedence.
    const initialChoices = userId === null && nextUserId ? localChanges : {};
    resetPreferencesCache();
    userId = nextUserId;
    localChanges = initialChoices;
    pendingChanges = initialChoices;
    scheduleSync();
  }
  return loadPreferences();
}

export function subscribePreferences(listener: (preferences: Preferences) => void) {
  listeners.add(listener);
  if (cachedPreferences) listener(cachedPreferences);
  return () => { listeners.delete(listener); };
}

export function loadPreferences(): Promise<Preferences | null> {
  if (!browser || !userId) return Promise.resolve(null);
  if (cachedPreferences) return Promise.resolve(cachedPreferences);
  if (inFlight) return inFlight.promise;

  const owner = userId;
  const version = generation;
  const controller = new AbortController();
  const isCurrent = () => version === generation && owner === userId && !controller.signal.aborted;
  const request: ReadRequest = { controller, promise: Promise.resolve(null) };
  request.promise = (async () => {
    try {
      const response = await fetch(`${base}/api/preferences`, { signal: controller.signal });
      if (!response.ok || !isCurrent()) return null;
      const result = await response.json();
      if (!isCurrent() || !result || typeof result !== 'object' || Array.isArray(result)) return null;
      // A late GET cannot undo a choice made while the request was in flight.
      cachedPreferences = mergePreferences(result as Preferences, localChanges);
      for (const listener of listeners) listener(cachedPreferences);
      return cachedPreferences;
    } catch {
      return null;
    } finally {
      if (inFlight === request) inFlight = null;
    }
  })();
  inFlight = request;
  return request.promise;
}

/** All appearance and language controls share one debounced, partial write. */
export function queuePreferenceUpdate(changes: Preferences) {
  if (!browser || !Object.keys(changes).length) return;
  localChanges = mergePreferences(localChanges, changes);
  pendingChanges = mergePreferences(pendingChanges, changes);
  if (cachedPreferences) cachedPreferences = mergePreferences(cachedPreferences, changes);
  scheduleSync();
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (!browser || !userId || !Object.keys(pendingChanges).length) return;
  const version = generation;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (version === generation) void syncPreferences();
  }, 500);
}

async function syncPreferences() {
  if (!userId || writing || !Object.keys(pendingChanges).length) return;
  const owner = userId;
  const version = generation;
  const controller = new AbortController();
  const changes = pendingChanges;
  pendingChanges = {};
  writing = controller;
  const isCurrent = () => version === generation && owner === userId && !controller.signal.aborted;
  let saved = false;
  try {
    const response = await fetch(`${base}/api/preferences`, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes)
    });
    saved = response.ok;
  } catch {
    // Local choices remain available offline and retry with the next edit.
  } finally {
    if (writing === controller) writing = null;
    if (isCurrent()) {
      if (saved) scheduleSync();
      else pendingChanges = mergePreferences(changes, pendingChanges);
    }
  }
}
