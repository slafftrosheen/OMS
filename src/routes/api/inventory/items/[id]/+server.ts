// src/routes/api/inventory/items/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/inventory/items/[id] - Get single item
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { data: row, error: fetchError } = await locals.supabase
    .from('inventory_items')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchError || !row) {
    throw error(404, 'Item not found');
  }

  return json({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    section: row.section,
    group: row.item_group,
    subgroup: row.subgroup,
    unit: row.unit,
    stock: row.stock,
    min: row.min_stock,
    thicknessMM: row.thickness_mm,
    location: row.location,
    vendor: row.vendor,
    colorCode: row.color_code,
    barcode: row.barcode,
    note: row.note,
    leftover: row.leftover_data,
    updatedAt: row.updated_at
  });
};

/**
 * PUT /api/inventory/items/[id] - Update item
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const data = await request.json();

  const updates: any = { updated_at: new Date().toISOString() };
  if (data.sku !== undefined) updates.sku = data.sku;
  if (data.name !== undefined) updates.name = data.name;
  if (data.category !== undefined) updates.category = data.category;
  if (data.section !== undefined) updates.section = data.section;
  if (data.group !== undefined) updates.item_group = data.group;
  if (data.subgroup !== undefined) updates.subgroup = data.subgroup;
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.stock !== undefined) updates.stock = data.stock;
  if (data.min !== undefined) updates.min_stock = data.min;
  if (data.thicknessMM !== undefined) updates.thickness_mm = data.thicknessMM;
  if (data.location !== undefined) updates.location = data.location;
  if (data.vendor !== undefined) updates.vendor = data.vendor;
  if (data.colorCode !== undefined) updates.color_code = data.colorCode;
  if (data.barcode !== undefined) updates.barcode = data.barcode;
  if (data.note !== undefined) updates.note = data.note;
  if (data.leftover !== undefined) updates.leftover_data = data.leftover;

  try {
    const { data: updated, error: updateError } = await locals.supabase
        .from('inventory_items')
        .update(updates)
        .eq('id', params.id)
        .select()
        .single();

    if (updateError || !updated) {
       if (updateError?.code === 'PGRST116' || !updated) throw error(404, 'Item not found');
       throw updateError;
    }

    // Return mapped item consistently
    return json({
      id: updated.id,
      sku: updated.sku,
      name: updated.name,
      category: updated.category,
      section: updated.section,
      group: updated.item_group,
      subgroup: updated.subgroup,
      unit: updated.unit,
      stock: updated.stock,
      min: updated.min_stock,
      thicknessMM: updated.thickness_mm,
      location: updated.location,
      vendor: updated.vendor,
      colorCode: updated.color_code,
      barcode: updated.barcode,
      note: updated.note,
      leftover: updated.leftover_data,
      updatedAt: updated.updated_at
    });
  } catch (err: any) {
    console.error('Failed to update item:', err);
    if (err.status) throw err;
    throw error(500, 'Failed to update item');
  }
};

/**
 * DELETE /api/inventory/items/[id] - Delete item
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { error: deleteError } = await locals.supabase
    .from('inventory_items')
    .delete()
    .eq('id', params.id);

  if (deleteError) {
     throw error(500, 'Failed to delete item');
  }

  return json({ success: true, id: params.id });
};