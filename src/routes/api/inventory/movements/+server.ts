// src/routes/api/inventory/movements/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/inventory/movements - List movements
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const itemId = url.searchParams.get('itemId');
  const materialId = url.searchParams.get('materialId');
  const kind = url.searchParams.get('kind');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  // Need to join both inventory_items and materials (via material_id)
  let query = locals.supabase
    .from('inventory_movements')
    .select(`
        *,
        inventory_items(sku, name),
        materials(code, name_en)
    `)
    .order('created_at', { ascending: false });

  if (itemId) query = query.eq('item_id', itemId);
  if (materialId) query = query.eq('material_id', materialId);
  if (kind) query = query.eq('kind', kind);

  query = query.limit(limit);

  const { data, error: fetchError } = await query;

  if (fetchError) {
    console.error('Failed to fetch movements:', fetchError);
    return json([], { status: 500 });
  }

  const movements = data.map(row => ({
    id: row.id,
    itemId: row.item_id,
    materialId: row.material_id,
    sku: row.inventory_items?.sku || row.materials?.code,
    itemName: row.inventory_items?.name || row.materials?.name_en,
    kind: row.kind,
    qty: row.qty,
    unit: row.unit,
    by: row.performed_by,
    refPO: row.ref_po,
    note: row.note,
    at: row.created_at
  }));

  return json(movements);
};

/**
 * POST /api/inventory/movements - Record movement and update stock
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if ((!data.itemId && !data.materialId) || !data.kind || data.qty === undefined) {
    return json({ error: 'itemId or materialId, kind, and qty are required' }, { status: 400 });
  }

  try {
     const { data: result, error: rpcError } = await locals.supabase
        .rpc('record_inventory_movement', {
            p_item_id: data.itemId || null,
            p_material_id: data.materialId || null,
            p_kind: data.kind,
            p_qty: data.qty,
            p_unit: data.unit,
            p_performed_by: data.by || 'system',
            p_ref_po: data.refPO || null,
            p_note: data.note || null
        });

     if (rpcError) {
         throw rpcError;
     }

     return json(result, { status: 201 });

  } catch (err: any) {
    console.error('Failed to record movement:', err);
    return json({ error: err.message || 'Failed to record movement' }, { status: 500 });
  }
};
