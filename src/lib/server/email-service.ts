/**
 * Email Service
 * Handles email sending via external provider (Resend, SendGrid, etc.)
 */

import { supabase } from './supabase';

// Configure your email provider
// This example uses Resend (https://resend.com)
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const FROM_NAME = process.env.FROM_NAME || 'OMS Notifications';

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  /**
   * Send email via Resend
   */
  static async sendEmail(data: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!RESEND_API_KEY) {
      console.error('[Email Service] RESEND_API_KEY not configured');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: data.to,
          subject: data.subject,
          html: data.html,
          text: data.text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Email Service] Send failed:', error);
        return { success: false, error };
      }

      const result = await response.json();
      return { success: true, messageId: result.id };

    } catch (error) {
      console.error('[Email Service] Error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Process email queue
   * Should be called by a background job/cron
   */
  static async processQueue(batchSize: number = 10): Promise<number> {
    try {
      // Get pending emails
      const { data: emails, error: fetchError } = await supabase
        .from('email_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (fetchError) throw fetchError;

      if (!emails || emails.length === 0) {
        return 0;
      }

      let sentCount = 0;

      for (const email of emails) {
        try {
          // Update status to sending
          await supabase
            .from('email_queue')
            .update({ status: 'sending' })
            .eq('id', email.id);

          // Send email
          const result = await this.sendEmail({
            to: email.recipient_email,
            subject: email.subject,
            html: email.body_html,
            text: email.body_text
          });

          if (result.success) {
            // Mark as sent
            await supabase
              .from('email_queue')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString()
              })
              .eq('id', email.id);

            // Log delivery
            await supabase
              .from('email_delivery_log')
              .insert({
                email_queue_id: email.id,
                provider: 'resend',
                provider_message_id: result.messageId,
                event_type: 'sent'
              });

            sentCount++;

          } else {
            // Handle failure
            const newRetryCount = email.retry_count + 1;
            
            if (newRetryCount >= email.max_retries) {
              // Max retries reached
              await supabase
                .from('email_queue')
                .update({
                  status: 'failed',
                  error_message: result.error
                })
                .eq('id', email.id);
            } else {
              // Retry later
              await supabase
                .from('email_queue')
                .update({
                  status: 'pending',
                  retry_count: newRetryCount,
                  error_message: result.error,
                  scheduled_at: new Date(Date.now() + (newRetryCount * 5 * 60 * 1000)).toISOString() // Exponential backoff
                })
                .eq('id', email.id);
            }

            // Log failure
            await supabase
              .from('email_delivery_log')
              .insert({
                email_queue_id: email.id,
                provider: 'resend',
                event_type: 'failed',
                error_message: result.error
              });
          }

        } catch (error) {
          console.error('[Email Service] Error processing email:', email.id, error);
        }
      }

      return sentCount;

    } catch (error) {
      console.error('[Email Service] Queue processing error:', error);
      return 0;
    }
  }

  /**
   * Generate daily digests for all users
   */
  static async generateDailyDigests(): Promise<number> {
    try {
      const { data: users, error } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('daily_digest', true)
        .eq('email_enabled', true);

      if (error) throw error;

      if (!users || users.length === 0) {
        return 0;
      }

      let generatedCount = 0;

      for (const user of users) {
        try {
          const { data, error: digestError } = await supabase
            .rpc('generate_daily_digest', {
              p_user_id: user.user_id
            });

          if (!digestError && data) {
            generatedCount++;
          }
        } catch (err) {
          console.error('[Email Service] Digest generation error for user:', user.user_id, err);
        }
      }

      return generatedCount;

    } catch (error) {
      console.error('[Email Service] Daily digest generation error:', error);
      return 0;
    }
  }
}