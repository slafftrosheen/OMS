import React,{useEffect,useState,type ReactNode} from 'react';
import {useEditor,useValue,type TLTextShape} from '@tldraw/tldraw';
import {useWorkbenchText} from './workbench-copy';
import {editDrawingText,scaleCanvasForm,spaceDrawingSelection,textPointSize} from './workbench-operations';
import {FORM_WIDTHS} from './shapes/form-shapes/form-layout';
import {canvasLengthToUnit,unitLengthToCanvas,type CadSettings} from './cad-settings';
import {captureToolkitControls} from './toolkit-controls';
import {getCadShapePageBounds} from './cad-bounds';

export function TextPanel({onOutlines}:{onOutlines:()=>void}){
 const editor=useEditor(),t=useWorkbenchText();
 const shape=useValue('editable text',()=>{const s=editor.getOnlySelectedShape();return s?.type==='text'?s as TLTextShape:null;},[editor]);
 const disabled=useValue('text permission',()=>!shape||editor.getInstanceState().isReadonly||editor.isShapeOrAncestorLocked(shape),[editor,shape]);
 const [text,setText]=useState(''),[font,setFont]=useState<TLTextShape['props']['font']>('sans'),[align,setAlign]=useState<TLTextShape['props']['textAlign']>('start'),[points,setPoints]=useState('18'),[auto,setAuto]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{if(shape){setText(shape.props.text);setFont(shape.props.font);setAlign(shape.props.textAlign);setPoints(String(Number(textPointSize(shape).toFixed(3))));setAuto(shape.props.autoSize);}setFailed(false);},[shape]);
 if(!shape)return <p className="drawing-help">{t('textHint')}</p>;
 return <fieldset className="drawing-workbench-fields" disabled={disabled}>
  <label><span>{t('content')}</span><textarea rows={6} value={text} maxLength={10000} onChange={e=>setText(e.target.value)}/></label>
  <label><span>{t('font')}</span><select value={font} onChange={e=>setFont(e.target.value as typeof font)}>{['sans','serif','mono','draw'].map(f=><option key={f} value={f}>{f==='sans'?'Sans serif':f==='serif'?'Serif':f==='mono'?'Monospace':'Handwriting'}</option>)}</select></label>
  <label><span>{t('fontSize')}</span><input type="number" min={1} max={3000} step="any" value={points} onChange={e=>setPoints(e.target.value)}/></label>
  <label><span>{t('align')}</span><select value={align} onChange={e=>setAlign(e.target.value as typeof align)}><option value="start">←</option><option value="middle">↔</option><option value="end">→</option></select></label>
  <label className="drawing-cad-check"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/><span>{t('autoWidth')}</span></label>
  <div className="drawing-workbench-actions"><button type="button" onClick={()=>setText(text.toLocaleUpperCase())}>{t('upper')}</button><button type="button" onClick={()=>setText(text.toLocaleLowerCase())}>{t('lower')}</button></div>
  <button type="button" onClick={()=>setFailed(!editDrawingText(editor,shape.id,{text,font,textAlign:align,autoSize:auto,pointSize:Number(points)}))}>{t('apply')}</button>
  <button type="button" onClick={onOutlines}>{t('outlines')}</button>
  {failed&&<p role="alert">{t('invalid')}</p>}
 </fieldset>;
}
export function ArrangePanel({settings,children}:{settings:CadSettings|null;children:ReactNode}){
 const editor=useEditor(),t=useWorkbenchText(),[gap,setGap]=useState('10'),[failed,setFailed]=useState(false);
 const controls=useValue('arrange permissions',()=>captureToolkitControls(editor),[editor]);
 return <><p className="drawing-help">{t('selection')}</p><div className="drawing-arrange">{children}</div>
  <fieldset className="drawing-workbench-fields" disabled={!controls.canEditSelection||controls.selected<2}>
   <label><span>{t('gap')} ({settings?.unit??'px'})</span><input type="number" min={0} step="any" value={gap} onChange={e=>setGap(e.target.value)}/></label>
   {(['x','y'] as const).map(axis=><button type="button" key={axis} onClick={()=>{const value=gap.trim()?Number(gap):NaN;setFailed(!spaceDrawingSelection(editor,axis,settings?unitLengthToCanvas(value,settings):value));}}>{t(axis==='x'?'horizontal':'vertical')}</button>)}
   {failed&&<p role="alert">{t('invalid')}</p>}
  </fieldset></>;
}
export function MeasurePanel({settings,onTool,onDocument}:{settings:CadSettings|null;onTool:(tool:string)=>void;onDocument:()=>void}){
 const editor=useEditor(),t=useWorkbenchText();
 const state=useValue('measure selection',()=>{const shape=editor.getOnlySelectedShape();return {shape,bounds:shape?getCadShapePageBounds(editor,shape):editor.getSelectionPageBounds(),readonly:editor.getInstanceState().isReadonly};},[editor]);
 const length=(n:number)=>`${(settings?canvasLengthToUnit(n,settings):n).toFixed(settings?.precision??2)} ${settings?.unit??'px'}`;
 const dimension=state.shape?.type==='cad-dimension'?state.shape:null;
 const p=dimension?.props as {endX:number;endY:number}|undefined;
 return <><p className="drawing-help">{t('measureHint')}</p><dl className="drawing-cad-values">
  <dt>{t('width')}</dt><dd>{state.bounds?length(state.bounds.w):'—'}</dd><dt>{t('height')}</dt><dd>{state.bounds?length(state.bounds.h):'—'}</dd>
  {p&&dimension&&<><dt>{t('distance')}</dt><dd>{length(Math.hypot(p.endX,p.endY))}</dd><dt>{t('angle')}</dt><dd>{((-Math.atan2(p.endY,p.endX)*180/Math.PI-editor.getShapePageTransform(dimension).rotation()*180/Math.PI+720)%360).toFixed(2)}°</dd></>}
 </dl><div className="drawing-workbench-fields"><button type="button" onClick={onDocument}>{t('document')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-dimension')}>{t('drawDimension')}</button><button type="button" disabled={state.readonly} onClick={()=>onTool('cad-circle')}>{t('drawCircle')}</button></div></>;
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
