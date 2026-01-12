// src/routes/api/inventory/items/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/inventory/items - List all inventory items
 */
export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category');
  const section = url.searchParams.get('section');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');

  let sql = `SELECT * FROM inventory_items WHERE 1=1`;
  const params: any[] = [];
  let idx = 1;

  if (category) {
    sql += ` AND category = $${idx++}`;
    params.push(category);
  }

  if (section) {
    sql += ` AND section = $${idx++}`;
    params.push(section);
  }

  if (lowStock) {
    sql += ` AND stock <= min_stock`;
  }

  if (search) {
    sql += ` AND (sku ILIKE $${idx} OR name ILIKE $${idx} OR location ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  sql += ` ORDER BY updated_at DESC`;

  try {
    const result = await query(sql, params);
    const items = result.rows.map(row => ({
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
    }));
    return json(items);
  } catch (err) {
    console.error('Failed to fetch inventory items:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/inventory/items - Create new inventory item
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  const id = data.id || `INV-${Date.now()}`;
  const sql = `
    INSERT INTO inventory_items (
      id, sku, name, category, section, item_group, subgroup, unit,
      stock, min_stock, thickness_mm, location, vendor, color_code, barcode, note, leftover_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *
  `;

  try {
    const result = await query(sql, [
      id,
      data.sku,
      data.name,
      data.category || 'HARDWARE',
      data.section || 'materials',
      data.group || 'General',
      data.subgroup || 'General',
      data.unit || 'PCS',
      data.stock || 0,
      data.min || 0,
      data.thicknessMM || null,
      data.location || null,
      data.vendor || null,
      data.colorCode || null,
      data.barcode || null,
      data.note || null,
      data.leftover ? JSON.stringify(data.leftover) : null
    ]);
    
    return json(result.rows[0], { status: 201 });
  } catch (err: any) {
    console.error('Failed to create inventory item:', err);
    if (err.code === '23505') {
      return json({ error: 'SKU already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create item' }, { status: 500 });
  }
};
