export const MIN_WORKFORCE_YEAR = 2015;
export const MAX_WORKFORCE_YEAR = 2099;

export class WorkforceError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_INPUT') {
    super(message);
    this.name = 'WorkforceError';
  }
}

export function parseDate(value: unknown, field = 'Date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WorkforceError(`${field} must use YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < MIN_WORKFORCE_YEAR || year > MAX_WORKFORCE_YEAR || parsed.toISOString().slice(0, 10) !== value) {
    throw new WorkforceError(`${field} must be a valid date between ${MIN_WORKFORCE_YEAR} and ${MAX_WORKFORCE_YEAR}.`);
  }
  return value;
}

export function parseMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new WorkforceError('Month must use YYYY-MM.');
  }
  parseDate(`${value}-01`, 'Month');
  return value;
}

/** Convert decimal hours with integer arithmetic: never silently round a fraction of a minute. */
export function parseHoursToMinutes(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,2}(?:[.,]\d{1,6})?$/.test(value.trim())) {
    throw new WorkforceError('Enter hours as a decimal number from 0 to 24.');
  }
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  const scale = 10 ** fraction.length;
  const numerator = (Number(whole) * scale + Number(fraction)) * 60;
  if (numerator % scale !== 0) {
    throw new WorkforceError('Enter whole minutes; the supplied hours contain a fraction of a minute.');
  }
  return parseActualMinutes(numerator / scale);
}

export function parseActualMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1440) {
    throw new WorkforceError('Daily work must be a whole number of minutes from 0 to 1,440.');
  }
  return value;
}

export function parseVersion(value: unknown, allowNew = false): number | null {
  if (allowNew && value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483646) {
    throw new WorkforceError('Reload the record before saving; a valid version is required.');
  }
  return value;
}

export function parseNote(value: unknown, maximum = 500): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > maximum) {
    throw new WorkforceError(`Text must contain at most ${maximum} characters.`);
  }
  return value.trim();
}

export function parseUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new WorkforceError('Invalid record identifier.');
  }
  return value;
}

export function parseYear(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) throw new WorkforceError('Enter a valid year.');
  parseDate(`${value}-01-01`, 'Year');
  return Number(value);
}

export function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkforceError('A JSON object is required.');
  return value as Record<string, unknown>;
}
