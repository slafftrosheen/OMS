import type {Material} from './types';

/** Existing 9-column CSV format remains accepted, but opening stock is
 * intentionally excluded from metadata creation and never silently lost.
 * Nonzero stock requires a separately verified, audited stock movement.
 */
export type CsvImportRow={line:number;metadata:Partial<Material>};
export type CsvImportResult={rows:CsvImportRow[];errors:string[]};
function splitCsvLine(line:string):string[] {
 const parts:string[]=[];
 let current='',quoted=false;
 for(let i=0;i<line.length;i++){
   const ch=line[i];
   if(ch==='"'){
     if(quoted && line[i+1]==='"'){current+='"';i++;}
     else quoted=!quoted;
   }else if(ch===','&&!quoted){parts.push(current.trim());current='';}
   else current+=ch;
 }
 if(quoted)throw new Error('Unclosed quoted field');
 parts.push(current.trim());
 return parts;
}
export function parseInventoryCsv(raw:string):CsvImportResult {
 const lines=raw.split(/\r?\n/);
 const rows:CsvImportRow[]=[],errors:string[]=[];
 const seen=new Set<string>();
 if(lines.length>201)return {rows:[],errors:['Too many rows (maximum 200)']};
 for(let i=0;i<lines.length;i++){
   const line=lines[i].trim();
   if(!line)continue;
   let parts:string[];
   try{parts=splitCsvLine(line);}
   catch{errors.push(`Line ${i+1}: invalid CSV quoting`);continue;}
   if(i===0&&parts[0]?.toLowerCase()==='section'&&
     parts[3]?.toLowerCase()==='sku')continue;
   if(parts.length<5||parts.length>9){
     errors.push(`Line ${i+1}: expected section,group,subgroup,sku,name,unit,stock,min,location`);
     continue;
   }
   const [section,group,subgroup,sku,name,unit,stock='0',minimum='0',location='']=parts;
   if(!sku?.trim()||!name?.trim()){
     errors.push(`Line ${i+1}: SKU and name are required`);continue;
   }
   const key=sku.toLowerCase();
   if(seen.has(key)){
     errors.push(`Line ${i+1}: duplicate SKU in import`);continue;
   }
   seen.add(key);
   // Refuse to silently ignore a stated opening stock value.
   if(stock!==''&&(!/^\d+$/.test(stock)||Number(stock)!==0)){
     errors.push(`Line ${i+1}: opening stock must be 0; record audited stock separately`);
     continue;
   }
   if(minimum!==''&&(!/^\d+$/.test(minimum)||!Number.isSafeInteger(Number(minimum)))){
     errors.push(`Line ${i+1}: minimum stock must be a whole non-negative number`);
     continue;
   }
   rows.push({line:i+1,metadata:{
     section:(section||'materials') as Material['section'],
     item_group:group||'General',subgroup:subgroup||'General',
     sku,name_en:name,unit:(unit||'PCS') as Material['unit'],
     stock:0,min_stock:Number(minimum)||0,location:location||''
   }});
 }
 return {rows,errors};
}
