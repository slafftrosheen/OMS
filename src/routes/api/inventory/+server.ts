// src/routes/api/inventory/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import type { InventoryStock, StockMovement } from '$lib/inventory/types';

/**
 * GET /api/inventory - List inventory items
 * Query params: ?category=ALU&lowStock=true&search=plexiglas
 */
export const GET: RequestHandler = async ({ url }) => {
  const category = url.searchParams.get('category');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');

  let sql = `
    SELECT
      i.*,
      m.code as material_code,
      m.name_en as material_name,
      m.category as material_category,
      m.metadata as material_metadata
    FROM inventory_stock i
    JOIN materials m ON m.id = i.material_id
    WHERE 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (category) {
    sql += ` AND m.category = $${paramIndex++}`;
    params.push(category);
  }

  if (lowStock) {
    sql += ` AND i.quantity_in_stock <= i.minimum_stock_level`;
  }

  if (search) {
    sql += ` AND (m.name_en ILIKE $${paramIndex} OR m.code ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY i.updated_at DESC`;

  const result = await query(sql, params);

  return json({
    items: result.rows,
    count: result.rowCount
  });
};

/**
 * POST /api/inventory - Add new inventory item
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  const sql = `
    INSERT INTO inventory_stock (
      material_id, thickness, quantity_in_stock, unit_of_measure,
      location, minimum_stock_level, reorder_point, cost_per_unit, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await query(sql, [
    data.materialId,
    data.thickness,
    data.quantityInStock,
    data.unitOfMeasure,
    data.location,
    data.minimumStockLevel,
    data.reorderPoint,
    data.costPerUnit,
    data.notes
  ]);

  return json(result.rows[0], { status: 201 });
};
