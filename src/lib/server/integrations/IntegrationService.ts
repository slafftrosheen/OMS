// src/lib/server/integrations/IntegrationService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

export interface IntegrationConfig {
    id: string;
    provider: 'slack' | 'discord' | 'zapier' | 'custom';
    name: string;
    config: Record<string, any>;
    active: boolean;
}

export class IntegrationService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Get all integrations
     */
    async getIntegrations(): Promise<IntegrationConfig[]> {
        const { data, error } = await this.supabase
            .from('integrations')
            .select('*');

        if (error) {
            logger.error('Failed to fetch integrations', error);
            return [];
        }
        return data;
    }

    /**
     * Trigger an external integration
     */
    async triggerIntegration(integrationId: string, event: string, payload: any): Promise<void> {
        const { data: integration } = await this.supabase
            .from('integrations')
            .select('*')
            .eq('id', integrationId)
            .single();

        if (!integration || !integration.active) return;

        try {
            if (integration.provider === 'slack' || integration.provider === 'discord') {
                await fetch(integration.config.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: `Event: ${event}\nData: ${JSON.stringify(payload)}`
                    })
                });
            }
            // Add other providers here
        } catch (error) {
            logger.error(`Integration trigger failed for ${integration.name}`, error as Error);
        }
    }
}