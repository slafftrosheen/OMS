/** Source facts are untrusted. Only the server resolves catalog identities;
 * only individually reviewed facts may reach the local native form. */
import {z} from 'zod';
import {INTAKE_JSON_SCHEMA, intakeModelSchema, type IntakeProposal, type IntakeField} from './intake-contract';
import {filterProfileMaterials,isProfilePrintMaterial} from '$lib/profiles/material-roles';
import type {CatalogMaterial} from '$lib/profiles/material-catalog';
import {readFaceMaterials, withFaceMaterials} from '$lib/profiles/face-materials';
import {applyPaintMaterialSelection} from '$lib/profiles/helpers';

export const PRODUCTION_TARGETS=[
  'faceMaterial','backMaterial','sidesMaterial','frameMaterial',
  'faceFilm','backFilm','sidesFilm','ledModule','psuModel','cableType',
  'facePaint','backPaint','sidesPaint','framePaint',
  'depth','faceThickness','backThickness','sidesThickness','width','height',
  'facePrint','backPrint','sidesPrint','signType','psuType','psuMounting',
  'cableLength','quantity','ledSpec','psuSpec','cableSpec','frameSpec',
  'productionNotes','customerReference','clientAddress'
] as const;
export const productionFactSchema=z.object({
  target:z.enum(PRODUCTION_TARGETS),value:z.string().trim().min(1).max(500),
  evidence:z.string().trim().min(2).max(500),page:z.number().int().min(1).max(1000).nullable(),
  part:z.string().trim().max(120).nullable(),confidence:z.enum(['high','medium','low'])
}).strict();
export type ProductionFact=z.infer<typeof productionFactSchema>;
export const productionIntakeSchema=intakeModelSchema.extend({
  production:z.array(productionFactSchema).max(50).default([])
});
export const PRODUCTION_INTAKE_JSON_SCHEMA={
  ...INTAKE_JSON_SCHEMA,
  properties:{...INTAKE_JSON_SCHEMA.properties,production:{type:'array',maxItems:50,items:{
    type:'object',additionalProperties:false,
    properties:{target:{type:'string',enum:[...PRODUCTION_TARGETS]},
      value:{type:'string'},evidence:{type:'string'},page:{type:['integer','null']},
      part:{type:['string','null']},confidence:{type:'string',enum:['high','medium','low']}},
    required:['target','value','evidence','page','part','confidence']
  }}},required:[...INTAKE_JSON_SCHEMA.required,'production']
};
export type IntakeMaterial=Omit<CatalogMaterial,'id'> & {id:string|number};
export type ProductionReview=ProductionFact & {
  status:'ready'|'unresolved';
  reason:'exact-match'|'source-value'|'no-exact-match'|'ambiguous-match'|'conflicting-values'|'invalid-value';
  material:IntakeMaterial|null;
};
export function sameIntakeMaterial(a:IntakeMaterial|null,b:IntakeMaterial|null):boolean{
  const snapshot=(m:IntakeMaterial|null)=>m?{
    id:m.id,code:m.code,category:m.category,name_en:m.name_en,
    name_ru:m.name_ru??null,name_lv:m.name_lv??null,
    thickness_options:m.thickness_options??null,metadata:m.metadata??{}
  }:null;
  return JSON.stringify(snapshot(a))===JSON.stringify(snapshot(b));
}
type RecordValue=Record<string,any>;
const record=(v:unknown):RecordValue=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v:{};
const key=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').toLowerCase().trim().replace(/[\s_-]+/g,' '):'';
const materialTargets=new Set<string>(['faceMaterial','backMaterial','sidesMaterial','frameMaterial',
  'faceFilm','backFilm','sidesFilm','ledModule','psuModel','cableType','facePaint','backPaint','sidesPaint','framePaint']);
