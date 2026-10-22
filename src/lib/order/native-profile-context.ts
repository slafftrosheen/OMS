/** OMS-R31: compact, allowlisted view of the existing Profile 7st form.
 * Preserves native order profile fields; no new fabrication input schema.
 * These are saved operator selections, NOT proven engineering specifications.
 */
import {readFaceMaterials} from '$lib/profiles/face-materials';
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

// Form controls may retain an old selection when its parent checkbox becomes
// inactive. Such hidden values are preserved in order JSON but are NOT current
// manufacturing instructions to send to OpenRouter.
function inactiveChoice(section:ProductionSection,key:string,values:RecordValue):boolean{
 if(section==='CNC_FREZER'){
   if(key==='faceThickness')return !text(values.face);
   if(key==='backThickness')return !text(values.back);
 }
 if(section==='BENDER'&&['sidesThickness','depth'].includes(key))
   return !text(values.sides);
 if(section==='FRONT'){
   for(const part of ['face','back','sides']){
     if((key===part+'Film'||key===part+'Custom')&&values[part]!==true)
       return true;
   }
 }
 if(section==='PAINTING'){
   for(const part of ['face','sides','back','frame']){
     if(key===part+'Custom'&&values[part]!==true)return true;
   }
 }
 if(section==='ASSEMBLING'){
   const dependents:Record<string,readonly string[]>={
     led:['ledModule','ledCustom'],
     psu:['psuModel','psuType','psuMounting'],
     cables:['cableType','cablesLength','cablesWago'],
     frame:['frameMaterial','frameDimensions','frameCustom',
       'frameWaterholes','frameMountingHoles']
   };
   for(const [toggle,fields] of Object.entries(dependents)){
     if(fields.includes(key)&&values[toggle]!==true)return true;
   }
 }
 return false;
}
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
     // An explicit row list is authoritative. Do not revive stale scalar FACE
     // selections after a row was removed or the list was cleared.
     if(section==='CNC_FREZER' && Array.isArray(rawSection.faceMaterials) &&
        (key==='face'||key==='faceThickness'))continue;
     if(inactiveChoice(section,key,rawSection))continue;
     const value=scalar(rawSection[key]);
     if(value!==undefined)values[key]=value;
   }
   if(section==='CNC_FREZER' && Array.isArray(rawSection.faceMaterials)){
     const selected=readFaceMaterials(rawSection).filter(row=>text(row.value));
     selected.forEach((row,index)=>{
       // Scalar pairs also render correctly in the existing station packet.
       const key=selected.length===1?'face':`faceMaterial${index+1}`;
       values[key]=text(row.value)!;
       const thickness=text(row.thickness);
       if(thickness)values[key+'Thickness']=thickness;
     });
   }
   // Color choices are structured objects, not free text for hallucinated RALs.
   if(section==='PAINTING'){
     for(const part of ['face','sides','back','frame']){
       if(rawSection[part]!==true)continue;
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
