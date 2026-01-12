// src/routes/api/inventory/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/inventory - List inventory items
 * Query params: ?category=ALU&lowStock=true&search=plexiglas
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const category = url.searchParams.get('category');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');

  let query = supabase
    .from('inventory_stock')
    .select(`
      *,
      materials (
        code,
        name_en,
        category,
        metadata
      )
    `);

  if (category) {
    query = query.eq('materials.category', category);
  }

  if (lowStock) {
    query = query.lte('quantity_in_stock', 'minimum_stock_level');
  }

  if (search) {
    query = query.or(`materials.name_en.ilike.%${search}%,materials.code.ilike.%${search}%`);
  }

  query = query.order('updated_at', { ascending: false });

  const { data: items, error, count } = await query;

  if (error) {
    console.error('Error fetching inventory items:', error);
    return json({ items: [], count: 0 }, { status: 500 });
  }

  return json({
    items: items,
    count: count
  });
};

/**
 * POST /api/inventory - Add new inventory item
 */
export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
  const data = await request.json();

  const { data: newItem, error } = await supabase
    .from('inventory_stock')
    .insert({
      material_id: data.materialId,
      thickness: data.thickness,
      quantity_in_stock: data.quantityInStock,
      unit_of_measure: data.unitOfMeasure,
      location: data.location,
      minimum_stock_level: data.minimumStockLevel,
      reorder_point: data.reorderPoint,
      cost_per_unit: data.costPerUnit,
      notes: data.notes
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating inventory item:', error);
    return json({ error: 'Failed to create item' }, { status: 500 });
  }

  return json(newItem, { status: 201 });
};
