// src/routes/api/inventory/items/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parsePaginationFromUrl, formatPaginatedResponse, calculatePagination } from '$lib/server/pagination';

/**
 * GET /api/inventory/items - List all inventory items
 * Now queries from unified materials table
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const category = url.searchParams.get('category');
  const section = url.searchParams.get('section');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');
  const { page, limit } = parsePaginationFromUrl(url);

  // Build filter conditions
  const filters: Record<string, string> = {};
  if (category) filters.category = category;
  if (section) filters.section = section;

  // First get the count for pagination
  let countQuery = locals.supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .order('updated_at', { ascending: false });

  if (category) countQuery = countQuery.eq('category', category);
  if (section) countQuery = countQuery.eq('section', section);
  // Don't filter by SKU - show all materials

  if (search) {
    countQuery = countQuery.or(`sku.ilike.%${search}%,name_en.ilike.%${search}%,location.ilike.%${search}%,code.ilike.%${search}%`);
  }

  const { count: totalCount, error: countError } = await countQuery;

  if (countError) {
    console.error('Failed to count inventory items:', countError);
    return json({ data: [], pagination: calculatePagination(0) }, { status: 500 });
  }

  // Now get the actual data with pagination
  let paginatedQuery = locals.supabase
    .from('materials')
    .select('*')
    .order('updated_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (category) paginatedQuery = paginatedQuery.eq('category', category);
  if (section) paginatedQuery = paginatedQuery.eq('section', section);
  // Don't filter by SKU - show all materials

  if (search) {
    paginatedQuery = paginatedQuery.or(`sku.ilike.%${search}%,name_en.ilike.%${search}%,location.ilike.%${search}%,code.ilike.%${search}%`);
  }

  const { data, error } = await paginatedQuery;

  if (error) {
    console.error('Failed to fetch inventory items:', error);
    return json({ data: [], pagination: calculatePagination(0) }, { status: 500 });
  }

  let items = data.map(row => ({
      id: row.id,
      sku: row.sku,
      name: row.name_en || row.code,
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

  const pagination = calculatePagination(totalCount || 0, { page, limit });

  return json(formatPaginatedResponse(items, pagination));
};

/**
 * POST /api/inventory/items - Create new inventory item
 * Now inserts into unified materials table
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  const { data: item, error } = await locals.supabase
    .from('materials')
    .insert({
      id: data.id || crypto.randomUUID(),
      sku: data.sku,
      code: data.code || 'INV-' + Date.now(),
      name_en: data.name,
      category: data.category || 'HARDWARE',
      section: data.section || 'materials',
      item_group: data.group || 'General',
      subgroup: data.subgroup || 'General',
      unit: data.unit || 'PCS',
      stock: data.stock || 0,
      min_stock: data.min || 0,
      max_stock: data.max_stock || null,
      thickness_mm: data.thicknessMM || null,
      location: data.location || null,
      vendor: data.vendor || null,
      supplier: data.supplier || null,
      color_code: data.colorCode || null,
      hex_color: data.hexColor || null,
      barcode: data.barcode || null,
      price: data.price || null,
      note: data.note || null,
      leftover_data: data.leftover || null,
      metadata: data.metadata || {}
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
    name: item.name_en,
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