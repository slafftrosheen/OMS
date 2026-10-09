// src/lib/server/calendar/CalendarService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import ical, { ICalEventStatus } from 'ical-generator';
import { logger } from '../logging/logger';

interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    url?: string;
    status: ICalEventStatus;
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
                categories: [{ name: order.status }, { name: `Progress: ${progress}%` }]
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
                status: stageStatus === 'IN_PROGRESS' ? ICalEventStatus.CONFIRMED : ICalEventStatus.TENTATIVE,
                categories: [{ name: station }, { name: stageStatus }]
            });
        });

        return calendar.toString();
    }

    /**
     * Generate calendar for all loading days (delivery schedule)
     */
    async generateLoadingCalendar(): Promise<string> {
        const { data: days, error: daysError } = await this.supabase
            .from('loading_days')
            .select('id, date, max_capacity, notes, is_blocked')
            .gte('date', new Date().toISOString().slice(0, 10))
            .order('date', { ascending: true });
        if (daysError) throw new Error('Could not load loading days');

        const calendar = ical({
            name: 'OMS Loading Schedule',
            description: 'Delivery and Loading Days',
            timezone: 'Europe/Riga'
        });
        const loadingDays = days ?? [];
        if (!loadingDays.length) return calendar.toString();

        // The FK is loading_event_pos.loading_event_id -> loading_events.id,
        // which is also calendar_events.id. It does NOT point to loading_days.id.
        const dates = loadingDays.map(day => day.date);
        const { data: events, error: eventsError } = await this.supabase
            .from('calendar_events').select('id,date').eq('kind', 'loading').in('date', dates);
        if (eventsError) throw new Error('Could not load loading events');

        const eventIds = (events ?? []).map(event => event.id);
        const { data: links, error: linksError } = eventIds.length
            ? await this.supabase.from('loading_event_pos')
                .select('loading_event_id,draft_order_id').in('loading_event_id', eventIds)
            : { data: [], error: null };
        if (linksError) throw new Error('Could not load loading-event orders');

        const orderIds = [...new Set((links ?? []).map(link => link.draft_order_id).filter(Boolean))];
        const { data: orders, error: ordersError } = orderIds.length
            ? await this.supabase.from('draft_orders')
                .select('id,title,client').in('id', orderIds)
            : { data: [], error: null };
        if (ordersError) throw new Error('Could not load orders');

        const datesByEvent = new Map((events ?? []).map(event => [event.id, event.date]));
        const ordersById = new Map((orders ?? []).map(order => [order.id, order]));
        const labelsByDate = new Map<string, string[]>();
        for (const link of links ?? []) {
            const date = datesByEvent.get(link.loading_event_id);
            const order = ordersById.get(link.draft_order_id);
            if (!date || !order) continue;
            const labels = labelsByDate.get(date) ?? [];
            labels.push(order.title || order.client || 'Untitled');
            labelsByDate.set(date, labels);
        }

        loadingDays.forEach(day => {
            const date = String(day.date).slice(0, 10);
            calendar.createEvent({
                id: String(day.id),
                start: new Date(date + 'T09:00:00'),
                end: new Date(date + 'T17:00:00'),
                allDay: false,
                summary: `Loading Day — ${date}`,
                description: `Capacity: ${day.max_capacity ?? 10}\nNotes: ${day.notes ?? ''}\nOrders: ${(labelsByDate.get(date) ?? []).join('; ')}`
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
    private mapOrderStatusToCalendar(status: string): ICalEventStatus {
        switch (status) {
            case 'COMPLETED':
            case 'ACTIVE':
                return ICalEventStatus.CONFIRMED;
            case 'CANCELLED':
                return ICalEventStatus.CANCELLED;
            default:
                return ICalEventStatus.TENTATIVE;
        }
    }

    private generateSecureToken(): string {
        return Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}
