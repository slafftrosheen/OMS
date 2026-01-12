// src/routes/api/inventory/movements/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';

/**
 * GET /api/inventory/movements - List movements
 */
export const GET: RequestHandler = async ({ url }) => {
  const itemId = url.searchParams.get('itemId');
  const kind = url.searchParams.get('kind');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let sql = `
    SELECT m.*, i.sku, i.name as item_name
    FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.item_id
    WHERE 1=1
  `;
  const params: any[] = [];
  let idx = 1;

  if (itemId) {
    sql += ` AND m.item_id = $${idx++}`;
    params.push(itemId);
  }

  if (kind) {
    sql += ` AND m.kind = $${idx++}`;
    params.push(kind);
  }

  sql += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
  params.push(limit);

  try {
    const result = await query(sql, params);
    const movements = result.rows.map(row => ({
      id: row.id,
      itemId: row.item_id,
      sku: row.sku,
      itemName: row.item_name,
      kind: row.kind,
      qty: parseFloat(row.qty),
      unit: row.unit,
      by: row.performed_by,
      refPO: row.ref_po,
      note: row.note,
      at: row.created_at?.toISOString()
    }));
    return json(movements);
  } catch (err) {
    console.error('Failed to fetch movements:', err);
    return json([], { status: 500 });
  }
};

/**
 * POST /api/inventory/movements - Record movement and update stock
 */
export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (!data.itemId || !data.kind || data.qty === undefined) {
    return json({ error: 'itemId, kind, and qty are required' }, { status: 400 });
  }

  try {
    const result = await transaction(async (client) => {
      // Get current item
      const itemResult = await client.query(
        'SELECT * FROM inventory_items WHERE id = $1',
        [data.itemId]
      );

      if (itemResult.rows.length === 0) {
        throw new Error('Item not found');
      }

      const item = itemResult.rows[0];
      const id = `MV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      // Insert movement
      await client.query(`
        INSERT INTO inventory_movements (id, item_id, kind, qty, unit, performed_by, ref_po, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        id,
        data.itemId,
        data.kind,
        data.qty,
        data.unit || item.unit,
        data.by || 'system',
        data.refPO || null,
        data.note || null
      ]);

      // Calculate new stock
      let newStock: number;
      const currentStock = parseFloat(item.stock);
      
      if (data.kind === 'ADJUST') {
        newStock = Math.max(0, data.qty);
      } else {
        const delta = data.kind === 'IN' ? data.qty : -data.qty;
        newStock = Math.max(0, currentStock + delta);
      }

      // Update stock
      await client.query(
        'UPDATE inventory_items SET stock = $1, updated_at = NOW() WHERE id = $2',
        [newStock, data.itemId]
      );

      return {
        id,
        itemId: data.itemId,
        kind: data.kind,
        qty: data.qty,
        previousStock: currentStock,
        newStock,
        unit: data.unit || item.unit
      };
    });

    return json(result, { status: 201 });
  } catch (err: any) {
    console.error('Failed to record movement:', err);
    return json({ error: err.message || 'Failed to record movement' }, { status: 500 });
  }
};
