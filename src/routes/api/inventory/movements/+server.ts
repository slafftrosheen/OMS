// src/routes/api/inventory/movements/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/inventory/movements - List movements
 * Now queries from unified materials table
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const materialId = url.searchParams.get('materialId');
  const kind = url.searchParams.get('kind');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  // Query movements with material info
  let query = locals.supabase
    .from('inventory_movements')
    .select(`
        *,
        materials(sku, name_en, code)
    `)
    .order('created_at', { ascending: false });

  if (materialId) query = query.eq('material_id', materialId);
  if (kind) query = query.eq('movement_type', kind);

  query = query.limit(limit);

  const { data, error: fetchError } = await query;

  if (fetchError) {
    console.error('Failed to fetch movements:', fetchError);
    return json([], { status: 500 });
  }

  const movements = data.map(row => ({
    id: row.id,
    materialId: row.material_id,
    sku: row.materials?.sku || row.materials?.code,
    name: row.materials?.name_en || row.materials?.code,
    kind: row.movement_type,
    qty: row.quantity,
    unit: row.unit_of_measure || 'PCS',
    by: row.performed_by,
    refPO: row.reference_type === 'order' ? row.reference_id?.toString() : undefined,
    note: row.notes,
    at: row.created_at
  }));

  return json(movements);
};

/**
 * POST /api/inventory/movements - Record movement and update stock
 * Now updates unified materials table
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  if (!data.materialId || !data.kind || data.qty === undefined) {
    return json({ error: 'materialId, kind, and qty are required' }, { status: 400 });
  }

  try {
    // Get current material stock
    const { data: material, error: materialError } = await locals.supabase
      .from('materials')
      .select('stock, unit')
      .eq('id', data.materialId)
      .single();

    if (materialError || !material) {
      throw new Error('Material not found');
    }

    // Calculate new stock
    let newStock = material.stock;
    if (data.kind === 'IN') {
      newStock += data.qty;
    } else if (data.kind === 'OUT') {
      newStock -= data.qty;
    }
    // ADJUST doesn't change stock automatically - qty is the new stock

    if (data.kind === 'ADJUST') {
      newStock = data.qty;
    }

    // Update material stock
    const { error: updateError } = await locals.supabase
      .from('materials')
      .update({ 
        stock: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.materialId);

    if (updateError) {
      throw updateError;
    }

    // Record movement
    const { data: movement, error: movementError } = await locals.supabase
      .from('inventory_movements')
      .insert({
        material_id: data.materialId,
        movement_type: data.kind,
        quantity: data.qty,
        unit_of_measure: data.unit || material.unit,
        performed_by: data.by || 'system',
        reference_type: data.refPO ? 'order' : null,
        reference_id: data.refPO ? data.refPO : null,
        notes: data.note || null
      })
      .select()
      .single();

    if (movementError) {
      throw movementError;
    }

    return json({
      id: movement.id,
      materialId: movement.material_id,
      kind: movement.movement_type,
      qty: movement.quantity,
      unit: movement.unit_of_measure,
      by: movement.performed_by,
      refPO: movement.reference_id,
      note: movement.notes,
      newStock,
      at: movement.created_at
    }, { status: 201 });

  } catch (err: any) {
    console.error('Failed to record movement:', err);
    return json({ error: err.message || 'Failed to record movement' }, { status: 500 });
  }
};
