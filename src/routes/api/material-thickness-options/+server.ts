import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// Helper function to normalize material type
function normalizeMaterialType(materialType: string): string {
  if (!materialType) return '';
  
  // Convert to uppercase for consistent comparison
  const upperType = materialType.toUpperCase();
  
  // Extract common material types from complex names
  if (upperType.includes('PLEXIGLAS') || upperType.includes('ACRYLIC') || upperType.includes('PLEXI')) {
    return 'ACRYLIC';
  } else if (upperType.includes('PVC') || upperType.includes('FOREX')) {
    return 'PVC';
  } else if (upperType.includes('ALU') || upperType.includes('ALUMINIUM') || upperType.includes('ALUMINUM')) {
    return 'ALUMINUM';
  } else if (upperType.includes('DIBOND') || upperType.includes('ALUCOBOND')) {
    return 'DIBOND';
  } else if (upperType.includes('MDF')) {
    return 'MDF';
  } else if (upperType.includes('WOOD') || upperType.includes('PLYWOOD')) {
    return 'WOOD';
  } else if (upperType.includes('STEEL') || upperType.includes('METAL')) {
    return 'STEEL';
  } else if (upperType.includes('FILM') || upperType.includes('ORACAL') || upperType.includes('PRINT')) {
    return 'FILM';
  }
  
  // Return the original type if no match found
  return upperType;
}

// GET - Fetch thickness options by material type
export const GET: RequestHandler = async ({ url, locals }) => {
  const supabase = locals.supabase;
  const materialTypeParam = url.searchParams.get('materialType');

  let query = supabase
    .from('material_thickness_options')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (materialTypeParam) {
    const normalizedType = normalizeMaterialType(materialTypeParam);
    
    // If normalization returns a known material type, use exact match
    const knownMaterialTypes = ['ACRYLIC', 'PVC', 'ALUMINUM', 'DIBOND', 'MDF', 'WOOD', 'STEEL', 'FILM'];
    if (knownMaterialTypes.includes(normalizedType)) {
      query = query.ilike('material_type', normalizedType);
    } else {
      // For other cases, use partial match
      query = query.ilike('material_type', `%${normalizedType}%`);
    }
  }

  try {
    const { data: options, error: dbError } = await query;

    if (dbError) {
      console.error('Error fetching thickness options:', dbError);
      console.error('Material type param:', materialTypeParam);
      console.error('Normalized type:', materialTypeParam ? normalizeMaterialType(materialTypeParam) : 'N/A');
      return json([], { status: 200 }); // Return empty array instead of throwing
    }

    return json(options || []);
  } catch (err) {
    console.error('Unexpected error in material-thickness-options API:', err);
    console.error('Material type param:', materialTypeParam);
    return json([], { status: 200 }); // Return empty array to prevent 503
  }
};