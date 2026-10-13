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

/** Canonical order_stages rows are arrays with station and state columns.
 * Never divide by an empty count or interpret numeric array indexes as stages.
 */
export function stageProgressPercent(rows:unknown):number {
  if(!Array.isArray(rows)||rows.length===0)return 0;
  const valid=rows.filter(row=>row&&typeof row==='object'&&
    typeof row.station==='string'&&typeof row.state==='string');
  if(!valid.length)return 0;
  const done=valid.filter(row=>row.state==='COMPLETED'||row.state==='SKIPPED').length;
  return Math.round(done/valid.length*100);
}
