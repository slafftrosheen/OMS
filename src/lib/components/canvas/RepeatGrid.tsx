import React,{useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {useEditor,useValue,type Editor,type TLShapeId} from '@tldraw/tldraw';
import {applyRepeatGrid,MAX_REPEAT_AXIS,prepareRepeatGrid,repeatDrawingRevision,type RepeatError,type RepeatGridOptions,type RepeatGridPlan,type RepeatOptions} from './drawing-operations';
import {canvasLengthToUnit,DEFAULT_CAD_SETTINGS,unitLengthToCanvas,type CadSettings} from './cad-settings';
import {drawingPageBounds,fitDrawingPage} from './drawing-pages';
import {drawingRepeatPreview} from './DrawingRepeatOverlay';
import {useDrawingText} from './drawing-copy';
import {useCadText} from './cad-copy';
import {useRepeatText} from './repeat-copy';
import {drawingDuplicateOffsetFromDisplay,drawingDuplicateOffsetToDisplay,MAX_DRAWING_DUPLICATE_OFFSET,readDrawingDuplicateOffset,writeDrawingDuplicateOffset} from './drawing-duplicate';
import {canWriteCadSnapSettings} from './cad-snap-settings';

const preferences=new WeakMap<Editor,RepeatGridOptions & {fit:boolean;margin:number}>();
const defaultMargin=unitLengthToCanvas(5,DEFAULT_CAD_SETTINGS);
const number=(value:string)=>value.trim()?Number(value):NaN;
const display=(value:number,settings:CadSettings|null)=>String(settings?canvasLengthToUnit(value,settings):value);
const toCanvas=(value:string,settings:CadSettings|null)=>settings?unitLengthToCanvas(number(value),settings):number(value);

export function RepeatGrid({selected,disabled,settings,focusRequest=0,expanded=false,active=true,onSetup}:{
  selected:readonly TLShapeId[];disabled:boolean;settings:CadSettings|null;focusRequest?:number;expanded?:boolean;
  active?:boolean;onSetup?:()=>void
}){
  const editor=useEditor(),t=useRepeatText(),{label}=useDrawingText(),{label:cadLabel}=useCadText();
  const errorText=(code:RepeatError)=>{
    if(code==='repeatProtected')return t('protected');
    if(code==='repeatLimit')return t('limit');
    if(code==='repeatOutsideSheet'||code==='repeatNoRoom'||code==='pageNeedsSize')
      return t(code==='pageNeedsSize'?'sheetNeedsPage':code);
    return label(code);
  };
  const initial=preferences.get(editor)??{rows:2,columns:2,gapX:24,gapY:24,fit:false,margin:defaultMargin};
  const [fit,setFit]=useState(initial.fit);
  const revision=useValue('repeat drawing revision',()=>repeatDrawingRevision(editor,fit),[editor,fit]);
  const hasSheet=useValue('repeat drawing page',()=>!!drawingPageBounds(editor),[editor]);
  const section=useRef<HTMLDetailsElement>(null),layoutInput=useRef<HTMLSelectElement>(null),errorId=useId();
  const [values,setValues]=useState(()=>({rows:String(initial.rows),columns:String(initial.columns),
    gapX:display(initial.gapX,settings),gapY:display(initial.gapY,settings),margin:display(initial.margin,settings)}));
  const [spacing,setSpacing]=useState<'gap'|'offset'>(initial.spacing??'gap');
  const [directionX,setDirectionX]=useState<1|-1>(initial.directionX??1),[directionY,setDirectionY]=useState<1|-1>(initial.directionY??1);
  const previousSettings=useRef(settings);
  const [review,setReview]=useState<{plan:RepeatGridPlan;key:string}>(),[message,setMessage]=useState('');
  const [showOverlay,setShowOverlay]=useState(true);
  const [sectionOpen,setSectionOpen]=useState(expanded);
  useEffect(()=>{
    if(!focusRequest)return;
    if(section.current)section.current.open=true;
    layoutInput.current?.focus();
  },[focusRequest]);
  useEffect(()=>{
    const previous=previousSettings.current;
    setValues(current=>{
      const convert=(value:string)=>{
        const distance=toCanvas(value,previous);
        return Number.isFinite(distance)?display(distance,settings):value;
      };
      return {...current,gapX:convert(current.gapX),gapY:convert(current.gapY),margin:convert(current.margin)};
    });
    previousSettings.current=settings;
  },[settings?.unit,settings?.scale]);
  const rows=number(values.rows),columns=number(values.columns),gapX=toCanvas(values.gapX,settings),gapY=toCanvas(values.gapY,settings);
  const margin=toCanvas(values.margin,settings);
  const manual:RepeatGridOptions={rows,columns,gapX,gapY,spacing,directionX,directionY};
  const options:RepeatOptions=fit?{mode:'sheet',margin,gapX,gapY,directionX,directionY}:manual;
  const effectiveSpacing=fit?'gap':spacing;
  const key=JSON.stringify(options),stale=!!review&&(review.key!==key||review.plan.revision!==revision);
  const preview=active&&sectionOpen&&showOverlay&&!disabled&&!stale?review?.plan:undefined;
  useLayoutEffect(()=>{
    if(!preview)return;
    const overlay=drawingRepeatPreview(editor);
    overlay.set(preview);
    return ()=>{
      if(overlay.get()===preview)overlay.set(null);
    };
  },[editor,preview]);
  const validCounts=Number.isInteger(rows)&&Number.isInteger(columns)&&rows>=1&&columns>=1&&
    rows<=MAX_REPEAT_AXIS&&columns<=MAX_REPEAT_AXIS&&rows*columns>=2;
  const valid=[gapX,gapY].every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)&&
    (fit ? Number.isFinite(margin)&&margin>=0&&gapX>=0&&gapY>=0 : validCounts&&
      (spacing!=='offset'||(gapX>=0&&gapY>=0&&(columns===1||gapX>0)&&(rows===1||gapY>0))));
  useEffect(()=>{
    if(valid&&validCounts&&Number.isFinite(margin)&&margin>=0)preferences.set(editor,{...manual,fit,margin});
  },[editor,valid,validCounts,rows,columns,gapX,gapY,spacing,directionX,directionY,fit,margin]);
  const unit=settings?.unit??'px',limit=settings?canvasLengthToUnit(10000,settings):10000;
  const distance=(value:number)=>(settings?canvasLengthToUnit(value,settings):value).toFixed(settings?.precision??2);
  function update(field:keyof typeof values,value:string){
    setValues(current=>({...current,[field]:value}));
    setMessage('');
  }
  return <details ref={section} open={expanded || undefined} onToggle={event=>setSectionOpen(event.currentTarget.open)}
    className="drawing-repeat" data-testid="drawing-repeat">
    <summary>{t('title')}</summary>
    <form onSubmit={event=>{
      event.preventDefault();setMessage('');setReview(undefined);
      if(!valid||disabled||(fit&&!hasSheet))return;
      const result=prepareRepeatGrid(editor,options,[...selected]);
      if(result.ok===true)setReview({plan:result.value,key});else setMessage(errorText(result.error));
    }}>
      <fieldset className="drawing-style-fields" disabled={disabled} aria-describedby={!valid?errorId:undefined}>
        <label><span>{t('mode')}</span><select ref={layoutInput} aria-label={t('mode')} value={fit?'sheet':'manual'} onChange={event=>{
          setFit(event.target.value==='sheet');setReview(undefined);setMessage('');
        }}>
          <option value="manual">{t('manual')}</option><option value="sheet">{t('sheet')}</option>
        </select></label>
        {fit ? <label><span>{t('margin')} ({unit})</span>
          <input type="number" min={0} step="any" required value={values.margin} onChange={event=>update('margin',event.target.value)}/>
        </label> : <>
          {(['rows','columns'] as const).map(field=><label key={field}><span>{label(field)}</span>
            <input type="number" min={1} max={MAX_REPEAT_AXIS} step={1} required value={values[field]}
              onChange={event=>update(field,event.target.value)}/>
          </label>)}
          <label><span>{t('spacing')}</span><select aria-label={t('spacing')} value={spacing} onChange={event=>{setSpacing(event.target.value as typeof spacing);setMessage('');}}>
            <option value="gap">{t('edgeGap')}</option><option value="offset">{t('offset')}</option>
          </select></label>
        </>}
        {(['gapX','gapY'] as const).map(field=><label key={field}>
          <span>{effectiveSpacing==='gap'?cadLabel(field):t(field==='gapX'?'horizontal':'vertical')} ({unit})</span>
          <input type="number" step="any" min={fit||effectiveSpacing==='offset'?0:-limit} max={limit} required value={values[field]}
            onChange={event=>update(field,event.target.value)}/>
        </label>)}
        <label><span>{t('horizontal')}</span><select aria-label={t('horizontal')} value={directionX} onChange={event=>setDirectionX(Number(event.target.value) as 1|-1)}>
          <option value={1}>{t('right')}</option><option value={-1}>{t('left')}</option>
        </select></label>
        <label><span>{t('vertical')}</span><select aria-label={t('vertical')} value={directionY} onChange={event=>setDirectionY(Number(event.target.value) as 1|-1)}>
          <option value={1}>{t('down')}</option><option value={-1}>{t('up')}</option>
        </select></label>
        <button type="submit" disabled={!valid||(fit&&!hasSheet)}>{t('preview')}</button>
      </fieldset>
      <p className="drawing-help">{t(fit?'sheetHelp':spacing==='gap'?'gapHelp':'offsetHelp')}</p>
      {fit&&!hasSheet&&<div className="drawing-repeat-setup">
        <p className="drawing-help">{t('sheetNeedsPage')}</p>
        {onSetup&&<button type="button" onClick={onSetup}>{label('pageSetup')}</button>}
      </div>}
      {!valid&&<p id={errorId} className="drawing-help is-error" role="alert">{t(fit?'invalidSheet':'invalid')}</p>}
    </form>
    {review&&<div className="drawing-cad-report">
      <GridPreview plan={review.plan}/>
      <dl className="drawing-cad-values">
        {review.plan.sheet&&<>
          <dt>{t('sheetSize')}</dt><dd>{distance(review.plan.sheet.bounds.w)} × {distance(review.plan.sheet.bounds.h)} {unit}</dd>
          <dt>{t('layout')}</dt><dd>{review.plan.rows} × {review.plan.columns}</dd>
        </>}
        <dt>{t('generated')}</dt><dd>{review.plan.generated}</dd>
        <dt>{t('extent')}</dt><dd>{distance(review.plan.bounds.w+Math.max(...review.plan.offsets.map(p=>Math.abs(p.x))))} × {distance(review.plan.bounds.h+Math.max(...review.plan.offsets.map(p=>Math.abs(p.y))))} {unit}</dd>
      </dl>
      <p className="drawing-help">{t('previewHelp')}</p>
      {review.plan.sheet?.limit==='axis'&&<p className="drawing-help" role="status">{t('sheetCap').replaceAll('{limit}',String(MAX_REPEAT_AXIS))}</p>}
      {review.plan.sheet?.limit==='capacity'&&<p className="drawing-help" role="status">{t('sheetCapacity')}</p>}
      {stale&&<p role="status">{t('stale')}</p>}
      <div className="drawing-repeat-review-controls">
        <label><input type="checkbox" checked={showOverlay} disabled={disabled||stale}
          onChange={event=>setShowOverlay(event.target.checked)}/>{t('showOverlay')}</label>
        {review.plan.sheet&&<button type="button" disabled={stale} onClick={()=>{
          if(!fitDrawingPage(editor))setMessage(label('changedFailed'));
        }}>{label('pageFit')}</button>}
      </div>
      <button type="button" disabled={disabled||stale} onClick={()=>{
        const result=applyRepeatGrid(editor,review.plan);
        setMessage(result.ok===true?`${label('copiesCreated')}: ${result.value}`:errorText(result.error));
        setReview(undefined);if(result.ok)editor.focus();
      }}>{t('apply')}</button>
    </div>}
    {message&&<p className="drawing-help" role="status">{message}</p>}
    <DuplicateOffsetControls settings={settings}/>
  </details>;
}

