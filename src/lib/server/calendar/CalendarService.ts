// src/lib/server/calendar/CalendarService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import ical from 'ical-generator';
import { logger } from '../logging/logger';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    url?: string;
    status: 'confirmed' | 'tentative' | 'cancelled';
}

export class CalendarService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Generate iCal feed for user's orders
     */
    async generateOrderCalendar(userId: string, includeCompleted: boolean = false): Promise<string> {
        // Fetch user's orders
        const query = this.supabase
            .from('orders')
            .select('id, title, client, description, due_date, status, stages, created_at')
            .or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);

        if (!includeCompleted) {
            query.neq('status', 'COMPLETED');
        }

        const { data: orders, error } = await query;

        if (error || !orders) {
            logger.error('Failed to fetch orders for calendar', error);
            throw new Error('Could not generate calendar');
        }

        const calendar = ical({
            name: 'OMS Orders Calendar',
            description: 'Order Management System - Order Due Dates',
            timezone: 'UTC',
            prodId: '//reclamefabriek.lv//OMS//EN'
        });

        orders.forEach(order => {
            const dueDate = new Date(order.due_date);
            const stages = order.stages as Record<string, string>;
            const completedStages = Object.values(stages).filter(s => s === 'COMPLETED').length;
            const totalStages = Object.keys(stages).length;
            const progress = Math.round((completedStages / totalStages) * 100);

            calendar.createEvent({
                id: order.id,
                start: dueDate,
                end: new Date(dueDate.getTime() + 60 * 60 * 1000), // 1 hour duration
                summary: `${order.title} - ${order.client}`,
                description: `${order.description || 'No description'}\n\nProgress: ${progress}%\nStatus: ${order.status}`,
                url: `${process.env.BASE_URL}/orders/${order.id}`,
                status: this.mapOrderStatusToCalendar(order.status),
                categories: [order.status, `Progress: ${progress}%`]
            });
        });

        return calendar.toString();
    }

    /**
     * Generate iCal feed for station-specific deadlines
     */
    async generateStationCalendar(station: string): Promise<string> {
        const { data: orders, error } = await this.supabase
            .from('orders')
            .select('id, title, client, due_date, stages, status')
            .neq('status', 'COMPLETED')
            .neq('status', 'CANCELLED');

        if (error || !orders) {
            throw new Error('Could not generate station calendar');
        }

        const calendar = ical({
            name: `OMS ${station} Station Calendar`,
            description: `Orders requiring ${station} processing`,
            timezone: 'UTC'
        });

        orders.forEach(order => {
            const stages = order.stages as Record<string, string>;
            const stageStatus = stages[station];

            // Only include if this station needs to process it
            if (!stageStatus || stageStatus === 'COMPLETED' || stageStatus === 'SKIPPED') {
                return;
            }

            const dueDate = new Date(order.due_date);
            // Estimate station deadline (subtract 1 day per remaining stage)
            const remainingStages = Object.values(stages).filter(s => 
                s === 'NOT_STARTED' || s === 'IN_PROGRESS'
            ).length;
            const stationDeadline = new Date(dueDate.getTime() - remainingStages * 24 * 60 * 60 * 1000);

            calendar.createEvent({
                id: `${order.id}-${station}`,
                start: stationDeadline,
                end: new Date(stationDeadline.getTime() + 8 * 60 * 60 * 1000), // 8 hour work day
                summary: `[${station}] ${order.title} - ${order.client}`,
                description: `Process order at ${station} station\nStage Status: ${stageStatus}\nFinal Due Date: ${dueDate.toLocaleDateString()}`,
                url: `${process.env.BASE_URL}/orders/${order.id}`,
                status: stageStatus === 'IN_PROGRESS' ? 'confirmed' : 'tentative',
                categories: [station, stageStatus]
            });
        });

        return calendar.toString();
    }

    /**
     * Generate calendar for all loading days (delivery schedule)
     */
    async generateLoadingCalendar(): Promise<string> {
        const { data: loadingDays, error } = await this.supabase
            .from('loading_days')
            .select('*, orders!inner(id, title, client)')
            .gte('loading_date', new Date().toISOString())
            .order('loading_date', { ascending: true });

        if (error || !loadingDays) {
            throw new Error('Could not generate loading calendar');
        }

        const calendar = ical({
            name: 'OMS Loading Schedule',
            description: 'Delivery and Loading Days',
            timezone: 'Europe/Riga'
        });

        loadingDays.forEach(day => {
            const loadingDate = new Date(day.loading_date);
            const order = day.orders;

            calendar.createEvent({
                id: day.id,
                start: loadingDate,
                end: new Date(loadingDate.getTime() + 4 * 60 * 60 * 1000), // 4 hours for loading
                summary: `Loading: ${order.title} - ${order.client}`,
                description: `Order: ${order.title}\nClient: ${order.client}\nLocation: ${day.loading_address || 'TBD'}`,
                location: day.loading_address,
                url: `${process.env.BASE_URL}/orders/${order.id}`,
                status: 'confirmed',
                categories: ['Loading', 'Delivery']
            });
        });

        return calendar.toString();
    }

    /**
     * Create calendar subscription token for user
     */
    async createSubscriptionToken(userId: string, calendarType: 'orders' | 'station' | 'loading'): Promise<string> {
        const token = this.generateSecureToken();

        const { error } = await this.supabase
            .from('calendar_subscriptions')
            .insert({
                user_id: userId,
                token,
                calendar_type: calendarType,
                active: true
            });

        if (error) {
            logger.error('Failed to create calendar subscription', error);
            throw new Error('Could not create subscription');
        }

        return token;
    }

    /**
     * Validate and retrieve calendar by token
     */
    async getCalendarByToken(token: string): Promise<{ type: string; userId: string; station?: string }> {
        const { data: subscription, error } = await this.supabase
            .from('calendar_subscriptions')
            .select('user_id, calendar_type, station')
            .eq('token', token)
            .eq('active', true)
            .single();

        if (error || !subscription) {
            throw new Error('Invalid or expired calendar subscription');
        }

        // Update last accessed
        await this.supabase
            .from('calendar_subscriptions')
            .update({ last_accessed: new Date().toISOString() })
            .eq('token', token);

        return {
            type: subscription.calendar_type,
            userId: subscription.user_id,
            station: subscription.station
        };
    }

    // Helper methods
    private mapOrderStatusToCalendar(status: string): 'confirmed' | 'tentative' | 'cancelled' {
        switch (status) {
            case 'COMPLETED':
            case 'ACTIVE':
                return 'confirmed';
            case 'CANCELLED':
                return 'cancelled';
            default:
                return 'tentative';
        }
    }

    private generateSecureToken(): string {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}
