// src/lib/server/workflow/OrderStateMachine.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';

export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'SKIPPED';
export type OrderStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export const WORKFLOW_STAGES = [
    'CAD',
    'CNC',
    'EDGE',
    'ASSEMBLY',
    'PAINT',
    'PACKAGING',
    'DELIVERY'
] as const;

export type WorkflowStage = typeof WORKFLOW_STAGES[number];

interface StageTransition {
    from: StageStatus;
    to: StageStatus;
    allowedRoles: string[];
    requiresApproval?: boolean;
}

interface OrderStateChange {
    orderId: string;
    stage: WorkflowStage;
    fromStatus: StageStatus;
    toStatus: StageStatus;
    userId: string;
    reason?: string;
    timestamp: Date;
}

const STAGE_TRANSITIONS: Record<StageStatus, StageTransition[]> = {
    'NOT_STARTED': [
        { from: 'NOT_STARTED', to: 'IN_PROGRESS', allowedRoles: ['operator', 'admin'] },
        { from: 'NOT_STARTED', to: 'SKIPPED', allowedRoles: ['admin'], requiresApproval: true }
    ],
    'IN_PROGRESS': [
        { from: 'IN_PROGRESS', to: 'COMPLETED', allowedRoles: ['operator', 'admin'] },
        { from: 'IN_PROGRESS', to: 'BLOCKED', allowedRoles: ['operator', 'admin'] },
        { from: 'IN_PROGRESS', to: 'NOT_STARTED', allowedRoles: ['admin'] }
    ],
    'COMPLETED': [
        { from: 'COMPLETED', to: 'IN_PROGRESS', allowedRoles: ['admin'], requiresApproval: true }
    ],
    'BLOCKED': [
        { from: 'BLOCKED', to: 'IN_PROGRESS', allowedRoles: ['operator', 'admin'] },
        { from: 'BLOCKED', to: 'NOT_STARTED', allowedRoles: ['admin'] }
    ],
    'SKIPPED': [
        { from: 'SKIPPED', to: 'NOT_STARTED', allowedRoles: ['admin'] }
    ]
};

export class OrderStateMachine {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Check if a stage transition is allowed
     */
    private canTransition(
        from: StageStatus,
        to: StageStatus,
        userRole: string
    ): { allowed: boolean; requiresApproval: boolean } {
        const transitions = STAGE_TRANSITIONS[from] || [];
        const transition = transitions.find(t => t.to === to);

        if (!transition) {
            return { allowed: false, requiresApproval: false };
        }

        const allowed = transition.allowedRoles.includes(userRole);
        return {
            allowed,
            requiresApproval: transition.requiresApproval || false
        };
    }

    /**
     * Transition an order stage to a new status
     */
    async transitionStage(
        orderId: string,
        stage: WorkflowStage,
        toStatus: StageStatus,
        userId: string,
        userRole: string,
        reason?: string
    ): Promise<{ success: boolean; requiresApproval: boolean; changeRequestId?: string }> {
        
        // Get current order state
        const { data: order, error: fetchError } = await this.supabase
            .from('orders')
            .select('stages, status')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            logger.error('Order not found', fetchError, { orderId });
            throw new Error('Order not found');
        }

        const currentStatus = (order.stages as Record<string, StageStatus>)[stage] || 'NOT_STARTED';

        // Check if transition is allowed
        const { allowed, requiresApproval } = this.canTransition(currentStatus, toStatus, userRole);

        if (!allowed) {
            logger.warn('Unauthorized stage transition attempt', {
                orderId,
                stage,
                from: currentStatus,
                to: toStatus,
                userId,
                userRole
            });
            throw new Error('Transition not allowed');
        }

        // If requires approval, create change request instead
        if (requiresApproval) {
            const { data: changeRequest, error: crError } = await this.supabase
                .from('change_requests')
                .insert({
                    order_id: orderId,
                    proposed_by: userId,
                    changes: [{
                        field: `stages.${stage}`,
                        old_value: currentStatus,
                        new_value: toStatus
                    }],
                    reason,
                    status: 'pending'
                })
                .select()
                .single();

            if (crError) {
                logger.error('Failed to create change request', crError, { orderId });
                throw new Error('Could not create change request');
            }

            logger.info('Change request created', {
                changeRequestId: changeRequest.id,
                orderId,
                stage
            });

            return {
                success: true,
                requiresApproval: true,
                changeRequestId: changeRequest.id
            };
        }

        // Perform the transition
        const newStages = {
            ...order.stages,
            [stage]: toStatus
        };

        const { error: updateError } = await this.supabase
            .from('orders')
            .update({ stages: newStages })
            .eq('id', orderId);

        if (updateError) {
            logger.error('Failed to update order stage', updateError, { orderId });
            throw new Error('Stage update failed');
        }

        // Log the transition
        await this.logStateChange({
            orderId,
            stage,
            fromStatus: currentStatus,
            toStatus,
            userId,
            reason,
            timestamp: new Date()
        });

        // Check if order should auto-complete
        await this.checkOrderCompletion(orderId);

        logger.info('Stage transition completed', {
            orderId,
            stage,
            from: currentStatus,
            to: toStatus,
            userId
        });

        return {
            success: true,
            requiresApproval: false
        };
    }

    /**
     * Log state change to audit trail
     */
    private async logStateChange(change: OrderStateChange): Promise<void> {
        await this.supabase.from('station_logs').insert({
            order_id: change.orderId,
            station: change.stage,
            action: `${change.fromStatus} → ${change.toStatus}`,
            performed_by: change.userId,
            notes: change.reason,
            timestamp: change.timestamp.toISOString()
        });
    }

    /**
     * Check if all required stages are complete and update order status
     */
    private async checkOrderCompletion(orderId: string): Promise<void> {
        const { data: order } = await this.supabase
            .from('orders')
            .select('stages, status')
            .eq('id', orderId)
            .single();

        if (!order) return;

        const stages = order.stages as Record<string, StageStatus>;
        const requiredStages = Object.keys(stages).filter(s => stages[s] !== 'SKIPPED');
        const allCompleted = requiredStages.every(s => stages[s] === 'COMPLETED');

        if (allCompleted && order.status !== 'COMPLETED') {
            await this.supabase
                .from('orders')
                .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
                .eq('id', orderId);

            logger.info('Order auto-completed', { orderId });
        }
    }

    /**
     * Get next recommended stage based on current progress
     */
    getNextStage(stages: Record<string, StageStatus>): WorkflowStage | null {
        for (const stage of WORKFLOW_STAGES) {
            const status = stages[stage];
            if (status === 'NOT_STARTED' || status === 'BLOCKED') {
                return stage;
            }
        }
        return null;
    }

    /**
     * Calculate overall order progress percentage
     */
    calculateProgress(stages: Record<string, StageStatus>): number {
        const totalStages = WORKFLOW_STAGES.length;
        let completedStages = 0;
        let inProgressStages = 0;

        WORKFLOW_STAGES.forEach(stage => {
            const status = stages[stage];
            if (status === 'COMPLETED') completedStages++;
            else if (status === 'IN_PROGRESS') inProgressStages += 0.5;
        });

        return Math.round(((completedStages + inProgressStages) / totalStages) * 100);
    }
}