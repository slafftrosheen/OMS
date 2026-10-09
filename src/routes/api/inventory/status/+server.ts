/**
 * Inventory status API
 * GET /api/inventory/status?codes=a,b,c
 * Returns per-material stock status used by the MaterialSelector to flag
 * low/out-of-stock materials. Backed by the unified `materials` table.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Query using the request-scoped, RLS-aware Supabase client.

// GET /api/inventory/status
export const GET: RequestHandler = async ({ url, locals }) => {
  const supabase = locals.supabase;
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const raw = url.searchParams.get('codes');
  if (!raw) return json({ data: [] });

  const codes = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  try {
    const { data, error: dbError } = await supabase
      .from('materials')
      .select('code, stock, min_stock, name_en, name_lv')
      .in('code', codes);

    if (dbError) {
      console.error('[Inventory Status API] Error:', dbError);
      throw error(500, 'Failed to load inventory status');
    }

    const byCode = new Map((data ?? []).map((m) => [m.code, m]));
    const result = codes.map((code) => {
      const m = byCode.get(code);
      if (!m) return { code, found: false, inStock: false, stock: 0, min: 0 };
      const stock: number = m.stock ?? 0;
      const min: number = m.min_stock ?? 0;
      return {
        code,
        found: true,
        inStock: stock > 0,
        lowStock: stock > 0 && stock <= min,
        stock,
        min
      };
    });

    return json({ data: result });
  } catch (err) {
    console.error('[Inventory Status API] Error:', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, 'Failed to load inventory status');
  }
};
