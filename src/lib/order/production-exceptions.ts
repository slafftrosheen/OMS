import {ALL_STATIONS} from './workflow';
export const REVIEW_KINDS=['MISSING_ACTUAL','ACTUAL_OVERRUN','BLOCKED','REWORK','MISSED_BOOKING','STAGE_UNCHANGED','MATERIAL_SKIPPED'] as const;
export type ReviewKind=(typeof REVIEW_KINDS)[number];
export type ReviewAction='claim'|'take'|'update'|'resolve'|'reopen';
export type ExceptionReview={
 id:string;draft_order_id:string;station:string;kind:ReviewKind;
 status:'OPEN'|'ACKNOWLEDGED'|'RESOLVED';owner_id:string|null;due_date:string|null;
 follow_up_note:string;resolution_note:string|null;updated_at:string;
 created_at:string;resolved_at:string|null;updated_by:string
};
export type ReviewChange={
 action:ReviewAction;orderId:string|null;station:string|null;kind:ReviewKind|null;
 reviewId:string|null;expectedUpdatedAt:string|null;dueDate:string|null;
 note:string|null;evidenceMovementIds:string[]
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const version=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function date(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===value;
}
export function parseReviewChange(raw:unknown):ReviewChange {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid review input');
 const x=raw as Record<string,unknown>;
 const action=x.action;
 if(typeof action!=='string'||!['claim','take','update','resolve','reopen'].includes(action))
   throw new Error('Unsupported review action');
 let note:string|null;
 if(x.note===undefined||x.note===null)note=null;
 else if(typeof x.note==='string')note=x.note;
 else throw new Error('Review note must be a string');
 if(note!==null&&note.length>2000)
   throw new Error('Review note must be at most 2000 characters');
 const ids=x.evidenceMovementIds??[];
 if(!Array.isArray(ids)||ids.length>10||
    ids.some(id=>typeof id!=='string'||!uuid.test(id))||
    new Set(ids).size!==ids.length)
   throw new Error('Evidence movement IDs must be unique, at most ten UUIDs');
 if(ids.length && !['update','resolve'].includes(String(action)))
   throw new Error('Movement evidence is only supported for a review update or resolution');
 const due=x.dueDate===undefined||x.dueDate===null?null:x.dueDate;
 if(due!==null&&!date(due))throw new Error('Invalid follow-up due date');
 const base:ReviewChange={action:action as ReviewAction,orderId:null,station:null,
   kind:null,reviewId:null,expectedUpdatedAt:null,dueDate:due as string|null,
   note:note as string|null,evidenceMovementIds:ids as string[]};
 if(['claim','take','update'].includes(action)&&due===null)
   throw new Error('A follow-up due date is required');
 if(action==='claim'){
   if(typeof x.orderId!=='string'||!uuid.test(x.orderId)||
      typeof x.station!=='string'||!ALL_STATIONS.includes(x.station.toUpperCase())||
      typeof x.kind!=='string'||!REVIEW_KINDS.includes(x.kind as ReviewKind)||
      x.reviewId!==undefined||x.expectedUpdatedAt!==undefined)
     throw new Error('Claim requires an order, station and supported live issue');
   if(note!==null&&note.length>1000)throw new Error('Follow-up note exceeds 1000 characters');
   return {...base,orderId:x.orderId,station:x.station.toUpperCase(),kind:x.kind as ReviewKind};
 }
 if(typeof x.reviewId!=='string'||!uuid.test(x.reviewId)||
   typeof x.expectedUpdatedAt!=='string'||!version.test(x.expectedUpdatedAt)||
   !Number.isFinite(Date.parse(x.expectedUpdatedAt))||
   x.orderId!==undefined||x.station!==undefined||x.kind!==undefined)
   throw new Error('Existing review ID and exact revision required');
 if(action==='update'&&(note===null||note.length>1000))
   throw new Error('An update note up to 1000 characters is required');
 if(action==='resolve'&&(!note||!note.trim()))
   throw new Error('Resolution requires a note');
 if((action==='reopen'||action==='take')&&note!==null)
   throw new Error('Unexpected note for this transition');
 return {...base,reviewId:x.reviewId,expectedUpdatedAt:x.expectedUpdatedAt};
}
