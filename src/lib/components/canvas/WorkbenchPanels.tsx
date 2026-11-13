import React,{useEffect,useId,useState,type ReactNode} from 'react';
import {useEditor,useValue,type Editor,type TLShapeId,type TLTextShape} from '@tldraw/tldraw';
import {useWorkbenchText} from './workbench-copy';
import {useDrawingText} from './drawing-copy';
import {drawingTextPointSizeDisplay} from './drawing-text-style';
import {editDrawingText,scaleCanvasForm,textPointSize} from './workbench-operations';
import {FORM_WIDTHS} from './shapes/form-shapes/form-layout';
import {canvasLengthToUnit,readCadSettings,unitLengthToCanvas,type CadSettings} from './cad-settings';
import {captureToolkitControls} from './toolkit-controls';
import {getCadSelectionPageBounds} from './cad-bounds';
import {cadConstruction} from './cad-construction';
import {measureCadSelection} from './cad-measurements';
import {RadialArrange} from './RadialArrange';
import {applyArrangePlan,arrangementRoots,arrangeGapFromDisplay,MAX_ARRANGE_GAP,prepareArrangePlan,type ArrangeOptions} from './drawing-arrange';
import {drawingObjectName,drawingObjectAlias} from './drawing-operations';
import {CadOperationError,cadRevision} from './cad-plans';
import {enArrange} from './arrange-copy';

// Keep the last valid physical spacing while switching docker panels. This is
// editor-local UI state, never document metadata or exported drawing content.
const arrangeGapByEditor=new WeakMap<Editor,number>();
const displayArrangeGap=(distance:number,settings:CadSettings|null)=>String(settings?canvasLengthToUnit(distance,settings):distance);

