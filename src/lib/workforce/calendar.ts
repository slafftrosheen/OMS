import { WORKFORCE_TIME_ZONE, type HolidayOverride, type WorkforceDay } from './types';
import { parseDate, parseMonth } from './validation';

const dayMilliseconds = 86_400_000;

export function rigaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKFORCE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(date: string, count: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + count * dayMilliseconds).toISOString().slice(0, 10);
}

export function monthBounds(month: string): { start: string; end: string; next: string } {
  parseMonth(month);
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const next = date.toISOString().slice(0, 10);
  return { start, end: addDays(next, -1), next };
}

/** Gregorian computus. Date-only arithmetic is UTC; reporting boundaries use Europe/Riga. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Current statutory calendar (2015 onward), verified 2026-10-31.
 * https://likumi.lv/ta/en/en/id/72608-on-public-holidays-commemoration-days-and-celebration-days
 * Observed days off are separately identified. Company policy also credits them at 2×.
 * Transferred government workdays are NOT inferred for this private employer.
 * Festival closing/observed dates and future one-offs must be explicitly added as overrides.
 */
function recurringHolidays(year: number): Map<string, { name: string; observed: boolean }> {
  const holidays = new Map<string, { name: string; observed: boolean }>();
  const add = (date: string, name: string, observed = false) => {
    const existing = holidays.get(date);
    holidays.set(date, { name: existing ? `${existing.name} / ${name}` : name, observed });
  };
  for (const [day, name] of [
    ['01-01', 'New Year’s Day'], ['05-01', 'Labour Day'], ['05-04', 'Restoration of Independence Day'],
    ['06-23', 'Līgo Day'], ['06-24', 'Jāņi Day'], ['11-18', 'Proclamation of the Republic of Latvia'],
    ['12-24', 'Christmas Eve'], ['12-25', 'Christmas Day'], ['12-26', 'Second Day of Christmas'],
    ['12-31', 'New Year’s Eve']
  ]) add(`${year}-${day}`, name);
  const easter = easterSunday(year);
  add(addDays(easter, -2), 'Good Friday');
  add(easter, 'Easter Sunday');
  add(addDays(easter, 1), 'Easter Monday');
  add(addDays(easter, 49), 'Pentecost');
  const firstMay = `${year}-05-01`;
  const firstSunday = (7 - new Date(`${firstMay}T00:00:00Z`).getUTCDay()) % 7;
  add(addDays(firstMay, firstSunday + 7), 'Mother’s Day');
  for (const day of ['05-04', '11-18']) {
    const date = `${year}-${day}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      let observed = addDays(date, 1);
      while ([0, 6].includes(new Date(`${observed}T00:00:00Z`).getUTCDay()) || holidays.has(observed)) observed = addDays(observed, 1);
      add(observed, `${holidays.get(date)!.name} — observed day off`, true);
    }
  }
  if (year === 2018) add('2018-09-24', 'Papal Visit to Latvia');
  if (year === 2023) add('2023-05-29', 'Latvian Ice Hockey Bronze Medal Day');
  // Official Labour Inspectorate confirms the final and following rest days:
  // https://www.vdi.gov.lv/lv/jaunums/03072018-pec-dziesmu-un-deju-svetkiem-pirmdiena-9-julijs-ir-brivdiena
  // https://www.vdi.gov.lv/lv/dazadi-jautajumi
  if (year === 2018) {
    add('2018-07-08', 'Nationwide Latvian Song and Dance Celebration — final day');
    add('2018-07-09', 'Nationwide Latvian Song and Dance Celebration — observed day off', true);
  }
  if (year === 2023) {
    add('2023-07-09', 'Nationwide Latvian Song and Dance Celebration — final day');
    add('2023-07-10', 'Nationwide Latvian Song and Dance Celebration — observed day off', true);
  }
  return holidays;
}

export function classifyWorkDay(date: string, overrides: readonly HolidayOverride[] = []): WorkforceDay {
  parseDate(date);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const recurring = recurringHolidays(Number(date.slice(0, 4))).get(date);
  const override = overrides.find((item) => item.date === date);
  const holidayName = override ? (override.isPublicHoliday ? override.name : null) : recurring?.name ?? null;
  const isObservedDayOff = !override && recurring?.observed === true;
  return {
    date, isWeekend, isPublicHoliday: holidayName !== null && !isObservedDayOff,
    isObservedDayOff, holidayName, multiplier: isWeekend || holidayName !== null ? 2 : 1
  };
}

export function calendarMonth(month: string, overrides: readonly HolidayOverride[] = []): WorkforceDay[] {
  const { start, next } = monthBounds(month);
  const days: WorkforceDay[] = [];
  for (let date = start; date < next; date = addDays(date, 1)) days.push(classifyWorkDay(date, overrides));
  return days;
}
