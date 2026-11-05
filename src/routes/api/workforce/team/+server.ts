import type { RequestHandler } from './$types';
import { workforceResponse } from '$lib/server/workforce/http';
import { readTeam, requireWorkforceUser } from '$lib/server/workforce/service';

export const GET: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  return readTeam(event.locals.supabase, event.url.searchParams.get('month'));
});
