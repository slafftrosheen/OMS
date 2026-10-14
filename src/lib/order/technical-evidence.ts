/** OMS-R29 — deterministic technical evidence for order assistance.
 * Never infer dimensional units from free text, Canvas pixels or profile names.
 * Areas are rectangular bounding faces, NOT cutting sheets, stock or quotations.
 */
export type TechnicalProfile={
  quantity1:unknown;configuration:unknown;name?:string|null;
};
export type TechnicalMaterial={
  material_type:unknown;quantity:unknown;unit:unknown;
};
export type TechnicalIssueCode=
  'NO_PROFILES'|'PROFILE_QUANTITY'|'PROFILE_TEMPLATE'|'DIMENSIONS_UNVERIFIED'|
  'MATERIALS_UNSPECIFIED'|'MATERIAL_QUANTITY'|'MATERIAL_UNIT'|
  'MATERIAL_MIXED_UNITS'|'STOCK_UNVERIFIED'|'FILES_UNVERIFIED';
export type TechnicalIssue={
  code:TechnicalIssueCode;severity:'review'|'info';
  profileIndex?:number;materialIndex?:number;subject?:string;
};
export type TechnicalGeometry={
  profileIndex:number;quantity:number;widthMm:number;heightMm:number;
  boundingAreaM2:number;source:'width_mm/height_mm'|'dimensions.mm';
};
export type TechnicalMaterialLine={
  materialIndex:number;description:string;quantity:number|null;unit:string|null;
};
export type OrderTechnicalChecks={
  kind:'deterministic-technical-evidence';
  primaryUnits:number|null;profileCount:number;
  materialCount:number;fileCount:number;
  boundingFaceAreaM2:number|null;
  measuredProfiles:number;geometries:TechnicalGeometry[];
  materialLines:TechnicalMaterialLine[];issues:TechnicalIssue[];
  sourceLimitReached:boolean;inventoryVerified:false;fileContentsVerified:false;
  feasibilityVerified:false;materialYieldEstimated:false;
};
const finitePositive=(v:unknown,maximum=1e6):number|null=>{
  if(typeof v!=='number'&&!(typeof v==='string'&&v.trim()&&/^\d+(?:\.\d+)?$/.test(v.trim())))return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>0&&n<=maximum?n:null;
};
function quantity(v:unknown):number|null{
  const n=finitePositive(v,1000);
  return n!==null&&Number.isSafeInteger(n)?n:null;
}
function geometry(value:unknown):Omit<TechnicalGeometry,'profileIndex'|'quantity'|'boundingAreaM2'>|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const cfg=value as Record<string,unknown>;
  let width=finitePositive(cfg.width_mm,100000),height=finitePositive(cfg.height_mm,100000);
  let source:'width_mm/height_mm'|'dimensions.mm'='width_mm/height_mm';
  if(width===null||height===null){
    const dims=cfg.dimensions;
    if(!dims||typeof dims!=='object'||Array.isArray(dims))return null;
    const d=dims as Record<string,unknown>;
    if(d.unit!=='mm')return null;
    width=finitePositive(d.width,100000);height=finitePositive(d.height,100000);
    source='dimensions.mm';
  }
  return width!==null&&height!==null?{widthMm:width,heightMm:height,source}:null;
}
const rounded=(n:number)=>Math.round((n+Number.EPSILON)*1e6)/1e6;
export function buildOrderTechnicalChecks(
 profiles:TechnicalProfile[],materials:TechnicalMaterial[],fileCount:number,
 options:{sourceLimitReached?:boolean}={}
):OrderTechnicalChecks{
 if(!Number.isSafeInteger(fileCount)||fileCount<0||
   profiles.length>100||materials.length>100)
   throw new Error('Incomplete or invalid technical evidence snapshot');
 const issues:TechnicalIssue[]=[];
 const add=(code:TechnicalIssueCode,severity:TechnicalIssue['severity'],
   extras:Omit<TechnicalIssue,'code'|'severity'>={})=>
   issues.push({code,severity,...extras});
 let primaryUnits=0,allQuantities=profiles.length>0;
 let area=0,allMeasured=profiles.length>0;
 const geometries:TechnicalGeometry[]=[];
 if(!profiles.length)add('NO_PROFILES','review');
 profiles.forEach((profile,i)=>{
   const count=quantity(profile.quantity1);
   if(count===null){allQuantities=false;add('PROFILE_QUANTITY','review',{profileIndex:i});}
   if(!profile.name?.trim())add('PROFILE_TEMPLATE','review',{profileIndex:i});
   const g=geometry(profile.configuration);
   if(!g){allMeasured=false;add('DIMENSIONS_UNVERIFIED','info',{profileIndex:i});}
   if(count!==null)primaryUnits+=count;
   if(g&&count!==null){
     const face=rounded(g.widthMm*g.heightMm*count/1e6);
     if(!Number.isFinite(face)||face>1e8)throw new Error('Technical area exceeds safe bound');
     geometries.push({profileIndex:i,quantity:count,...g,boundingAreaM2:face});
     area+=face;
   }else allMeasured=false;
 });
 if(!materials.length)add('MATERIALS_UNSPECIFIED','review');
 const unitsByType=new Map<string,Set<string>>();
 const materialLines=materials.map((item,i)=>{
   const description=typeof item.material_type==='string'?item.material_type.slice(0,180):'';
   const qty=finitePositive(item.quantity);
   const unit=typeof item.unit==='string'&&item.unit.trim()?item.unit.trim().slice(0,40):null;
   if(qty===null)add('MATERIAL_QUANTITY','review',{materialIndex:i,subject:description});
   if(!unit)add('MATERIAL_UNIT','review',{materialIndex:i,subject:description});
   // Same displayed material name with differing units must never be summed.
   const typeKey=description.trim().toUpperCase();
   if(typeKey&&unit){
     const all=unitsByType.get(typeKey)??new Set<string>();
     all.add(unit.toUpperCase());unitsByType.set(typeKey,all);
   }
   return {materialIndex:i,description,quantity:qty,unit};
 });
 for(const [subject,units] of unitsByType){
   if(units.size>1)add('MATERIAL_MIXED_UNITS','review',{subject});
 }
 add('STOCK_UNVERIFIED','info');
 if(fileCount>0)add('FILES_UNVERIFIED','info');
 return {
   kind:'deterministic-technical-evidence',
   primaryUnits:allQuantities?primaryUnits:null,
   profileCount:profiles.length,materialCount:materials.length,fileCount,
   boundingFaceAreaM2:allMeasured?rounded(area):null,
   measuredProfiles:geometries.length,
   geometries,materialLines,issues,
   sourceLimitReached:options.sourceLimitReached===true,
   inventoryVerified:false,fileContentsVerified:false,
   feasibilityVerified:false,materialYieldEstimated:false
 };
}
