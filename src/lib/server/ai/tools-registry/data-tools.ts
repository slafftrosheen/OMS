// OMS data tools run under the user's request-scoped client (RLS), never service_role.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATALOG_EVIDENCE_NOTE, projectCatalogEvidence } from '$lib/materials/catalog-evidence';

const catalogColumns = 'code,name_en,name_ru,name_lv,category,unit,thickness_options,metadata';
const quotedCatalogCode = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function catalogSample(rows: unknown[], limit: number, budget = 10500) {
    const materials: ReturnType<typeof projectCatalogEvidence>[] = [];
    let used = 2;
    for (const row of rows.slice(0, limit)) {
        const projected = projectCatalogEvidence(row);
        const size = JSON.stringify(projected).length + 1;
        if (used + size > budget) break;
        materials.push(projected); used += size;
    }
    return materials;
}

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
    const exactCode = quotedCatalogCode(query);
    // Broad text search still strips query syntax and wildcard characters.
    const term = query.replace(/[,%_()*\\"']/g, ' ').replace(/\s+/g, ' ').trim();
    const conditions = [`code.eq.${exactCode}`];
    if (term.length >= 2) {
        conditions.push(...['code', 'name_en', 'name_ru', 'name_lv'].map(column => `${column}.ilike.%${term}%`));
    }
    const limit = 20;
    let lookup = db.from('materials')
        .select(catalogColumns)
        .or(conditions.join(','))
        .order('code').limit(limit + 1);
    if (category) lookup = lookup.eq('category', category);
    if (signal) lookup = lookup.abortSignal(signal);
    const { data, error } = await lookup;
    signal?.throwIfAborted();
    if (error) throw new Error('Material catalog unavailable or access denied');
    const inspected = data ?? [];
    const materials = catalogSample(inspected, limit);
    return { materials, limit, inspectedCount: inspected.length, returnedCount: materials.length,
        mayBeIncomplete: materials.length < inspected.length,
        stockVerified: false, supplierPriceVerified: false, evidenceNote: CATALOG_EVIDENCE_NOTE };
}

/** Exact, bounded comparison. No fuzzy replacement of missing or hidden codes. */
export async function compareMaterialCatalog(db: SupabaseClient, args: Record<string, unknown>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (Object.keys(args).some(key => key !== 'codes') || !Array.isArray(args.codes)
        || args.codes.length < 2 || args.codes.length > 4 || !args.codes.every(code =>
            typeof code === 'string' && code.trim().length > 0 && code.trim().length <= 100)) {
        throw new Error('Comparison requires 2–4 exact material codes');
    }
    const codes = [...new Set((args.codes as string[]).map(code => code.trim()))];
    if (codes.length < 2) throw new Error('Choose at least two distinct material codes');
    // Quote each equality explicitly: older PostgREST clients do not escape
    // quotes/backslashes inside every IN-list value.
    let lookup = db.from('materials').select(catalogColumns)
        .or(codes.map(code => `code.eq.${quotedCatalogCode(code)}`).join(',')).limit(4);
    if (signal) lookup = lookup.abortSignal(signal);
    const { data, error } = await lookup;
    signal?.throwIfAborted();
    if (error) throw new Error('Material comparison unavailable or access denied');
    const rows = (data ?? []).filter(row => codes.includes(row.code));
    const ambiguousCodes = codes.filter(code => rows.filter(row => row.code === code).length > 1);
    const found = codes.filter(code => !ambiguousCodes.includes(code)).flatMap(code =>
        rows.filter(row => row.code === code));
    const materials = catalogSample(found, 4);
    const missingCodes = codes.filter(code => !rows.some(row => row.code === code));
    const comparison = () => {
        const omittedCodes = found.filter(row => !materials.some(item => item.code === row.code)).map(row => row.code);
        return { requestedCodes: codes, materials, missingCodes, ambiguousCodes, omittedCodes,
            complete: missingCodes.length === 0 && ambiguousCodes.length === 0 && omittedCodes.length === 0,
            compatibilityVerified: false, stockVerified: false, supplierPriceVerified: false,
            evidenceNote: CATALOG_EVIDENCE_NOTE };
    };
    let result = comparison();
    // Codes appear in both the request and omission lists, and JSON escaping can
    // expand them. Fit the complete result below the assistant's 14KB boundary
    // so its exact completeness fields are never replaced by a text excerpt.
    while (materials.length && JSON.stringify(result).length > 13500) {
        materials.pop();
        result = comparison();
    }
    return result;
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
