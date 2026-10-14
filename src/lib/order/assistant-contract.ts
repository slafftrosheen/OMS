/** OMS-R27: pure order-assistant request/reply contract.
 * Provider content and history are untrusted; only staff can approve draft changes.
 */
import {z} from 'zod';
import {intakeProposalSchema,normalizeIntakeProposals,INTAKE_JSON_SCHEMA} from './intake-contract';

const version=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export const orderAssistantRequest=z.object({
 orderId:z.string().uuid(),
 consent:z.literal(true),
 question:z.string().trim().min(2).max(2500),
 mode:z.enum(['chat','propose']).default('chat'),
 language:z.string().max(20).optional(),
 expectedUpdatedAt:z.string().regex(version).refine(v=>Number.isFinite(Date.parse(v))).optional(),
 history:z.array(z.object({
   role:z.enum(['user','assistant']),
   content:z.string().trim().min(1).max(1600)
 }).strict()).max(8).default([])
}).strict();

export const assistantProposalReply=z.object({
 reply:z.string().trim().min(1).max(5000),
 proposals:z.array(intakeProposalSchema).max(12),
 missing:z.array(z.string().trim().min(1).max(250)).max(10)
}).strict();

export type OrderAssistantProposalReply=z.infer<typeof assistantProposalReply>;
export type OrderAssistantTurn={role:'user'|'assistant';content:string};

export function validateOrderAssistantSuggestions(raw:unknown):OrderAssistantProposalReply{
 const parsed=assistantProposalReply.parse(raw);
 const normalized=normalizeIntakeProposals({
   proposals:parsed.proposals,profileSuggestions:[],missing:parsed.missing
 });
 return {reply:parsed.reply,proposals:normalized.proposals,missing:normalized.missing};
}
export const ORDER_ASSISTANT_JSON_SCHEMA={
 type:'object',additionalProperties:false,
 properties:{
   reply:{type:'string'},
   proposals:INTAKE_JSON_SCHEMA.properties.proposals,
   missing:INTAKE_JSON_SCHEMA.properties.missing
 },
 required:['reply','proposals','missing']
} as const;
