// src/lib/server/webhooks/WebhookService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';
import crypto from 'crypto';

export type WebhookEvent =
    | 'order.created'
    | 'order.updated'
    | 'order.completed'
    | 'order.cancelled'
    | 'stage.changed'
    | 'rework.initiated'
    | 'file.uploaded';

interface Webhook {
    id: string;
    url: string;
    events: WebhookEvent[];
    secret: string;
    active: boolean;
    created_by: string;
}

interface WebhookPayload {
    event: WebhookEvent;
    timestamp: string;
    data: any;
}

export class WebhookService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Register a new webhook
     */
    async register(
        url: string,
        events: WebhookEvent[],
        userId: string
    ): Promise<Webhook> {
        
        // Validate URL
        try {
            new URL(url);
        } catch {
            throw new Error('Invalid webhook URL');
        }

        // Generate secret for signature validation
        const secret = crypto.randomBytes(32).toString('hex');

        const { data: webhook, error } = await this.supabase
            .from('webhooks')
            .insert({
                url,
                events,
                secret,
                active: true,
                created_by: userId
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to register webhook', error);
            throw new Error('Webhook registration failed');
        }

        logger.info('Webhook registered', {
            webhookId: webhook.id,
            url,
            events
        });

        return webhook;
    }

    /**
     * Trigger webhooks for an event
     */
    async trigger(event: WebhookEvent, data: any): Promise<void> {
        // Get active webhooks for this event
        const { data: webhooks, error } = await this.supabase
            .from('webhooks')
            .select('*')
            .eq('active', true)
            .contains('events', [event]);

        if (error || !webhooks || webhooks.length === 0) {
            return;
        }

        const payload: WebhookPayload = {
            event,
            timestamp: new Date().toISOString(),
            data
        };

        // Send to all matching webhooks
        const deliveryPromises = webhooks.map(webhook =>
            this.deliver(webhook, payload)
        );

        await Promise.allSettled(deliveryPromises);
    }

    /**
     * Deliver payload to a webhook endpoint
     */
    private async deliver(webhook: Webhook, payload: WebhookPayload): Promise<void> {
        const signature = this.generateSignature(payload, webhook.secret);

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Event': payload.event,
                    'User-Agent': 'OMS-Webhook/1.0'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Log successful delivery
            await this.logDelivery(webhook.id, payload.event, 'success');

            logger.debug('Webhook delivered', {
                webhookId: webhook.id,
                event: payload.event
            });

        } catch (error) {
            // Log failed delivery
            await this.logDelivery(
                webhook.id,
                payload.event,
                'failed',
                (error as Error).message
            );

            logger.error('Webhook delivery failed', error as Error, {
                webhookId: webhook.id,
                url: webhook.url
            });

            // Disable webhook after 10 consecutive failures
            await this.checkAndDisable(webhook.id);
        }
    }

    /**
     * Generate HMAC signature for payload
     */
    private generateSignature(payload: WebhookPayload, secret: string): string {
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }

    /**
     * Log webhook delivery attempt
     */
    private async logDelivery(
        webhookId: string,
        event: string,
        status: 'success' | 'failed',
        error?: string
    ): Promise<void> {
        
        await this.supabase.from('webhook_deliveries').insert({
            webhook_id: webhookId,
            event,
            status,
            error_message: error,
            delivered_at: new Date().toISOString()
        });
    }

    /**
     * Check consecutive failures and disable if threshold exceeded
     */
    private async checkAndDisable(webhookId: string): Promise<void> {
        const { data: recentDeliveries } = await this.supabase
            .from('webhook_deliveries')
            .select('status')
            .eq('webhook_id', webhookId)
            .order('delivered_at', { ascending: false })
            .limit(10);

        if (!recentDeliveries) return;

        const recentFailures = recentDeliveries.filter(d => d.status === 'failed').length;

        if (recentFailures >= 10) {
            await this.supabase
                .from('webhooks')
                .update({ active: false })
                .eq('id', webhookId);

            logger.warn('Webhook disabled due to consecutive failures', {
                webhookId,
                failures: recentFailures
            });
        }
    }

    /**
     * Verify webhook signature
     */
    static verifySignature(
        payload: string,
        signature: string,
        secret: string
    ): boolean {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }
}