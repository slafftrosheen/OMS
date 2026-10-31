import { base } from '$app/paths';
export { rigaToday } from './calendar';

export class WorkforceApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'WorkforceApiError';
  }
}

/** Each screen owns its AbortSignal; private responses are never cached. */
export async function workforceRequest<T>(path: string, options: {
  signal: AbortSignal; method?: 'GET' | 'POST' | 'DELETE'; body?: unknown;
}): Promise<T> {
  const response = await fetch(`${base}/api/workforce${path}`, {
    method: options.method ?? 'GET', credentials: 'include', cache: 'no-store',
    signal: options.signal,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new WorkforceApiError(response.status,
    typeof payload?.code === 'string' ? payload.code : 'request_failed',
    typeof payload?.error === 'string' ? payload.error : 'Request failed');
  if (!payload || typeof payload !== 'object') throw new WorkforceApiError(502, 'invalid_response', 'Invalid response');
  return payload as T;
}

export async function workforceCSV(id: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`${base}/api/workforce/reports/${encodeURIComponent(id)}?format=csv`, {
    credentials: 'include', cache: 'no-store', signal
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new WorkforceApiError(response.status, payload?.code ?? 'request_failed', payload?.error ?? 'Download failed');
  }
  return response.blob();
}

export function downloadWorkforceCSV(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function workforceLocale(locale: string | null | undefined): 'en' | 'ru' | 'lv' {
  const language = locale?.split('-')[0];
  return language === 'lv' || language === 'ru' ? language : 'en';
}

const intlLocale = (locale: string) => locale === 'lv' ? 'lv-LV' : locale === 'ru' ? 'ru-RU' : 'en-GB';

export function formatWorkDate(date: string, locale: string, includeWeekday = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
    ...(includeWeekday ? { weekday: 'short' as const } : {})
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatWorkMonth(month: string, locale: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC', year: 'numeric', month: 'long' })
    .format(new Date(`${month}-01T12:00:00Z`));
}

export function formatReportTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: 'Europe/Riga', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function minutesLabel(minutes: number, units: { hourUnit: string; minuteUnit: string }): string {
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = Math.floor(whole / 60), rest = whole % 60;
  return rest ? `${hours} ${units.hourUnit} ${rest} ${units.minuteUnit}` : `${hours} ${units.hourUnit}`;
}

/** Empty fields are not silently converted to a recorded zero. */
export function enteredMinutes(hours: string | number | undefined, minutes: string | number | undefined): number | null {
  if (hours === '' || hours === undefined || minutes === '' || minutes === undefined) return null;
  const h = Number(hours), m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 24 || m < 0 || m > 59 || h * 60 + m > 1440) return null;
  return h * 60 + m;
}
