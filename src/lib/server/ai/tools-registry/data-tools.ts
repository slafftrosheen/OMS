// OMS data tools run under the user's request-scoped client (RLS), never service_role.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Bounded, RLS-aware catalog lookup. This does not infer stock or supplier prices. */
export async function searchMaterialCatalog(db: SupabaseClient, args: Record<string, unknown>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (query.length < 2 || query.length > 100) throw new Error('Catalog query must contain 2–100 characters');
    const category = typeof args.category === 'string' ? args.category.trim() : '';
    if (category && !/^[A-Z][A-Z0-9_]{1,49}$/.test(category)) throw new Error('Invalid material category');
    // Preserve exact supplier/legacy codes (including underscores) as a quoted
    // PostgREST value. Quote/backslash escaping keeps commas and parentheses in
    // that value, never in the OR grammar. Supabase handles URL percent encoding.
    const exactCode = `"${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    // Broad text search still strips query syntax and wildcard characters.
    const term = query.replace(/[,%_()*\\"']/g, ' ').replace(/\s+/g, ' ').trim();
    const conditions = [`code.eq.${exactCode}`];
    if (term.length >= 2) {
        conditions.push(...['code', 'name_en', 'name_ru', 'name_lv'].map(column => `${column}.ilike.%${term}%`));
    }
    let lookup = db.from('materials')
        .select('code,name_en,name_ru,name_lv,category,unit,thickness_options,metadata')
        .or(conditions.join(','))
        .order('code').limit(20);
    if (category) lookup = lookup.eq('category', category);
    if (signal) lookup = lookup.abortSignal(signal);
    const { data, error } = await lookup;
    signal?.throwIfAborted();
    if (error) throw new Error('Material catalog unavailable or access denied');
    const metadataKeys = ['brand','model','manufacturer_part_number','short_name','supplier','supplier_sku','supplier_product_code',
        'source_url','verified_at','voltage_v','power_w','current_a','ip_rating','color_temperature_k',
        'watts_per_m','leds_per_m','length_m','wire_cross_section_mm2','diameter_mm','weight_kg','material',
        'cores','conductor','color','led_type','control_ic','manufacturer_source_url','source_kind',
        'data_notes','product_family','package_type','connections','wire_cross_section_range_mm2',
        'fine_stranded_conductor_range_mm2','solid_conductor_range_mm2','wire_cross_section_max_mm2',
        'color_temperature_range_k','width_mm','height_mm','cut_interval_mm','beam_angle_deg',
        'beam_angle_horizontal_deg','beam_angle_vertical_deg','volume_ml','mounting'];
    return { materials: (data ?? []).map(row => ({
        code: row.code, name: row.name_en, name_ru: row.name_ru, name_lv: row.name_lv,
        category: row.category, unit: row.unit, thickness_options: row.thickness_options,
        specifications: Object.fromEntries(metadataKeys.filter(key => row.metadata?.[key] !== undefined)
            .map(key => [key, row.metadata[key]]))
    })), limit: 20, stockVerified: false, supplierPriceVerified: false };
}

export async function getPendingOrders(db: SupabaseClient, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const limit = 25;
    const statusFilter = ['DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY_TO_LOAD', 'ON_HOLD'];
    let lookup = db.from('draft_orders')
        .select('id,po_number,title,client,status,priority,due_date,loading_date')
        .in('status', statusFilter)
        .order('due_date', { ascending: true })
        .limit(limit + 1);
    if (signal) lookup = lookup.abortSignal(signal);
    const { data, error } = await lookup;
    signal?.throwIfAborted();
    if (error) throw new Error('Pending orders are unavailable or access is denied');
    const inspected = data ?? [];
    const orders = inspected.slice(0, limit);
    return {
        orders, limit, inspectedCount: inspected.length, returnedCount: orders.length,
        mayBeIncomplete: inspected.length > limit,
        statusFilter, scope: 'Pending orders visible to the signed-in user, ordered by due date.'
    };
}

export async function getLowStock(db: SupabaseClient, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const scanLimit = 500;
    const limit = 100;
    // PostgREST filter(column, 'lte', 'min_stock') compares to a literal string,
    // NOT to another column. Filter the two numeric values in code.
    let lookup = db.from('materials')
        .select('id,sku,name_en,category,unit,stock,min_stock')
        .order('updated_at', { ascending: false })
        .limit(scanLimit);
    if (signal) lookup = lookup.abortSignal(signal);
    const { data, error } = await lookup;
    signal?.throwIfAborted();
    if (error) throw new Error('Inventory levels are unavailable or access is denied');
    const inspected = data ?? [];
    const numeric = (value: unknown) => (typeof value === 'number' ||
        (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
    const classified = inspected.filter(item => numeric(item.stock) && numeric(item.min_stock));
    const matches = classified.filter(item => Number(item.stock) <= Number(item.min_stock)).map(item => ({
        id: item.id, sku: item.sku, name: item.name_en, category: item.category, unit: item.unit,
        stock: Number(item.stock), min_stock: Number(item.min_stock),
        deficit: Math.max(0, Number(item.min_stock) - Number(item.stock))
    }));
    const materials = matches.slice(0, limit);
    const scanMayBeIncomplete = inspected.length >= scanLimit;
    const resultsTruncated = matches.length > limit;
    const unclassifiedCount = inspected.length - classified.length;
    return {
        materials, limit, scanLimit, inspectedCount: inspected.length,
        matchingInspectedCount: matches.length, returnedCount: materials.length,
        scanMayBeIncomplete, resultsTruncated, unclassifiedCount,
        mayBeIncomplete: scanMayBeIncomplete || resultsTruncated || unclassifiedCount > 0,
        scope: 'Only the most recently updated materials visible to the signed-in user were inspected. An empty partial result does not prove there are no low-stock materials.',
        thresholdRule: 'Recorded stock <= recorded min_stock, including zero stock with a zero minimum. These default thresholds are not a purchase recommendation.'
    };
}
