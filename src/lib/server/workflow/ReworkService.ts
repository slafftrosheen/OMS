// src/lib/server/workflow/ReworkService.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

export type ReworkReason = 
    | 'RECUT'
    | 'DIMENSION_ERROR'
    | 'MATERIAL_DEFECT'
    | 'ASSEMBLY_ERROR'
    | 'PAINT_DEFECT'
    | 'CLIENT_CHANGE'
    | 'OTHER';

interface ReworkCycle {
    id: string;
    order_id: string;
    station: string;
    reason: ReworkReason;
    description: string;
    initiated_by: string;
    resolved_by?: string;
    resolved_at?: string;
    created_at: string;
    cost_impact?: number;
    time_impact?: number;
}

export class ReworkService {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Initiate a rework cycle for an order
     */
    async initiateRework(
        orderId: string,
        station: string,
        reason: ReworkReason,
        description: string,
        userId: string,
        files?: string[]
    ): Promise<ReworkCycle> {
        
        // Validate order exists
        const { data: order, error: orderError } = await this.supabase
            .from('orders')
            .select('id, stages')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            throw new Error('Order not found');
        }

        // Create rework cycle
        const { data: rework, error: reworkError } = await this.supabase
            .from('rework_cycles')
            .insert({
                order_id: orderId,
                station,
                reason,
                description,
                initiated_by: userId,
                status: 'PENDING'
            })
            .select()
            .single();

        if (reworkError) {
            logger.error('Failed to create rework cycle', reworkError, { orderId });
            throw new Error('Could not initiate rework');
        }

        // Attach files if provided
        if (files && files.length > 0) {
            await this.supabase.from('rework_attachments').insert(
                files.map(fileId => ({
                    rework_id: rework.id,
                    file_id: fileId
                }))
            );
        }

        // Update order stage to reflect rework
        const currentStages = order.stages as Record<string, string>;
        await this.supabase
            .from('orders')
            .update({
                stages: {
                    ...currentStages,
                    [station]: 'IN_PROGRESS' // Reset to in progress
                },
                rework_count: this.supabase.rpc('increment', { row_id: orderId })
            })
            .eq('id', orderId);

        // Log to station logs
        await this.supabase.from('station_logs').insert({
            order_id: orderId,
            station,
            action: 'REWORK_INITIATED',
            performed_by: userId,
            notes: `Reason: ${reason} - ${description}`,
            metadata: { rework_id: rework.id }
        });

        // Send notification to relevant users
        await this.notifyRework(orderId, station, reason, userId);

        logger.info('Rework cycle initiated', {
            reworkId: rework.id,
            orderId,
            station,
            reason
        });

        return rework;
    }

    /**
     * Resolve a rework cycle
     */
    async resolveRework(
        reworkId: string,
        userId: string,
        resolution: string,
        timeImpact?: number,
        costImpact?: number
    ): Promise<void> {
        
        const { data: rework, error: fetchError } = await this.supabase
            .from('rework_cycles')
            .select('*')
            .eq('id', reworkId)
            .single();

        if (fetchError || !rework) {
            throw new Error('Rework cycle not found');
        }

        // Update rework cycle
        const { error: updateError } = await this.supabase
            .from('rework_cycles')
            .update({
                status: 'RESOLVED',
                resolved_by: userId,
                resolved_at: new Date().toISOString(),
                resolution,
                time_impact: timeImpact,
                cost_impact: costImpact
            })
            .eq('id', reworkId);

        if (updateError) {
            logger.error('Failed to resolve rework', updateError, { reworkId });
            throw new Error('Could not resolve rework');
        }

        // Log resolution
        await this.supabase.from('station_logs').insert({
            order_id: rework.order_id,
            station: rework.station,
            action: 'REWORK_RESOLVED',
            performed_by: userId,
            notes: resolution,
            metadata: { rework_id: reworkId }
        });

        logger.info('Rework cycle resolved', {
            reworkId,
            orderId: rework.order_id,
            timeImpact,
            costImpact
        });
    }

    /**
     * Get rework statistics for an order
     */
    async getOrderReworkStats(orderId: string): Promise<{
        totalCycles: number;
        byReason: Record<ReworkReason, number>;
        totalCostImpact: number;
        totalTimeImpact: number;
        mostCommonStation: string;
    }> {
        
        const { data: reworks, error } = await this.supabase
            .from('rework_cycles')
            .select('*')
            .eq('order_id', orderId);

        if (error || !reworks) {
            return {
                totalCycles: 0,
                byReason: {} as Record<ReworkReason, number>,
                totalCostImpact: 0,
                totalTimeImpact: 0,
                mostCommonStation: ''
            };
        }

        const byReason: Record<string, number> = {};
        const byStation: Record<string, number> = {};
        let totalCost = 0;
        let totalTime = 0;

        reworks.forEach(rework => {
            byReason[rework.reason] = (byReason[rework.reason] || 0) + 1;
            byStation[rework.station] = (byStation[rework.station] || 0) + 1;
            totalCost += rework.cost_impact || 0;
            totalTime += rework.time_impact || 0;
        });

        const mostCommonStation = Object.entries(byStation)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || '';

        return {
            totalCycles: reworks.length,
            byReason: byReason as Record<ReworkReason, number>,
            totalCostImpact: totalCost,
            totalTimeImpact: totalTime,
            mostCommonStation
        };
    }

    /**
     * Send notifications about rework
     */
    private async notifyRework(
        orderId: string,
        station: string,
        reason: ReworkReason,
        initiatedBy: string
    ): Promise<void> {
        
        // Get order details
        const { data: order } = await this.supabase
            .from('orders')
            .select('title, client')
            .eq('id', orderId)
            .single();

        if (!order) return;

        // Get relevant users (admins + station operators)
        const { data: users } = await this.supabase
            .from('profiles')
            .select('id')
            .or(`roles->Admin.neq.null,primary_section.eq.${station}`);

        if (!users) return;

        // Create notifications
        const notifications = users
            .filter(u => u.id !== initiatedBy)
            .map(u => ({
                user_id: u.id,
                title: 'Rework Initiated',
                message: `Order "${order.title}" (${order.client}) requires rework at ${station} station. Reason: ${reason}`,
                type: 'warning' as const,
                action_url: `/orders/${orderId}`,
                read: false
            }));

        await this.supabase.from('notifications').insert(notifications);
    }
}