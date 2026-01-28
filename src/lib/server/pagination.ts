// src/lib/server/pagination.ts
export function getPagination(url: URL) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}