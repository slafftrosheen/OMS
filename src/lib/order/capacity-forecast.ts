/** Pure deterministic what-if forecast. Never updates a production stage. */
import {ALL_STATIONS} from './workflow';
import type {PlanningItem} from './production-planning';
import {dailyStationHours,type ProductionCapacity} from './production-capacity';

export type ForecastReason='unconfigured'|'blocked'|'paused'|'missingEstimate'|
  'noAvailability'|'outsideHorizon';
export type UnplannedStage={id:string;station:string;poNumber:string|null;
  reason:ForecastReason;remainingHours:number|null};
export type ForecastSlice={id:string;station:string;poNumber:string|null;
  date:string;hours:number;tentative:boolean};
export type ForecastDay={date:string;capacityHours:number;allocatedHours:number;
  tasks:ForecastSlice[]};
export type ForecastStation={station:string;configured:boolean;dailyHours:number|null;
  days:ForecastDay[];unplanned:UnplannedStage[];late:ForecastSlice[];
  totalAvailableHours:number;totalAllocatedHours:number};
export type ForecastResult={stations:Record<string,ForecastStation>;
  allocatedHours:number;availableHours:number;unplanned:number;late:number;
  configuredStations:number;tentative:number;startDate:string;horizonDays:number};

function dates(start:string,length:number):string[]{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start))throw new Error('Invalid start date');
  const [y,m,d]=start.split('-').map(Number);
  const first=Date.UTC(y,m-1,d);
  if(new Date(first).toISOString().slice(0,10)!==start)throw new Error('Invalid start date');
  return Array.from({length},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));
}
function weekday(iso:string):number {
  const day=new Date(iso+'T12:00:00Z').getUTCDay();
  return day===0?7:day;
}
const round=(value:number)=>Math.round(value*100)/100;
export function buildCapacityForecast(
  source:Record<string,PlanningItem[]>,capacity:ProductionCapacity[],
  startDate:string,horizonDays:7|14|28=14,includeUpcoming=false
):ForecastResult {
  if(![7,14,28].includes(horizonDays))throw new Error('Invalid forecast horizon');
  const calendar=dates(startDate,horizonDays);
  const byStation=new Map(capacity.map(c=>[c.station,c]));
  const stations={} as Record<string,ForecastStation>;
  let allocatedHours=0,availableHours=0,unplanned=0,late=0,configuredStations=0,tentative=0;
  for(const station of ALL_STATIONS){
    const config=byStation.get(station),hours=dailyStationHours(config);
    if(config)configuredStations++;
    const days:ForecastDay[]=calendar.map(date=>({
      date,capacityHours:config&&config.workdays.includes(weekday(date))?hours??0:0,
      allocatedHours:0,tasks:[]
    }));
    const failed:UnplannedStage[]=[],lateTasks:ForecastSlice[]=[];
    const eligible=(source[station]??[]).filter(s=>!s.upcoming||includeUpcoming);
    for(const task of eligible){
      const estimate=task.estimatedHours;
      let reason:ForecastReason|null=task.paused?'paused':
        ['BLOCKED','REWORK'].includes(task.stageState)?'blocked':
        estimate===null||estimate<=0?'missingEstimate':
        !config?'unconfigured':
        hours===0||!config.workdays.length?'noAvailability':null;
      // R20 lists active work in dispatch order and upcoming after it.
      if(reason) {
        failed.push({id:task.id,station,poNumber:task.poNumber,
          reason,remainingHours:estimate});continue;
      }
      let remaining=estimate as number;
      let lastDate:string|null=null;
      for(const day of days){
        if(remaining<=0.000001)break;
        const spare=round(day.capacityHours-day.allocatedHours);
        if(spare<=0)continue;
        const allotted=round(Math.min(remaining,spare));
        if(allotted<=0)continue;
        const slice:ForecastSlice={id:task.id,station,poNumber:task.poNumber,
          date:day.date,hours:allotted,tentative:task.upcoming};
        day.tasks.push(slice);day.allocatedHours=round(day.allocatedHours+allotted);
        allocatedHours=round(allocatedHours+allotted);
        if(task.upcoming)tentative++;
        remaining=round(remaining-allotted);
        lastDate=day.date;
        if(task.dueDate && day.date>task.dueDate.slice(0,10)) {
          lateTasks.push(slice);late++;
        }
      }
      if(remaining>0.000001){
        failed.push({id:task.id,station,poNumber:task.poNumber,
          reason:'outsideHorizon',remainingHours:remaining});
      }else if(lastDate&&task.dueDate&&lastDate>task.dueDate.slice(0,10)&&
        !lateTasks.some(item=>item.id===task.id)) {
        // Safeguard if due date comparison changes elsewhere.
        lateTasks.push({id:task.id,station,poNumber:task.poNumber,
          date:lastDate,hours:0,tentative:task.upcoming});
      }
    }
    const totalAvailableHours=round(days.reduce((sum,d)=>sum+d.capacityHours,0));
    const totalAllocatedHours=round(days.reduce((sum,d)=>sum+d.allocatedHours,0));
    availableHours=round(availableHours+totalAvailableHours);
    unplanned+=failed.length;
    stations[station]={station,configured:!!config,dailyHours:hours,
      days,unplanned:failed,late:lateTasks,totalAvailableHours,totalAllocatedHours};
  }
  return {stations,allocatedHours,availableHours,unplanned,late,configuredStations,
    tentative,startDate,horizonDays};
}
