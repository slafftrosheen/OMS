// src/lib/server/pagination.ts

export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

/**
 * Parse pagination parameters from URL
 * @param url - The request URL
 * @returns Object with page and limit
 */
export function parsePaginationFromUrl(url: URL): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Legacy function for backward compatibility
 */
export function getPagination(url: URL): PaginationParams {
  return parsePaginationFromUrl(url);
}

/**
 * Calculate pagination metadata
 * @param total - Total number of items
 * @param params - Optional pagination params (defaults to page 1, limit 50)
 * @returns Pagination information object
 */
export function calculatePagination(
  total: number,
  params: Partial<PaginationParams> = {}
): PaginationInfo {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Format a paginated response
 * @param data - Array of data items
 * @param pagination - Pagination information
 * @returns Formatted paginated response
 */
export function formatPaginatedResponse<T>(
  data: T[],
  pagination: PaginationInfo
): PaginatedResponse<T> {
  return {
    data,
    pagination
  };
}
