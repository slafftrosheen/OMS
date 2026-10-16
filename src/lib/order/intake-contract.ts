/** OMS-R13: AI suggestions are untrusted evidence, never database writes.
 * Shared between the browser preview and the authenticated server.
 */
import { z } from 'zod';

export const INTAKE_FIELDS = [
  'clientName','title','deadline','loadingDate','priority','notes',
  'deliveryAddress','deliveryContact','deliveryPhone','deliveryEmail',
  'isRd','rdNotes'
] as const;
export type IntakeField = typeof INTAKE_FIELDS[number];
const fieldName = z.enum(INTAKE_FIELDS);
export const intakeProposalSchema = z.object({
  field: fieldName,
  value: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(2).max(500),
  confidence: z.enum(['high','medium','low'])
}).strict();
export const intakeProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(1000).nullable(),
  details: z.string().max(500)
}).strict();
export const intakeModelSchema = z.object({
  proposals: z.array(intakeProposalSchema).max(18),
  profileSuggestions: z.array(intakeProfileSchema).max(8),
  missing: z.array(z.string().trim().min(1).max(250)).max(12)
}).strict();
export type IntakeProposal = z.infer<typeof intakeProposalSchema>;
export type IntakeModel = z.infer<typeof intakeModelSchema>;
export type IntakeResponse = IntakeModel & {
  fileId: string | null;
  fileName: string | null;
  model: string;
  provenance: 'model-reported';
  evidenceVerified: boolean[];
};

const maxLengths: Partial<Record<IntakeField,number>> = {
  clientName:200,title:200,notes:2000,deliveryAddress:2000,
  deliveryContact:200,deliveryPhone:40,deliveryEmail:200,rdNotes:2000
};
function validDate(v:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().startsWith(v);
}
/** Invalid, guessed, or lifecycle-sensitive AI values are dropped.
 * Numbers cannot be written to profile config by this batch.
 */
export function normalizeIntakeProposals(raw:unknown):IntakeModel {
  const parsed=intakeModelSchema.parse(raw);
  const seen=new Set<IntakeField>();
  const proposals:IntakeProposal[]=[];
  for(const p of parsed.proposals){
    if(seen.has(p.field))continue;
    const value=p.value.trim();
    if(maxLengths[p.field] && value.length>maxLengths[p.field]!) continue;
    if((p.field==='deadline'||p.field==='loadingDate')&&!validDate(value))continue;
    if(p.field==='priority'&&!['LOW','NORMAL','HIGH','URGENT'].includes(value))continue;
    if(p.field==='isRd'&&!['true','false'].includes(value))continue;
    if(p.field==='deliveryEmail'&&!z.string().email().safeParse(value).success)continue;
    seen.add(p.field);
    proposals.push({...p,value});
  }
  return {...parsed,proposals};
}
/** A model suggestion that would not change an existing order field is not actionable.
 * Keep provider proposals read-only; callers use this only for human review UI.
 */
export function proposalMatchesCurrent(p:IntakeProposal,current:Record<string,unknown>):boolean {
  const existing=current[p.field];
  if(existing===null||existing===undefined)return false;
  return String(existing).trim()===p.value.trim();
}
export function proposalValue(p:IntakeProposal):string|boolean {
  return p.field==='isRd' ? p.value==='true' : p.value;
}
export function proposalsToPatch(selected:IntakeProposal[]):Record<IntakeField,unknown> {
  const patch={} as Record<IntakeField,unknown>;
  for(const p of normalizeIntakeProposals({
    proposals:selected,profileSuggestions:[],missing:[]
  }).proposals) patch[p.field]=proposalValue(p);
  return patch;
}

/** A schema compatible with OpenRouter's response_format: json_schema.
 * The client should always validate the response again with Zod.
 */
const shortString={type:'string'} as const;
export const INTAKE_JSON_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    proposals:{type:'array',items:{
      type:'object',additionalProperties:false,
      properties:{
        field:{type:'string',enum:[...INTAKE_FIELDS]},
        value:shortString,evidence:shortString,
        confidence:{type:'string',enum:['high','medium','low']}
      },
      required:['field','value','evidence','confidence']
    }},
    profileSuggestions:{type:'array',items:{
      type:'object',additionalProperties:false,
      properties:{
        name:shortString,quantity:{type:['integer','null']},details:shortString
      },required:['name','quantity','details']
    }},
    missing:{type:'array',items:shortString}
  },
  required:['proposals','profileSuggestions','missing']
} as const;
