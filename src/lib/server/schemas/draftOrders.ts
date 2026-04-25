import { z } from 'zod';

export const draftOrderUpdateSchema = z.object({
  clientName: z.string().optional(),
  client: z.string().optional(),
  title: z.string().optional(),
  deadline: z.string().optional().nullable(),
  due: z.string().optional().nullable(),
  loadingDate: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  priority: z.string().optional(),
  deliveryAddress: z.string().optional().nullable(),
  deliveryContact: z.string().optional().nullable(),
  deliveryPhone: z.string().optional().nullable(),
  profiles: z.array(z.object({
    profileTemplateId: z.string().uuid().optional().nullable(),
    quantity: z.number().optional(),
    configuration: z.record(z.any()).optional(),
    notes: z.string().optional()
  })).optional(),
  newFileIds: z.array(z.string().uuid()).optional()
});

export const DraftOrderSchema = draftOrderUpdateSchema;
export const UpdateDraftOrderSchema = draftOrderUpdateSchema;
export const OrderProfileSchema = z.object({
  id: z.string().optional(),
  order_id: z.string().uuid(),
  profile_template_id: z.string().uuid().optional().nullable(),
  quantity: z.number().optional(),
  configuration: z.record(z.any()).optional(),
  notes: z.string().optional()
});
