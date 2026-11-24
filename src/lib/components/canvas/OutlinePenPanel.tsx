import React,{useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useEditor,useValue} from '@tldraw/tldraw';
import {canvasLengthToUnit,cadMmPerPixel,unitMm,type CadSettings} from './cad-settings';
import {newCadOutlinePaint,prepareOutlineDefaultsPlan,applyOutlineDefaultsPlan,type OutlineDefaultsPlan} from './drawing-outline-defaults';
import {convertSelectionToCurves,getCadCurveConversionIssue} from './cad-editing';
import {OUTLINE_FIELDS,readOutlineSelection,prepareOutlinePlan,applyOutlinePlan,outlinePatchFromInput,type OutlineField,type OutlineInput,type OutlinePlan} from './drawing-outline';
import {useOutlineText,outlineError} from './outline-copy';
import {vectorPaint,CAD_HAIRLINE_FALLBACK_MM} from './cad-vector';
import {canWriteCadSnapSettings} from './cad-snap-settings';
import {assertCadEditable} from './cad-plans';

type Draft=Record<OutlineField,string>;
type WidthUnit=CadSettings['unit']|'pt';
const widthUnitMm=(unit:WidthUnit)=>unit==='pt'?25.4/72:unitMm(unit);
const numeric=(value:string)=>value.trim()?Number(value):NaN;
const widthPresetsMm = [0.10, 0.18, 0.25, 0.35, 0.50, 0.70, 1, 1.4, 2, 3, 5];
function draftFrom(p:ReturnType<typeof vectorPaint>,settings:CadSettings|null,widthUnit:WidthUnit):Draft{
 const length=(value:number)=>String(settings?canvasLengthToUnit(value,settings):value);
 return {stroke:p.stroke,strokeWidth:String(settings?p.strokeWidth*cadMmPerPixel(settings)/widthUnitMm(widthUnit):p.strokeWidth),hairline:String(!!p.hairline),strokeOpacity:String(p.strokeOpacity*100),
   lineCap:p.lineCap,lineJoin:p.lineJoin,miterLimit:String(p.miterLimit),dash:p.dash.map(v=>length(v)).join(' '),dashOffset:length(p.dashOffset)};
}
function inputFrom(draft:Draft,checked:OutlineField[],settings:CadSettings|null,widthUnit:WidthUnit):OutlineInput{
 const input:Record<string,unknown>={};
 for(const key of checked)input[key]=key==='strokeWidth'?numeric(draft.strokeWidth)*widthUnitMm(widthUnit)/(settings?unitMm(settings.unit):1):key==='hairline'?draft.hairline==='true':key==='dash'?(draft.dash.trim()?draft.dash.trim().split(/[\s,]+/).map(Number):[]):key==='strokeOpacity'?numeric(draft[key])/100:
   ['strokeWidth','miterLimit','dashOffset'].includes(key)?numeric(draft[key]):draft[key];
 return input as OutlineInput;
}
export function OutlinePenPanel({settings,revision,disabled,focusSequence,focusColor}:{settings:CadSettings|null;revision:string;disabled:boolean;focusSequence?:number;focusColor?:boolean}){
 const editor=useEditor(),t=useOutlineText(),section=useRef<HTMLDetailsElement>(null),errorId=useId();
 const [activity,setActivity]=useState(0);
 useEffect(()=>{
  let mounted=true,queued=false,previous=canWriteCadSnapSettings(editor);
  const changed=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(!mounted)return;const available=canWriteCadSnapSettings(editor);if(available!==previous){previous=available;setActivity(value=>value+1);}});};
  const win=editor.getContainer().ownerDocument.defaultView,events=['pointerdown','pointerup','pointercancel','lostpointercapture','keydown','keyup','blur'] as const;
  editor.on('event',changed);events.forEach(event=>win?.addEventListener(event,changed,true));
  return ()=>{mounted=false;editor.off('event',changed);events.forEach(event=>win?.removeEventListener(event,changed,true));};
 },[editor]);
 const available=useValue('outline available',()=>canWriteCadSnapSettings(editor),[editor,activity]);
 const source=useValue('outline selection',()=>{try{return readOutlineSelection(editor);}catch{return null;}},[editor]);
 const selectionEditable=useValue('outline selection editable',()=>{try{assertCadEditable(editor,source?.map(item=>item.shape.id)??[]);return true;}catch{return false;}},[editor,source]);
 const [widthUnit,setWidthUnit]=useState<WidthUnit>(settings?.unit??'mm');
 const [scopeChoice,setScopeChoice]=useState<'selection'|'defaults'>('selection');
 const scope=source?scopeChoice:'defaults';
 const defaults=useValue('new artwork outline',()=>settings?newCadOutlinePaint(editor,settings):null,[editor,settings]);
 const selectedPaint=scope==='defaults'?defaults:source?.[0]?.paint;
 const identity=JSON.stringify([scope,editor.getCurrentPageId(),source?.map(item=>item.shape.id),settings]);
 const sourcePaintKey=JSON.stringify(scope==='defaults'?defaults:source?.map(item=>OUTLINE_FIELDS.map(field=>item.paint[field])));
 const [loaded,setLoaded]=useState(''),[draft,setDraft]=useState<Draft>(()=>draftFrom(vectorPaint({},'black'),settings,widthUnit));
 const [checked,setChecked]=useState<OutlineField[]>([]),[preset,setPreset]=useState('custom');
 const [review,setReview]=useState<{plan:OutlinePlan|OutlineDefaultsPlan;key:string}>(),[message,setMessage]=useState<ReturnType<typeof outlineError>|'done'>();
 const reset=()=>{setDraft(draftFrom(selectedPaint??vectorPaint({},'black'),settings,widthUnit));setChecked([]);setPreset('custom');setReview(undefined);setMessage(undefined);setLoaded(identity);};
 useEffect(reset,[identity]);
 useEffect(()=>{
  if(loaded!==identity)return;
  const current=draftFrom(selectedPaint??vectorPaint({},'black'),settings,widthUnit);
  setDraft(previous=>({...current,...Object.fromEntries(checked.map(field=>[field,previous[field]]))}));
 },[sourcePaintKey,identity,checked.join('|')]);

 const readonly=useValue('outline read-only',()=>editor.getInstanceState().isReadonly,[editor]);
 const convertible = useValue('convert native outline geometry', () => !getCadCurveConversionIssue(editor), [editor]);
 const blocked=disabled||!available||!settings||(scope==='selection'&&(!source||!selectionEditable))||loaded!==identity;
 const colorInput=useRef<HTMLInputElement>(null), consumedFocus=useRef<number>();
 useEffect(()=>{
  if(focusSequence===undefined||focusSequence===consumedFocus.current||!section.current)return;
  if(focusColor&&source&&!disabled&&!readonly&&settings&&loaded!==identity)return;
  consumedFocus.current=focusSequence;
  section.current.open=true;
  const target=focusColor&&!blocked?colorInput.current:section.current.querySelector('summary');
  target?.scrollIntoView({block:'nearest'});
  target?.focus();
 },[focusSequence,focusColor,blocked,source,disabled,readonly,settings,loaded,identity]);
 const input=inputFrom(draft,checked,settings,widthUnit),key=JSON.stringify([scope,draft,checked,settings,widthUnit]);
 let valid=false;try{if(settings&&checked.length){outlinePatchFromInput(input,settings);valid=true;}}catch{}
 const stale=!!review&&(review.plan.revision!==revision||review.key!==key);
 const width=numeric(draft.strokeWidth)*widthUnitMm(widthUnit)/(settings?unitMm(settings.unit):1);
 let validWidth=false;
 try { if(settings) { outlinePatchFromInput(draft.hairline==='true'?{hairline:true}:{strokeWidth:width},settings); validWidth=true; } } catch {}
 const prepare=(input:OutlineInput)=>scope==='defaults'?prepareOutlineDefaultsPlan(editor,input,settings!):prepareOutlinePlan(editor,input,settings!);
 const apply=(plan:OutlinePlan|OutlineDefaultsPlan)=>'target' in plan?applyOutlineDefaultsPlan(editor,plan):applyOutlinePlan(editor,plan);
 function applyField(field: 'stroke' | 'strokeWidth', input: OutlineInput) {
  if (!settings || blocked) return;
  try {
   const applied = apply(prepare(input));
   setMessage(applied ? (scope==='defaults'?'defaultsDone':'done') : 'failed');
   if (applied) {
    setReview(undefined);
    setChecked(previous => previous.filter(value => value !== field && !(field==='strokeWidth'&&value==='hairline')));
   }
  } catch (error) { setMessage(outlineError(error)); }
 }
 const previewScale=review ? Math.min(8,12/Math.max(0.001,...review.plan.samples.map(paint=>paint.strokeWidth))) : 1;
 const mixed=(field:OutlineField)=>scope==='selection'&&!!source&&source.some(item=>JSON.stringify(item.paint[field])!==JSON.stringify(source[0].paint[field])||field==='strokeWidth'&&!!item.paint.hairline!==!!source[0].paint.hairline);
 const edit=(field:OutlineField,value:string)=>{setDraft(old=>({...old,[field]:value}));setChecked(old=>old.includes(field)?old:[...old,field]);setMessage(undefined);};
 const widthChanged=checked.includes('strokeWidth')||checked.includes('hairline');
 const editWidth=(value:string,hairline:boolean)=>{setDraft(old=>({...old,strokeWidth:hairline?String(CAD_HAIRLINE_FALLBACK_MM/widthUnitMm(widthUnit)):value,hairline:String(hairline)}));setChecked(old=>[...old.filter(v=>v!=='strokeWidth'&&v!=='hairline'),'strokeWidth','hairline']);setMessage(undefined);};
 const field=(field:OutlineField,control:ReactNode)=> <div className="drawing-cad-field" key={field}>
   <label className="drawing-cad-check"><input type="checkbox" checked={field==='strokeWidth'?widthChanged:checked.includes(field)} aria-label={t('change')+' '+t(field)} onChange={event=>{setChecked(old=>{const fields:OutlineField[]=field==='strokeWidth'?['strokeWidth','hairline']:[field];return event.target.checked?[...old.filter(v=>!fields.includes(v)),...fields]:old.filter(v=>!fields.includes(v));});setMessage(undefined);}}/>
   <span>{t(field)}{['strokeWidth','dash','dashOffset'].includes(field)?' ('+(field==='strokeWidth'?widthUnit:settings?.unit??'px')+')':''}{mixed(field)&&!checked.includes(field)?' · '+t('mixed'):''}</span></label>{control}
 </div>;
 const select=(name:'lineCap'|'lineJoin',values:string[])=>field(name,<select aria-label={t(name)} value={draft[name]} onChange={event=>edit(name,event.target.value)}>{values.map(value=><option key={value} value={value}>{t(value as 'butt')}</option>)}</select>);
 return <details className="drawing-cad-section" open ref={section} data-testid="drawing-outline-pen">
  <summary>{t('title')}</summary><p className="drawing-help">{t('help')}</p>
  <label className="drawing-cad-field"><span>{t('target')}</span><select aria-label={t('target')} value={scope} disabled={disabled||!available} onChange={event=>setScopeChoice(event.target.value as 'selection'|'defaults')}><option value="selection" disabled={!source}>{t('selectedObjects')}</option><option value="defaults">{t('newObjects')}</option></select></label>
  {scope==='defaults'?<p className="drawing-help">{t('defaultsHelp')}</p>:<p className="drawing-help">{t('count')}: {source?.length}</p>}
  {scope==='selection'&&!selectionEditable&&<p className="drawing-help" role="status">{t('protected')}</p>}
  {!source&&<p className="drawing-help">{t('selection')}</p>}
  {!source && convertible && settings && <button type="button" disabled={disabled||readonly}
    onClick={()=>setMessage(convertSelectionToCurves(editor,settings)?'converted':'failed')}>{t('convertForOutline')}</button>}
  <fieldset className="drawing-cad-fields" disabled={blocked} aria-describedby={errorId}>
   {field('stroke',<>
    <div className="drawing-vector-paint-row"><input ref={colorInput} type="color" aria-label={t('stroke')} value={draft.stroke==='none'?'#000000':draft.stroke} onChange={event=>edit('stroke',event.target.value)}/>
      <label><input type="checkbox" checked={draft.stroke==='none'} onChange={event=>edit('stroke',event.target.checked?'none':'#000000')}/>{t('none')}</label></div>
    <button type="button" disabled={!checked.includes('stroke')} onClick={()=>applyField('stroke', {stroke:draft.stroke})}>{t('applyColor')}</button>
   </>)}
   {field('strokeWidth',<>
    <select aria-label={t('widthUnit')} value={widthUnit} onChange={event=>{const next=event.target.value as WidthUnit;setDraft(old=>({...old,strokeWidth:Number.isFinite(numeric(old.strokeWidth))?String(numeric(old.strokeWidth)*widthUnitMm(widthUnit)/widthUnitMm(next)):old.strokeWidth}));setWidthUnit(next);}}>{(['mm','cm','m','in','pt'] as const).map(unit=><option key={unit} value={unit}>{unit}</option>)}</select>
    <select aria-label={t('widthMode')} value={draft.hairline==='true'?'hairline':'custom'} onChange={event=>editWidth(draft.strokeWidth,event.target.value==='hairline')}><option value="hairline">{t('hairline')}</option><option value="custom">{t('customWidth')}</option></select>
    <input type="number" aria-label={t('strokeWidth')} min={0} step="any" disabled={draft.hairline==='true'} value={draft.strokeWidth} onChange={event=>editWidth(event.target.value,false)}/>
    <select aria-label={t('widthPresets')} value="" onChange={event=>{
      if(event.target.value==='hairline')editWidth(draft.strokeWidth,true);
      else if(event.target.value && settings) editWidth(String(Number((Number(event.target.value)/widthUnitMm(widthUnit)).toPrecision(12))),false);
    }}>
      <option value="">{t('widthPresets')}</option>
      <option value="hairline">{t('hairline')}</option>
      {widthPresetsMm.map(mm=><option key={mm} value={mm}>{mm} mm</option>)}
    </select>
    <p className="drawing-help">{t('hairlineHelp')}</p>
    <button type="button" disabled={!validWidth||!widthChanged} onClick={()=>applyField('strokeWidth',draft.hairline==='true'?{hairline:true}:{strokeWidth:width})}>{t('applyWidth')}</button>
   </>)}
   {field('strokeOpacity',<input type="number" aria-label={t('strokeOpacity')} min={0} max={100} step="any" value={draft.strokeOpacity} onChange={event=>edit('strokeOpacity',event.target.value)}/>)}
   {select('lineCap',['butt','round','square'])}{select('lineJoin',['miter','round','bevel'])}
   <p className="drawing-help">{t('cornersHelp')}</p>
   {field('miterLimit',<input type="number" aria-label={t('miterLimit')} min={1} max={1000} disabled={draft.lineJoin!=='miter'} step="any" value={draft.miterLimit} onChange={event=>edit('miterLimit',event.target.value)}/>)}
   {field('dash',<><select aria-label={t('dash')} value={preset} onChange={event=>{
     const value=event.target.value;setPreset(value);
     if(value==='custom')return;
     const width=numeric(draft.strokeWidth)*widthUnitMm(widthUnit)/(settings?unitMm(settings.unit):1),unit=settings?.unit?1/unitMm(settings.unit):1,w=draft.hairline==='true'?unit:Number.isFinite(width)&&width>0?width:unit;
     const factors=value==='solid'?[]:value==='dashed'?[3,2]:value==='dotted'?[1,2]:[3,2,1,2];
     edit('dash',factors.map(v=>String(v*w)).join(' '));
    }}>{['solid','dashed','dotted','dashdot','custom'].map(value=><option key={value} value={value}>{t(value as 'solid')}</option>)}</select>
    <input type="text" aria-label={t('custom')+' '+t('dash')} value={draft.dash} maxLength={1000} onChange={event=>{setPreset('custom');edit('dash',event.target.value);}}/><p className="drawing-help">{t('dashHelp')}</p></>)}
   {field('dashOffset',<input type="number" aria-label={t('dashOffset')} step="any" value={draft.dashOffset} onChange={event=>edit('dashOffset',event.target.value)}/>)}
   <div className="drawing-cad-actions"><button type="button" disabled={!valid} onClick={()=>{try{if(settings)setReview({plan:prepare(input),key});setMessage(undefined);}catch(error){setReview(undefined);setMessage(outlineError(error));}}}>{t('review')}</button><button type="button" onClick={reset}>{t('reset')}</button></div>
  </fieldset>
  <p id={errorId} className="drawing-help" role={checked.length&&!valid?'alert':undefined}>{!checked.length?t('empty'):!valid?t('invalid'):''}</p>
  {review&&<div className="drawing-cad-report">
   <p>{'target' in review.plan?t('newObjects'):`${t('count')}: ${review.plan.count}`}</p><p className="drawing-help">{t('sample')}</p>
   {review.plan.samples.map((paint,index)=><div key={index}>{paint.stroke==='none'||paint.strokeWidth===0||paint.strokeOpacity===0?<span>{t('noStroke')}</span>:<svg viewBox="0 0 180 48" width="100%" height="48" role="img" aria-label={t('sample')}>
    <path d="M14 34 H68 L95 12 L123 34 H166" fill="none" stroke={paint.stroke} strokeWidth={paint.hairline?1:paint.strokeWidth*previewScale} strokeOpacity={paint.strokeOpacity} strokeLinecap={paint.lineCap} strokeLinejoin={paint.lineJoin} strokeMiterlimit={paint.miterLimit} strokeDasharray={paint.dash.map(v=>v*previewScale).join(' ')} strokeDashoffset={paint.dashOffset*previewScale}/>
   </svg>}</div>)}
   {stale&&<p className="drawing-help" role="alert">{t('changed')}</p>}
   <button type="button" disabled={blocked||stale} onClick={()=>{if(!review||stale)return;const applied=apply(review.plan);setMessage(applied?(scope==='defaults'?'defaultsDone':'done'):'failed');if(applied){setReview(undefined);setChecked([]);}}}>{t(scope==='defaults'?'saveDefaults':'apply')}</button>
  </div>}
  {message&&<p className="drawing-help" role={message==='done'||message==='converted'||message==='defaultsDone'?'status':'alert'}>{t(message)}</p>}
 </details>;
}
