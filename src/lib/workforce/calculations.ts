import type { WorkEntry, WorkforceTotals } from './types';

export function emptyTotals(): WorkforceTotals {
  return { actualMinutes: 0, regularMinutes: 0, premiumMinutes: 0, creditedMinutes: 0, daysWorked: 0, recordedDays: 0 };
}

export function totalEntries(entries: readonly Pick<WorkEntry, 'actualMinutes' | 'multiplier' | 'creditedMinutes'>[]): WorkforceTotals {
  return entries.reduce((totals, entry) => {
    totals.actualMinutes += entry.actualMinutes;
    totals.creditedMinutes += entry.creditedMinutes;
    totals[entry.multiplier === 2 ? 'premiumMinutes' : 'regularMinutes'] += entry.actualMinutes;
    totals.daysWorked += Number(entry.actualMinutes > 0);
    totals.recordedDays += 1;
    return totals;
  }, emptyTotals());
}

export function sumTotals(rows: readonly WorkforceTotals[]): WorkforceTotals {
  return rows.reduce((total, row) => {
    for (const key of Object.keys(total) as Array<keyof WorkforceTotals>) total[key] += row[key];
    return total;
  }, emptyTotals());
}

/** Human display only. Storage and calculations always retain exact integer minutes. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}
