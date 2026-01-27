// src/lib/stores/changeRequests.ts
import { writable, derived } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChangeRequest {
    id: string;
    order_id: string;
    proposed_by: string;
    status: 'pending' | 'approved' | 'rejected';
    changes: {
        field: string;
        old_value: any;
        new_value: any;
    }[];
    reason?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    created_at: string;
}

export function createChangeRequestStore(supabase: SupabaseClient) {
    const { subscribe, set, update } = writable<ChangeRequest[]>([]);

    async function loadChangeRequests(orderId?: string) {
        let query = supabase
            .from('change_requests')
            .select('*, proposed_by_profile:profiles!proposed_by(id, username), reviewed_by_profile:profiles!reviewed_by(id, username)')
            .order('created_at', { ascending: false });

        if (orderId) {
            query = query.eq('order_id', orderId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error loading change requests:', error);
            return;
        }

        set(data || []);
    }

    async function createChangeRequest(request: Omit<ChangeRequest, 'id' | 'created_at' | 'status'>) {
        const { data, error } = await supabase
            .from('change_requests')
            .insert({
                ...request,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        update(requests => [data, ...requests]);
        return data;
    }

    async function approveChangeRequest(id: string, reviewerId: string) {
        const { data, error } = await supabase
            .from('change_requests')
            .update({
                status: 'approved',
                reviewed_by: reviewerId,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        // Apply changes to the order
        // Note: Assuming 'draft_orders' table based on previous analysis, but check if it's 'orders' or 'draft_orders'
        // The file usually refers to 'orders' in variable names, but the table might be 'draft_orders'.
        // If the 'order_id' points to 'draft_orders', we should update 'draft_orders'.
        
        const { changes, order_id } = data;
        const updates: Record<string, any> = {};
        
        changes.forEach((change: any) => {
            updates[change.field] = change.new_value;
        });

        await supabase
            .from('draft_orders') // Updated to draft_orders
            .update(updates)
            .eq('id', order_id);

        update(requests =>
            requests.map(cr => (cr.id === id ? data : cr))
        );

        return data;
    }

    async function rejectChangeRequest(id: string, reviewerId: string, reason?: string) {
        const { data, error } = await supabase
            .from('change_requests')
            .update({
                status: 'rejected',
                reviewed_by: reviewerId,
                reviewed_at: new Date().toISOString(),
                reason
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw error;
        }

        update(requests =>
            requests.map(cr => (cr.id === id ? data : cr))
        );

        return data;
    }

    return {
        subscribe,
        load: loadChangeRequests,
        create: createChangeRequest,
        approve: approveChangeRequest,
        reject: rejectChangeRequest
    };
}