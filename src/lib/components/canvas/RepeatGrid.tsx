import React,{useEffect,useId,useRef,useState} from 'react';
import {useEditor,useValue,type Editor,type TLShapeId} from '@tldraw/tldraw';
import {applyRepeatGrid,prepareRepeatGrid,repeatDrawingRevision,type DrawingOperationError,type RepeatGridOptions,type RepeatGridPlan} from './drawing-operations';
import {canvasLengthToUnit,unitLengthToCanvas,type CadSettings} from './cad-settings';
import {useDrawingText} from './drawing-copy';
import {useCadText} from './cad-copy';
import {useRepeatText} from './repeat-copy';

const preferences=new WeakMap<Editor,RepeatGridOptions>();
const number=(value:string)=>value.trim()?Number(value):NaN;
const display=(value:number,settings:CadSettings|null)=>String(settings?canvasLengthToUnit(value,settings):value);
const toCanvas=(value:string,settings:CadSettings|null)=>settings?unitLengthToCanvas(number(value),settings):number(value);

export function RepeatGrid({selected,disabled,settings,focusRequest=0}:{
  selected:readonly TLShapeId[];disabled:boolean;settings:CadSettings|null;focusRequest?:number
}){
  const editor=useEditor(),t=useRepeatText(),{label}=useDrawingText(),{label:cadLabel}=useCadText();
  const errorText=(code:DrawingOperationError)=>code==='repeatProtected'?t('protected'):code==='repeatLimit'?t('limit'):label(code);
  const revision=useValue('repeat drawing revision',()=>repeatDrawingRevision(editor),[editor]);
  const section=useRef<HTMLDetailsElement>(null),firstInput=useRef<HTMLInputElement>(null),errorId=useId();
  const initial=preferences.get(editor)??{rows:2,columns:2,gapX:24,gapY:24};
  const [values,setValues]=useState(()=>({rows:String(initial.rows),columns:String(initial.columns),
    gapX:display(initial.gapX,settings),gapY:display(initial.gapY,settings)}));
  const [spacing,setSpacing]=useState<'gap'|'offset'>(initial.spacing??'gap');
  const [directionX,setDirectionX]=useState<1|-1>(initial.directionX??1),[directionY,setDirectionY]=useState<1|-1>(initial.directionY??1);
  const previousSettings=useRef(settings);
  const [review,setReview]=useState<{plan:RepeatGridPlan;key:string}>(),[message,setMessage]=useState('');
  useEffect(()=>{
    if(!focusRequest)return;
    if(section.current)section.current.open=true;
    firstInput.current?.focus();
  },[focusRequest]);
  useEffect(()=>{
    const previous=previousSettings.current;
    setValues(current=>{
      const convert=(value:string)=>{
        const distance=toCanvas(value,previous);
        return Number.isFinite(distance)?display(distance,settings):value;
      };
      return {...current,gapX:convert(current.gapX),gapY:convert(current.gapY)};
    });
    previousSettings.current=settings;
  },[settings?.unit,settings?.scale]);
  const rows=number(values.rows),columns=number(values.columns),gapX=toCanvas(values.gapX,settings),gapY=toCanvas(values.gapY,settings);
  const options:RepeatGridOptions={rows,columns,gapX,gapY,spacing,directionX,directionY};
  const key=JSON.stringify(options),stale=!!review&&(review.key!==key||review.plan.revision!==revision);
  const valid=Number.isInteger(rows)&&Number.isInteger(columns)&&rows>=1&&columns>=1&&rows<=20&&columns<=20&&rows*columns>=2&&
    [gapX,gapY].every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)&&
    (spacing!=='offset'||(gapX>=0&&gapY>=0&&(columns===1||gapX>0)&&(rows===1||gapY>0)));
  useEffect(()=>{if(valid)preferences.set(editor,options);},[editor,key,valid]);
  const unit=settings?.unit??'px',limit=settings?canvasLengthToUnit(10000,settings):10000;
  const distance=(value:number)=>(settings?canvasLengthToUnit(value,settings):value).toFixed(settings?.precision??2);
  return <details ref={section} className="drawing-repeat" data-testid="drawing-repeat">
    <summary>{t('title')}</summary>
    <form onSubmit={event=>{
      event.preventDefault();setMessage('');setReview(undefined);
      if(!valid||disabled)return;
      const result=prepareRepeatGrid(editor,options,[...selected]);
      if(result.ok)setReview({plan:result.value,key});else setMessage(errorText(result.error));
    }}>
      <fieldset className="drawing-style-fields" disabled={disabled} aria-describedby={!valid?errorId:undefined}>
        {(['rows','columns'] as const).map((field,index)=><label key={field}><span>{label(field)}</span>
          <input ref={index===0?firstInput:undefined} type="number" min={1} max={20} step={1} required value={values[field]}
            onChange={event=>{setValues(current=>({...current,[field]:event.target.value}));setMessage('');}}/>
        </label>)}
        <label><span>{t('spacing')}</span><select value={spacing} onChange={event=>{setSpacing(event.target.value as typeof spacing);setMessage('');}}>
          <option value="gap">{t('edgeGap')}</option><option value="offset">{t('offset')}</option>
        </select></label>
        {(['gapX','gapY'] as const).map(field=><label key={field}>
          <span>{spacing==='gap'?cadLabel(field):t(field==='gapX'?'horizontal':'vertical')} ({unit})</span>
          <input type="number" step="any" min={spacing==='offset'?0:-limit} max={limit} required value={values[field]}
            onChange={event=>{setValues(current=>({...current,[field]:event.target.value}));setMessage('');}}/>
        </label>)}
        <label><span>{t('horizontal')}</span><select value={directionX} onChange={event=>setDirectionX(Number(event.target.value) as 1|-1)}>
          <option value={1}>{t('right')}</option><option value={-1}>{t('left')}</option>
        </select></label>
        <label><span>{t('vertical')}</span><select value={directionY} onChange={event=>setDirectionY(Number(event.target.value) as 1|-1)}>
          <option value={1}>{t('down')}</option><option value={-1}>{t('up')}</option>
        </select></label>
        <button type="submit" disabled={!valid}>{t('preview')}</button>
      </fieldset>
      <p className="drawing-help">{t(spacing==='gap'?'gapHelp':'offsetHelp')}</p>
      {!valid&&<p id={errorId} className="drawing-help is-error" role="alert">{t('invalid')}</p>}
    </form>
    {review&&<div className="drawing-cad-report">
      <GridPreview plan={review.plan}/>
      <dl className="drawing-cad-values">
        <dt>{t('generated')}</dt><dd>{review.plan.generated}</dd>
        <dt>{t('extent')}</dt><dd>{distance(review.plan.bounds.w+Math.max(...review.plan.offsets.map(p=>Math.abs(p.x))))} × {distance(review.plan.bounds.h+Math.max(...review.plan.offsets.map(p=>Math.abs(p.y))))} {unit}</dd>
      </dl>
      <p className="drawing-help">{t('previewHelp')}</p>
      {stale&&<p role="status">{t('stale')}</p>}
      <button type="button" disabled={disabled||stale} onClick={()=>{
        const result=applyRepeatGrid(editor,review.plan);
        setMessage(result.ok?`${label('copiesCreated')}: ${result.value}`:errorText(result.error));
        setReview(undefined);if(result.ok)editor.focus();
      }}>{t('apply')}</button>
    </div>}
    {message&&<p className="drawing-help" role="status">{message}</p>}
  </details>;
}

function GridPreview({plan}:{plan:RepeatGridPlan}){
  const t=useRepeatText(),{w,h}=plan.bounds,positions=[{x:0,y:0},...plan.offsets];
  const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys);
  const width=Math.max(...xs)+w-minX,height=Math.max(...ys)+h-minY,padding=Math.max(width,height,1)*0.06;
  const points=(x:number,y:number)=>`${x},${y} ${x+w},${y} ${x+w},${y+h} ${x},${y+h}`;
  return <>
    <svg className="drawing-radial-preview" viewBox={`${minX-padding} ${minY-padding} ${width+2*padding} ${height+2*padding}`} role="img" aria-label={t('layout')}>
      {plan.offsets.map((offset,index)=><polygon key={index} points={points(offset.x,offset.y)} vectorEffect="non-scaling-stroke"/>)}
      <polygon className="is-original" points={points(0,0)} vectorEffect="non-scaling-stroke"/>
    </svg>
    <p className="drawing-radial-legend"><span className="is-original">{t('original')}</span><span>{t('copies')}</span></p>
  </>;
}
