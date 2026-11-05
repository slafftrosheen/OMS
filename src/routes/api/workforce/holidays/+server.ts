import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapOverride, readHolidays, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { rigaToday } from '$lib/workforce/calendar';
import { parseDate, parseNote, parseVersion, parseYear, WorkforceError } from '$lib/workforce/validation';

export const GET: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const year = parseYear(event.url.searchParams.get('year') || rigaToday().slice(0, 4));
  return readHolidays(event.locals.supabase, year);
});

export const POST: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  const body = await readBody(event);
  const date = parseDate(body.date);
  const name = parseNote(body.name, 120);
  if (!name) throw new WorkforceError('Give this calendar exception a name.');
  if (typeof body.isPublicHoliday !== 'boolean') throw new WorkforceError('Choose whether the date receives holiday credit.');
  const override = await rpc(event.locals.supabase, 'workforce_save_holiday_override', {
    p_date: date, p_name: name, p_is_public_holiday: body.isPublicHoliday, p_expected_version: parseVersion(body.expectedVersion, true)
  });
  return { override: mapOverride(override) };
});
