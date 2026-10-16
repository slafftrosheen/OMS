/** OMS-R39: manager-only *read-only* signals from persisted stage rows.
 * This is not a workflow state, acknowledgement or proof that work stopped:
 * stage progress notes may be stored in a separate station timeline.
 */
import {ALL_STATIONS} from './workflow';
import type {OrderRow,StageRow} from './production-planning';

export const STAGE_UNCHANGED_HOURS=72;
export const OVERSIGHT_PREVIEW_LIMIT=100;
export type OversightKind='STAGE_UNCHANGED'|'MATERIAL_SKIPPED';
export type OversightSignal={
  key:string;kind:OversightKind;orderId:string;poNumber:string|null;
  title:string;station:string;status:string;stageState:string;
  recordedAt:string;elapsedHours:number;reason:string|null;
};
export type ProductionOversight={
  asOf:string;unchangedCount:number;skippedCount:number;total:number;
  previewLimit:number;truncated:boolean;signals:OversightSignal[];
};
const activeStatuses=new Set(['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD']);
const isoDate=(value:unknown):number|null=>{
  if(typeof value!=='string')return null;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:null;
};
const limitReason=(raw:unknown)=>typeof raw==='string'&&raw.trim()
  ?raw.trim().slice(0,500):null;
export function deriveProductionOversight(
  orders:OrderRow[],stages:StageRow[],asOf:string
):ProductionOversight {
  const now=isoDate(asOf);
  if(now===null)throw new Error('A valid observation time is required');
  const byId=new Map(orders.filter(o=>activeStatuses.has(o.status)).map(o=>[o.id,o]));
  const rows:OversightSignal[]=[];
  for(const stage of stages){
    const order=byId.get(stage.draft_order_id);
    if(!order||!ALL_STATIONS.includes(stage.station))continue;
    const make=(kind:OversightKind,recordedAt:string,elapsedHours:number,reason:string|null)=>{
      rows.push({
        key:`${stage.draft_order_id}:${stage.station}:${kind}`,kind,
        orderId:order.id,poNumber:order.po_number??null,title:order.title??'',
        station:stage.station,status:order.status,stageState:stage.state,
        recordedAt,elapsedHours,reason
      });
    };
    const stamp=isoDate(stage.updated_at);
    if(order.status!=='ON_HOLD' &&
      ['QUEUED','IN_PROGRESS'].includes(stage.state) &&
      stamp!==null && stamp<=now-STAGE_UNCHANGED_HOURS*3600000){
      make('STAGE_UNCHANGED',stage.updated_at!,Math.floor((now-stamp)/3600000),null);
    }
    // A completed stage's skip declaration is not the same as an unresolved
    // financial discrepancy. This is a reminder to verify reconciliation.
    if(stage.state==='COMPLETED' && stage.consumption_skipped===true){
      const finished=isoDate(stage.completed_at)??stamp;
      if(finished!==null)
        make('MATERIAL_SKIPPED',
          stage.completed_at??stage.updated_at!,
          Math.max(0,Math.floor((now-finished)/3600000)),
          limitReason(stage.consumption_skipped_reason));
    }
  }
  // Failed/partial DB data must never be interpreted as verified inactivity.
  // Stable deterministic ordering avoids flicker in repeatedly refreshed boards.
  rows.sort((a,b)=>{
    const kind=a.kind===b.kind?0:a.kind==='MATERIAL_SKIPPED'?-1:1;
    return kind||b.elapsedHours-a.elapsedHours||
      (a.poNumber??a.orderId).localeCompare(b.poNumber??b.orderId)||
      a.station.localeCompare(b.station);
  });
  const skippedCount=rows.filter(x=>x.kind==='MATERIAL_SKIPPED').length;
  const unchangedCount=rows.length-skippedCount;
  return {asOf,unchangedCount,skippedCount,total:rows.length,
    previewLimit:OVERSIGHT_PREVIEW_LIMIT,truncated:rows.length>OVERSIGHT_PREVIEW_LIMIT,
    signals:rows.slice(0,OVERSIGHT_PREVIEW_LIMIT)};
}
