/**
 * Webhook Processing API
 * Process pending webhooks and integration events (for cron jobs)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { WebhookService } from '$lib/server/webhook-service';
import { IntegrationService } from '$lib/server/integration-service';

// POST /api/webhooks/process - Process pending webhooks
export const POST: RequestHandler = async ({ request }) => {
  // Verify cron secret
  const secret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    throw error(403, 'Forbidden');
  }

  try {
    // Process webhook deliveries
    const webhookCount = await WebhookService.processDeliveries(20);
    
    // Retry failed deliveries
    const retryCount = await WebhookService.retryFailedDeliveries();
    
    // Process integration events
    const integrationCount = await IntegrationService.processIntegrationEvents(20);

    return json({
      success: true,
      processed: {
        webhooks: webhookCount,
        retries: retryCount,
        integrations: integrationCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Webhook Processing API] Error:', err);
    throw error(500, 'Failed to process webhooks');
  }
};