export function isOrderProductionFact(f:ProductionFact){
  return f.target==='customerReference'||f.target==='clientAddress';
}
/** Read the same native keys that application changes for the review preview. */
export function productionCurrentValue(f:ProductionFact,current:RecordValue,index:number|null):string{
  if(isOrderProductionFact(f))return String(current.notes??'');
  const profile=index===null?{}:record(current.profiles?.[index]);
  const config=record(profile.configuration);
  const paths:Record<string,[string,string]>={
    faceMaterial:['CNC_FREZER','face'],backMaterial:['CNC_FREZER','back'],sidesMaterial:['BENDER','sides'],
    frameMaterial:['ASSEMBLING','frameMaterial'],depth:['BENDER','depth'],
    faceThickness:['CNC_FREZER','faceThickness'],backThickness:['CNC_FREZER','backThickness'],sidesThickness:['BENDER','sidesThickness'],
    faceFilm:['FRONT','faceFilm'],backFilm:['FRONT','backFilm'],sidesFilm:['FRONT','sidesFilm'],
    facePrint:['FRONT','facePrint'],backPrint:['FRONT','backPrint'],sidesPrint:['FRONT','sidesPrint'],
    ledModule:['ASSEMBLING','ledModule'],psuModel:['ASSEMBLING','psuModel'],cableType:['ASSEMBLING','cableType'],
    cableLength:['ASSEMBLING','cablesLength'],psuType:['ASSEMBLING','psuType'],psuMounting:['ASSEMBLING','psuMounting']
  };
  let value:unknown;
  if(f.target==='faceMaterial'||f.target==='faceThickness'){
    const rows=readFaceMaterials(config.CNC_FREZER);
    value=rows.map(row=>f.target==='faceMaterial'?row.value:row.thickness).filter(Boolean).join(', ');
  }else if(f.target==='signType')value=config.signType;
  else if(f.target==='quantity')value=profile.quantity??profile.quantity1;
  else if(f.target.endsWith('Paint'))value=record(config.PAINTING)[f.target.replace('Paint','')+'Color']?.code;
  else if(paths[f.target]){const [section,field]=paths[f.target];value=record(config[section])[field];}
  else value=record(config[f.target==='width'||f.target==='height'?'CNC_FREZER':'ASSEMBLING']).notes;
  return value===null||value===undefined?'':String(value);
}
function candidates(target:ProductionFact['target'],catalog:IntakeMaterial[]):IntakeMaterial[]{
  const roles={faceMaterial:'face',backMaterial:'back',sidesMaterial:'sides',frameMaterial:'frame',cableType:'mainCable'} as const;
  if(target in roles) return filterProfileMaterials(catalog as CatalogMaterial[],roles[target as keyof typeof roles]) as IntakeMaterial[];
  const categories=target.endsWith('Paint')?['PAINT_RAL','PAINT_PANTONE']:target.endsWith('Film')?['VINYL_ORACAL']:target==='ledModule'
    ?['LED_MODULE','LED_STRIP','LED_NEON']:target==='psuModel'?['PSU_MEANWELL']:[];
  return catalog.filter(m=>categories.includes(m.category));
}
/** No fuzzy ranking or color/voltage equivalence. Only complete recorded
 * identities (or explicit catalog aliases) count as a match. */
