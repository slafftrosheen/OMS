import React,{useEffect,useId,useRef,useState} from 'react';
import {useEditor,useValue,type Editor} from '@tldraw/tldraw';
import {cadRevision,CadOperationError} from './cad-plans';
import {canvasLengthToUnit,unitLengthToCanvas,canvasPointToCad,cadPointToCanvas,type CadSettings} from './cad-settings';
import {TRANSFORM_ANCHORS,transformAnchorPoint,getTransformSelectionBounds,prepareTransformPlan,applyTransformPlan,type TransformAnchor,type TransformOptions,type TransformPlan} from './drawing-transform';
import {enTransform,useTransformText} from './transform-copy';

type Draft={kind:'position'|'scale';relative:boolean;size:'percent'|'dimensions';anchor:TransformAnchor;proportional:boolean;x:string;y:string;copies:string};
const preferences=new WeakMap<Editor,{draft:Draft;settings:CadSettings|null}>();
const number=(value:string)=>value.trim()?Number(value):NaN;
const display=(value:number,settings:CadSettings|null)=>String(settings?canvasLengthToUnit(value,settings):value);
const length=(value:string,settings:CadSettings|null)=>settings?unitLengthToCanvas(number(value),settings):number(value);
function convertDraft(draft:Draft,previous:CadSettings|null,next:CadSettings|null):Draft {
  if(draft.kind==='scale'&&draft.size==='percent')return draft;
  if(draft.kind==='position'&&!draft.relative){
    const point={x:number(draft.x),y:number(draft.y)};
    if(![point.x,point.y].every(Number.isFinite))return draft;
    const canvas=previous?cadPointToCanvas(point,previous):point;
    const result=next?canvasPointToCad(canvas,next):canvas;
    return {...draft,x:String(result.x),y:String(result.y)};
  }
  return {...draft,x:Number.isFinite(number(draft.x))?display(length(draft.x,previous),next):draft.x,
    y:Number.isFinite(number(draft.y))?display(length(draft.y,previous)*(draft.kind==='position'&&!!previous!==!!next?-1:1),next):draft.y};
}
export function DrawingTransformPanel({settings,focusRequest=0}:{settings:CadSettings|null;focusRequest?:number}){
  const editor=useEditor(),t=useTransformText(),id=useId(),first=useRef<HTMLInputElement>(null);
  const revision=useValue('transformation revision',()=>cadRevision(editor),[editor]);
  const readonly=useValue('transformation readonly',()=>editor.getInstanceState().isReadonly,[editor]);
  const bounds=useValue('transformation selection bounds',()=>getTransformSelectionBounds(editor),[editor]);
  const [draft,setDraft]=useState<Draft>(()=>{const saved=preferences.get(editor);return saved?convertDraft(saved.draft,saved.settings,settings):{kind:'position',relative:true,size:'percent',anchor:'center',proportional:true,x:'0',y:'0',copies:'0'};});
  const [review,setReview]=useState<{plan:TransformPlan;key:string}>(),[message,setMessage]=useState<{key:keyof typeof enTransform;success?:boolean}>();
  const previousSettings=useRef(settings);
  useEffect(()=>{const previous=previousSettings.current;setDraft(current=>convertDraft(current,previous,settings));previousSettings.current=settings;},[settings?.unit,settings?.scale,settings?.originX,settings?.originY]);
  useEffect(()=>{preferences.set(editor,{draft,settings});},[editor,draft,settings]);
  useEffect(()=>{if(focusRequest)first.current?.focus();},[focusRequest]);
  useEffect(()=>{
    if(draft.kind==='scale'&&draft.size==='dimensions'&&draft.proportional&&bounds&&bounds.w>0)
      setDraft(current=>({...current,y:String(number(current.x)*bounds.h/bounds.w)}));
  },[bounds?.w,bounds?.h]);
  const update=(patch:Partial<Draft>)=>{setDraft(current=>({...current,...patch}));setMessage(undefined);};
  const resetCoordinates=(next:Draft)=>{
    if(next.kind==='position'){
      const point=bounds?transformAnchorPoint(bounds,next.anchor):{x:0,y:0};
      const displayed=settings?canvasPointToCad(point,settings):point;
      return {...next,x:next.relative?'0':String(displayed.x),y:next.relative?'0':String(displayed.y)};
    }
    return {...next,x:next.size==='percent'?'100':display(bounds?.w??0,settings),y:next.size==='percent'?'100':display(bounds?.h??0,settings)};
  };
  const changeMode=(patch:Partial<Draft>)=>{update(resetCoordinates({...draft,...patch}));};
  const edit=(axis:'x'|'y',value:string)=>{
    const patch:Partial<Draft>={[axis]:value};
    if(draft.kind==='scale'&&draft.proportional){
      const other=axis==='x'?'y':'x';
      patch[other]=draft.size==='percent'?value:bounds&&bounds[axis==='x'?'w':'h']>0?String(number(value)*bounds[axis==='x'?'h':'w']/bounds[axis==='x'?'w':'h']):'';
    }
    update(patch);
  };
  const point={x:number(draft.x),y:number(draft.y)};
  const position=draft.relative?{x:length(draft.x,settings),y:length(draft.y,settings)*(settings?-1:1)}:settings?cadPointToCanvas(point,settings):point;
  const scaleX=draft.size==='percent'?point.x/100:length(draft.x,settings)/(bounds?.w??0);
  const scaleY=draft.proportional?scaleX:draft.size==='percent'?point.y/100:length(draft.y,settings)/(bounds?.h??0);
  const options:TransformOptions=draft.kind==='position'?{kind:'position',relative:draft.relative,...position,anchor:draft.anchor,copies:number(draft.copies)}:
    {kind:'scale',x:scaleX,y:scaleY,anchor:draft.anchor,copies:number(draft.copies)};
  const key=JSON.stringify([options,settings]),stale=!!review&&(key!==review.key||review.plan.revision!==revision);
  const disabled=readonly||!bounds,unit=settings?.unit??'px';
  const runPreview=()=>{
    setReview(undefined);setMessage(undefined);
    try{setReview({plan:prepareTransformPlan(editor,options),key});}
    catch(error){const code=error instanceof CadOperationError?error.code:'';setMessage({key:Object.hasOwn(enTransform,code)?code as keyof typeof enTransform:'failed'});}
  };
  return <section className="drawing-transform" data-testid="drawing-transform">
    <p className="drawing-help">{t('help')}</p>
    {!bounds&&<p className="drawing-help" role="status">{t(readonly?'protected':'selection')}</p>}
    <form onSubmit={event=>{event.preventDefault();if(!disabled)runPreview();}}>
      <fieldset className="drawing-workbench-fields" disabled={disabled}>
        <label><span>{t('title')}</span><select value={draft.kind} onChange={event=>changeMode({kind:event.target.value as Draft['kind']})}><option value="position">{t('position')}</option><option value="scale">{t('scale')}</option></select></label>
        <fieldset className="drawing-transform-anchor"><legend>{t('reference')}</legend><div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:3}}>
          {TRANSFORM_ANCHORS.map(anchor=><button key={anchor} type="button" aria-label={t(anchor)} title={t(anchor)} aria-pressed={draft.anchor===anchor} onClick={()=>draft.kind==='position'&&!draft.relative?changeMode({anchor}):update({anchor})}><span aria-hidden="true">{draft.anchor===anchor?'●':'○'}</span></button>)}
        </div></fieldset>
        {draft.kind==='position'?<label className="drawing-cad-check"><input type="checkbox" checked={draft.relative} onChange={event=>changeMode({relative:event.target.checked})}/><span>{t('relative')}</span></label>:<>
          <label><span>{t('scale')}</span><select value={draft.size} onChange={event=>changeMode({size:event.target.value as Draft['size']})}><option value="percent">{t('percent')}</option><option value="dimensions">{t('dimensions')}</option></select></label>
          <label className="drawing-cad-check"><input type="checkbox" checked={draft.proportional} onChange={event=>{if(event.target.checked){const y=draft.size==='percent'?draft.x:bounds&&bounds.w>0?String(number(draft.x)*bounds.h/bounds.w):'';update({proportional:true,y});}else update({proportional:false});}}/><span>{t('proportionsLabel')}</span></label>
        </>}
        {(['x','y'] as const).map((axis,index)=><label key={axis}><span>{t(draft.kind==='position'?axis:axis==='x'?'width':'height')} ({draft.kind==='scale'&&draft.size==='percent'?'%':unit})</span><input ref={index===0?first:undefined} type="number" step="any" required min={draft.kind==='scale'?Number.MIN_VALUE:undefined} value={draft[axis]} onChange={event=>edit(axis,event.target.value)}/></label>)}
        <label><span>{t('copies')}</span><input type="number" min={0} max={200} step={1} required value={draft.copies} aria-describedby={id+'-copies'} onChange={event=>update({copies:event.target.value})}/></label>
        <p id={id+'-copies'} className="drawing-help">{t('copyHelp')}</p>
        <button type="submit">{t('preview')}</button>
      </fieldset>
    </form>
    {review&&<><TransformPreview plan={review.plan} label={t('preview')}/><dl className="drawing-cad-values">
      <dt>{t('original')}</dt><dd>{display(review.plan.source.w,settings)} × {display(review.plan.source.h,settings)} {unit}</dd>
      <dt>{t('result')}{review.plan.results.length>1?' (1–'+review.plan.results.length+')':''}</dt><dd>{[review.plan.results[0],...(review.plan.results.length>1?[review.plan.results.at(-1)!]:[])].map(b=>display(b.w,settings)+' × '+display(b.h,settings)+' '+unit).join(' → ')}</dd>
    </dl><p className="drawing-help">{t('objects')}: {review.plan.generated}. {t('previewHelp')}</p><button type="button" disabled={disabled||stale} onClick={()=>{const ok=applyTransformPlan(editor,review.plan);setMessage({key:ok?'done':'failed',success:ok});if(ok){setReview(undefined);editor.focus();}}}>{t('apply')}</button></>}
    {stale&&<p className="drawing-help" role="status">{t('stale')}</p>}
    {message&&<p className="drawing-help" role={message.success?'status':'alert'}>{t(message.key)}</p>}
  </section>;
}
function TransformPreview({plan,label}:{plan:TransformPlan;label:string}){
  const boxes=[plan.source,...plan.results],minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y));
  const width=Math.max(...boxes.map(b=>b.x+b.w))-minX,height=Math.max(...boxes.map(b=>b.y+b.h))-minY,pad=Math.max(width,height,1)*0.08;
  return <svg role="img" aria-label={label} viewBox={[minX-pad,minY-pad,width+2*pad,height+2*pad].join(' ')} style={{width:'100%',height:160}}>
    {boxes.map((b,index)=><rect key={index} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={index?'var(--drawing-accent, #2563eb)':'currentColor'} strokeWidth={1.5} strokeDasharray={index?undefined:'4 3'} vectorEffect="non-scaling-stroke"/>)}
  </svg>;
}
