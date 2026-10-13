/** OMS-R14: deterministic production-readiness evidence, never AI authority.
 * All comparisons use canonical order tables; ambiguous inventory links stay unknown.
 */
import { z } from 'zod';

export const PRODUCTION_STATIONS = [
  'CAD','CNC','EDGE','ASSEMBLY','PAINT','PACKAGING','DELIVERY'
] as const;
export const readinessSeverity = z.enum(['blocker','warning','information']);
export const stationSchema = z.enum(PRODUCTION_STATIONS);
export type ProductionStation = z.infer<typeof stationSchema>;

const uuid=z.string().uuid();
export const profileEvidenceSchema=z.object({
  id:uuid, templateId:uuid.nullable(), templateName:z.string().max(180).nullable(),
  templateCode:z.string().max(80).nullable(),
  quantity1:z.number().int().min(0),quantity2:z.number().int().min(0),
  quantity3:z.number().int().min(0),quantity4:z.number().int().min(0)
}).strict();
export const stockEvidenceSchema=z.object({
  orderMaterialId:uuid, materialType:z.string().max(180), unit:z.string().max(40),
  required:z.number().nonnegative().nullable(), inventoryId:uuid.nullable(),
  sku:z.string().max(120).nullable(), available:z.number().nonnegative().nullable(),
  minStock:z.number().nonnegative().nullable(),
  match:z.enum(['exact-code','exact-sku','unresolved','ambiguous']),
  status:z.enum(['sufficient','insufficient','unknown'])
}).strict();
export const readinessIssueSchema=z.object({
  code:z.string().max(70), severity:readinessSeverity,
  message:z.string().max(300)
}).strict();
export const readinessEvidenceSchema=z.object({
  orderId:uuid, status:z.string().max(50),
  updatedAt:z.string().nullable(),
  client:z.string().max(200), title:z.string().max(200), dueDate:z.string().nullable(),
  priority:z.string().max(20), notes:z.string().max(3500),
  profiles:z.array(profileEvidenceSchema).max(100),
  materials:z.array(stockEvidenceSchema).max(100),
  fileCount:z.number().int().min(0),
  stageCodes:z.array(stationSchema),
  inventoryChecked:z.boolean()
}).strict();
export type ReadinessEvidence=z.infer<typeof readinessEvidenceSchema>;
export type ReadinessIssue=z.infer<typeof readinessIssueSchema>;

export function safeCount(value:unknown):number {
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=0 ? Math.min(n,100000) : 0;
}
export function safeStock(value:unknown):number|null {
  const n=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;
  return Number.isFinite(n)&&n>=0?n:null;
}
function norm(value:unknown):string {
  return typeof value==='string'?value.trim().toUpperCase():'';
}
export interface StockRow {
  id:string;sku?:string|null;code?:string|null;stock?:unknown;min_stock?:unknown;
  unit?:string|null
}
export interface OrderMaterialRow {
  id:string;material_type?:string|null;quantity?:unknown;unit?:string|null;
}
/** Match only explicit SKU or code, never fuzzy names, colors or substrings.
 * One-to-many matches are never silently selected. Units must agree.
 */
export function reconcileOrderMaterials(
  orderMaterials:OrderMaterialRow[], inventory:StockRow[]
):ReadinessEvidence['materials']{
  return orderMaterials.slice(0,100).map(row=>{
    const materialType=String(row.material_type??'').slice(0,180);
    const code=norm(materialType);
    const matched=code?inventory.filter(item=>norm(item.sku)===code||norm(item.code)===code):[];
    const candidate=matched.length===1?matched[0]:null;
    const required=safeStock(row.quantity);
    const available=candidate?safeStock(candidate.stock):null;
    const minStock=candidate?safeStock(candidate.min_stock):null;
    const unit=String(row.unit??'').slice(0,40);
    const unitMatch=!!candidate&&norm(candidate.unit)===norm(unit);
    const status=candidate&&required!==null&&available!==null&&unitMatch
      ? available>=required?'sufficient':'insufficient':'unknown';
    return {
      orderMaterialId:row.id,materialType,unit,required,
      inventoryId:candidate?.id??null,sku:candidate?.sku??null,
      available,minStock,
      match:matched.length>1?'ambiguous':!candidate?'unresolved':
        norm(candidate.sku)===code?'exact-sku':'exact-code',
      status
    };
  });
}

export function deterministicReadiness(e:ReadinessEvidence):{
  issues:ReadinessIssue[]; state:'blocked'|'needs-review'|'checklist-clear';
}{
  const issues:ReadinessIssue[]=[];
  const add=(code:string,severity:ReadinessIssue['severity'],message:string)=>
    issues.push({code,severity,message});
  if(!e.client.trim())add('missing-client','blocker','Client is missing');
  if(!e.dueDate)add('missing-deadline','blocker','Delivery deadline is missing');
  if(!e.profiles.length)add('missing-profiles','blocker','No production profiles configured');
  for(const p of e.profiles){
    if(!p.templateId||!p.templateName)add('unresolved-profile','warning',
      'A production profile has no active, verified template');
    if(p.quantity1<1)add('invalid-quantity','blocker','A production profile has no primary quantity');
  }
  if(e.fileCount<1)add('missing-files','warning','No source attachment linked to this order');
  if(!e.inventoryChecked)add('inventory-unavailable','warning','Inventory status could not be verified');
  if(!e.materials.length)add('materials-unspecified','warning',
    'No order materials have been specified; stock readiness is unknown');
  for(const m of e.materials){
    if(m.status==='insufficient')add('stock-shortfall','blocker',
      `Insufficient stock for ${m.materialType} (required ${m.required} ${m.unit}, available ${m.available} ${m.unit})`);
    else if(m.status==='unknown')add('unverified-material','warning',
      `Cannot verify ${m.materialType || 'unnamed material'} against inventory SKU, unit and quantity`);
  }
  return {issues,state:issues.some(i=>i.severity==='blocker')?'blocked':
    issues.some(i=>i.severity==='warning')?'needs-review':'checklist-clear'};
}

export const modelReadinessSchema=z.object({
  summary:z.string().trim().max(1600),
  recommendations:z.array(z.object({
    station:stationSchema,why:z.string().trim().min(4).max(400),
    priority:z.enum(['normal','high'])
  }).strict()).max(7),
  questions:z.array(z.string().trim().min(4).max(300)).max(12),
  risks:z.array(z.string().trim().min(4).max(350)).max(12)
}).strict();
export type ModelReadiness=z.infer<typeof modelReadinessSchema>;
export const READINESS_JSON_SCHEMA={
  type:'object',additionalProperties:false,
  properties:{
    summary:{type:'string'},
    recommendations:{type:'array',items:{type:'object',additionalProperties:false,
      properties:{station:{type:'string',enum:[...PRODUCTION_STATIONS]},
        why:{type:'string'},priority:{type:'string',enum:['normal','high']}},
      required:['station','why','priority']}},
    questions:{type:'array',items:{type:'string'}},
    risks:{type:'array',items:{type:'string'}}
  },
  required:['summary','recommendations','questions','risks']
} as const;
export function parseReadinessModel(raw:unknown):ModelReadiness{
  const parsed=modelReadinessSchema.parse(raw);
  const used=new Set<ProductionStation>();
  return {...parsed,recommendations:parsed.recommendations.filter(r=>{
    if(used.has(r.station))return false;
    used.add(r.station);return true;
  })};
}
