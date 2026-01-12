// src/routes/api/inventory/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db/connection';

/**
 * GET /api/inventory - List inventory items
 * Query params: ?category=ALU&lowStock=true&search=plexiglas
 */
export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');

  try {
    let sql = `
      SELECT
        s.*,
        m.code,
        m.name_en,
        m.category,
        m.metadata
      FROM inventory_stock s
      JOIN materials m ON s.material_id = m.id
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`m.category = $${paramIndex++}`);
      params.push(category);
    }

    if (lowStock) {
      conditions.push('s.quantity_in_stock <= s.minimum_stock_level');
    }

    if (search) {
      conditions.push(`(m.name_en ILIKE $${paramIndex} OR m.code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY s.updated_at DESC';

    const result = await query(sql, params);

    return json({
      items: result.rows,
      count: result.rowCount
    });
  } catch (err) {
    console.error('Error fetching inventory items:', err);
    return json({ items: [], count: 0 }, { status: 500 });
  }
};

/**
 * POST /api/inventory - Add new inventory item
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  try {
    const result = await query(
      'INSERT INTO inventory_stock (material_id, thickness, quantity_in_stock, unit_of_measure, location, minimum_stock_level, reorder_point, cost_per_unit, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [data.materialId, data.thickness, data.quantityInStock, data.unitOfMeasure, data.location, data.minimumStockLevel, data.reorderPoint, data.costPerUnit, data.notes]
    );

    return json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error('Error creating inventory item:', err);
    return json({ error: 'Failed to create item' }, { status: 500 });
  }
};
