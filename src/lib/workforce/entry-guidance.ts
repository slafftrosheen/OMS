import { parseWorkClockInterval } from './clock-times';
import { parseDate } from './validation';
import type { WorkEntry } from './types';

type ShiftHistoryEntry = Pick<WorkEntry, 'userId' | 'workDate' | 'startTime' | 'finishTime'>;
export interface PreviousShift { sourceDate: string; startTime: string; finishTime: string }

/** Reuse clock boundaries only, never a previous day's duration, pay factor or note. */
export function previousShift(
  entries: readonly ShiftHistoryEntry[], workDate: string, userId: string
): PreviousShift | null {
  if (!userId) return null;
  try { parseDate(workDate); } catch { return null; }
  let result: PreviousShift | null = null;
  for (const entry of entries) {
    if (entry.userId !== userId || entry.workDate >= workDate
      || (result && entry.workDate <= result.sourceDate)) continue;
    try {
      // Historical records without clocks are not inferred from their hours.
      const source = parseWorkClockInterval(entry.workDate, entry.startTime, entry.finishTime);
      // A boundary valid on its original date may be ambiguous on a DST date.
      parseWorkClockInterval(workDate, source.startTime, source.finishTime);
      result = { sourceDate: entry.workDate, startTime: source.startTime, finishTime: source.finishTime };
    } catch { /* Skip malformed or ambiguous records without blocking manual entry. */ }
  }
  return result;
}

export interface ShiftReuseState {
  ready: boolean; busy: boolean; dirty: boolean; hasEntry: boolean;
  future: boolean; fullAbsence: boolean; hasSuggestion: boolean;
}

/** Both the button and its handler use this guard; never replace a saved/typed draft. */
export function canReuseShift(state: ShiftReuseState): boolean {
  return state.ready && state.hasSuggestion && !state.busy && !state.dirty
    && !state.hasEntry && !state.future && !state.fullAbsence;
}

export function savedShiftDraft(entry?: Pick<WorkEntry, 'startTime' | 'finishTime' | 'note'>) {
  return { startTime: entry?.startTime ?? '', finishTime: entry?.finishTime ?? '', note: entry?.note ?? '' };
}

export type ShiftDraftStatus = 'unavailable' | 'busy' | 'future' | 'absence' | 'startRequired'
  | 'finishRequired' | 'invalid' | 'noteTooLong' | 'ready' | 'unchanged';
export interface ShiftDraftState {
  ready: boolean; busy: boolean; future: boolean; fullAbsence: boolean;
  startTime: string; finishTime: string; actualMinutes: number | null; noteLength: number; dirty: boolean;
}

/** Explains disabled actions; validation and persistence remain authoritative on the server. */
export function shiftDraftStatus(state: ShiftDraftState): ShiftDraftStatus {
  if (!state.ready) return 'unavailable';
  if (state.busy) return 'busy';
  if (state.future) return 'future';
  if (state.fullAbsence) return 'absence';
  if (!state.startTime) return 'startRequired';
  if (!state.finishTime) return 'finishRequired';
  if (state.actualMinutes === null || !Number.isInteger(state.actualMinutes)
    || state.actualMinutes <= 0 || state.actualMinutes > 1440) return 'invalid';
  if (state.noteLength > 500) return 'noteTooLong';
  return state.dirty ? 'ready' : 'unchanged';
}
