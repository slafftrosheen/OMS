// Lightweight database tools (already had equivalents in tools.ts —
// re-exported here under the new registry shape so the orchestrator only has
// one source of executors).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

export async function getPendingOrders() {
    const db = admin();
    const { data, error } = await db
        .from('draft_orders')
        .select('id,po_number,title,client,status,priority,due_date,loading_date,created_at')
        .in('status', ['active', 'draft', 'on_hold'])
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true })
        .limit(25);
    if (error) {
        logger.error('getPendingOrders failed', new Error(error.message));
        throw new Error(error.message);
    }
    return data ?? [];
}

export async function getLowStock() {
    const db = admin();
    const { data, error } = await db
        .from('materials')
        .select('id,name,category,unit,current_stock,min_stock')
        .filter('current_stock', 'lte', 'min_stock');
    if (error) {
        logger.error('getLowStock failed', new Error(error.message));
        throw new Error(error.message);
    }
    return (data ?? []).map((m) => {
        const item = m as Record<string, unknown>;
        const cur = Number(item.current_stock ?? 0);
        const min = Number(item.min_stock ?? 0);
        return { ...item, deficit: Math.max(0, min - cur) };
    });
}
