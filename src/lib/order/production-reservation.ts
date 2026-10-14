import {ALL_STATIONS} from './workflow';
export type ProductionReservation={
  id:string;draft_order_id:string;station:string;work_date:string;
  hours:number;status:'PROPOSED'|'APPROVED'|'CANCELLED';note:string;
  updated_at:string;created_at:string;approved_at:string|null;
  cancelled_at:string|null;created_by:string;
};
export type ReservationAction={
  action:'propose'|'approve'|'cancel';
  reservationId:string|null;orderId:string|null;station:string|null;
  workDate:string|null;hours:number|null;note:string|null;
  expectedUpdatedAt:string|null;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
export function validDate(input:unknown):input is string {
 if(typeof input!=='string'||!date.test(input))return false;
 const [y,m,d]=input.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===input;
}
export function parseReservationAction(raw:unknown):ReservationAction {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid reservation action');
 const d=raw as Record<string,unknown>;
 const action=d.action;
 if(action!=='propose'&&action!=='approve'&&action!=='cancel')
  throw Error('Unknown reservation action');
 const base={action,reservationId:null,orderId:null,station:null,
   workDate:null,hours:null,note:null,expectedUpdatedAt:null} as ReservationAction;
 if(action==='propose'){
  if(!uuid.test(String(d.orderId??''))||typeof d.station!=='string'||
     !ALL_STATIONS.includes(d.station.toUpperCase())||!validDate(d.workDate)||
     typeof d.hours!=='number'||!Number.isFinite(d.hours)||d.hours<=0||
     d.hours>999.99||Math.abs(d.hours*100-Math.round(d.hours*100))>1e-7||
     (d.note!==undefined&&(typeof d.note!=='string'||d.note.length>500)))
    throw Error('Invalid proposed date, stage, hours or note');
  return {...base,orderId:d.orderId as string,station:d.station.toUpperCase(),
    workDate:d.workDate,hours:d.hours,note:typeof d.note==='string'?d.note.trim():null};
 }
 if(!uuid.test(String(d.reservationId??''))||
    typeof d.expectedUpdatedAt!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(d.expectedUpdatedAt)||
    !Number.isFinite(Date.parse(d.expectedUpdatedAt)))
  throw Error('Reservation and current revision required');
 return {...base,reservationId:d.reservationId as string,
   expectedUpdatedAt:d.expectedUpdatedAt};
}
