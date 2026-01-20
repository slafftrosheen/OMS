/**
 * Calculate pagination details based on page, limit, and total count
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  maxLimit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function calculatePagination(
  total: number,
  options: PaginationOptions = {}
): PaginationResult {
  const maxLimit = options.maxLimit || 100;
  const limit = Math.min(options.limit || 50, maxLimit);
  const page = Math.max(options.page || 1, 1);
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    offset,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Parse pagination parameters from URL search params
 */
export function parsePaginationFromUrl(url: URL): { page: number; limit: number } {
  const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '50'), 1),
    100
  );

  return { page, limit };
}

/**
 * Format paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationResult;
}

export function formatPaginatedResponse<T>(
  data: T[],
  pagination: PaginationResult
): PaginatedResponse<T> {
  return {
    data,
    pagination
  };
}