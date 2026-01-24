/**
 * Email Queue API
 * Trigger email processing (for cron jobs)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EmailService } from '$lib/server/email-service';

// POST /api/emails/queue - Process email queue
export const POST: RequestHandler = async ({ request, locals }) => {
  // Verify cron secret or admin user
  const secret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    // Check if admin user
    const user = locals.user;
    if (!user) throw error(401, 'Unauthorized');

    // Check admin role (implement your admin check)
    // For now, allow any authenticated user in development
    if (process.env.NODE_ENV === 'production') {
      throw error(403, 'Forbidden');
    }
  }

  try {
    const sentCount = await EmailService.processQueue(20);

    return json({
      success: true,
      sentCount,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Email Queue API] Error:', err);
    throw error(500, 'Failed to process email queue');
  }
};