import type { RequestHandler } from './$types';
import { workforceResponse } from '$lib/server/workforce/http';
import { readReport, reportCsv, requireWorkforceUser } from '$lib/server/workforce/service';

export const GET: RequestHandler = (event) => workforceResponse(async () => {
  requireWorkforceUser(event, true);
  const report = await readReport(event.locals.supabase, event.params.id);
  if (event.url.searchParams.get('format') === 'csv') {
    return new Response(reportCsv(report), { headers: {
      'content-type': 'text/csv; charset=utf-8', 'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="${report.kind}-${report.period}-v${report.version}.csv"`
    } });
  }
  return { report };
});
