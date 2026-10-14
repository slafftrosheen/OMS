/** Narrow server-side validators for operator-facing production writes. */
export interface ProductionCompletion {
  items: Array<{item_id:string;quantity:number;notes?:string}>;
  skipped:boolean;
  reason:string;
  actualHours:number|null;
  notes:string|null;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseStageCompletion(body:Record<string,unknown>):ProductionCompletion {
  if(typeof body.skipped!=='boolean')throw new Error('Specify whether materials were skipped');
  if(!Array.isArray(body.items)||body.items.length>100)
    throw new Error('Provide at most 100 material lines');
  const items=body.items as ProductionCompletion['items'];
  if(items.some(i=>!i||typeof i!=='object'||!uuid.test(i.item_id)||
      !Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>1000000||
      (i.notes!==undefined&&(typeof i.notes!=='string'||i.notes.length>500))))
    throw new Error('Invalid material ID, quantity or notes');
  if(new Set(items.map(i=>i.item_id)).size!==items.length)
    throw new Error('Duplicate material lines');
  const skipped=body.skipped;
  const reason=typeof body.skipReason==='string'?body.skipReason.trim():'';
  if(skipped ? !!items.length||!reason||reason.length>500 : !items.length||!!reason)
    throw new Error('Declare materials or skip with a reason (not both)');
  const rawHours=body.actualHours;
  const actualHours=rawHours==null?null:rawHours as number;
  if(actualHours!==null&&(!Number.isFinite(actualHours)||typeof actualHours!=='number'||
      actualHours<0||actualHours>999.99||Math.round(actualHours*100)!==actualHours*100))
    throw new Error('Actual hours must be between 0 and 999.99 (two decimal places)');
  const rawNotes=body.notes;
  if(rawNotes!=null&&typeof rawNotes!=='string')throw new Error('Notes must be text');
  const notes=typeof rawNotes==='string'?rawNotes.trim():null;
  if((notes?.length??0)>2000)throw new Error('Completion note is too long');
  return {items,skipped,reason,actualHours,notes:notes||null};
}
export interface ProgressInput { note:string; progressPercent:number|null; expectedUpdatedAt:string; }
export function parseProgressInput(value:unknown):ProgressInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid progress report');
  const data=value as Record<string,unknown>;
  const note=typeof data.note==='string'?data.note.trim():'';
  if(note.length>1000)throw new Error('Progress note exceeds 1000 characters');
  const percent=data.progressPercent==null?null:data.progressPercent as number;
  if(percent!==null&&(!Number.isInteger(percent)||percent<0||percent>99))
    throw new Error('Progress percent must be 0–99; use Complete for 100%');
  if(!note&&percent===null)throw new Error('Add a progress note or percentage');
  const version=data.expectedUpdatedAt;
  if(typeof version!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(version)||
     !Number.isFinite(Date.parse(version)))
    throw new Error('Stage version required; refresh the workstation');
  return {note,progressPercent:percent,expectedUpdatedAt:version};
}
