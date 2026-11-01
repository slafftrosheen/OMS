import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapEntry, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { rigaToday } from '$lib/workforce/calendar';
import { parseDate, parseNote, parseVersion, WorkforceError } from '$lib/workforce/validation';
import { parseWorkClockInterval } from '$lib/workforce/clock-times';

export const POST: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const body = await readBody(event);
  const workDate = parseDate(body.workDate, 'Work date');
  if (workDate > rigaToday()) throw new WorkforceError('Worked hours cannot be recorded for a future date.');
  if ('actualMinutes' in body || 'hours' in body || 'creditedMinutes' in body) {
    throw new WorkforceError('Enter start and finish times; working duration is calculated by the system.', 400, 'INVALID_CLOCK_TIME');
  }
  const interval = parseWorkClockInterval(workDate, body.startTime, body.finishTime);
  const entry = await rpc(event.locals.supabase, 'workforce_save_clock_entry', {
    p_work_date: workDate, p_start_time: interval.startTime, p_finish_time: interval.finishTime,
    p_note: parseNote(body.note), p_expected_version: parseVersion(body.expectedVersion, true)
  });
  return { entry: mapEntry(entry) };
});
