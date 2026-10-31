import type { RequestHandler } from './$types';
import { readBody, workforceResponse } from '$lib/server/workforce/http';
import { mapReport, readReports, requireWorkforceUser, rpc } from '$lib/server/workforce/service';
import { parseMonth } from '$lib/workforce/validation';

export const GET: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  return { reports: await readReports(event.locals.supabase, event.url.searchParams.get('month')) };
});

export const POST: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  const body = await readBody(event);
  const month = parseMonth(body.month);
  const report = await rpc(event.locals.supabase, 'workforce_regenerate_monthly_report', { p_month: `${month}-01` });
  return { report: mapReport(report) };
});