export function TextPanel({onOutlines,onLettering}:{onOutlines:()=>void;onLettering:()=>void}){
 const editor=useEditor(),t=useWorkbenchText();
 const {tr}=useDrawingText();
 const readonly=useValue('lettering permission',()=>editor.getInstanceState().isReadonly,[editor]);
 const shape=useValue('editable text',()=>{const s=editor.getOnlySelectedShape();return s?.type==='text'?s as TLTextShape:null;},[editor]);
 const disabled=useValue('text permission',()=>!shape||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape),[editor,shape]);
 const [text,setText]=useState(''),[font,setFont]=useState<TLTextShape['props']['font']>('sans'),[align,setAlign]=useState<TLTextShape['props']['textAlign']>('start'),[points,setPoints]=useState('18'),[auto,setAuto]=useState(true),[failed,setFailed]=useState(false);
 const pointSize=shape?textPointSize(shape):undefined;
 // A property-bar edit only refreshes its corresponding draft. In particular,
 // changing font or size must not discard content waiting for Apply.
 useEffect(()=>{if(shape)setText(shape.props.text);},[shape?.id,shape?.props.text]);
 useEffect(()=>{if(shape)setFont(shape.props.font);},[shape?.id,shape?.props.font]);
 useEffect(()=>{if(shape)setAlign(shape.props.textAlign);},[shape?.id,shape?.props.textAlign]);
 useEffect(()=>{if(pointSize!==undefined)setPoints(String(drawingTextPointSizeDisplay(pointSize)));},[shape?.id,pointSize]);
 useEffect(()=>{if(shape)setAuto(shape.props.autoSize);},[shape?.id,shape?.props.autoSize]);
 useEffect(()=>setFailed(false),[shape?.id]);
 const lettering=<button type="button" className="drawing-lettering-button" disabled={readonly} onClick={onLettering}>{t('newLettering')}</button>;
 if(!shape)return <><p className="drawing-help">{t('textHint')}</p>{lettering}</>;
 const apply=()=>{const success=editDrawingText(editor,shape.id,{text,font,textAlign:align,autoSize:auto,pointSize:points.trim()?Number(points):NaN});setFailed(!success);return success;};
 return <><fieldset className="drawing-workbench-fields" disabled={disabled}>
  <label><span>{t('content')}</span><textarea rows={6} value={text} maxLength={10000} onChange={e=>setText(e.target.value)}/></label>
  <label><span>{t('font')}</span><select value={font} onChange={e=>setFont(e.target.value as typeof font)}>{['sans','serif','mono','draw'].map(f=><option key={f} value={f}>{tr(`toolkit.toolbar.styleValues.font.${f}`)}</option>)}</select></label>
  <label><span>{t('fontSize')}</span><input type="number" min={1} max={3000} step="any" value={points} onChange={e=>setPoints(e.target.value)}/></label>
  <label><span>{t('align')}</span><select value={align} onChange={e=>setAlign(e.target.value as typeof align)}>{['start','middle','end'].map(value=><option key={value} value={value}>{tr(`toolkit.toolbar.styleValues.horizontal.${value}`)}</option>)}</select></label>
  <label className="drawing-cad-check"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/><span>{t('autoWidth')}</span></label>
  <div className="drawing-workbench-actions"><button type="button" onClick={()=>setText(text.toLocaleUpperCase())}>{t('upper')}</button><button type="button" onClick={()=>setText(text.toLocaleLowerCase())}>{t('lower')}</button></div>
  <button type="button" onClick={apply}>{t('apply')}</button>
  <button type="button" onClick={()=>{if(apply())onOutlines();}}>{t('outlines')}</button>
  {failed&&<p role="alert">{t('invalid')}</p>}
 </fieldset>{lettering}</>;
}
export function ArrangePanel({settings,children}:{settings:CadSettings|null;children:ReactNode}){
 const editor=useEditor(),t=useWorkbenchText();
 const controls=useValue('arrange permissions',()=>captureToolkitControls(editor),[editor]);
 const revision=useValue('arrange document revision',()=>cadRevision(editor),[editor]);
 const state=useValue('arrange selected roots',()=>{
  const roots=arrangementRoots(editor);
  return {roots,objects:roots.flatMap(id=>{const shape=editor.getShape(id);if(!shape)return [];const props=shape.props as Record<string,unknown>;return [{id,name:drawingObjectName(shape),kind:drawingObjectAlias(shape).trim()||props.title||props.name||props.text?null:shape.type}];})};
 },[editor]);
 const [reference,setReference]=useState<'selection'|TLShapeId>('selection');
 const [mode,setMode]=useState<'gaps'|'centers'|'exact'>('gaps');
 const [anchor,setAnchor]=useState<'start'|'end'|TLShapeId>('start');
 const [gapDraft,setGapDraft]=useState<{text:string;canvas:number|undefined}>(()=>{
  const current=readCadSettings(editor);
  const canvas=arrangeGapByEditor.get(editor)??(current?unitLengthToCanvas(10,current):10);
  return {text:displayArrangeGap(canvas,current),canvas:Number.isFinite(canvas)&&canvas>=0&&canvas<=MAX_ARRANGE_GAP?canvas:undefined};
 });
 const [message,setMessage]=useState<{key:keyof typeof enArrange;success:boolean;gap?:number;revision:string}>();
 const gapErrorId=useId(),gapLimitId=useId(),alignmentHintId=useId(),distributionHintId=useId();
 const rootsKey=state.roots.join('|');
 // Resolve a removed key immediately, before the selection-change effect runs.
 const currentReference=reference==='selection'||state.roots.includes(reference)?reference:'selection';
 const currentAnchor=anchor==='start'||anchor==='end'||state.roots.includes(anchor)?anchor:'start';
 useEffect(()=>{
  setReference(current=>current==='selection'||state.roots.includes(current)?current:'selection');
  setAnchor(current=>current==='start'||current==='end'||state.roots.includes(current)?current:'start');
  setMessage(undefined);
 },[rootsKey]);
 useEffect(()=>{
  if(gapDraft.canvas!==undefined)arrangeGapByEditor.set(editor,gapDraft.canvas);
 },[editor,gapDraft.canvas]);
 useEffect(()=>{
  // Convert from the canonical canvas distance, without rounding on each switch.
  const current=readCadSettings(editor);
  setGapDraft(draft=>draft.canvas===undefined?draft:{...draft,text:displayArrangeGap(draft.canvas,current)});
 },[editor,settings?.unit,settings?.scale]);
 const editGap=(text:string)=>{
  const current=readCadSettings(editor),value=text.trim()?Number(text):NaN;
  const canvas=arrangeGapFromDisplay(value,current);
  if(canvas!==undefined)arrangeGapByEditor.set(editor,canvas);
  setGapDraft({text,canvas});setMessage(undefined);
 };
 const validGap=gapDraft.canvas!==undefined;
 const protectedSelection=controls.readOnly||controls.selectionLocked;
 const canAlign=controls.canEditSelection&&state.roots.length>=2;
 const canDistribute=controls.canEditSelection&&state.roots.length>=(mode==='exact'?2:3)&&(mode!=='exact'||validGap);
 const unit=settings?.unit??'px';
 const maxGap=settings?canvasLengthToUnit(MAX_ARRANGE_GAP,settings):MAX_ARRANGE_GAP;
 const objectKinds:Record<string,keyof typeof enArrange>={'cad-path':'arrangePath','cad-bezier':'arrangeCurve','cad-ellipse':'arrangeEllipse','cad-arc':'arrangeArc','cad-dimension':'arrangeDimension',group:'arrangeGroup',image:'arrangeImage'};
 const objectOptions=state.objects.map((object,index)=><option key={object.id} value={object.id}>{index+1}. {object.kind?t(objectKinds[object.kind]??'arrangeObject'):object.name}</option>);
 const apply=(options:ArrangeOptions)=>{
  setMessage(undefined);
  try{
   const plan=prepareArrangePlan(editor,options);
   if(!applyArrangePlan(editor,plan))throw new CadOperationError('arrangeFailed');
   setMessage({key:plan.moved?'arrangeDone':'arrangeUnchanged',success:true,gap:plan.gap,revision:cadRevision(editor)});
   editor.focus();
  }catch(error){
   const code=error instanceof CadOperationError?error.code:'';
   setMessage({key:Object.hasOwn(enArrange,code)?code as keyof typeof enArrange:'arrangeFailed',success:false,revision:cadRevision(editor)});
  }
 };
 const alignments=[
  {axis:'x',alignment:'start',label:'arrangeLeft',title:'arrangeAlignLeft'},
  {axis:'x',alignment:'center',label:'arrangeHCenter',title:'arrangeAlignHCenter'},
  {axis:'x',alignment:'end',label:'arrangeRight',title:'arrangeAlignRight'},
  {axis:'y',alignment:'start',label:'arrangeTop',title:'arrangeAlignTop'},
  {axis:'y',alignment:'center',label:'arrangeVCenter',title:'arrangeAlignVCenter'},
  {axis:'y',alignment:'end',label:'arrangeBottom',title:'arrangeAlignBottom'}
 ] as const;
 return <div className="drawing-arrangement" data-testid="drawing-arrangement">
  {protectedSelection&&<p className="drawing-help">{t('arrangeProtected')}</p>}
  <fieldset className="drawing-workbench-fields drawing-arrange-section" disabled={protectedSelection} aria-describedby={alignmentHintId}>
   <legend>{t('arrangeAlignment')}</legend>
   <label><span>{t('arrangeReference')}</span><select value={currentReference} onChange={e=>{setReference(e.target.value as typeof reference);setMessage(undefined);}}>
    <option value="selection">{t('arrangeSelectionBounds')}</option>
    {objectOptions.length>0&&<optgroup label={t('arrangeSelectedObjects')}>{objectOptions}</optgroup>}
   </select></label>
   <div className="drawing-align-grid drawing-arrange-align">
    {alignments.map(({axis,alignment,label,title})=><button type="button" key={`${axis}-${alignment}`} title={t(title)} aria-label={t(title)} disabled={!canAlign} onClick={()=>apply({kind:'align',axis,alignment,reference:currentReference})}>
     <ArrangeAlignmentIcon axis={axis} alignment={alignment}/><span>{t(label)}</span>
    </button>)}
   </div>
   <p id={alignmentHintId} className="drawing-help">{t(state.roots.length<2?'arrangeSelectionHelp':currentReference==='selection'?'arrangeBoundsHelp':'arrangeKeyHelp')}</p>
  </fieldset>
  <fieldset className="drawing-workbench-fields drawing-arrange-section" disabled={protectedSelection} aria-describedby={distributionHintId}>
   <legend>{t('arrangeDistribution')}</legend>
   <label><span>{t('arrangeMode')}</span><select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setMessage(undefined);}}>
    <option value="gaps">{t('arrangeEqualGaps')}</option><option value="centers">{t('arrangeEqualCenters')}</option><option value="exact">{t('arrangeExactGap')}</option>
   </select></label>
   {mode==='exact'&&<>
    <label><span>{t('arrangeGapValue')} ({unit})</span><input type="number" min={0} max={maxGap} step="any" required value={gapDraft.text} aria-invalid={!validGap} aria-describedby={!validGap?`${gapErrorId} ${gapLimitId}`:gapLimitId} onChange={e=>editGap(e.target.value)}/></label>
    <p id={gapLimitId} className="drawing-help">{t('arrangeGapLimit')}: {String(maxGap)} {unit}.</p>
    {!validGap&&<p id={gapErrorId} className="drawing-help" role="alert">{t('arrangeGap')}</p>}
    <label><span>{t('arrangeAnchor')}</span><select value={currentAnchor} onChange={e=>{setAnchor(e.target.value as typeof anchor);setMessage(undefined);}}>
     <option value="start">{t('arrangeStart')}</option><option value="end">{t('arrangeEnd')}</option>
     {objectOptions.length>0&&<optgroup label={t('arrangeSelectedObjects')}>{objectOptions}</optgroup>}
    </select></label>
   </>}
   <div className="drawing-align-grid">
    {(['x','y'] as const).map(axis=><button type="button" key={axis} title={t(axis==='x'?'arrangeDistributeHorizontal':'arrangeDistributeVertical')} aria-label={t(axis==='x'?'arrangeDistributeHorizontal':'arrangeDistributeVertical')} disabled={!canDistribute} onClick={()=>apply(mode==='exact'?{kind:'space',axis,gap:gapDraft.canvas??NaN,anchor:currentAnchor}:{kind:'distribute',axis,mode})}>{t(axis==='x'?'arrangeHorizontal':'arrangeVertical')}</button>)}
   </div>
   <p id={distributionHintId} className="drawing-help">{t(mode==='exact'?'arrangeExactHelp':mode==='centers'?'arrangeCentersHelp':'arrangeEqualHelp')}</p>
  </fieldset>
  {message&&message.revision===revision&&<p className="drawing-help" role={message.success?'status':'alert'}>{t(message.key)}{message.success&&message.gap!==undefined&&<> {t('arrangeResultGap')}: {(settings?canvasLengthToUnit(message.gap,settings):message.gap).toFixed(settings?.precision??2)} {unit}.</>}</p>}
  <div className="drawing-arrange">{children}</div>
  <RadialArrange settings={settings}/>
 </div>;
}
function ArrangeAlignmentIcon({axis,alignment}:{axis:'x'|'y';alignment:'start'|'center'|'end'}){
 const guide=alignment==='start'?3:alignment==='center'?12:21;
 const smallX=alignment==='start'?5:alignment==='center'?8:11;
 return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5">
  <g transform={axis==='y'?'rotate(90 12 12)':undefined}><path d={`M${guide} 2v20`}/><rect x="5" y="5" width="14" height="4"/><rect x={smallX} y="15" width="8" height="4"/></g>
 </svg>;
}
export function MeasurePanel({settings,onTool,onDocument}:{settings:CadSettings|null;onTool:(tool:string)=>void;onDocument:()=>void}){
 const editor=useEditor(),t=useWorkbenchText();
 const construction=useValue('measure construction',()=>cadConstruction(editor).get(),[editor]);
 const activeTool=useValue('measure tool',()=>editor.getCurrentToolId(),[editor]);
 const hint=construction?t(construction.points.length===0?'pickFirst':construction.points.length===1?'pickThrough':construction.kind==='arc'?'pickArcEnd':'pickThird'):t(activeTool==='cad-dimension'?'measureHint':'measureSelection');
 const measurement=useValue('CAD curve measurements',()=>measureCadSelection(editor,settings),[editor,settings]);
 const state=useValue('measure selection',()=>{const shape=editor.getOnlySelectedShape();return {shape,bounds:getCadSelectionPageBounds(editor),readonly:editor.getInstanceState().isReadonly};},[editor]);
 const length=(n:number)=>`${(settings?canvasLengthToUnit(n,settings):n).toFixed(settings?.precision??2)} ${settings?.unit??'px'}`;
 const dimension=state.shape?.type==='cad-dimension'?state.shape:null;
 const p=dimension?.props as {endX:number;endY:number}|undefined;
 return <><p className="drawing-help">{hint}</p><dl className="drawing-cad-values">
  <dt>{t('width')}</dt><dd>{state.bounds?length(state.bounds.w):'—'}</dd><dt>{t('height')}</dt><dd>{state.bounds?length(state.bounds.h):'—'}</dd>
  {measurement.measured>0&&<><dt>{t('curveLength')}</dt><dd>{measurement.approximate?'≈ ':''}{length(measurement.length)}</dd><dt>{t('openPaths')}</dt><dd>{measurement.open}</dd><dt>{t('closedPaths')}</dt><dd>{measurement.closed}</dd></>}
  {measurement.radius!==undefined&&<><dt>{t('radius')}</dt><dd>{length(measurement.radius)}</dd><dt>{t('diameter')}</dt><dd>{length(measurement.radius*2)}</dd></>}
  {measurement.sweep!==undefined&&<><dt>{t('sweep')}</dt><dd>{measurement.sweep.toFixed(settings?.precision??2)}°</dd></>}
  {measurement.omitted>0&&<><dt>{t('omittedMeasure')}</dt><dd>{measurement.omitted}</dd></>}
  {p&&dimension&&<><dt>{t('distance')}</dt><dd>{length(Math.hypot(p.endX,p.endY))}</dd><dt>{t('angle')}</dt><dd>{((-Math.atan2(p.endY,p.endX)*180/Math.PI-editor.getShapePageTransform(dimension).rotation()*180/Math.PI+720)%360).toFixed(2)}°</dd></>}
 </dl><p className="drawing-help">{t('lengthHint')}</p>{state.shape?.type==='cad-arc'&&<p className="drawing-help">{t('arcHandles')}</p>}<div className="drawing-workbench-fields"><button type="button" onClick={onDocument}>{t('document')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-dimension')}>{t('drawDimension')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-circle')}>{t('drawCircle')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-arc-three')}>{t('arcThree')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-circle-three')}>{t('circleThree')}</button></div></>;
}
export function FormScaleControl(){
 const editor=useEditor(),t=useWorkbenchText();
 const shape=useValue('form scale',()=>{const s=editor.getOnlySelectedShape();return s&&FORM_WIDTHS[s.type]?s:null;},[editor]);
 const disabled=useValue('form scale permission',()=>!shape||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape),[editor,shape]);
 const value=shape?(shape.props as {w:number}).w/FORM_WIDTHS[shape.type]*100:100;
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(Number(value.toFixed(2)))),[shape?.id,value]);
 if(!shape)return null;
 return <section className="drawing-form-scale"><label>{t('scaleForm')}<input type="number" min={10} max={400} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(!scaleCanvasForm(editor,shape.id,Number(draft)))setDraft(String(value));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label><p className="drawing-help">{t('formHint')}</p></section>;
}
