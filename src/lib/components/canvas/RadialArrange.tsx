import React, {useEffect,useId,useRef,useState} from 'react';
import {atom,useEditor,useValue,type Editor} from '@tldraw/tldraw';
import {applyRadialPlan,prepareRadialPlan,type RadialPlan} from './drawing-radial';
import {cadRevision,CadOperationError} from './cad-plans';
import {getCadSelectionPageBounds} from './cad-bounds';
import {cadPointToCanvas,canvasPointToCad,validCadPoint,type CadPoint,type CadSettings} from './cad-settings';
import {useWorkbenchText} from './workbench-copy';
import {enRadial} from './radial-copy';
import {readDrawingRotationPivot} from './drawing-rotation-pivot';
import {TRANSFORM_ANCHORS,transformAnchorPoint,type TransformAnchor} from './drawing-transform';
import {useTransformText} from './transform-copy';
import {canWriteCadSnapSettings} from './cad-snap-settings';

const numeric=(s:string)=>s.trim()?Number(s):NaN;
const toPage=(point:CadPoint,settings:CadSettings|null)=>settings?cadPointToCanvas(point,settings):{x:point.x,y:-point.y};
const fromPage=(point:CadPoint,settings:CadSettings|null)=>settings?canvasPointToCad(point,settings):{x:point.x,y:-point.y};

type RadialDraft={action:'rotate'|'copy';centerMode:'pick'|'selection'|'origin'|'custom';anchor:TransformAnchor;x:string;y:string;angle:string;copies:string;spacing:'full'|'step';rotateCopies:boolean};
type RadialSession={draft:RadialDraft;settings:CadSettings|null};
const preferences=new WeakMap<Editor,ReturnType<typeof atom<RadialSession>>>();
function session(editor:Editor,settings:CadSettings|null){
  let value=preferences.get(editor);
  if(!value){
    value=atom<RadialSession>('rotation and circular copy options',{settings,draft:{action:'rotate',centerMode:'pick',anchor:'center',x:'0',y:'0',angle:'30',copies:'5',spacing:'full',rotateCopies:true}});
    preferences.set(editor,value);
  }
  return value;
}
function displayDraft(saved:RadialSession,settings:CadSettings|null):RadialDraft {
  if(saved.settings?.unit===settings?.unit&&saved.settings?.scale===settings?.scale&&saved.settings?.originX===settings?.originX&&saved.settings?.originY===settings?.originY)return saved.draft;
  const point=toPage({x:numeric(saved.draft.x),y:numeric(saved.draft.y)},saved.settings),next=fromPage(point,settings);
  return {...saved.draft,x:Number.isFinite(next.x)?String(next.x):saved.draft.x,y:Number.isFinite(next.y)?String(next.y):saved.draft.y};
}
function centerFor(draft:RadialDraft,settings:CadSettings|null,bounds:ReturnType<typeof getCadSelectionPageBounds>,pivot:ReturnType<typeof readDrawingRotationPivot>):CadPoint|undefined {
  if(draft.centerMode==='pick')return pivot?.point??bounds?.center;
  if(draft.centerMode==='selection')return bounds?transformAnchorPoint(bounds,draft.anchor):undefined;
  return toPage(draft.centerMode==='origin'?{x:0,y:0}:{x:numeric(draft.x),y:numeric(draft.y)},settings);
}
const reviewKey=(draft:RadialDraft,settings:CadSettings|null,center:CadPoint|undefined)=>JSON.stringify([draft,settings,center]);

/** The existing circular-copy docker and Transformations mode use the same
 * controls and draft. Preview geometry remains local and never edits artwork. */
