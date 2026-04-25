/**
 * Webhook Service
 * Handles webhook delivery and retry logic
 */

import { supabase } from './supabase';
import { signWebhook } from './webhook-signature';

interface WebhookDelivery {
  id: string;
  webhook_endpoint_id: string;
  event_type: string;
  payload: any;
  url: string;
  auth_type: string;
  auth_config: any;
  headers: any;
  timeout_seconds: number;
  retry_count: number;
  max_retries: number;
}

export class WebhookService {
  /**
   * Process pending webhook deliveries
   */
  static async processDeliveries(batchSize: number = 10): Promise<number> {
    try {
      // Get pending deliveries
      const { data: deliveries, error } = await supabase
        .from('webhook_deliveries')
        .select(`
          *,
          endpoint:webhook_endpoints(url, auth_type, auth_config, headers, timeout_seconds, max_retries)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (error) throw error;

      if (!deliveries || deliveries.length === 0) {
        return 0;
      }

      let processedCount = 0;

      for (const delivery of deliveries) {
        try {
          await this.deliverWebhook(delivery);
          processedCount++;
        } catch (error) {
          console.error('[Webhook] Delivery error:', delivery.id, error);
        }
      }

      return processedCount;

    } catch (error) {
      console.error('[Webhook] Process deliveries error:', error);
      return 0;
    }
  }

  /**
   * Deliver single webhook
   */
  static async deliverWebhook(delivery: any): Promise<void> {
    const startTime = Date.now();

    try {
      // Update status to sending
      await supabase
        .from('webhook_deliveries')
        .update({ status: 'sending', sent_at: new Date().toISOString() })
        .eq('id', delivery.id);

      const endpoint = delivery.endpoint;
      const bodyText = JSON.stringify(delivery.payload);

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'OMS-Webhook/1.0',
        'X-Webhook-Event': delivery.event_type,
        'X-Webhook-Delivery-Id': delivery.id,
        ...(endpoint.headers || {})
      };

      // HMAC-SHA256 signature so the receiver can verify authenticity.
      // The shared secret lives on webhook_endpoints.secret.
      if (endpoint.secret) {
        const signed = signWebhook(endpoint.secret, bodyText);
        headers['X-OMS-Timestamp'] = String(signed.timestamp);
        headers['X-OMS-Signature'] = signed.signature;
      }

      // Add authentication
      if (endpoint.auth_type === 'bearer' && endpoint.auth_config?.token) {
        headers['Authorization'] = `Bearer ${endpoint.auth_config.token}`;
      } else if (endpoint.auth_type === 'api_key' && endpoint.auth_config?.key) {
        headers[endpoint.auth_config.header_name || 'X-API-Key'] = endpoint.auth_config.key;
      } else if (endpoint.auth_type === 'basic' && endpoint.auth_config?.username) {
        const credentials = Buffer.from(
          `${endpoint.auth_config.username}:${endpoint.auth_config.password}`
        ).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      // Make request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout_seconds * 1000);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: bodyText,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();
      const duration = Date.now() - startTime;

      // Update delivery record
      if (response.ok) {
        await supabase
          .from('webhook_deliveries')
          .update({
            status: 'success',
            response_status_code: response.status,
            response_body: responseBody.substring(0, 1000), // Limit size
            duration_ms: duration,
            completed_at: new Date().toISOString()
          })
          .eq('id', delivery.id);
      } else {
        await this.handleFailedDelivery(delivery.id, {
          statusCode: response.status,
          body: responseBody,
          duration
        });
      }

    } catch (error) {
      await this.handleFailedDelivery(delivery.id, {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Handle failed delivery with retry logic
   */
  static async handleFailedDelivery(
    deliveryId: string,
    details: { statusCode?: number; body?: string; error?: string; duration: number }
  ): Promise<void> {
    const { data: delivery } = await supabase
      .from('webhook_deliveries')
      .select('retry_count, max_retries')
      .eq('id', deliveryId)
      .single();

    if (!delivery) return;

    const newRetryCount = delivery.retry_count + 1;

    if (newRetryCount < delivery.max_retries) {
      // Schedule retry with exponential backoff
      const retryDelay = Math.min(Math.pow(2, newRetryCount) * 60, 3600); // Max 1 hour
      const nextRetryAt = new Date(Date.now() + retryDelay * 1000);

      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'failed',
          retry_count: newRetryCount,
          next_retry_at: nextRetryAt.toISOString(),
          response_status_code: details.statusCode || null,
          response_body: details.body?.substring(0, 1000) || null,
          error_message: details.error || `HTTP ${details.statusCode}`,
          duration_ms: details.duration
        })
        .eq('id', deliveryId);
    } else {
      // Max retries reached
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'failed',
          retry_count: newRetryCount,
          response_status_code: details.statusCode || null,
          response_body: details.body?.substring(0, 1000) || null,
          error_message: details.error || `HTTP ${details.statusCode} - Max retries exceeded`,
          duration_ms: details.duration,
          completed_at: new Date().toISOString()
        })
        .eq('id', deliveryId);
    }
  }

  /**
   * Retry failed deliveries
   */
  static async retryFailedDeliveries(): Promise<number> {
    try {
      // Get failed deliveries ready for retry
      const { data: deliveries, error } = await supabase
        .from('webhook_deliveries')
        .select(`
          *,
          endpoint:webhook_endpoints(url, auth_type, auth_config, headers, timeout_seconds, max_retries)
        `)
        .eq('status', 'failed')
        .lte('next_retry_at', new Date().toISOString())
        .lt('retry_count', supabase.rpc('max_retries'))
        .limit(20);

      if (error) throw error;

      if (!deliveries || deliveries.length === 0) {
        return 0;
      }

      let retriedCount = 0;

      for (const delivery of deliveries) {
        // Reset to pending for retry
        await supabase
          .from('webhook_deliveries')
          .update({ status: 'pending' })
          .eq('id', delivery.id);

        await this.deliverWebhook(delivery);
        retriedCount++;
      }

      return retriedCount;

    } catch (error) {
      console.error('[Webhook] Retry failed deliveries error:', error);
      return 0;
    }
  }

  /**
   * Test webhook endpoint
   */
  static async testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: webhook, error } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .eq('id', webhookId)
        .single();

      if (error || !webhook) {
        return { success: false, error: 'Webhook not found' };
      }

      // Create test delivery
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        webhook_id: webhookId,
        message: 'This is a test webhook delivery'
      };

      const { data: delivery, error: createError } = await supabase
        .from('webhook_deliveries')
        .insert({
          webhook_endpoint_id: webhookId,
          event_type: 'webhook.test',
          payload: testPayload,
          status: 'pending'
        })
        .select()
        .single();

      if (createError || !delivery) {
        return { success: false, error: 'Failed to create test delivery' };
      }

      // Deliver immediately
      await this.deliverWebhook({ ...delivery, endpoint: webhook });

      // Check result
      const { data: result } = await supabase
        .from('webhook_deliveries')
        .select('status, error_message')
        .eq('id', delivery.id)
        .single();

      if (result?.status === 'success') {
        return { success: true };
      } else {
        return { success: false, error: result?.error_message || 'Delivery failed' };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Test failed'
      };
    }
  }
}