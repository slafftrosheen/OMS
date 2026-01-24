/**
 * Integration Service
 * Handle external service integrations (Slack, Teams, etc.)
 */

import { supabase } from './supabase';

interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: any[];
  attachments?: any[];
}

interface TeamsMessage {
  text: string;
  summary?: string;
  themeColor?: string;
  sections?: any[];
}

export class IntegrationService {
  /**
   * Process integration events from queue
   */
  static async processIntegrationEvents(batchSize: number = 10): Promise<number> {
    try {
      const { data: events, error } = await supabase
        .from('event_queue')
        .select('*')
        .eq('status', 'pending')
        .not('metadata->integration_id', 'is', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (error) throw error;

      if (!events || events.length === 0) {
        return 0;
      }

      let processedCount = 0;

      for (const event of events) {
        try {
          await this.processIntegrationEvent(event);
          processedCount++;
        } catch (error) {
          console.error('[Integration] Event processing error:', event.id, error);
        }
      }

      return processedCount;

    } catch (error) {
      console.error('[Integration] Process events error:', error);
      return 0;
    }
  }

  /**
   * Process single integration event
   */
  static async processIntegrationEvent(event: any): Promise<void> {
    try {
      // Update status
      await supabase
        .from('event_queue')
        .update({ status: 'processing', processed_at: new Date().toISOString() })
        .eq('id', event.id);

      // Get integration config
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', event.metadata.integration_id)
        .single();

      if (!integration) {
        throw new Error('Integration not found');
      }

      // Route to appropriate handler
      switch (integration.integration_type) {
        case 'slack':
          await this.sendSlackMessage(integration, event);
          break;
        case 'teams':
          await this.sendTeamsMessage(integration, event);
          break;
        case 'discord':
          await this.sendDiscordMessage(integration, event);
          break;
        default:
          console.log('[Integration] Unknown type:', integration.integration_type);
      }

      // Mark as completed
      await supabase
        .from('event_queue')
        .update({ status: 'completed' })
        .eq('id', event.id);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await supabase
        .from('event_queue')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: event.retry_count + 1
        })
        .eq('id', event.id);
    }
  }

  /**
   * Send Slack message
   */
  static async sendSlackMessage(integration: any, event: any): Promise<void> {
    const webhookUrl = integration.config.webhook_url;
    
    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const message = this.formatSlackMessage(event);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }
  }

  /**
   * Format message for Slack
   */
  static formatSlackMessage(event: any): SlackMessage {
    const payload = event.payload;
    
    switch (event.event_type) {
      case 'order.created':
        return {
          text: `New Order Created: ${payload.po_number}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `📦 New Order: ${payload.po_number}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Client:*\n${payload.client}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Status:*\n${payload.status}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Title:*\n${payload.title || 'N/A'}`
                }
              ]
            }
          ]
        };

      case 'station.issue_reported':
        return {
          text: `⚠️ Issue Reported: ${payload.station}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `⚠️ Station Issue: ${payload.station}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Message:* ${payload.message}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Severity:* ${payload.issue_severity || 'medium'}`
                },
                {
                  type: 'mrkdwn',
                  text: `*Order:* ${payload.order_id}`
                }
              ]
            }
          ]
        };

      default:
        return {
          text: `Event: ${event.event_type}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Event:* ${event.event_type}\n\`\`\`${JSON.stringify(payload, null, 2)}\`\`\``
              }
            }
          ]
        };
    }
  }

  /**
   * Send Microsoft Teams message
   */
  static async sendTeamsMessage(integration: any, event: any): Promise<void> {
    const webhookUrl = integration.config.webhook_url;
    
    if (!webhookUrl) {
      throw new Error('Teams webhook URL not configured');
    }

    const message = this.formatTeamsMessage(event);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Teams API error: ${response.status}`);
    }
  }

  /**
   * Format message for Microsoft Teams
   */
  static formatTeamsMessage(event: any): TeamsMessage {
    const payload = event.payload;
    
    switch (event.event_type) {
      case 'order.created':
        return {
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: '0076D7',
          summary: `New Order: ${payload.po_number}`,
          sections: [
            {
              activityTitle: `📦 New Order Created`,
              activitySubtitle: payload.po_number,
              facts: [
                {
                  name: 'Client',
                  value: payload.client
                },
                {
                  name: 'Status',
                  value: payload.status
                },
                {
                  name: 'Title',
                  value: payload.title || 'N/A'
                }
              ]
            }
          ]
        };

      case 'station.issue_reported':
        return {
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: 'FF0000',
          summary: `Station Issue: ${payload.station}`,
          sections: [
            {
              activityTitle: `⚠️ Station Issue Reported`,
              activitySubtitle: payload.station,
              text: payload.message,
              facts: [
                {
                  name: 'Severity',
                  value: payload.issue_severity || 'medium'
                },
                {
                  name: 'Order',
                  value: payload.order_id
                }
              ]
            }
          ]
        };

      default:
        return {
          text: `Event: ${event.event_type}`,
          summary: event.event_type
        };
    }
  }

  /**
   * Send Discord message
   */
  static async sendDiscordMessage(integration: any, event: any): Promise<void> {
    const webhookUrl = integration.config.webhook_url;
    
    if (!webhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    const message = this.formatDiscordMessage(event);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }
  }

  /**
   * Format message for Discord
   */
  static formatDiscordMessage(event: any): any {
    const payload = event.payload;
    
    switch (event.event_type) {
      case 'order.created':
        return {
          embeds: [
            {
              title: `📦 New Order: ${payload.po_number}`,
              color: 0x0076D7,
              fields: [
                {
                  name: 'Client',
                  value: payload.client,
                  inline: true
                },
                {
                  name: 'Status',
                  value: payload.status,
                  inline: true
                },
                {
                  name: 'Title',
                  value: payload.title || 'N/A'
                }
              ],
              timestamp: new Date().toISOString()
            }
          ]
        };

      case 'station.issue_reported':
        return {
          embeds: [
            {
              title: `⚠️ Station Issue: ${payload.station}`,
              description: payload.message,
              color: 0xFF0000,
              fields: [
                {
                  name: 'Severity',
                  value: payload.issue_severity || 'medium',
                  inline: true
                },
                {
                  name: 'Order',
                  value: payload.order_id,
                  inline: true
                }
              ],
              timestamp: new Date().toISOString()
            }
          ]
        };

      default:
        return {
          content: `Event: ${event.event_type}`,
          embeds: [
            {
              description: `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
            }
          ]
        };
    }
  }
}