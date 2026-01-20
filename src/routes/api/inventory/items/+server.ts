// src/routes/api/inventory/items/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/inventory/items - List all inventory items
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const category = url.searchParams.get('category');
  const section = url.searchParams.get('section');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');

  let query = locals.supabase
    .from('inventory_items')
    .select('*')
    .order('updated_at', { ascending: false });

  if (category) query = query.eq('category', category);
  if (section) query = query.eq('section', section);

  if (search) {
    query = query.or(`sku.ilike.%${search}%,name.ilike.%${search}%,location.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch inventory items:', error);
    return json([], { status: 500 });
  }

  let items = data.map(row => ({
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
  }));

  if (lowStock) {
      items = items.filter(i => i.stock <= i.min);
  }

  return json(items);
};

/**
 * POST /api/inventory/items - Create new inventory item
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  const { data: item, error } = await locals.supabase
    .from('inventory_items')
    .insert({
      id: data.id || `INV-${Date.now()}`,
      sku: data.sku,
      name: data.name,
      category: data.category || 'HARDWARE',
      section: data.section || 'materials',
      item_group: data.group || 'General',
      subgroup: data.subgroup || 'General',
      unit: data.unit || 'PCS',
      stock: data.stock || 0,
      min_stock: data.min || 0,
      thickness_mm: data.thicknessMM || null,
      location: data.location || null,
      vendor: data.vendor || null,
      color_code: data.colorCode || null,
      barcode: data.barcode || null,
      note: data.note || null,
      leftover_data: data.leftover || null
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create inventory item:', error);
    if (error.code === '23505') {
      return json({ error: 'SKU or ID already exists' }, { status: 409 });
    }
    return json({ error: 'Failed to create item' }, { status: 500 });
  }

  // Return mapped item
  return json({
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    section: item.section,
    group: item.item_group,
    subgroup: item.subgroup,
    unit: item.unit,
    stock: item.stock,
    min: item.min_stock,
    thicknessMM: item.thickness_mm,
    location: item.location,
    vendor: item.vendor,
    colorCode: item.color_code,
    barcode: item.barcode,
    note: item.note,
    leftover: item.leftover_data,
    updatedAt: item.updated_at
  }, { status: 201 });
};