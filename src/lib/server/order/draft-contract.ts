import { z } from 'zod';
import {validateProfileFabrication} from '$lib/order/fabrication-spec';

const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const nullableText = (max: number) => z.string().max(max).nullable().optional();
const profile = z.object({
  profileTemplateId: z.string().uuid().nullable().optional(),
  profile_template_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  quantity1: z.number().int().min(0).max(1000).optional(),
  quantity2: z.number().int().min(0).max(1000).optional(),
  quantity3: z.number().int().min(0).max(1000).optional(),
  quantity4: z.number().int().min(0).max(1000).optional(),
  configuration: z.record(z.unknown()).optional().superRefine((configuration,ctx)=>{
    for(const issue of validateProfileFabrication(configuration)){
      if(issue.type==='invalid')ctx.addIssue({
        code:z.ZodIssueCode.custom,path:['fabricationSpec',issue.key],
        message:issue.message
      });
    }
  }),
  notes: z.string().max(4000).optional()
}).strict().refine(p => (p.quantity ?? p.quantity1 ?? 1) >= 1, 'Primary profile quantity required');

export const orderFields = z.object({
  clientName: z.string().trim().min(1).max(200).optional(),
  client: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200).optional(),
  deadline: optionalDate,
  due: optionalDate,
  due_date: optionalDate,
  loadingDate: optionalDate,
  priority: z.enum(['LOW','NORMAL','HIGH','URGENT']).optional(),
  notes: nullableText(20_000),
  deliveryPresetId: z.string().uuid().nullable().optional(),
  deliveryAddress: nullableText(2000),
  deliveryContact: nullableText(200),
  deliveryPhone: nullableText(40),
  deliveryEmail: z.string().email().max(200).nullable().optional(),
  profiles: z.array(profile).max(100).optional(),
  isRd: z.boolean().optional(),
  rdNotes: nullableText(8000),
  badges: z.record(z.unknown()).optional(),
  status: z.enum(['DRAFT','PENDING_REVIEW']).optional()
}).strict();

export type OrderForm = z.infer<typeof orderFields>;
export function canonicalDraftFields(value: OrderForm, creating: boolean) {
  const client = value.clientName ?? value.client;
  const due = value.deadline ?? value.due ?? value.due_date;
  if (creating && (!client || !due)) throw new Error('Client and deadline are required');
  const fields: Record<string, unknown> = {};
  if (client !== undefined) fields.client = client;
  if (due !== undefined) fields.due_date = due;
  if (value.title !== undefined) fields.title = value.title;
  if (value.loadingDate !== undefined) fields.loading_date = value.loadingDate;
  if (value.priority !== undefined) fields.priority = value.priority;
  if (value.notes !== undefined) fields.notes = value.notes;
  if (value.deliveryPresetId !== undefined) fields.delivery_preset_id = value.deliveryPresetId;
  if (value.deliveryAddress !== undefined) fields.delivery_address = value.deliveryAddress;
  if (value.deliveryContact !== undefined) fields.delivery_contact = value.deliveryContact;
  if (value.deliveryPhone !== undefined) fields.delivery_phone = value.deliveryPhone;
  if (value.deliveryEmail !== undefined) fields.delivery_email = value.deliveryEmail;
  if (value.isRd !== undefined) fields.is_rd = value.isRd;
  if (value.rdNotes !== undefined) fields.rd_notes = value.rdNotes;
  if (value.badges !== undefined) fields.badges = value.badges;
  return fields;
}
export function canonicalOrderProfiles(profiles: OrderForm['profiles']) {
  return profiles?.map((p, index) => ({
    profile_template_id: p.profileTemplateId ?? p.profile_template_id ?? null,
    quantity1: p.quantity ?? p.quantity1 ?? 1,
    quantity2: p.quantity2 ?? 0,
    quantity3: p.quantity3 ?? 0,
    quantity4: p.quantity4 ?? 0,
    configuration: p.configuration ?? {},
    notes: p.notes ?? '',
    order_index: index
  })) ?? [];
}
export const DRAFT_EDIT_STATUSES = new Set(['DRAFT','draft','PENDING_REVIEW']);
export function canEditDraft(role: string | null | undefined, owner: string | null,
  actor: string, status: string) {
  return DRAFT_EDIT_STATUSES.has(status) && (
    ['RD','Boss','HeadOfProduction'].includes(role ?? '') || owner === actor
  );
}
export function canEditConfirmedMetadata(role: string | null | undefined) {
  return ['RD','Boss','HeadOfProduction'].includes(role ?? '');
}
export function canManageOrderFile(role: string | null | undefined, owner: string | null,
  actor: string, status: string) {
  return DRAFT_EDIT_STATUSES.has(status) ? canEditDraft(role, owner, actor, status)
    : canEditConfirmedMetadata(role) &&
      ['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(status);
}
