import { writable } from 'svelte/store';
import { createId } from '$lib/utils/id';

export type TelemetryEventName = 'theme_toggle' | 'locale_toggle' | 'stage_proposed';

export type TelemetryEvent = {
  id: string;
  name: TelemetryEventName;
  ts: string;
  payload?: Record<string, unknown>;
};

const MAX_EVENTS = 200;

export const telemetryEvents = writable<TelemetryEvent[]>([]);

export function track(name: TelemetryEventName, payload?: Record<string, unknown>) {
  const entry: TelemetryEvent = {
    id: createId('telemetry'),
    name,
    ts: new Date().toISOString(),
    payload
  };

  telemetryEvents.update((events) => {
    const next = [entry, ...events];
    return next.slice(0, MAX_EVENTS);
  });

  if (import.meta.env.DEV) {
    console.debug('[telemetry]', name, payload ?? {});
  }
}
