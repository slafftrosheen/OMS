import React,{useEffect,useId,useRef,useState} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import {unitMm,type CadSettings} from './cad-settings';
import {inspectDrawingPreflight,locatePreflightIssue,preflightRevision,type DrawingPreflight,type PreflightKind} from './drawing-preflight';
import {usePreflightText} from './preflight-copy';
export function DrawingPreflightPanel({settings,focusSequence}:{settings:CadSettings|null;focusSequence?:number}){
 const editor=useEditor(),t=usePreflightText(),root=useRef<HTMLElement>(null),errorId=useId();
 const [scope,setScope]=useState<'selected'|'all'>('selected'),[threshold,setThreshold]=useState('0.1');
 const [report,setReport]=useState<DrawingPreflight>(),[filter,setFilter]=useState<PreflightKind|'all'>('all');
 const [error,setError]=useState<'empty'|'limit'|'failed'>();
 const previousUnit=useRef(settings?.unit??'mm');
 useEffect(()=>{const unit=settings?.unit??'mm',factor=unitMm(previousUnit.current)/unitMm(unit);previousUnit.current=unit;if(factor!==1)setThreshold(value=>value.trim()&&Number.isFinite(Number(value))?String(Number(value)*factor):value);},[settings?.unit]);
 useEffect(()=>{if(focusSequence)root.current?.querySelector<HTMLElement>('select')?.focus();},[focusSequence]);
 const revision=useValue('preflight drawing revision',()=>report?preflightRevision(editor):'', [editor,report]);
 const thresholdMm=threshold.trim()?Number(threshold)*unitMm(settings?.unit??'mm'):NaN;
 const valid=Number.isFinite(thresholdMm)&&thresholdMm>0&&thresholdMm<=100;
 const stale=!!report&&(revision!==report.revision||report.scope!==scope||Math.abs(report.thresholdMm-thresholdMm)>1e-12||!valid);
 const issueKinds:PreflightKind[]=['open','zero','short','duplicate','clipped','invalid','text','unsupported'];
 const display=(mm:number)=>(mm/unitMm(settings?.unit??'mm')).toLocaleString(undefined,{maximumFractionDigits:6})+' '+(settings?.unit??'mm');
 return <section ref={root} data-testid="drawing-preflight">
  <p className="drawing-help">{t('help')}</p>
  {!settings&&<p className="drawing-help">{t('setup')}</p>}
  <fieldset className="drawing-cad-fields" disabled={!settings}>
   <label className="drawing-cad-field"><span>{t('scope')}</span><select value={scope} onChange={event=>{setScope(event.target.value as typeof scope);setError(undefined);}}><option value="selected">{t('selected')}</option><option value="all">{t('all')}</option></select></label>
   <label className="drawing-cad-field"><span>{t('threshold')} ({settings?.unit??'mm'})</span><input type="number" min={0} max={100/unitMm(settings?.unit??'mm')} step="any" value={threshold} aria-invalid={!valid} aria-describedby={!valid?errorId:undefined} onChange={event=>setThreshold(event.target.value)}/></label>
   {!valid&&<p id={errorId} className="drawing-help is-error" role="alert">{t('invalidSettings')}</p>}
   <button type="button" disabled={!valid} onClick={()=>{if(!settings)return;try{setReport(inspectDrawingPreflight(editor,settings,scope,thresholdMm));setError(undefined);}catch(err){setError(err instanceof Error&&['empty','limit'].includes(err.message)?err.message as 'empty'|'limit':'failed');setReport(undefined);}}}>{t(report?'refresh':'scan')}</button>
  </fieldset>
  {error&&<p className="drawing-help is-error" role="alert">{t(error)}</p>}
  {report&&<>
   <dl className="drawing-cad-values">
    <dt>{t('checked')}</dt><dd>{report.checked}</dd><dt>{t('omitted')}</dt><dd>{report.omitted}</dd>
    <dt>{t('openCount')}</dt><dd>{report.open}</dd><dt>{t('closedCount')}</dt><dd>{report.closed}</dd><dt>{t('issues')}</dt><dd>{report.issueCount}</dd>
   </dl>
   {stale&&<p className="drawing-help is-error" role="alert">{t('stale')}</p>}
   {report.truncated&&<p className="drawing-help" role="status">{t('truncated')}</p>}
   {!report.issueCount?<p className="drawing-help" role="status">{t('none')}</p>:<>
    <label className="drawing-cad-field"><span>{t('filter')}</span><select value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}><option value="all">{t('everything')}</option>{issueKinds.map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}</select></label>
    <ul className="drawing-cad-omissions">{report.issues.map((issue,index)=>filter!=='all'&&issue.kind!==filter?null:<li key={index}>
     <strong>{issue.name}</strong><span>{t(issue.kind)}{issue.contour!==undefined?' · '+t('contour')+' '+(issue.contour+1):''}{issue.segment!==undefined?' · '+t('segment')+' '+(issue.segment+1):''}</span>
     {issue.otherName&&<span>{t('duplicateOf')}: {issue.otherName}{issue.otherContour!==undefined?' · '+t('contour')+' '+(issue.otherContour+1):''}</span>}
     {issue.lengthMm!==undefined&&<span>{t('upper')}: {display(issue.lengthMm)}</span>}
     <button type="button" disabled={stale} onClick={()=>{if(!locatePreflightIssue(editor,report,index))setError('failed');}}>{t('locate')}</button>
    </li>)}</ul>
   </>}
  </>}
  <details><summary>{t('issues')}</summary><p className="drawing-help">{t('limits')}</p></details>
 </section>;
}
