import {ALL_STATIONS} from './workflow';

export type ProductionCapacity={
  station:string; workers:number; hours_per_worker:number;
  efficiency_percent:number; workdays:number[];
  updated_at:string; updated_by?:string|null;
};
export type CapacityWrite={
  station:string;workers:number;hoursPerWorker:number;
  efficiencyPercent:number;workdays:number[];expectedUpdatedAt:string|null;
};
export function validateCapacityWrite(value:unknown):CapacityWrite {
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new Error('Invalid station capacity payload');
  const v=value as Record<string,unknown>;
  const station=typeof v.station==='string'?v.station.toUpperCase():'';
  if(!ALL_STATIONS.includes(station))throw new Error('Unknown production station');
  if(!Number.isInteger(v.workers)||Number(v.workers)<0||Number(v.workers)>40)
    throw new Error('Staff count must be a whole number from 0 to 40');
  if(typeof v.hoursPerWorker!=='number'||!Number.isFinite(v.hoursPerWorker)||
      v.hoursPerWorker<0.25||v.hoursPerWorker>16||
      Math.abs(v.hoursPerWorker*4-Math.round(v.hoursPerWorker*4))>1e-6)
    throw new Error('Hours per worker must be 0.25–16 in 15-minute increments');
  if(!Number.isInteger(v.efficiencyPercent)||Number(v.efficiencyPercent)<25||
     Number(v.efficiencyPercent)>100)
    throw new Error('Availability percentage must be a whole number from 25–100');
  const workdays=v.workdays;
  if(!Array.isArray(workdays)||workdays.length<1||workdays.length>7||
      workdays.some(x=>!Number.isInteger(x)||x<1||x>7)||
      new Set(workdays).size!==workdays.length)
    throw new Error('Workdays must be unique weekday numbers from 1 to 7');
  if(v.expectedUpdatedAt!==null&&
    (typeof v.expectedUpdatedAt!=='string'||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v.expectedUpdatedAt)||
     !Number.isFinite(Date.parse(v.expectedUpdatedAt))))
    throw new Error('Capacity version is missing or invalid');
  return {station,workers:v.workers as number,
    hoursPerWorker:v.hoursPerWorker as number,
    efficiencyPercent:v.efficiencyPercent as number,
    workdays:[...workdays].sort((a,b)=>a-b),
    expectedUpdatedAt:v.expectedUpdatedAt as string|null};
}
export function dailyStationHours(config:ProductionCapacity|null|undefined):number|null {
  if(!config)return null;
  const hours=config.workers*config.hours_per_worker*config.efficiency_percent/100;
  return Math.round(hours*100)/100;
}