function DuplicateOffsetControls({settings}:{settings:CadSettings|null}){
  const editor=useEditor(),t=useRepeatText(),errorId=useId(),helpId=useId(),busyId=useId();
  const [activity,setActivity]=useState(0);
  useEffect(()=>{
    let mounted=true,queued=false,previous=canWriteCadSnapSettings(editor);
    const changed=()=>{
      if(queued)return;
      queued=true;
      // Drafts and custom pointer ownership are updated after event dispatch;
      // their first point need not create a document/store record.
      queueMicrotask(()=>{
        queued=false;if(!mounted)return;
        const available=canWriteCadSnapSettings(editor);
        if(available!==previous){previous=available;setActivity(value=>value+1);}
      });
    };
    const win=editor.getContainer().ownerDocument.defaultView;
    const events=['pointerdown','pointerup','pointercancel','lostpointercapture','keydown','keyup','blur'] as const;
    editor.on('event',changed);
    events.forEach(event=>win?.addEventListener(event,changed,true));
    return ()=>{mounted=false;editor.off('event',changed);events.forEach(event=>win?.removeEventListener(event,changed,true));};
  },[editor]);
  const saved=useValue('default duplicate offsets',()=>({pageId:editor.getCurrentPageId(),...readDrawingDuplicateOffset(editor),
    readOnly:editor.getInstanceState().isReadonly,available:canWriteCadSnapSettings(editor)}),[editor,activity]);
  const shown=drawingDuplicateOffsetToDisplay(saved,settings);
  const [draft,setDraft]=useState(()=>({x:String(shown.x),y:String(shown.y)}));
  const previous=useRef({pageId:saved.pageId,x:saved.x,y:saved.y,settings});
  const ownSave=useRef('');
  const [result,setResult]=useState<'duplicateSaved'|'duplicateFailed'>();
  useEffect(()=>{
    const old=previous.current;
    if(old.pageId!==saved.pageId||old.x!==saved.x||old.y!==saved.y){
      const display=drawingDuplicateOffsetToDisplay(saved,settings);
      setDraft({x:String(display.x),y:String(display.y)});
    }else if(old.settings?.unit!==settings?.unit||old.settings?.scale!==settings?.scale){
      setDraft(current=>{
        const convert=(value:string)=>{
          const px=toCanvas(value,old.settings);
          return Number.isFinite(px)?display(px,settings):value;
        };
        return {x:convert(current.x),y:convert(current.y)};
      });
    }
    previous.current={pageId:saved.pageId,x:saved.x,y:saved.y,settings};
    if(ownSave.current!==JSON.stringify([saved.pageId,saved.x,saved.y]))setResult(undefined);
    ownSave.current='';
  },[saved.pageId,saved.x,saved.y,settings?.unit,settings?.scale]);
  const offset=drawingDuplicateOffsetFromDisplay({x:number(draft.x),y:number(draft.y)},settings);
  const unit=settings?.unit??'px',limit=settings?canvasLengthToUnit(MAX_DRAWING_DUPLICATE_OFFSET,settings):MAX_DRAWING_DUPLICATE_OFFSET;
  const invalid=(axis:'x'|'y')=>!Number.isFinite(number(draft[axis]))||Math.abs(number(draft[axis]))>limit;
  const busy=!saved.readOnly&&!saved.available;
  const describedBy=[helpId,!offset?errorId:null,busy?busyId:null].filter(Boolean).join(' ');
  return <form className="drawing-production-section" data-testid="drawing-duplicate-offset" onSubmit={event=>{
    event.preventDefault();
    if(!offset||!saved.available||!canWriteCadSnapSettings(editor))return;
    const success=writeDrawingDuplicateOffset(editor,offset);
    ownSave.current=success?JSON.stringify([saved.pageId,offset.x,offset.y]):'';
    setResult(success?'duplicateSaved':'duplicateFailed');
  }}>
    <h4>{t('duplicateOffsetTitle')}</h4>
    <fieldset className="drawing-style-fields" disabled={!saved.available} aria-describedby={describedBy}>
      {(['x','y'] as const).map(axis=><label key={axis}><span>{t(axis==='x'?'duplicateX':'duplicateY')} ({unit})</span>
        <input type="number" step="any" required min={-limit} max={limit} value={draft[axis]}
          aria-invalid={invalid(axis)} aria-describedby={describedBy}
          onChange={event=>{setDraft(current=>({...current,[axis]:event.target.value}));setResult(undefined);}}/>
      </label>)}
      <button type="submit" disabled={!offset}>{t('saveDuplicateOffsets')}</button>
    </fieldset>
    <p id={helpId} className="drawing-help">{t('duplicateOffsetHelp')}</p>
    {busy&&<p id={busyId} className="drawing-help" role="status">{t('duplicateBusy')}</p>}
    {!offset&&<p id={errorId} className="drawing-help is-error" role="alert">{t('duplicateInvalid')}</p>}
    {result&&<p className={`drawing-help${result==='duplicateFailed'?' is-error':''}`} role={result==='duplicateFailed'?'alert':'status'}>{t(result)}</p>}
  </form>;
}

