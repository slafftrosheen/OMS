import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapAbsence, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { parseDate, parseNote, WorkforceError } from '$lib/workforce/validation';

export const POST: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const body = await readBody(event);
  const startDate = parseDate(body.startDate, 'Start date');
  const endDate = parseDate(body.endDate, 'End date');
  if (endDate < startDate || new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime() > 365 * 86_400_000) {
    throw new WorkforceError('An absence must end on or after its start and cover no more than 366 days.');
  }
  if (typeof body.partialDay !== 'boolean') throw new WorkforceError('Choose full day or partial day.');
  if (!['leave', 'sick', 'personal', 'other'].includes(String(body.reason))) throw new WorkforceError('Choose an absence reason.');
  const absence = await rpc(event.locals.supabase, 'workforce_create_absence', {
    p_start_date: startDate, p_end_date: endDate, p_partial_day: body.partialDay,
    p_reason: body.reason, p_note: parseNote(body.note)
  });
  return { absence: mapAbsence(absence) };
});
