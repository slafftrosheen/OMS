import React,{useEffect,useId,useRef,useState} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import type {CadSettings} from './cad-settings';
import {curveBounds,curvePathData} from './cad-curves';
import {prepareOutlineToObject,applyOutlineToObject,type OutlineToObjectPlan} from './drawing-outline-object';
import {useOutlineToObjectText,outlineToObjectError} from './outline-object-copy';

export function OutlineToObjectPanel({settings,revision,disabled,focusSequence}:{settings:CadSettings|null;revision:string;disabled:boolean;focusSequence?:number}){
 const editor=useEditor(),t=useOutlineToObjectText(),root=useRef<HTMLDetailsElement>(null),errorId=useId();
 const [tolerance,setTolerance]=useState('0.05'),[keepOriginal,setKeepOriginal]=useState(false),[acknowledged,setAcknowledged]=useState(false);
 const [review,setReview]=useState<{plan:OutlineToObjectPlan;key:string}>(),[message,setMessage]=useState<ReturnType<typeof outlineToObjectError>|'done'>();
 const readonly=useValue('outline conversion read-only',()=>editor.getInstanceState().isReadonly,[editor]);
 const blocked=disabled||readonly||!settings,toleranceMm=tolerance.trim()?Number(tolerance):NaN;
 const valid=Number.isFinite(toleranceMm)&&toleranceMm>=.001&&toleranceMm<=1,key=JSON.stringify([tolerance,keepOriginal,settings]);
 const stale=!!review&&(review.plan.revision!==revision||review.key!==key);
 useEffect(()=>{setAcknowledged(false);setMessage(undefined);},[key,revision]);
 useEffect(()=>{if(focusSequence!==undefined&&root.current){root.current.open=true;root.current.scrollIntoView({block:'nearest'});root.current.querySelector('summary')?.focus();}},[focusSequence]);
 const bounds=review?curveBounds(review.plan.items.flatMap(item=>item.previewContours)):null,padding=bounds?Math.max(bounds.w,bounds.h,.001)*.05:0;
 const overlap=!!review&&review.plan.items.some(item=>item.retainSource);
 const format=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:4});
 return <details className="drawing-cad-section" open ref={root} data-testid="drawing-outline-to-object">
  <summary>{t('title')}</summary><p className="drawing-help">{t('help')}</p>
  <fieldset className="drawing-cad-fields" disabled={blocked} aria-describedby={errorId}>
   <label className="drawing-cad-field"><span>{t('tolerance')}</span><input type="number" min={.001} max={1} step="any" value={tolerance} aria-invalid={!valid} onChange={event=>setTolerance(event.target.value)}/></label>
   <label className="drawing-cad-check"><input type="checkbox" checked={keepOriginal} onChange={event=>setKeepOriginal(event.target.checked)}/>{t('keep')}</label>
   <p className="drawing-help">{t('replaceHelp')}</p>
   {!valid&&<p className="drawing-help is-error" role="alert">{t('invalid')}</p>}
   <button type="button" disabled={!valid} onClick={()=>{if(blocked||!valid||!settings)return;try{setReview({plan:prepareOutlineToObject(editor,settings,{toleranceMm,keepOriginal}),key});setAcknowledged(false);setMessage(undefined);}catch(error){setReview(undefined);setMessage(outlineToObjectError(error));}}}>{t('review')}</button>
  </fieldset>
  {review&&bounds&&<>
   <svg role="img" aria-label={t('preview')} viewBox={[bounds.x-padding,bounds.y-padding,bounds.w+2*padding,bounds.h+2*padding].join(' ')} style={{width:'100%',height:160,background:'#fff'}}>
    <title>{t('preview')}</title>{review.plan.items.map(item=><path key={item.sourceId} d={curvePathData(item.previewContours)} fill={item.paint.fill} fillOpacity={item.paint.fillOpacity} opacity={item.previewOpacity} fillRule="nonzero" stroke="none"/>)}
   </svg>
   <dl className="drawing-cad-values"><dt>{t('count')}</dt><dd>{review.plan.items.length}</dd><dt>{t('nodes')}</dt><dd>{review.plan.nodeCount}</dd><dt>{t('size')}</dt><dd>{format(review.plan.widthMm)} × {format(review.plan.heightMm)}</dd></dl>
   <p className="drawing-help">{t('approximation')}</p>
   {overlap&&<p className="drawing-help">{t('overlap')}</p>}
   {review.plan.transparency&&<><p className="drawing-help" role="status">{t('transparency')}</p><label className="drawing-cad-check"><input type="checkbox" checked={acknowledged} disabled={blocked||stale} onChange={event=>setAcknowledged(event.target.checked)}/>{t('acknowledge')}</label></>}
   {stale&&<p className="drawing-help is-error" role="alert">{t('changed')}</p>}
   <button type="button" disabled={blocked||stale||!valid||review.plan.transparency&&!acknowledged} onClick={()=>{if(blocked||stale||!valid||review.plan.transparency&&!acknowledged)return;if(applyOutlineToObject(editor,review.plan)){setReview(undefined);setMessage('done');}else setMessage('failed');}}>{t('apply')}</button>
  </>}
  {message&&<p id={errorId} className={'drawing-help'+(message==='done'?'':' is-error')} role={message==='done'?'status':'alert'}>{t(message)}</p>}
 </details>;
}