export function reviewProductionFacts(raw:unknown[],catalog:IntakeMaterial[]):ProductionReview[]{
  const facts=z.array(productionFactSchema).max(50).parse(raw);
  return facts.map(f=>{
    const review:ProductionReview={...f,status:'ready',reason:'source-value',material:null};
    if(facts.some(other=>other.target===f.target && key(other.value)!==key(f.value)))
      return {...review,status:'unresolved',reason:'conflicting-values'};
    if(materialTargets.has(f.target)){
      const matches=candidates(f.target,catalog).filter(m=>{
        const meta=m.metadata??{};
        const identities=[m.code,m.name_en,m.name_ru,m.name_lv,meta.model,meta.manufacturer_part_number,
          ...(Array.isArray(meta.intake_aliases)?meta.intake_aliases:[])];
        return identities.some(id=>key(id)!==''&&key(id)===key(f.value));
      });
      if(matches.length!==1) return {...review,status:'unresolved',
        reason:matches.length?'ambiguous-match':'no-exact-match'};
      return {...review,reason:'exact-match',material:matches[0]};
    }
    if(!normalizedValue(f))return {...review,status:'unresolved',reason:'invalid-value'};
    return review;
  });
}
function millimeters(value:string):number|null{
  const match=/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i.exec(value);
  if(!match)return null;
  const number=Number(match[1].replace(',','.'))*({mm:1,cm:10,m:1000}[match[2].toLowerCase()]??0);
  return Number.isFinite(number)&&number>0&&number<=100000?Math.round(number*1000)/1000:null;
}
function normalizedValue(f:ProductionFact):string|number|boolean|null{
  if(['depth','faceThickness','backThickness','sidesThickness','width','height','cableLength'].includes(f.target))
    return millimeters(f.value);
  if(f.target==='quantity'){
    const m=/^(\d+)\s*(?:pcs|pieces)?$/i.exec(f.value);
    return m&&Number(m[1])>0&&Number(m[1])<=1000?Number(m[1]):null;
  }
  if(f.target.endsWith('Print'))return ['true','false'].includes(f.value)?f.value:null;
  if(f.target==='signType')return ['INTERIOR','EXTERIOR'].includes(f.value)?f.value:null;
  if(f.target==='psuType')return ['regular','dimmable'].includes(f.value)?f.value:null;
  if(f.target==='customerReference' && /^(?:PO[- ]*)?(?:x+|tbd|unknown|n\/?a)$/i.test(f.value))return null;
  return f.value;
}
function append(values:RecordValue,field:string,line:string){
  const old=typeof values[field]==='string'?values[field]:'';
  if(!old.split('\n').includes(line))values[field]=old?`${old}\n${line}`:line;
  if(values[field].length>4000)throw new Error('Notes exceed the form limit');
}
function set(values:RecordValue,field:string,value:unknown,replace:boolean){
  const old=values[field];
  if(old!==undefined&&old!==null&&old!==''&&old!==value&&!replace)
    throw new Error('Existing values require replacement acknowledgment');
  values[field]=value;
}
/** All-or-nothing local merge. Never persists; unchanged baseline is mandatory. */
export function applyProductionFacts<T extends RecordValue>(
  current:T[],baseline:T[],index:number,selected:ProductionReview[],replace:boolean,catalog?:IntakeMaterial[]
):T[]{
  if(JSON.stringify(current)!==JSON.stringify(baseline))throw new Error('Profiles changed during review');
  if(!Number.isInteger(index)||!current[index])throw new Error('Choose a saved profile');
  if(selected.some(f=>f.status!=='ready'||isOrderProductionFact(f)))throw new Error('Unresolved production choices');
  // Persisted profile configuration is JSON. Svelte proxies cannot be passed
  // to structuredClone; serialize the same contract used by Save Draft.
  const next=JSON.parse(JSON.stringify(current)) as T[],profile=next[index] as RecordValue;
  const config=profile.configuration=record(profile.configuration);
  const section=(name:string)=>config[name]=record(config[name]);
  const write=(name:string,field:string,value:unknown)=>set(section(name),field,value,replace);
  const notes=(name:string,line:string)=>append(section(name),'notes',line);
  // Material selection happens before thickness regardless of checkbox order.
  for(const f of selected.filter(f=>materialTargets.has(f.target))){
    const m=f.material;
    if(!m || !m.id || !m.code || !candidates(f.target,[m]).length)throw new Error('Invalid catalog choice');
    const target=f.target;
    if(target.endsWith('Paint')){
      const part=target.replace('Paint','');
      const color=applyPaintMaterialSelection({value:m.code,hex:m.metadata?.hex??'',material:m});
      const values=section('PAINTING');
      if(JSON.stringify(values[part+'Color']??{})!==JSON.stringify(color)){
        const old=record(values[part+'Color']);
        if((old.code||old.hex)&&!replace)throw new Error('Existing paint requires acknowledgment');
        values[part+'Color']=color;
      }
      write('PAINTING',part,true);
      values[part+'MaterialId']=m.id;
    }else if(target==='faceMaterial'){
      const cnc=section('CNC_FREZER'),rows=readFaceMaterials(cnc);
      if(rows.some(r=>r.value && r.value!==m.code)&&!replace)throw new Error('Existing face requires acknowledgment');
      if(rows.filter(r=>r.value).length>1)throw new Error('Edit multiple face materials in the native form');
      const old=rows[0]??{id:'face-material-1',value:''};
      Object.assign(cnc,withFaceMaterials(cnc,[{...old,value:m.code,materialId:m.id,
        category:m.category,hex:m.metadata?.hex??'',shortName:m.name_en,
        process:isProfilePrintMaterial(m.category)?'3D_PRINT':undefined,
        thickness:old.value===m.code?old.thickness:'',thicknessOptions:m.thickness_options}]));
    }else{
      const mapping:Record<string,[string,string,string?]>={
        backMaterial:['CNC_FREZER','back'],sidesMaterial:['BENDER','sides'],frameMaterial:['ASSEMBLING','frameMaterial','frame'],
        faceFilm:['FRONT','faceFilm','face'],backFilm:['FRONT','backFilm','back'],sidesFilm:['FRONT','sidesFilm','sides'],
        ledModule:['ASSEMBLING','ledModule','led'],psuModel:['ASSEMBLING','psuModel','psu'],cableType:['ASSEMBLING','cableType','cables']
      };
      const [name,field,toggle]=mapping[target];
      write(name,field,m.code);
      // Enabling an explicitly disabled production step is also a replacement.
      if(toggle)write(name,toggle,true);
      const values=section(name);
      values[field+'MaterialId']=m.id;
      values[field+'Category']=m.category;
      values[field+'Short']=m.name_en;
      if(m.metadata?.hex)values[field+'Hex']=m.metadata.hex;
      if(target==='backMaterial'||target==='sidesMaterial'){
        if(target==='backMaterial')values.backProcess=isProfilePrintMaterial(m.category)?'3D_PRINT':undefined;
        values[field+'ThicknessOptions']=m.thickness_options;
        if(current[index].configuration?.[name]?.[field]!==m.code)values[field+'Thickness']='';
      }
      if(target==='frameMaterial'){
        values.frameThicknessOptions=m.thickness_options;
        if(current[index].configuration?.ASSEMBLING?.frameMaterial!==m.code)values.frameThickness='';
      }
    }
  }
  for(const f of selected.filter(f=>!materialTargets.has(f.target))){
    const value=normalizedValue(f);
    if(value===null)throw new Error('Invalid production value');
    if(f.target==='depth')write('BENDER','depth',value);
    else if(f.target==='signType')set(config,'signType',value,replace);
    else if(f.target==='quantity'){
      set(profile,'quantity',value,replace);
      if('quantity1' in profile)set(profile,'quantity1',value,replace);
    }
    else if(f.target.endsWith('Thickness')){
      const part=f.target.replace('Thickness',''),name=part==='sides'?'BENDER':'CNC_FREZER';
      const values=section(name);
      const materialFor=(code:string,id:unknown)=>{
        const target=(part+'Material') as ProductionFact['target'];
        const approved=selected.find(p=>p.target===target)?.material;
        const matches=approved?[approved]:candidates(target,catalog??[])
          .filter(m=>m.code===code&&(!id||m.id===id));
        if(matches.length!==1||!matches[0].thickness_options?.includes(Number(value)))
          throw new Error('Thickness is not a current catalog option for this material');
        return matches[0];
      };
      if(part==='face'){
        const rows=readFaceMaterials(values);
        if(rows.length!==1||!rows[0].value)throw new Error('Thickness needs one exact catalog material');
        const material=materialFor(rows[0].value,rows[0].materialId);
        rows[0].thicknessOptions=material.thickness_options;
        set(rows[0],'thickness',`${value}mm`,replace);
        Object.assign(values,withFaceMaterials(values,rows));
      }else{
        if(!values[part])throw new Error('Select the material before thickness');
        const material=materialFor(values[part],values[part+'MaterialId']);
        values[part+'ThicknessOptions']=material.thickness_options;
        write(name,f.target,`${value}mm`);
      }
    }else if(f.target.endsWith('Print')){
      if(value==='true')write('FRONT',f.target.replace('Print',''),true);
      write('FRONT',f.target,value==='true');
    }else if(f.target==='cableLength')write('ASSEMBLING','cablesLength',`${Number(value)/1000}m`);
    else if(f.target==='psuType'||f.target==='psuMounting')write('ASSEMBLING',f.target,value);
    else if(f.target==='width'||f.target==='height')notes('CNC_FREZER',`${f.target}: ${value}mm${f.part?` (${f.part})`:''}`);
    else notes('ASSEMBLING',`${f.target}: ${f.value}${f.part?` (${f.part})`:''}`);
  }
  return next;
}
/** Native files require an administrator-configured PDF-capable model. */
export function resolveIntakePdfEngine(ocr:boolean,native:boolean,paid:boolean,model:string){
  if(ocr&&native)throw new Error('Choose one PDF engine');
  if(ocr){if(!paid)throw new Error('Paid OCR is disabled');return 'mistral-ocr';}
  if(native){if(!model.trim())throw new Error('Native PDF model is not configured');return 'native';}
  return 'cloudflare-ai';
}
export function appendOrderProductionFacts(notes:string,facts:ProductionReview[]):string{
  const values={notes};
  for(const f of facts){
    if(!isOrderProductionFact(f)||f.status!=='ready')throw new Error('Invalid order reference');
    append(values,'notes',`${f.target}: ${f.value}`);
  }
  return values.notes;
}

export function findOrderIntakeConflicts(proposals:IntakeProposal[]):Array<{field:IntakeField;alternatives:IntakeProposal[]}>{
  const groups=new Map<IntakeField,IntakeProposal[]>();
  for(const proposal of proposals)groups.set(proposal.field,[...(groups.get(proposal.field)??[]),proposal]);
  return [...groups].filter(([,items])=>new Set(items.map(p=>p.value.trim())).size>1)
    .map(([field,alternatives])=>({field,alternatives}));
}
