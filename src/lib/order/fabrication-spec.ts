/** OMS-R30: versioned human-entered manufacturing specification.
 * Measurements use millimetres; never infer dimensions from legacy free text.
 * This is order evidence, NOT a machine instruction, stock allocation or quote.
 */
export const FABRICATION_METHODS=['unspecified','laser','cnc-router','bending','hand','other'] as const;
export const ILLUMINATION=['unspecified','none','front','halo','edge','other'] as const;
export const MOUNTING=['unspecified','wall','frame','suspended','freestanding','other'] as const;
export const EXPOSURE=['unspecified','interior','exterior','sheltered'] as const;
export type FabricationMethod=typeof FABRICATION_METHODS[number];
export type Illumination=typeof ILLUMINATION[number];
export type Mounting=typeof MOUNTING[number];
export type Exposure=typeof EXPOSURE[number];
export type FabricationSpec={
 version:1;
 width_mm?:number;height_mm?:number;depth_mm?:number;thickness_mm?:number;
 method?:FabricationMethod;illumination?:Illumination;
 mounting?:Mounting;exposure?:Exposure;
 material_note?:string;finish_note?:string;installation_note?:string;
};
export const FAB_SPEC_FIELD_LIMITS={
 width_mm:100000,height_mm:100000,depth_mm:10000,thickness_mm:1000
} as const;
const dimensional=Object.keys(FAB_SPEC_FIELD_LIMITS) as (keyof typeof FAB_SPEC_FIELD_LIMITS)[];
const enums={
 method:FABRICATION_METHODS,illumination:ILLUMINATION,
 mounting:MOUNTING,exposure:EXPOSURE
} as const;
const textFields=['material_note','finish_note','installation_note'] as const;
const isRecord=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export type SpecIssue={key:string;type:'invalid'|'incomplete';message:string};
export function parseFabricationSpec(value:unknown):{
 spec:FabricationSpec|null;issues:SpecIssue[];
}{
 if(value===undefined||value===null)return {spec:null,issues:[]};
 if(!isRecord(value))return {spec:null,issues:[{key:'fabricationSpec',type:'invalid',message:'Must be an object'}]};
 const issues:SpecIssue[]=[];
 const report=(key:string,message:string)=>issues.push({key,type:'invalid',message});
 const allowed=new Set(['version',...dimensional,...Object.keys(enums),...textFields]);
 for(const key of Object.keys(value))if(!allowed.has(key))report(key,'Unsupported fabrication specification field');
 if(value.version!==1)report('version','Unsupported fabrication specification version');
 const spec:FabricationSpec={version:1};
 for(const key of dimensional){
   const n=value[key];
   if(n===undefined||n===null)continue;
   if(typeof n!=='number'||!Number.isFinite(n)||n<=0||
      n>FAB_SPEC_FIELD_LIMITS[key]||Math.round(n*1000)/1000!==n){
     report(key,'Explicit positive millimetres required, up to three decimal places');
   }else spec[key]=n;
 }
 for(const key of Object.keys(enums) as (keyof typeof enums)[]){
   const valueOfKey=value[key];
   if(valueOfKey===undefined)continue;
   if(typeof valueOfKey!=='string'||!(enums[key] as readonly string[]).includes(valueOfKey))
     report(key,'Unsupported production choice');
   else {
     // The value is validated against the options for this exact key.
     Object.assign(spec,{[key]:valueOfKey});
   }
 }
 for(const key of textFields){
   const text=value[key];
   if(text===undefined)continue;
   if(typeof text!=='string'||text.length>800)report(key,'Maximum 800 characters');
   else spec[key]=text;
 }
 if((spec.width_mm===undefined)!==(spec.height_mm===undefined)){
   issues.push({key:'dimensions',type:'incomplete',
     message:'Both width and height are required for a reliable bounding area'});
 }
 return {spec:issues.some(x=>x.type==='invalid')?null:spec,issues};
}
export function validateProfileFabrication(configuration:unknown):SpecIssue[]{
 if(!isRecord(configuration))return [];
 return parseFabricationSpec(configuration.fabricationSpec).issues;
}
export function updateFabricationSpec(
 current:unknown,key:keyof FabricationSpec,value:string
):FabricationSpec{
 const parsed=parseFabricationSpec(current);
 if(parsed.issues.some(i=>i.type==='invalid'))
   throw new Error('Correct the invalid specification or clear it first');
 const old=parsed.spec??{version:1 as const};
 const next={...old} as Record<string,unknown>;
 if(key==='version')return old;
 if((dimensional as string[]).includes(key)){
   if(value.trim()==='')delete next[key];
   else {
     const numeric=Number(value);
     if(!Number.isFinite(numeric)||numeric<=0)throw Error('Enter a positive measurement');
     next[key]=numeric;
   }
 }else if((textFields as readonly string[]).includes(key)||
   Object.keys(enums).includes(key)){
   next[key]=value;
 }else throw Error('Unknown fabrication specification field');
 const result=parseFabricationSpec(next);
 if(result.issues.some(x=>x.type==='invalid')||!result.spec)
   throw Error(result.issues.find(x=>x.type==='invalid')?.message??'Invalid specification');
 return result.spec;
}
