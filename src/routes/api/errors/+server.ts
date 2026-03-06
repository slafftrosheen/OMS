import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logging/logger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const errorData = await request.json();
    const { message, stack, context, timestamp, userAgent, url, appContext } = errorData;

    // Enrich context with server-side info
    const enrichedContext = {
      ...context,
      ...appContext,
      reportedTimestamp: timestamp,
      userAgent,
      url,
      userId: locals.user?.id,
      clientIp: request.headers.get('x-forwarded-for') || 'unknown'
    };

    // Reconstruct Error object-like structure for the logger
    const reportedError = {
        name: 'ClientReportedError',
        message: message || 'Unknown client error',
        stack: stack
    };

    // Log the error using the server-side logger
    // The logger will automatically send this to Sentry in production
    logger.error(`Client Error: ${message}`, reportedError as any, enrichedContext);

    return json({ success: true });
  } catch (e) {
    // If we fail to log the error, at least log that failure
    console.error('Failed to process client-side error report:', e);
    return json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
};
