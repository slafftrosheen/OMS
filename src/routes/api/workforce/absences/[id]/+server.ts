import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapAbsence, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { parseUuid, parseVersion } from '$lib/workforce/validation';

export const DELETE: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const body = await readBody(event);
  const absence = await rpc(event.locals.supabase, 'workforce_cancel_absence', { p_id: parseUuid(event.params.id), p_expected_version: parseVersion(body.expectedVersion) });
  return { absence: mapAbsence(absence) };
});
