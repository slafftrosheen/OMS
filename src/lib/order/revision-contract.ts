/** OMS-R15: AI comparison output is a proposal, not an order mutation.
 * Change-request diffs use only a small, auditable DB column allowlist.
 */
import { z } from 'zod';

export const REVISION_FIELDS = [
  'title','client','due_date','priority','notes','is_rd','rd_notes'
] as const;
export const revisionField=z.enum(REVISION_FIELDS);
export const revisionItem=z.object({
  field:revisionField,
  before:z.string().max(700),after:z.string().trim().min(1).max(2000),
  oldEvidence:z.string().trim().min(1).max(400),
  newEvidence:z.string().trim().min(1).max(400),
  confidence:z.enum(['high','medium','low'])
}).strict();
export const revisionModel=z.object({
  summary:z.string().trim().min(1).max(1000),
  changes:z.array(revisionItem).max(12),
  questions:z.array(z.string().trim().min(1).max(240)).max(12),
  risks:z.array(z.string().trim().min(1).max(250)).max(12)
}).strict();
export type RevisionModel=z.infer<typeof revisionModel>;
export type RevisionChange=z.infer<typeof revisionItem>;
export const REVISION_JSON_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    summary:{type:'string'},
    changes:{type:'array',items:{type:'object',additionalProperties:false,
      properties:{
        field:{type:'string',enum:[...REVISION_FIELDS]},
        before:{type:'string'},after:{type:'string'},
        oldEvidence:{type:'string'},newEvidence:{type:'string'},
        confidence:{type:'string',enum:['high','medium','low']}
      },
      required:['field','before','after','oldEvidence','newEvidence','confidence']
    }},
    questions:{type:'array',items:{type:'string'}},
    risks:{type:'array',items:{type:'string'}}
  },
  required:['summary','changes','questions','risks']
} as const;

export function revisionValue(field: typeof REVISION_FIELDS[number], raw:string):string|boolean|null{
  const value=raw.trim();
  if(!value)return null;
  if(field==='is_rd')return value==='true'?true:value==='false'?false:null;
  if(field==='due_date'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
    const d=new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(d.getTime())&&d.toISOString().startsWith(value)?value:null;
  }
  if(field==='priority')return ['LOW','NORMAL','HIGH','URGENT'].includes(value)?value:null;
  const max=field==='notes'?2000:field==='rd_notes'?2000:200;
  return value.length<=max?value:null;
}
export function parseRevisionModel(raw:unknown):RevisionModel {
  const parsed=revisionModel.parse(raw);
  const seen=new Set<string>();
  const changes=parsed.changes.filter(change=>{
    if(seen.has(change.field)||revisionValue(change.field,change.after)===null)return false;
    seen.add(change.field);
    return true;
  });
  return {...parsed,changes};
}
export function selectedRevisionDiff(changes:RevisionChange[]):Record<string,string|boolean>{
  const parsed=parseRevisionModel({summary:'Selected revisions',changes,questions:[],risks:[]});
  const result:Record<string,string|boolean>={};
  for(const c of parsed.changes){
    const value=revisionValue(c.field,c.after);
    if(value!==null)result[c.field]=value;
  }
  return result;
}
export const revisionEvidenceSchema=z.object({
  orderId:z.string().uuid(),
  baselineFileId:z.string().uuid(),
  revisedFileId:z.string().uuid(),
  baselineSha256:z.string().regex(/^[a-f0-9]{64}$/),
  revisedSha256:z.string().regex(/^[a-f0-9]{64}$/),
  orderUpdatedAt:z.string().min(10).max(80),
  summary:z.string().trim().min(1).max(1000),
  changes:z.array(revisionItem).min(1).max(7),
  consent:z.literal(true)
}).strict();
export function safeRevisionDescription(input:z.infer<typeof revisionEvidenceSchema>):string{
  const changed=input.changes.map(c=>c.field).join(', ');
  const clean=(text:string,limit:number)=>text.replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,limit);
  const excerpts=input.changes.map(c=>
    `${c.field}: original "${clean(c.oldEvidence,95)}"; revised "${clean(c.newEvidence,95)}"`);
  return [
    'AI-assisted customer file revision — staff selected fields',
    `Summary: ${clean(input.summary,650)}`,
    `Fields: ${changed}`,
    `Baseline file ID: ${input.baselineFileId}`,
    `Baseline SHA-256: ${input.baselineSha256}`,
    `Revised file ID: ${input.revisedFileId}`,
    `Revised SHA-256: ${input.revisedSha256}`,
    `Order revision at comparison: ${input.orderUpdatedAt}`,
    'Evidence excerpts reported by OpenRouter (not independently verified):',
    ...excerpts,
    'Human verification required before applying any approved change.'
  ].join('\n').slice(0,3600);
}
