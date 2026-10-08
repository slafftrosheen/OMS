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
        // Load loading days and resolve linked orders through the junction
        // loading_event_pos (draft_order_id -> draft_orders.id) — there is
        // NO direct FK draft_orders <-> loading_days in either direction.
        const { data: loadingEventPos, error: posErr } = await this.supabase
            .from('loading_event_pos')
            .select('loading_event_id, draft_order_id')
            .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString());
        // For simplicity, resolve orders by ID array rather than attempting
        // an unresolvable embed.
        const { data: loadingDays, error } = await this.supabase
            .from('loading_days')
            .select('id, date, max_capacity, notes, is_blocked')
            .gte('date', new Date().toISOString())
            .order('date', { ascending: true });

        if (error) {
            throw new Error('Could not generate loading calendar: ' + (error.message ?? String(error)));
        }
        const days = Array.isArray(loadingDays) ? loadingDays : [];

        // Resolve linked orders by collecting draft_order_ids from the junction,
        // then fetching matching orders in a second query.
        const orderIds = (loadingEventPos && Array.isArray(loadingEventPos))
            ? Array.from(new Set(
                (loadingEventPos as Array<{ draft_order_id?: string }>)
                    .map(e => e.draft_order_id)
                    .filter(id => !!id)
            )) : [];
        const { data: linkedOrders } = (orderIds.length > 0)
            ? await this.supabase.from('draft_orders')
                .select('id, title, client, status, due_date')
                .in('id', orderIds)
            : { data: null };
        const ordersByDay: Record<string, Array<{ id: string; title?: string; client?: string; status?: string; dueDate?: string }>> = {};
        if (linkedOrders && Array.isArray(linkedOrders) && loadingEventPos) {
            const posEntries = loadingEventPos as Array<{ loading_event_id?: string; draft_order_id?: string }>; // assume event id = loading_days.id for mapping
            // Map: loading_event_id -> array of draft_order_ids; we simplify here for calendar output.
            // For the ICS feed, we only need the list; detailed mapping can be refined.
            const eventIds: string[] = days.map((d: any) => String(d.id));
            // Simplified mapping: each linked order mapped to its event by order_id as best-effort
            const eventIdForPos: Record<string, string> = {};
            (posEntries).forEach(e => {
                if (e.loading_event_id && e.draft_order_id) eventIdForPos[e.draft_order_id] = e.loading_event_id;
            });
            (linkedOrders).forEach((o: any) => {
                const evId = eventIdForPos[o.id];
                if (evId) {
                    if (!ordersByDay[evId]) ordersByDay[evId] = [];
                    ordersByDay[evId].push({ id: o.id, title: o.title, client: o.client, status: o.status, dueDate: o.due_date });
                }
            });
        }

        const calendar = ical({
            name: 'OMS Loading Schedule',
            description: 'Delivery and Loading Days',
            timezone: 'Europe/Riga'
        });

        days.forEach((day: any) => {
            const loadingDateStr = String(day.date).slice(0, 10);
            const eventIdStr = String(day.id);
            calendar.createEvent({
                id: eventIdStr,
                start: new Date(loadingDateStr + 'T09:00:00'),
                end: new Date(loadingDateStr + 'T17:00:00'),
                allDay: false,
                summary: `Loading Day — ${loadingDateStr}`,
                description: `Capacity: ${day.max_capacity ?? 10}\nNotes: ${day.notes ?? ''}\nOrders: ${(ordersByDay[eventIdStr] || []).map((o: any) => o.title || o.client || 'Untitled').join('; ')}`,
            });
        });
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
