// src/routes/api/inventory/items/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/inventory/items/[id] - Get single item
 */
export const GET: RequestHandler = async ({ params }) => {
  const result = await query('SELECT * FROM inventory_items WHERE id = $1', [params.id]);
  
  if (result.rows.length === 0) {
    throw error(404, 'Item not found');
  }

  const row = result.rows[0];
  return json({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    section: row.section,
    group: row.item_group,
    subgroup: row.subgroup,
    unit: row.unit,
    stock: parseFloat(row.stock),
    min: parseFloat(row.min_stock),
    thicknessMM: row.thickness_mm ? parseFloat(row.thickness_mm) : undefined,
    location: row.location,
    vendor: row.vendor,
    colorCode: row.color_code,
    barcode: row.barcode,
    note: row.note,
    leftover: row.leftover_data,
    updatedAt: row.updated_at?.toISOString()
  });
};

/**
 * PUT /api/inventory/items/[id] - Update item
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const data = await request.json();

  const sql = `
    UPDATE inventory_items SET
      sku = COALESCE($2, sku),
      name = COALESCE($3, name),
      category = COALESCE($4, category),
      section = COALESCE($5, section),
      item_group = COALESCE($6, item_group),
      subgroup = COALESCE($7, subgroup),
      unit = COALESCE($8, unit),
      stock = COALESCE($9, stock),
      min_stock = COALESCE($10, min_stock),
      thickness_mm = $11,
      location = $12,
      vendor = $13,
      color_code = $14,
      barcode = $15,
      note = $16,
      leftover_data = $17,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await query(sql, [
      params.id,
      data.sku,
      data.name,
      data.category,
      data.section,
      data.group,
      data.subgroup,
      data.unit,
      data.stock,
      data.min,
      data.thicknessMM ?? null,
      data.location ?? null,
      data.vendor ?? null,
      data.colorCode ?? null,
      data.barcode ?? null,
      data.note ?? null,
      data.leftover ? JSON.stringify(data.leftover) : null
    ]);

    if (result.rows.length === 0) {
      throw error(404, 'Item not found');
    }

    return json(result.rows[0]);
  } catch (err: any) {
    console.error('Failed to update item:', err);
    throw error(500, 'Failed to update item');
  }
};

/**
 * DELETE /api/inventory/items/[id] - Delete item
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const result = await query('DELETE FROM inventory_items WHERE id = $1 RETURNING id', [params.id]);
  
  if (result.rows.length === 0) {
    throw error(404, 'Item not found');
  }

  return json({ success: true, id: params.id });
};
