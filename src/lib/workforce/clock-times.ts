import { parseDate, WorkforceError } from './validation';
import { WORKFORCE_TIME_ZONE } from './types';

const localClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: WORKFORCE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** Strict minute precision keeps browser, API and database inputs identical. */
export function parseClockTime(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new WorkforceError('Enter start and finish times as HH:MM.', 400, 'INVALID_CLOCK_TIME');
  }
  return value;
}

function localEpoch(instant: number): number {
  const values = Object.fromEntries(localClock.formatToParts(instant).map(part => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
}

/** Resolve a Riga wall-clock boundary without guessing a repeated DST hour. */
function clockInstant(date: string, time: string): number {
  const wallTime = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set([-DAY_MS, 0, DAY_MS].map(delta => localEpoch(wallTime + delta) - (wallTime + delta)));
  const candidates = [...offsets].map(offset => wallTime - offset).filter(instant => localEpoch(instant) === wallTime);
  if (candidates.length !== 1) {
    throw new WorkforceError('This local time is missing or repeated when the clocks change. Choose unambiguous times.', 400, 'CLOCK_CHANGE');
  }
  return candidates[0];
}

export interface WorkClockInterval { startTime: string; finishTime: string; actualMinutes: number }

/** One daily ledger row covers a positive interval within its Riga calendar date. */
export function parseWorkClockInterval(workDate: unknown, start: unknown, finish: unknown): WorkClockInterval {
  const date = parseDate(workDate, 'Work date');
  const startTime = parseClockTime(start), finishTime = parseClockTime(finish);
  if (finishTime <= startTime) {
    throw new WorkforceError('Finish must be after start on the same work date.', 400, 'INVALID_CLOCK_TIME');
  }
  const actualMinutes = (clockInstant(date, finishTime) - clockInstant(date, startTime)) / 60000;
  if (!Number.isInteger(actualMinutes) || actualMinutes <= 0 || actualMinutes > 1440) {
    throw new WorkforceError('Working time must be a positive interval of at most 24 hours.', 400, 'INVALID_CLOCK_TIME');
  }
  return { startTime, finishTime, actualMinutes };
}
