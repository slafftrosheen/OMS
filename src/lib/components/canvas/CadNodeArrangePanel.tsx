import React,{useEffect,useRef,useState} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import type {CadBezierShape} from './shapes/CadBezierShape';
import {getSelectedCadNodes,setSelectedCadNodes,setCadNodeEditing} from './cad-node-selection';
import {prepareNodeArrange,applyNodeArrange,type NodeArrangeOptions,type NodeArrangePlan} from './cad-node-arrange';
import {cadRevision} from './cad-plans';
import {curveBounds,curvePathData} from './cad-curves';
import {unitLengthToCanvas,canvasLengthToUnit,type CadSettings} from './cad-settings';
import {useNodeArrangeText} from './node-arrange-copy';

const actions=['move','left','centerX','right','top','centerY','bottom','distributeX','distributeY'] as const;
type Action=typeof actions[number];
const numeric=(s:string)=>s.trim()?Number(s):NaN;
function options(action:Action,x:string,y:string,settings:CadSettings|null):NodeArrangeOptions{
  if(action==='move')return {kind:'move',x:settings?unitLengthToCanvas(numeric(x),settings):numeric(x),y:settings?-unitLengthToCanvas(numeric(y),settings):numeric(y)};
  if(action.startsWith('distribute'))return {kind:'distribute',axis:action==='distributeX'?'x':'y'};
  return {kind:'align',axis:['left','centerX','right'].includes(action)?'x':'y',reference:['left','top'].includes(action)?'min':['right','bottom'].includes(action)?'max':'center'};
}
export function CadNodeArrangePanel({settings,disabled,focusSequence}:{settings:CadSettings|null;disabled:boolean;focusSequence?:number}){
  const editor=useEditor(),t=useNodeArrangeText(),section=useRef<HTMLDetailsElement>(null);
  const state=useValue('CAD node arrangement',()=>({revision:cadRevision(editor),shape:editor.getOnlySelectedShape(),nodes:getSelectedCadNodes(editor)}),[editor]);
  const shape=state.shape?.type==='cad-bezier'?state.shape as CadBezierShape:null;
  const [action,setAction]=useState<Action>('move'),[x,setX]=useState('0'),[y,setY]=useState('0'),[review,setReview]=useState<{plan:NodeArrangePlan;key:string}>(),[message,setMessage]=useState<'done'|'failed'|''>('');
  const previous=useRef(settings);
  useEffect(()=>{
    const old=previous.current;previous.current=settings;
    const convert=(s:string,axis:'x'|'y')=>{
      if(!s.trim()||!Number.isFinite(Number(s)))return s;
      let canvas=old?unitLengthToCanvas(Number(s),old):Number(s);if(axis==='y'&&old)canvas=-canvas;
      if(axis==='y'&&settings)canvas=-canvas;
      return String(settings?canvasLengthToUnit(canvas,settings):canvas);
    };
    setX(s=>convert(s,'x'));setY(s=>convert(s,'y'));
  },[settings?.unit,settings?.scale]);
  useEffect(()=>{if(focusSequence&&section.current){section.current.open=true;section.current.querySelector('summary')?.focus();}},[focusSequence]);
  const selected=state.nodes.map(n=>n.contourIndex+':'+n.nodeIndex),key=JSON.stringify([action,x,y,settings]);
  const stale=!!review&&(review.plan.revision!==state.revision||review.key!==key||JSON.stringify(review.plan.selected)!==JSON.stringify(state.nodes));
  const points=shape?shape.props.contours.flatMap((c,ci)=>c.nodes.map((_,ni)=>({contourIndex:ci,nodeIndex:ni}))):[];
  const enough=state.nodes.length>=(action==='move'?1:action.startsWith('distribute')?3:2);
  const valid=action!=='move'||[x,y].every(s=>s.trim()&&Number.isFinite(Number(s)));
  const bounds=review?curveBounds([...review.plan.source,...review.plan.result]):null,pad=bounds?Math.max(bounds.w,bounds.h,1)*0.05:1;
  return <details ref={section} className="drawing-cad-section" data-testid="drawing-cad-node-arrange" onFocusCapture={()=>setCadNodeEditing(editor,true)}>
    <summary>{t('title')}</summary>
    {!shape?<p className="drawing-help">{t('none')}</p>:<>
      <p className="drawing-help">{t('pick')}</p>
      <label className="drawing-cad-field"><span>{t('selection')} ({selected.length})</span><select multiple size={8} aria-label={t('selection')} value={selected} onChange={e=>{
        const next=Array.from(e.target.selectedOptions).map(o=>{const [ci,ni]=o.value.split(':').map(Number);return {contourIndex:ci,nodeIndex:ni};});
        setSelectedCadNodes(editor,next);setMessage('');
      }}>{points.map(n=><option key={n.contourIndex+':'+n.nodeIndex} value={n.contourIndex+':'+n.nodeIndex}>{n.contourIndex+1} : {n.nodeIndex+1}</option>)}</select></label>
      <div className="drawing-cad-actions"><button type="button" onClick={()=>setSelectedCadNodes(editor,points)}>{t('all')}</button><button type="button" onClick={()=>setSelectedCadNodes(editor,[])}>{t('clear')}</button></div>
      {!selected.length&&<p className="drawing-help">{t('staleSelection')}</p>}
      <p className="drawing-help">{t('drag')}</p>
      <fieldset className="drawing-cad-fields" disabled={disabled}>
        <label className="drawing-cad-field"><span>{t('action')}</span><select value={action} onChange={e=>{setAction(e.target.value as Action);setMessage('');}}>{actions.map(a=><option key={a} value={a}>{t(a)}</option>)}</select></label>
        {action==='move'&&<>{(['x','y'] as const).map(axis=><label key={axis} className="drawing-cad-field"><span>{t(axis)} ({settings?.unit??'px'})</span><input type="number" step="any" value={axis==='x'?x:y} aria-invalid={!((axis==='x'?x:y).trim())||!Number.isFinite(numeric(axis==='x'?x:y))} onChange={e=>{(axis==='x'?setX:setY)(e.target.value);setMessage('');}}/></label>)}</>}
        <p className="drawing-help">{t('axes')}</p>{!enough&&<p className="drawing-help">{t('count')}</p>}
        <button type="button" disabled={!enough||!valid} onClick={()=>{try{setReview({plan:prepareNodeArrange(editor,options(action,x,y,settings)),key});setMessage('');}catch{setReview(undefined);setMessage('failed');}}}>{t('review')}</button>
      </fieldset>
      {disabled&&<p className="drawing-help">{t('protected')}</p>}
      {review&&bounds&&<div className="drawing-cad-report">
        <svg className="drawing-cad-preview" role="img" aria-label={t('preview')} viewBox={[bounds.x-pad,bounds.y-pad,Math.max(bounds.w,0.001)+2*pad,Math.max(bounds.h,0.001)+2*pad].join(' ')}>
          <path d={curvePathData(review.plan.source)} fill="none" stroke="currentColor" opacity={0.35} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>
          <path d={curvePathData(review.plan.result)} fill="none" stroke="var(--brand)" vectorEffect="non-scaling-stroke"/>
        </svg>
        <p className="drawing-help">{t('before')} · {t('after')} · {t('changed')}: {review.plan.moved}</p>
        {stale&&<p className="drawing-help" role="status">{t('stale')}</p>}
        {!review.plan.moved&&<p className="drawing-help">{t('unchanged')}</p>}
        <button type="button" disabled={disabled||stale||!review.plan.moved} onClick={()=>{const success=applyNodeArrange(editor,review.plan);setMessage(success?'done':'failed');if(success)setReview(undefined);}}>{t('apply')}</button>
      </div>}
      {message&&<p className="drawing-help" role={message==='failed'?'alert':'status'}>{t(message)}</p>}
    </>}
  </details>;
}
