import { z } from 'zod';

// Define the schema for a draft order
export const DraftOrderSchema = z.object({
  id: z.string().optional(), // Will be generated if not provided
  customer_name: z.string()
    .min(1, 'Customer name is required')
    .max(255, 'Customer name must be less than 255 characters'),
  customer_email: z.string()
    .email('Must be a valid email address')
    .max(255, 'Email must be less than 255 characters'),
  customer_phone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Must be a valid phone number')
    .max(20, 'Phone number must be less than 20 characters')
    .optional()
    .or(z.literal('')),
  status: z.enum(['draft', 'pending', 'confirmed', 'in_production', 'ready_for_pickup', 'delivered', 'cancelled'], {
    errorMap: () => ({ message: 'Status must be one of: draft, pending, confirmed, in_production, ready_for_pickup, delivered, cancelled' })
  }).default('draft'),
  order_date: z.string().datetime({ message: 'Order date must be a valid datetime' }),
  delivery_date: z.string().datetime({ message: 'Delivery date must be a valid datetime' }),
  special_instructions: z.string()
    .max(1000, 'Special instructions must be less than 1000 characters')
    .optional()
    .or(z.literal('')),
  total_amount: z.number()
    .min(0, 'Total amount must be a positive number'),
  currency: z.string()
    .length(3, 'Currency must be a 3-character code')
    .default('USD'),
  created_by: z.string().optional(), // Will be set from session
  updated_by: z.string().optional()  // Will be set from session
});

// Schema for updating a draft order (all fields optional)
export const UpdateDraftOrderSchema = DraftOrderSchema.partial();
export const draftOrderUpdateSchema = UpdateDraftOrderSchema;

// Schema for creating order profiles associated with a draft order
export const OrderProfileSchema = z.object({
  id: z.string().optional(),
  draft_order_id: z.string().uuid('Must be a valid UUID'),
  profile_data: z.record(z.unknown()).optional().default({}),
  quantity: z.number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(999999, 'Quantity must not exceed 999,999'),
  created_by: z.string().optional(),
  updated_by: z.string().optional()
});

// Schema for bulk operations
export const BulkOperationSchema = z.object({
  ids: z.array(z.string().uuid('Each ID must be a valid UUID')).min(1),
});

// Schema for filtering draft orders
export const DraftOrderFilterSchema = z.object({
  status: z.enum(['draft', 'pending', 'confirmed', 'in_production', 'ready_for_pickup', 'delivered', 'cancelled']).optional(),
  customer_name: z.string().optional(),
  customer_email: z.string().email().optional(),
  order_date_from: z.string().datetime().optional(),
  order_date_to: z.string().datetime().optional(),
  created_at_from: z.string().datetime().optional(),
  created_at_to: z.string().datetime().optional(),
  limit: z.number().int().positive().max(1000).default(50),
  offset: z.number().int().nonnegative().default(0),
});