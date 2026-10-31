import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapEntry, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { rigaToday } from '$lib/workforce/calendar';
import { parseActualMinutes, parseDate, parseHoursToMinutes, parseNote, parseVersion, WorkforceError } from '$lib/workforce/validation';

export const POST: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const body = await readBody(event);
  const workDate = parseDate(body.workDate, 'Work date');
  if (workDate > rigaToday()) throw new WorkforceError('Worked hours cannot be recorded for a future date.');
  if (('actualMinutes' in body) === ('hours' in body)) throw new WorkforceError('Supply actual minutes or decimal hours, but not both.');
  const actualMinutes = 'actualMinutes' in body ? parseActualMinutes(body.actualMinutes) : parseHoursToMinutes(body.hours);
  const entry = await rpc(event.locals.supabase, 'workforce_save_entry', {
    p_work_date: workDate, p_actual_minutes: actualMinutes, p_note: parseNote(body.note), p_expected_version: parseVersion(body.expectedVersion, true)
  });
  return { entry: mapEntry(entry) };
});
