import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { parseDate, parseVersion } from '$lib/workforce/validation';

export const DELETE: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  const body = await readBody(event);
  await rpc(event.locals.supabase, 'workforce_delete_holiday_override', { p_date: parseDate(event.params.date), p_expected_version: parseVersion(body.expectedVersion) });
  return { ok: true };
});
