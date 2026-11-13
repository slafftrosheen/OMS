import React,{useEffect,useId,useRef,useState} from 'react';
import {useEditor,useValue,type TLPageId} from '@tldraw/tldraw';
import {canvasLengthToUnit,unitLengthToCanvas,type CadSettings} from './cad-settings';
import {readCadSnapSettings,writeCadSnapSettings} from './cad-snap-settings';
import {useSnapText} from './snap-copy';

const targets=['endpoints','midpoints','centers','quadrants','intersections','nearest','grid'] as const;

function SnapNumberField({field,value,pageId,settings,disabled}:{
  field:'tolerance'|'gridSpacing';value:number;pageId:TLPageId;settings:CadSettings|null;disabled:boolean;
}){
  const editor=useEditor(),t=useSnapText();
  const grid=field==='gridSpacing';
  const display=(number:number)=>String(grid&&settings?canvasLengthToUnit(number,settings):number);
  const rangeDisplay=(number:number)=>String(Number(Number(display(number)).toPrecision(6)));
  const [draft,setDraft]=useState(()=>display(value)),[error,setError]=useState<'invalid'|'failed'|null>(null);
  const canonicalDraft=useRef<number|undefined>(value),dirty=useRef(false),cancelBlur=useRef(false);
  const errorId=useId(),rangeId=useId();
  const unit=settings?.unit??'px',minimum=grid?0.01:2,maximum=grid?1_000_000:30;
  useEffect(()=>{canonicalDraft.current=value;dirty.current=false;setDraft(display(value));setError(null);},[value,pageId]);
  useEffect(()=>{
    if(canonicalDraft.current!==undefined)setDraft(display(canonicalDraft.current));
  },[settings?.unit,settings?.scale]);
  function commit(){
    if(cancelBlur.current){cancelBlur.current=false;return;}
    if(!dirty.current)return;
    const number=canonicalDraft.current;
    if(number===undefined||!Number.isFinite(number)||number<minimum||number>maximum){setError('invalid');return;}
    if(editor.getCurrentPageId()!==pageId||!writeCadSnapSettings(editor,{[field]:number})){setError('failed');return;}
    dirty.current=false;setDraft(display(number));setError(null);
  }
  return <>
    <label><span>{t(field)}{grid&&` (${unit})`}</span>
      <input type="number" min={display(minimum)} max={display(maximum)} step="any" value={draft} disabled={disabled}
        aria-invalid={!!error} aria-describedby={[grid?rangeId:null,error?errorId:null].filter(Boolean).join(' ')||undefined} data-testid={`drawing-snap-${field}`}
        onChange={event=>{
          const text=event.target.value,number=text.trim()?Number(text):NaN;
          canonicalDraft.current=Number.isFinite(number)?grid&&settings?unitLengthToCanvas(number,settings):number:undefined;
          dirty.current=true;setDraft(text);setError(null);
        }} onBlur={commit} onKeyDown={event=>{
          event.stopPropagation();
          if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
          if(event.key==='Escape'){
            event.preventDefault();cancelBlur.current=true;dirty.current=false;canonicalDraft.current=value;
            setDraft(display(value));setError(null);event.currentTarget.blur();
          }
        }}/>
    </label>
    {grid&&<p id={rangeId} className="drawing-help">{t('range')}: {rangeDisplay(minimum)}–{rangeDisplay(maximum)} {unit}.</p>}
    {error&&<p id={errorId} className="drawing-help is-error" role="alert">{t(error==='failed'?'failed':grid?'gridInvalid':'toleranceInvalid')}</p>}
  </>;
}

export function CadSnapPanel({settings}:{settings:CadSettings|null}){
  const editor=useEditor(),t=useSnapText();
  const state=useValue('CAD snap options',()=>({
    pageId:editor.getCurrentPageId(),options:readCadSnapSettings(editor),master:editor.user.getIsSnapMode(),
    gridShow:editor.getInstanceState().isGridMode,readonly:editor.getInstanceState().isReadonly
  }),[editor]);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[state.pageId]);
  return <div data-testid="drawing-snap-options">
    <div className="drawing-workbench-fields">
      <label className="drawing-cad-check"><input type="checkbox" checked={state.master} data-testid="drawing-snap-master" onChange={event=>editor.user.updateUserPreferences({isSnapMode:event.target.checked})}/><span>{t('enabled')}</span></label>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.gridShow} data-testid="drawing-snap-grid-show" onChange={event=>editor.updateInstanceState({isGridMode:event.target.checked})}/><span>{t('gridShow')}</span></label>
    </div>
    <p className="drawing-help">{t('scope')}</p>
    <p className="drawing-help">{t('keys')}</p>
    {!state.master&&<p className="drawing-help">{t('off')}</p>}
    {state.readonly&&<p className="drawing-help">{t('readOnly')}</p>}
    <fieldset className="drawing-workbench-fields" disabled={state.readonly}>
      <legend>{t('targets')}</legend>
      {targets.map(target=><label key={target} className="drawing-cad-check"><input type="checkbox" checked={state.options[target]} data-testid={`drawing-snap-${target}`}
        onChange={event=>setFailed(editor.getCurrentPageId()!==state.pageId||!writeCadSnapSettings(editor,{[target]:event.target.checked}))}/><span>{t(target)}</span></label>)}
      <p className="drawing-help">{t('intersectionsHelp')}</p>
      <SnapNumberField key={`${state.pageId}-tolerance`} field="tolerance" value={state.options.tolerance} pageId={state.pageId} settings={null} disabled={state.readonly}/>
      <SnapNumberField key={`${state.pageId}-grid`} field="gridSpacing" value={state.options.gridSpacing} pageId={state.pageId} settings={settings} disabled={state.readonly}/>
      <p className="drawing-help">{t('gridHelp')}</p>
      {failed&&<p className="drawing-help is-error" role="alert">{t('failed')}</p>}
    </fieldset>
  </div>;
}
