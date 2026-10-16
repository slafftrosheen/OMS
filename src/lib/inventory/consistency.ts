/** R42: read-only parity classifier. materials.stock is the canonical value.
 * Never select a "winning" balance automatically from historical rows.
 */
export type CanonicalBalance={id:string;sku:string|null;name_en:string|null;stock:number|null};
export type LegacyBalance={
 id:string;material_id:string|null;sku:string|null;stock:number|null
};
export type ParityState='MATCH'|'DIVERGENT'|'CANONICAL_ONLY'|'AMBIGUOUS'|'INVALID';
export type InventoryParity={
 materialId:string;sku:string|null;name:string|null;
 canonicalStock:number|null;legacyStock:number|null;
 legacyItemId:string|null;linkedCount:number;state:ParityState;
};
const isStock=(value:unknown):value is number=>
 typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function classifyInventoryParity(
 materials:CanonicalBalance[],legacy:LegacyBalance[]
):InventoryParity[]{
 const byMaterial=new Map<string,LegacyBalance[]>();
 for(const item of legacy){
   if(!item.material_id)continue;
   const group=byMaterial.get(item.material_id)??[];
   group.push(item);
   byMaterial.set(item.material_id,group);
 }
 return materials.map(material=>{
   const matching=byMaterial.get(material.id)??[];
   const first=matching[0];
   let state:ParityState;
   if(!isStock(material.stock)||
     matching.some(item=>!isStock(item.stock)))state='INVALID';
   else if(matching.length>1)state='AMBIGUOUS';
   else if(!first)state='CANONICAL_ONLY';
   else if(first.stock!==material.stock)state='DIVERGENT';
   else state='MATCH';
   return {
     materialId:material.id,sku:material.sku,
     name:material.name_en,canonicalStock:material.stock,
     legacyStock:matching.length===1?matching[0].stock:null,
     legacyItemId:matching.length===1?matching[0].id:null,
     linkedCount:matching.length,state
   };
 });
}