export function RadialArrange({settings,expanded=false,embedded=false,focusRequest=0}:{settings:CadSettings|null;expanded?:boolean;embedded?:boolean;focusRequest?:number}) {
  const editor=useEditor(),t=useWorkbenchText(),transformText=useTransformText(),id=useId(),first=useRef<HTMLSelectElement>(null);
  const [activity,setActivity]=useState(0);
  useEffect(()=>{
    let mounted=true,queued=false,previous=canWriteCadSnapSettings(editor);
    const changed=()=>{
      if(queued)return;queued=true;
      // Some CAD tools and custom gestures do not create a record at their first
      // point. Read their state after native/capture event handlers have finished.
      queueMicrotask(()=>{queued=false;if(!mounted)return;const available=canWriteCadSnapSettings(editor);if(available!==previous){previous=available;setActivity(value=>value+1);}});
    };
    const win=editor.getContainer().ownerDocument.defaultView;
    const events=['pointerdown','pointerup','pointercancel','lostpointercapture','keydown','keyup','blur'] as const;
    editor.on('event',changed);events.forEach(event=>win?.addEventListener(event,changed,true));
    return ()=>{mounted=false;editor.off('event',changed);events.forEach(event=>win?.removeEventListener(event,changed,true));};
  },[editor]);
  const saved=useValue('shared radial options',()=>session(editor,settings).get(),[editor]);
  const draft=displayDraft(saved,settings),{action,centerMode,anchor,x,y,angle,copies,spacing,rotateCopies}=draft;
  const state=useValue('radial arrangement',()=>({revision:cadRevision(editor),bounds:getCadSelectionPageBounds(editor),pivot:readDrawingRotationPivot(editor),selected:[...editor.getSelectedShapeIds()],
    readonly:editor.getInstanceState().isReadonly,available:canWriteCadSnapSettings(editor),locked:[...editor.getShapeAndDescendantIds(editor.getSelectedShapeIds())].some(shapeId=>editor.isShapeOrAncestorLocked(shapeId))}),[editor,activity]);
  const [review,setReview]=useState<{plan:RadialPlan;key:string}>(),[message,setMessage]=useState<keyof typeof enRadial>();
  useEffect(()=>{if(focusRequest)first.current?.focus();},[focusRequest]);
  const update=(patch:Partial<RadialDraft>)=>{session(editor,settings).set({draft:{...displayDraft(session(editor,settings).get(),settings),...patch},settings});setMessage(undefined);};
  const center=centerFor(draft,settings,state.bounds,state.pivot);
  const count=action==='copy'?numeric(copies):0,step=action==='copy'&&spacing==='full'?360/(count+1):numeric(angle);
  const key=reviewKey(draft,settings,center);
  const stale=!!review&&(review.key!==key||review.plan.revision!==state.revision);
  const disabled=!state.available||state.locked||!state.selected.length;
  const validCenter=!!center&&validCadPoint(center),validCount=Number.isInteger(count)&&count>=0&&count<=200&&(action!=='copy'||count>=1);
  const validAngle=Number.isFinite(step)&&Math.abs(step)>=1e-8&&Math.abs(step)<360&&(!count||Math.abs(step)*count<360-1e-8);
  const valid=validCenter&&validCount&&validAngle,errorId=!valid&&!disabled?id+'-invalid':undefined;
  const centerDisplay=center?fromPage(center,settings):undefined,unit=settings?.unit??'px';
  const fmt=(n:number)=>n.toFixed(settings?.precision??2);
  const liveKey=()=>{const latest=displayDraft(session(editor,settings).get(),settings);return reviewKey(latest,settings,centerFor(latest,settings,getCadSelectionPageBounds(editor),readDrawingRotationPivot(editor)));};
  const controls=<>
    <p className="drawing-help">{t('radialHelp')}</p>
    {(state.readonly||state.locked||!state.selected.length||!state.available)&&<p className="drawing-help" role="status">{t(state.readonly||state.locked?'radialProtected':!state.available?'radialBusy':'radialSelection')}</p>}
    <form onSubmit={event=>{event.preventDefault();setMessage(undefined);setReview(undefined);try{
      if(disabled||!canWriteCadSnapSettings(editor))return;
      if(!center||!valid)throw new CadOperationError('radialInvalid');
      if(liveKey()!==key)throw new CadOperationError('radialStale');
      setReview({plan:prepareRadialPlan(editor,{center,angle:step,copies:count,rotateCopies},state.selected),key});
    }catch(error){const code=error instanceof CadOperationError?error.code:'';setMessage(Object.hasOwn(enRadial,code)?code as keyof typeof enRadial:'radialFailed');}}}>
      <fieldset className="drawing-workbench-fields" disabled={disabled}>
        <label><span>{t('radialAction')}</span><select ref={first} value={action} onChange={e=>update({action:e.target.value as typeof action})} data-testid="drawing-radial-action"><option value="rotate">{t('radialRotate')}</option><option value="copy">{t('radialCopy')}</option></select></label>
        <label><span>{t('radialCenter')}</span><select value={centerMode} onChange={e=>{
          const mode=e.target.value as typeof centerMode,point=center?fromPage(center,settings):undefined;
          update({centerMode:mode,...(mode==='custom'&&point?{x:String(point.x),y:String(point.y)}:{})});
        }} data-testid="drawing-radial-center"><option value="pick">{t('radialPickCenter')}</option><option value="selection">{t('radialSelectionAnchor')}</option><option value="origin">{t('radialOrigin')}</option><option value="custom">{t('radialCustom')}</option></select></label>
        {centerMode==='pick'&&<p className="drawing-help">{t('radialPickHelp')}</p>}
        {centerMode==='selection'&&<fieldset className="drawing-transform-anchor"><legend>{transformText('reference')}</legend><div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:3}}>
          {TRANSFORM_ANCHORS.map(value=><button key={value} type="button" aria-label={transformText(value)} title={transformText(value)} aria-pressed={anchor===value} onClick={()=>update({anchor:value})}><span aria-hidden="true">{anchor===value?'●':'○'}</span></button>)}
        </div></fieldset>}
        {centerMode==='custom'?<>
          <label><span>{t('radialX')} ({unit})</span><input type="number" step="any" required value={x} aria-invalid={!validCenter||undefined} aria-describedby={errorId} onChange={e=>update({x:e.target.value})} data-testid="drawing-radial-x"/></label>
          <label><span>{t('radialY')} ↑ ({unit})</span><input type="number" step="any" required value={y} aria-invalid={!validCenter||undefined} aria-describedby={errorId} onChange={e=>update({y:e.target.value})} data-testid="drawing-radial-y"/></label>
        </>:centerDisplay&&<p className="drawing-help" data-testid="drawing-radial-center-value">X {fmt(centerDisplay.x)} · Y ↑ {fmt(centerDisplay.y)} {unit}</p>}
        <p className="drawing-help">{t('radialReferenceHelp')}</p>
        {action==='copy'&&<>
          <label><span>{t('radialCopies')}</span><input type="number" min={1} max={200} step={1} required value={copies} aria-invalid={!validCount||undefined} aria-describedby={errorId} onChange={e=>update({copies:e.target.value})} data-testid="drawing-radial-copies"/></label>
          <label><span>{t('radialSpacing')}</span><select value={spacing} onChange={e=>update({spacing:e.target.value as typeof spacing})} data-testid="drawing-radial-spacing"><option value="full">{t('radialFull')}</option><option value="step">{t('radialStep')}</option></select></label>
          <label className="drawing-cad-check"><input type="checkbox" checked={rotateCopies} onChange={e=>update({rotateCopies:e.target.checked})}/><span>{t('radialOrientation')}</span></label>
        </>}
        {(action==='rotate'||spacing==='step')&&<label><span>{t('radialAngle')}</span><input type="number" min={-359.999999} max={359.999999} step="any" required value={angle} aria-invalid={!validAngle||undefined} aria-describedby={errorId} onChange={e=>update({angle:e.target.value})} data-testid="drawing-radial-angle"/></label>}
        {errorId&&<p id={errorId} className="drawing-help" role="alert">{t('radialInvalid')}</p>}
        <button type="submit" disabled={!valid} aria-describedby={errorId} data-testid="drawing-radial-preview">{t('radialPreview')}</button>
      </fieldset>
    </form>
    {review&&<div className="drawing-cad-report">
      <PlacementPreview plan={review.plan}/>
      <dl className="drawing-cad-values"><dt>{t('radialStepValue')}</dt><dd>{review.plan.options.angle.toFixed(4)}°</dd><dt>{t('radialGenerated')}</dt><dd>{review.plan.generated}</dd></dl>
      <p className="drawing-help">{t('radialPreviewHelp')}</p>
      {stale&&<p className="drawing-help" role="status">{t('radialStale')}</p>}
      <button type="button" disabled={disabled||stale} data-testid="drawing-radial-apply" onClick={()=>{
        if(!canWriteCadSnapSettings(editor)){setMessage(editor.getInstanceState().isReadonly?'radialProtected':'radialBusy');return;}
        if(stale||liveKey()!==review.key){setMessage('radialStale');return;}
        const success=applyRadialPlan(editor,review.plan);setMessage(success?'radialDone':'radialFailed');setReview(undefined);if(success)editor.focus();
      }}>{t('radialApply')}</button>
      <button type="button" data-testid="drawing-radial-discard" onClick={()=>{setReview(undefined);setMessage(undefined);}}>{t('radialDiscard')}</button>
    </div>}
    {message&&<p className="drawing-help" role={message==='radialDone'?'status':'alert'}>{t(message)}</p>}
  </>;
  return embedded?<section className="drawing-radial" aria-label={t('radialTitle')} data-testid="drawing-radial">{controls}</section>:
    <details open={expanded||undefined} className="drawing-cad-section drawing-radial" data-testid="drawing-radial"><summary>{t('radialTitle')}</summary>{controls}</details>;
}
function PlacementPreview({plan}:{plan:RadialPlan}) {
  const t=useWorkbenchText(),points=[...plan.sourceBox,...plan.placements.flat(),plan.options.center];
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY;
  const pad=Math.max(w,h,1)*0.08,mark=pad*.4;
  const path=(box:CadPoint[])=>box.map(p=>`${p.x},${p.y}`).join(' ');
  return <><svg className="drawing-radial-preview" viewBox={`${minX-pad} ${minY-pad} ${w+pad*2} ${h+pad*2}`} role="img" aria-label={t('radialPlacement')}>
    <polygon className="is-original" points={path(plan.sourceBox)} vectorEffect="non-scaling-stroke"/>
    {plan.placements.map((box,i)=><polygon key={i} points={path(box)} vectorEffect="non-scaling-stroke"/>)}
    <path className="is-pivot" d={`M${plan.options.center.x-mark},${plan.options.center.y}h${mark*2} M${plan.options.center.x},${plan.options.center.y-mark}v${mark*2}`} vectorEffect="non-scaling-stroke"/>
  </svg><p className="drawing-radial-legend"><span className="is-original">{t('radialOriginal')}</span><span>{t('radialResult')}</span><span className="is-pivot">+ {t('radialCenter')}</span></p></>;
}
