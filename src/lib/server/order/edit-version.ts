import { z } from 'zod';

const revision = z.string().max(64).datetime({ offset: true });

/** Strip the concurrency token before validating strict order fields. */
export function splitVersionedOrderPayload(value: unknown): {
  expectedUpdatedAt: string;
  form: Record<string, unknown>;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { expectedUpdatedAt, ...form } = value as Record<string, unknown>;
  const result = revision.safeParse(expectedUpdatedAt);
  return result.success ? { expectedUpdatedAt: result.data, form } : null;
}
