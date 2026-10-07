/**
 * Order creation validation schema (shared "ali points" gate).
 *
 * The backend POST /api/draft-orders only enforces client + due_date + po length.
 * This client schema tightens the rules the UI is responsible for and lets us map
 * field-level errors back to inputs. Keep it aligned with the DB column constraints
 * in supabase/migrations/20260204000006_orders.sql and the POST handler.
 */

import { z } from 'zod';

// Dutch/EU-ish phone: digits, spaces, +, -, /, parentheses, 6-20 chars.
const phoneRegex = /^[+]?[\d\s().\-/]{6,20}$/;

export const orderProfileSchema = z.object({
  profileTemplateId: z.string().uuid().optional().nullable(),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(100, 'Quantity cannot exceed 100'),
  configuration: z.record(z.any()).optional()
});

export const createOrderSchema = z.object({
  clientName: z
    .string()
    .trim()
    .min(1, 'Client name is required')
    .max(200, 'Client name is too long'),
  deadline: z
    .string()
    .min(1, 'Deadline is required')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Deadline is not a valid date')
    .refine((v) => Date.parse(v) >= Date.now() - 24 * 3600 * 1000, 'Deadline cannot be in the past'),
  loadingDate: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Loading date is not a valid date'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  deliveryAddress: z.string().trim().optional().nullable(),
  deliveryContact: z.string().trim().max(200).optional().nullable(),
  deliveryPhone: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || phoneRegex.test(v), 'Invalid phone number'),
  notes: z.string().optional().nullable(),
  hasFiles: z.boolean(),
  selectedPresetId: z.union([z.string().uuid(), z.null()]).optional(),
  profiles: z.array(orderProfileSchema).optional()
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Validate the order form. Returns the parsed data or a flat map of
 * fieldName -> first error message (for inline display).
 */
export function validateOrderForm(values: unknown): {
  ok: boolean;
  data?: CreateOrderInput;
  errors: Record<string, string>;
} {
  const result = createOrderSchema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data, errors: {} };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
