// OMS data tools run under the user's request-scoped client (RLS), never service_role.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getPendingOrders(db: SupabaseClient) {
    const { data, error } = await db.from('draft_orders')
        .select('id,po_number,title,client,status,priority,due_date,loading_date')
        .in('status', ['DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'ON_HOLD'])
        .order('due_date', { ascending: true })
        .limit(25);
    if (error) throw new Error('Pending orders are unavailable or access is denied');
    return data ?? [];
}

export async function getLowStock(db: SupabaseClient) {
    // PostgREST filter(column, 'lte', 'min_stock') compares to a literal string,
    // NOT to another column. Filter the two numeric values in code.
    const { data, error } = await db.from('materials')
        .select('id,sku,name_en,category,unit,stock,min_stock')
        .order('updated_at', { ascending: false })
        .limit(500);
    if (error) throw new Error('Inventory levels are unavailable or access is denied');
    return (data ?? []).filter(item =>
        Number.isFinite(Number(item.stock)) && Number.isFinite(Number(item.min_stock)) &&
        Number(item.stock) <= Number(item.min_stock)
    ).map(item => ({
        id: item.id, sku: item.sku, name: item.name_en, category: item.category, unit: item.unit,
        stock: Number(item.stock), min_stock: Number(item.min_stock),
        deficit: Math.max(0, Number(item.min_stock) - Number(item.stock))
    })).slice(0, 100);
}
