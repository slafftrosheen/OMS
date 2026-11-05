import type { RequestHandler } from './$types';
import { workforceResponse } from '$lib/server/workforce/http';
import { readMonth, requireWorkforceUser } from '$lib/server/workforce/service';

export const GET: RequestHandler = (event) => workforceResponse(async () => {
  const user = requireWorkforceUser(event);
  return readMonth(event.locals.supabase, user, event.url.searchParams.get('month'), event.url.searchParams.get('userId'));
});
