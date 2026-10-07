import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canonicalSearchEntityTypes, globalSearchResponse, globalSearchArgs, advancedSearchArgs, normalizeAdvancedFilters, searchRange, safeSearchQuery } from '$lib/server/api-contracts';

export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const query = safeSearchQuery(url.searchParams.get('q'));
  if (!query) return json({ results: [], query: '', count: 0 });
  const types = canonicalSearchEntityTypes(url.searchParams.get('types'));
  const { limit } = searchRange(Number.parseInt(url.searchParams.get('limit') ?? '50', 10), 0);

  const { data, error: searchError } = await locals.supabase.rpc('global_search', globalSearchArgs(query, limit));
  if (searchError) {
    console.error('Global search error:', searchError);
    throw error(500, 'Search failed');
  }

  const rows = (data ?? []).filter((row: any) => {
    const kind = row.kind === 'order' ? 'orders' : row.kind === 'profile' ? 'users' : row.kind === 'material' ? 'materials' : row.kind;
    return types.includes(kind);
  });
  try {
    await locals.supabase.from('search_history').insert({ user_id: session.user.id, query, results_count: rows.length, filters: { entityTypes: types } });
  } catch (err) { console.warn('Failed to log global search history:', err); }
  return json(globalSearchResponse(rows, query));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid request body');
  const query = safeSearchQuery(body.query);
  const { limit, offset } = searchRange(body.limit, body.offset);
  const filters = normalizeAdvancedFilters(body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters) ? body.filters : {});
  if (!query) return json({ data: [], count: 0, limit, offset, query: '' });

  const { data, error: searchError } = await locals.supabase.rpc('search_orders_advanced', advancedSearchArgs(query, filters, limit, offset));
  if (searchError) {
    console.error('Advanced search error:', searchError);
    throw error(500, 'Search failed');
  }
  try {
    await locals.supabase.from('search_history').insert({ user_id: session.user.id, query, filters, results_count: data?.length ?? 0 });
  } catch (err) { console.warn('Failed to log advanced search history:', err); }
  return json({ data: data ?? [], count: data?.length ?? 0, limit, offset, query });
};
