import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { parseUuid, parseVersion } from '$lib/workforce/validation';

export const DELETE: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event);
  const body = await readBody(event);
  await rpc(event.locals.supabase, 'workforce_delete_entry', { p_id: parseUuid(event.params.id), p_expected_version: parseVersion(body.expectedVersion) });
  return { ok: true };
});
