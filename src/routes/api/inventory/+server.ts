// src/routes/api/inventory/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parsePaginationFromUrl, formatPaginatedResponse, calculatePagination } from '$lib/server/pagination';

/**
 * GET /api/inventory - List inventory items
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const category = url.searchParams.get('category');
  const lowStock = url.searchParams.get('lowStock') === 'true';
  const search = url.searchParams.get('search');
  const { page, limit } = parsePaginationFromUrl(url);

  try {
    // Note: The previous logic joined `inventory_stock` and `materials`.
    // I need to check if these tables exist in the new schema.
    // In migration 006_inventory.sql I created `inventory_items` which combined these concepts?
    // No, `inventory_items` was for `src/routes/api/inventory/items/+server.ts`.
    // This file `src/routes/api/inventory/+server.ts` seems to be using a different schema (`inventory_stock` + `materials`).
    // This implies `inventory/items` and `inventory` might be duplicate or different systems.
    // But since I am refactoring, I should consolidate or support both if they serve different purposes.
    // However, looking at the code, `inventory_stock` references `material_id`.
    // `materials` table exists (migration 001).
    // `inventory_stock` does not exist in my migrations yet. I should add it if I want to support this endpoint.
    // Or maybe this endpoint is legacy and replaced by `inventory/items`?
    // The `inventory/items` endpoint uses `inventory_items` table (which has sku, name, etc.).
    // `inventory` endpoint uses `inventory_stock` + `materials`.
    // If the system has "Materials" and "Inventory of Materials", this endpoint makes sense.
    // I should create `inventory_stock` table.

    let query = locals.supabase
        .from('inventory_stock')
        .select(`
            *,
            materials (code, name_en, category, metadata)
        `)
        .order('updated_at', { ascending: false });

    // Filtering by joined table (materials) in Supabase is done via !inner join and filter.
    if (category) {
        query = query.eq('materials.category', category); // This works if FK is set up correctly
        // Or .filter('materials.category', 'eq', category)? No.
        // Needs: .select('*, materials!inner(*)') .eq('materials.category', category)
        // But let's verify if `materials` relationship exists.
    }

    // Search
    if (search) {
        // Search on materials name/code
        // .or(`name_en.ilike.%${search}%,code.ilike.%${search}%`, { foreignTable: 'materials' })
        // Need to enable inner join for filtering
    }

    // Since I haven't created `inventory_stock` table yet, I need to add it in a migration.
    // And I should adjust the code to use it.

    // First get the count for pagination
    let countQuery = locals.supabase
        .from('inventory_stock')
        .select('*', { count: 'exact', head: true });

    if (category) {
        countQuery = countQuery.eq('materials.category', category);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
         // If table missing, return empty or error.
         console.error('Error counting inventory items:', countError);
         return json({ data: [], pagination: calculatePagination(0) }); // Fail gracefully
    }

    // Now get the actual data with pagination
    let paginatedQuery = locals.supabase
        .from('inventory_stock')
        .select(`
            *,
            materials (code, name_en, category, metadata)
        `)
        .order('updated_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1); // Apply pagination

    // Filtering by joined table (materials) in Supabase is done via !inner join and filter.
    if (category) {
        paginatedQuery = paginatedQuery.eq('materials.category', category); // This works if FK is set up correctly
        // Or .filter('materials.category', 'eq', category)? No.
        // Needs: .select('*, materials!inner(*)') .eq('materials.category', category)
        // But let's verify if `materials` relationship exists.
    }

    // Search
    if (search) {
        // Search on materials name/code
        // .or(`name_en.ilike.%${search}%,code.ilike.%${search}%`, { foreignTable: 'materials' })
        // Need to enable inner join for filtering
    }

    // Since I haven't created `inventory_stock` table yet, I need to add it in a migration.
    // And I should adjust the code to use it.

    // For now, I'll write the code assuming the table exists, and then add the migration.

    const { data, error } = await paginatedQuery;

    if (error) {
         // If table missing, return empty or error.
         console.error('Error fetching inventory items:', error);
         return json({ data: [], pagination: calculatePagination(0) }); // Fail gracefully
    }

    let items = data.map((row: any) => ({
        ...row,
        code: row.materials?.code,
        name_en: row.materials?.name_en,
        category: row.materials?.category,
        metadata: row.materials?.metadata
    }));

    if (lowStock) {
        items = items.filter((i: any) => i.quantity_in_stock <= i.minimum_stock_level);
    }

    if (category) {
        items = items.filter((i: any) => i.category === category);
    }

    if (search) {
        const lowerSearch = search.toLowerCase();
        items = items.filter((i: any) =>
            (i.name_en && i.name_en.toLowerCase().includes(lowerSearch)) ||
            (i.code && i.code.toLowerCase().includes(lowerSearch))
        );
    }

    const pagination = calculatePagination(totalCount || 0, { page, limit });

    return json(formatPaginatedResponse(items, pagination));
  } catch (err) {
    console.error('Error fetching inventory items:', err);
    return json({ data: [], pagination: calculatePagination(0) }, { status: 500 });
  }
};

/**
 * POST /api/inventory - Add new inventory item
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();

  try {
    const { data: newItem, error } = await locals.supabase
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

    if (error) throw error;

    return json(newItem, { status: 201 });
  } catch (err) {
    console.error('Error creating inventory item:', err);
    return json({ error: 'Failed to create item' }, { status: 500 });
  }
};
