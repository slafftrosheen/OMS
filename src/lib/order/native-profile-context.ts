/** OMS-R31: compact, allowlisted view of the existing Profile 7st form.
 * Preserves native order profile fields; no new fabrication input schema.
 * These are saved operator selections, NOT proven engineering specifications.
 */
type RecordValue=Record<string,unknown>;
const record=(value:unknown):RecordValue=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as RecordValue:{};
const text=(value:unknown,max=160):string|undefined=>
  typeof value==='string'&&value.trim()?value.trim().slice(0,max):undefined;
const scalar=(value:unknown):string|number|boolean|undefined=>{
 if(typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 return text(value);
};
const properties={
 CNC_FREZER:['face','back','faceThickness','backThickness','laser','print3d','notes'],
 BENDER:['sides','sidesThickness','depth','notes'],
 FRONT:['face','faceFilm','faceCustom','back','backFilm','backCustom',
   'sides','sidesFilm','sidesCustom','notes'],
 PAINTING:['face','faceCustom','sides','sidesCustom','back','backCustom',
   'frame','frameCustom','notes'],
 ASSEMBLING:['led','ledModule','ledCustom','psu','psuModel','psuType','psuMounting',
   'cables','cableType','cablesLength','cablesWago','frame','frameMaterial',
   'frameDimensions','frameCustom','frameWaterholes','frameMountingHoles','shablon','notes']
} as const;
type ProductionSection=keyof typeof properties;
export type NativeProfileSummary={
 profileName:string|null;
 signType:string|null;
 sections:Partial<Record<ProductionSection,Record<string,string|number|boolean>>>;
};
export function summarizeNativeProfileConfiguration(raw:unknown):NativeProfileSummary{
 const source=record(raw);
 const sections:NativeProfileSummary['sections']={};
 for(const [section,keys] of Object.entries(properties) as
    [ProductionSection,readonly string[]][]){
   const rawSection=record(source[section]);
   const values:Record<string,string|number|boolean>={};
   for(const key of keys){
     const value=scalar(rawSection[key]);
     if(value!==undefined)values[key]=value;
   }
   // Color choices are structured objects, not free text for hallucinated RALs.
   if(section==='PAINTING'){
     for(const part of ['face','sides','back','frame']){
       const color=record(rawSection[part+'Color']);
       for(const colorKey of ['system','code']){
         const value=text(color[colorKey],60);
         if(value)values[part+'Color'+colorKey]=value;
       }
     }
   }
   if(Object.keys(values).length)sections[section]=values;
 }
 return {
   profileName:text(source.profileName,120)??null,
   signType:text(source.signType,40)??null,
   sections
 };
}
