import React, {useEffect,useRef,useState} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import {applyRadialPlan,prepareRadialPlan,type RadialPlan} from './drawing-radial';
import {cadRevision,CadOperationError} from './cad-plans';
import {getCadSelectionPageBounds} from './cad-bounds';
import {cadPointToCanvas,canvasPointToCad,type CadPoint,type CadSettings} from './cad-settings';
import {useWorkbenchText} from './workbench-copy';
import {enRadial} from './radial-copy';

const numeric=(s:string)=>s.trim()?Number(s):NaN;
const toPage=(point:CadPoint,settings:CadSettings|null)=>settings?cadPointToCanvas(point,settings):{x:point.x,y:-point.y};
const fromPage=(point:CadPoint,settings:CadSettings|null)=>settings?canvasPointToCad(point,settings):{x:point.x,y:-point.y};

export function RadialArrange({settings}:{settings:CadSettings|null}) {
  const editor=useEditor(),t=useWorkbenchText();
  const state=useValue('radial arrangement',()=>({revision:cadRevision(editor),bounds:getCadSelectionPageBounds(editor),selected:[...editor.getSelectedShapeIds()],readonly:editor.getInstanceState().isReadonly}),[editor]);
  const [action,setAction]=useState<'rotate'|'copy'>('rotate'),[centerMode,setCenterMode]=useState<'selection'|'origin'|'custom'>('selection');
  const [x,setX]=useState('0'),[y,setY]=useState('0'),[angle,setAngle]=useState('30'),[copies,setCopies]=useState('5');
  const [spacing,setSpacing]=useState<'full'|'step'>('full'),[rotateCopies,setRotateCopies]=useState(true);
  const [review,setReview]=useState<{plan:RadialPlan;key:string}>(),[message,setMessage]=useState<keyof typeof enRadial>();
  const priorSettings=useRef(settings);
  useEffect(()=>{
    // Preserve the physical pivot when display units, origin or scale changes.
    const point=toPage({x:numeric(x),y:numeric(y)},priorSettings.current);
    const next=fromPage(point,settings);
    if(Number.isFinite(next.x)&&Number.isFinite(next.y)){setX(String(next.x));setY(String(next.y));}
    priorSettings.current=settings;
  },[settings?.unit,settings?.scale,settings?.originX,settings?.originY]);
  const center=centerMode==='selection'?state.bounds?.center:centerMode==='origin'?toPage({x:0,y:0},settings):toPage({x:numeric(x),y:numeric(y)},settings);
  const count=action==='copy'?numeric(copies):0,step=action==='copy'&&spacing==='full'?360/(count+1):numeric(angle);
  const key=JSON.stringify([action,centerMode,x,y,angle,copies,spacing,rotateCopies,settings]);
  const stale=!!review&&(review.key!==key||review.plan.revision!==state.revision);
  const disabled=state.readonly||!state.selected.length;
  const valid=!!center&&Number.isFinite(center.x)&&Number.isFinite(center.y)&&Number.isFinite(step)&&Number.isInteger(count)&&count>=0&&(action!=='copy'||count>=1);
  const centerDisplay=center?fromPage(center,settings):undefined,unit=settings?.unit??'px';
  const fmt=(n:number)=>n.toFixed(settings?.precision??2);
  return <details className="drawing-cad-section drawing-radial" data-testid="drawing-radial">
    <summary>{t('radialTitle')}</summary>
    <p className="drawing-help">{t('radialHelp')}</p>
    <form onSubmit={event=>{event.preventDefault();setMessage(undefined);setReview(undefined);try{
      if(!center||!valid)throw new CadOperationError('radialInvalid');
      setReview({plan:prepareRadialPlan(editor,{center,angle:step,copies:count,rotateCopies},state.selected),key});
    }catch(error){const code=error instanceof CadOperationError?error.code:'';setMessage(code in enRadial?code as keyof typeof enRadial:'radialFailed');}}}>
      <fieldset className="drawing-workbench-fields" disabled={disabled}>
        <label><span>{t('radialAction')}</span><select value={action} onChange={e=>setAction(e.target.value as typeof action)}><option value="rotate">{t('radialRotate')}</option><option value="copy">{t('radialCopy')}</option></select></label>
        <label><span>{t('radialCenter')}</span><select value={centerMode} onChange={e=>setCenterMode(e.target.value as typeof centerMode)}><option value="selection">{t('radialSelectionCenter')}</option><option value="origin">{t('radialOrigin')}</option><option value="custom">{t('radialCustom')}</option></select></label>
        {centerMode==='custom'?<>
          <label><span>{t('radialX')} ({unit})</span><input type="number" step="any" required value={x} onChange={e=>setX(e.target.value)}/></label>
          <label><span>{t('radialY')} ↑ ({unit})</span><input type="number" step="any" required value={y} onChange={e=>setY(e.target.value)}/></label>
        </>:centerDisplay&&<p className="drawing-help">X {fmt(centerDisplay.x)} · Y ↑ {fmt(centerDisplay.y)} {unit}</p>}
        {action==='copy'&&<>
          <label><span>{t('radialCopies')}</span><input type="number" min={1} max={200} step={1} required value={copies} onChange={e=>setCopies(e.target.value)}/></label>
          <label><span>{t('radialSpacing')}</span><select value={spacing} onChange={e=>setSpacing(e.target.value as typeof spacing)}><option value="full">{t('radialFull')}</option><option value="step">{t('radialStep')}</option></select></label>
          <label className="drawing-cad-check"><input type="checkbox" checked={rotateCopies} onChange={e=>setRotateCopies(e.target.checked)}/><span>{t('radialOrientation')}</span></label>
        </>}
        {(action==='rotate'||spacing==='step')&&<label><span>{t('radialAngle')}</span><input type="number" min={-359.999999} max={359.999999} step="any" required value={angle} onChange={e=>setAngle(e.target.value)}/></label>}
        <button type="submit" disabled={!valid}>{t('radialPreview')}</button>
      </fieldset>
    </form>
    {review&&<div className="drawing-cad-report">
      <PlacementPreview plan={review.plan}/>
      <dl className="drawing-cad-values"><dt>{t('radialStepValue')}</dt><dd>{review.plan.options.angle.toFixed(4)}°</dd><dt>{t('radialGenerated')}</dt><dd>{review.plan.generated}</dd></dl>
      <p className="drawing-help">{t('radialPreviewHelp')}</p>
      {stale&&<p role="status">{t('radialStale')}</p>}
      <button type="button" disabled={disabled||stale} onClick={()=>{
        const success=applyRadialPlan(editor,review.plan);setMessage(success?'radialDone':'radialFailed');setReview(undefined);if(success)editor.focus();
      }}>{t('radialApply')}</button>
    </div>}
    {message&&<p role={message==='radialDone'?'status':'alert'}>{t(message)}</p>}
  </details>;
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
