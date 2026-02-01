// src/lib/server/email/NotificationScheduler.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailService } from './EmailService';
import { logger } from '../logging/logger';
import cron from 'node-cron';

export class NotificationScheduler {
    private scheduledJobs: cron.ScheduledTask[] = [];

    constructor(private supabase: SupabaseClient) {}

    /**
     * Start all scheduled notification jobs
     */
    start(): void {
        // Daily digest at 8 AM
        this.scheduledJobs.push(
            cron.schedule('0 8 * * *', () => this.sendDailyDigests())
        );

        // Due date reminders at 9 AM
        this.scheduledJobs.push(
            cron.schedule('0 9 * * *', () => this.sendDueDateReminders())
        );

        // Low stock alerts weekly (Monday 10 AM)
        this.scheduledJobs.push(
            cron.schedule('0 10 * * 1', () => this.sendLowStockAlerts())
        );

        logger.info('Notification scheduler started', {
            jobs: this.scheduledJobs.length
        });
    }

    /**
     * Stop all scheduled jobs
     */
    stop(): void {
        this.scheduledJobs.forEach(job => job.stop());
        this.scheduledJobs = [];
        logger.info('Notification scheduler stopped');
    }

    /**
     * Send daily digests to users who have it enabled
     */
    private async sendDailyDigests(): Promise<void> {
        const { data: users } = await this.supabase
            .from('profiles')
            .select('id, email, username, notification_preferences')
            .contains('notification_preferences', { dailyDigest: true });

        if (!users) return;

        for (const user of users) {
            try {
                // Get user's stats for the day
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);

                const { data: completedOrders } = await this.supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'COMPLETED')
                    .gte('completed_at', yesterday.toISOString())
                    .or(`created_by.eq.${user.id},assigned_to.cs.{${user.id}}`);

                const { data: inProgressOrders } = await this.supabase
                    .from('orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'ACTIVE')
                    .or(`created_by.eq.${user.id},assigned_to.cs.{${user.id}}`);

                // Get upcoming deadlines (next 7 days)
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);

                const { data: upcomingOrders } = await this.supabase
                    .from('orders')
                    .select('id, title, due_date')
                    .eq('status', 'ACTIVE')
                    .gte('due_date', new Date().toISOString())
                    .lte('due_date', nextWeek.toISOString())
                    .or(`created_by.eq.${user.id},assigned_to.cs.{${user.id}}`)
                    .limit(5);

                // Get low stock items
                const { data: lowStockItems } = await this.supabase
                    .from('materials')
                    .select('name, current_stock')
                    .lte('current_stock', this.supabase.raw('min_stock'))
                    .limit(5);

                await emailService.sendDailyDigest(user.email, {
                    userName: user.username,
                    ordersCompleted: completedOrders?.length || 0,
                    ordersInProgress: inProgressOrders?.length || 0,
                    upcomingDeadlines: (upcomingOrders || []).map(o => ({
                        title: o.title,
                        dueDate: o.due_date,
                        url: `${process.env.BASE_URL}/orders/${o.id}`
                    })),
                    lowStockItems: (lowStockItems || []).map(m => ({
                        material: m.name,
                        stock: m.current_stock
                    }))
                });

            } catch (error) {
                logger.error('Failed to send daily digest', error as Error, {
                    userId: user.id
                });
            }
        }

        logger.info('Daily digests sent', { count: users.length });
    }

    /**
     * Send due date reminders
     */
    private async sendDueDateReminders(): Promise<void> {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 59, 999);

        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        // Get orders due soon
        const { data: orders } = await this.supabase
            .from('orders')
            .select('id, title, client, due_date, created_by, assigned_to')
            .eq('status', 'ACTIVE')
            .lte('due_date', threeDaysFromNow.toISOString());

        if (!orders) return;

        for (const order of orders) {
            const dueDate = new Date(order.due_date);
            const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            // Only send for 1 and 3 days before
            if (![1, 3].includes(daysRemaining)) continue;

            // Get recipients
            const recipients = new Set([order.created_by]);
            if (order.assigned_to) {
                order.assigned_to.forEach((id: string) => recipients.add(id));
            }

            for (const userId of recipients) {
                const { data: user } = await this.supabase
                    .from('profiles')
                    .select('email, notification_preferences')
                    .eq('id', userId)
                    .single();

                if (!user?.notification_preferences?.dueDateReminders) continue;

                try {
                    await emailService.sendDueDateReminder(user.email, {
                        title: order.title,
                        client: order.client,
                        dueDate: order.due_date,
                        daysRemaining,
                        url: `${process.env.BASE_URL}/orders/${order.id}`
                    });
                } catch (error) {
                    logger.error('Failed to send due date reminder', error as Error);
                }
            }
        }

        logger.info('Due date reminders sent', { ordersProcessed: orders.length });
    }

    /**
     * Send low stock alerts
     */
    private async sendLowStockAlerts(): Promise<void> {
        const { data: lowStockMaterials } = await this.supabase
            .from('materials')
            .select('*')
            .lte('current_stock', this.supabase.raw('min_stock'));

        if (!lowStockMaterials || lowStockMaterials.length === 0) return;

        // Get admins
        const { data: admins } = await this.supabase
            .from('profiles')
            .select('email')
            .contains('roles', { Admin: 'SuperAdmin' });

        if (!admins) return;

        const summary = lowStockMaterials.map(m => 
            `${m.name}: ${m.current_stock} ${m.unit} (min: ${m.min_stock})`
        ).join('\n');

        // TODO: Create low stock email template
        logger.info('Low stock alerts sent', { 
            materials: lowStockMaterials.length,
            admins: admins.length 
        });
    }
}
