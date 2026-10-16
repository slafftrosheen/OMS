/** OMS-R16: one canonical order-workspace navigation contract.
 * No route may infer permissions from the selected view.
 */
export const WORKSPACE_GROUPS = [
  {id:'prepare', label:'orderWorkspace.groups.prepare',
    sections:['details','files','intake']},
  {id:'plan', label:'orderWorkspace.groups.plan',
    sections:['readiness','layers']},
  {id:'review', label:'orderWorkspace.groups.review',
    sections:['revisions','changes']},
  {id:'collaborate', label:'orderWorkspace.groups.collaborate',
    sections:['chat']}
] as const;
export type WorkspaceGroup = typeof WORKSPACE_GROUPS[number]['id'];
export type WorkspaceSection = typeof WORKSPACE_GROUPS[number]['sections'][number];
const allSections=WORKSPACE_GROUPS.flatMap(g=>g.sections) as WorkspaceSection[];
export function validWorkspaceSection(value:unknown):value is WorkspaceSection {
  return typeof value==='string'&&allSections.includes(value as WorkspaceSection);
}
export function sectionFromQuery(value:unknown):WorkspaceSection {
  return validWorkspaceSection(value)?value:'details';
}
export function workspaceGroup(section:WorkspaceSection):WorkspaceGroup {
  return WORKSPACE_GROUPS.find(group=>(group.sections as readonly string[]).includes(section))?.id??'prepare';
}
export function sectionsForGroup(group:WorkspaceGroup):readonly WorkspaceSection[]{
  return WORKSPACE_GROUPS.find(g=>g.id===group)?.sections??WORKSPACE_GROUPS[0].sections;
}
export function workspaceUrl(orderId:string,section:WorkspaceSection):string {
  return `/orders/${encodeURIComponent(orderId)}/edit?section=${section}`;
}
export function suggestedWorkspaceSection(status:string,hasFiles:boolean,
  hasPendingChanges:boolean):WorkspaceSection{
  if(hasPendingChanges)return 'changes';
  if(status==='DRAFT'||status==='PENDING_REVIEW')
    return hasFiles?'readiness':'files';
  if(['CONFIRMED','IN_PRODUCTION','READY_TO_LOAD','ON_HOLD'].includes(status))
    return 'readiness';
  return 'changes';
}

/** Progress means recorded production work, not dispatch. DELIVERY is
 * handled after loading and must not hold manufacturing at 86% indefinitely.
 * Optional/legacy configured station rows (such as QC) remain counted.
 * No stage rows means unknown/unstarted: 0%, never an invented 100%.
 */
export function stageProgressSummary(rows:unknown):{
  percent:number; completed:number; total:number; blocked:number; rework:number;
} {
  if(!Array.isArray(rows))return {percent:0,completed:0,total:0,blocked:0,rework:0};
  const stages=rows.filter((row):row is {station:string;state:string} =>
    !!row && typeof row==='object' &&
    typeof row.station==='string' && typeof row.state==='string' &&
    row.station.trim().toUpperCase()!=='DELIVERY');
  const total=stages.length;
  const completed=stages.filter(row=>['COMPLETED','SKIPPED'].includes(row.state)).length;
  const blocked=stages.filter(row=>row.state==='BLOCKED').length;
  const rework=stages.filter(row=>row.state==='REWORK').length;
  return {percent:total?Math.round(completed/total*100):0,
    completed,total,blocked,rework};
}
export function stageProgressPercent(rows:unknown):number {
  return stageProgressSummary(rows).percent;
}

export function mayControlStage(user:{
  role?:string|null;stations?:Array<{stationId?:string|null}>|null
}|null|undefined,station:string):boolean{
  if(!user)return false;
  if(['RD','Boss','HeadOfProduction'].includes(user.role??''))return true;
  if(!['StationHead','Operator'].includes(user.role??''))return false;
  return !!user.stations?.some(s=>
    s.stationId?.toUpperCase()===station.toUpperCase());
}