function GridPreview({plan}:{plan:RepeatGridPlan}){
  const t=useRepeatText(),{x,y,w,h}=plan.bounds,positions=[{x:0,y:0},...plan.offsets];
  const xs=positions.map(p=>p.x),ys=positions.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys);
  const sheet=plan.sheet;
  const view=sheet
    ? {x:sheet.bounds.x-x,y:sheet.bounds.y-y,w:sheet.bounds.w,h:sheet.bounds.h}
    : {x:minX,y:minY,w:Math.max(...xs)+w-minX,h:Math.max(...ys)+h-minY};
  const padding=Math.max(view.w,view.h,1)*0.06;
  const points=(x:number,y:number)=>`${x},${y} ${x+w},${y} ${x+w},${y+h} ${x},${y+h}`;
  return <>
    <svg className={sheet?'drawing-radial-preview drawing-repeat-sheet-preview':'drawing-radial-preview'}
      viewBox={`${view.x-padding} ${view.y-padding} ${view.w+2*padding} ${view.h+2*padding}`} role="img" aria-label={t(sheet?'sheetPreview':'layout')}>
      {sheet&&<>
        <rect className="drawing-repeat-sheet" x={view.x} y={view.y} width={view.w} height={view.h} vectorEffect="non-scaling-stroke"/>
        {sheet.margin>0&&<rect className="drawing-repeat-margin" x={view.x+sheet.margin} y={view.y+sheet.margin}
          width={view.w-2*sheet.margin} height={view.h-2*sheet.margin} vectorEffect="non-scaling-stroke"/>}
      </>}
      {plan.offsets.map((offset,index)=><polygon key={index} points={points(offset.x,offset.y)} vectorEffect="non-scaling-stroke"/>)}
      <polygon className="is-original" points={points(0,0)} vectorEffect="non-scaling-stroke"/>
    </svg>
    <p className="drawing-radial-legend"><span className="is-original">{t('original')}</span><span>{t('copies')}</span>
      {!!sheet&&sheet.margin>0&&<span className="is-margin">{t('margin')}</span>}
    </p>
  </>;
}
