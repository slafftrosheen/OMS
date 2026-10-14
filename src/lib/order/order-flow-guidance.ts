/** OMS-R28: UI-only order guidance. Signals are NOT readiness approval.
 * Never call an LLM to produce these hints or treat file selection as persistence.
 */
import type {WorkspaceSection} from './workspace-navigation';
export type GuideStepId='brief'|'profiles'|'files'|'review';
export type GuideSignal='present'|'missing'|'check'|'unknown';
export type OrderGuideInput={
  phase:'new'|'saved';
  status:string;
  clientName:string;
  deadline:string;
  title:string;
  profileCount:number;
  unassignedProfiles:number;
  fileCount:number|null;
  dirty:boolean;
  canEdit:boolean;
};
export type OrderGuideStep={
  id:GuideStepId;
  signal:GuideSignal;
  section:WorkspaceSection;
  helpKey:string;
};
export type OrderGuideResult={
  steps:OrderGuideStep[];
  signalsPresent:number;
  signalsTotal:3;
  suggested:GuideStepId;
  nextSection:WorkspaceSection;
  isDraft:boolean;
};
export const GUIDE_SECTION:Record<GuideStepId,WorkspaceSection>={
  brief:'details',profiles:'details',files:'files',review:'readiness'
};
/** Signal counts report field presence only. They never imply production feasibility,
 * verified file contents, approved profiles, saved state or permission to confirm.
 */
export function deriveOrderGuide(input:OrderGuideInput):OrderGuideResult{
 const isDraft=['DRAFT','draft','PENDING_REVIEW'].includes(input.status);
 const brief:GuideSignal=input.clientName.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)
   ?'present':'missing';
 const profiles:GuideSignal=input.profileCount<=0?'missing':
   input.unassignedProfiles>0?'check':'present';
 const files:GuideSignal=input.fileCount===null?'unknown':
   input.fileCount===0?'missing':'present';
 const steps:OrderGuideStep[]=[
   {id:'brief',signal:brief,section:'details',helpKey:'orderGuide.help.brief'},
   {id:'profiles',signal:profiles,section:'details',helpKey:'orderGuide.help.profiles'},
   {id:'files',signal:files,section:'files',helpKey:'orderGuide.help.files'},
   {id:'review',signal:'check',section:'readiness',helpKey:'orderGuide.help.review'}
 ];
 const next=steps.find(s=>s.signal==='missing'||s.signal==='unknown')??
   steps.find(s=>s.id==='profiles'&&s.signal==='check')??steps[3];
 const suggested=isDraft?next.id:'review';
 return {steps,signalsPresent:steps.slice(0,3).filter(s=>s.signal==='present').length,
   signalsTotal:3,suggested,nextSection:GUIDE_SECTION[suggested],isDraft};
}
export const ORDER_SECTION_HELP:Record<WorkspaceSection,GuideStepId>={
 details:'brief',files:'files',intake:'files',readiness:'review',
 layers:'profiles',revisions:'review',changes:'review',chat:'review'
};
