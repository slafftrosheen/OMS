import React, { useEffect, useId, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { canvasLengthToUnit, readCadSettings, unitLengthToCanvas } from './cad-settings';
import { readCadFreehandOptions, setCadFreehandOptions } from './cad-freehand';
import { cadFreehandPreview } from './CadFreehandTool';
import { readDrawingPenSettings, updateDrawingPenSettings } from './drawing-pen-settings';
import { usePenText } from './pen-copy';

const display = (value: number) => String(Number(value.toPrecision(8)));

function NibNumber({ value, min, max, label, error, testId, disabled, onCommit }: {
  value: number; min: number; max: number; label: string; error: string; testId: string;
  disabled: boolean; onCommit: (value: number) => boolean;
}) {
  const [draft, setDraft] = useState(display(value)), [invalid, setInvalid] = useState(false), errorId = useId();
  useEffect(() => { setDraft(display(value)); setInvalid(false); }, [value]);
  const commit = () => {
    if (disabled) return;
    const parsed = draft.trim() ? Number(draft) : NaN;
    setInvalid(!(Number.isFinite(parsed) && parsed >= min && parsed <= max && onCommit(parsed)));
  };
  return <><label className="drawing-freehand-nib-number"><span>{label} (°)</span>
    <input type="number" min={min} max={max} step="any" value={draft} aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined} data-testid={testId}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(display(value)); setInvalid(false); }
      }} />
  </label>{invalid && <p id={errorId} role="alert" className="drawing-help is-error">{error}</p>}</>;
}

export function DrawingFreehandControls({ compact = false }: { compact?: boolean }) {
  const editor = useEditor(), t = usePenText(), errorId = useId();
  const state = useValue('freehand property controls', () => ({ options: readCadFreehandOptions(editor), pen: readDrawingPenSettings(editor),
    settings: readCadSettings(editor), readonly: editor.getInstanceState().isReadonly, drawing: !!cadFreehandPreview(editor).get() }), [editor]);
  const width = state.settings ? canvasLengthToUnit(state.options.width, state.settings) : state.options.width;
  const [draft, setDraft] = useState(display(width)), [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(display(width)); setInvalid(false); }, [width, state.settings?.unit, state.settings?.scale]);
  const prefix = compact ? 'drawing-freehand-property' : 'drawing-freehand';
  const disabled = state.readonly || state.drawing;
  const commitWidth = () => {
    if (disabled) return;
    const value = draft.trim() ? Number(draft) : NaN;
    const canvas = state.settings ? unitLengthToCanvas(value, state.settings) : value;
    const accepted = Number.isFinite(canvas) && canvas > 0 && setCadFreehandOptions(editor, { width: canvas });
    setInvalid(!accepted);
  };
  return <fieldset className={`drawing-freehand-controls${compact ? ' is-compact' : ''}`} disabled={disabled} aria-label={t('nextStroke')}
    data-testid={prefix} onKeyDown={event => event.stopPropagation()}>
    {!compact && <legend>{t('nextStroke')}</legend>}
    <label><span>{t('mode')}</span><select value={state.options.mode} data-testid={`${prefix}-mode`}
      onChange={event => setCadFreehandOptions(editor, { mode: event.target.value as 'curve' | 'ink' | 'calligraphy' })}>
      <option value="curve">{t('curve')}</option><option value="ink">{t('ink')}</option><option value="calligraphy">{t('calligraphy')}</option>
    </select></label>
    <label className="drawing-freehand-width"><span>{t('width')} ({state.settings?.unit ?? 'px'})</span>
      <input type="number" step="any" value={draft} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
        data-testid={`${prefix}-width`} onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={commitWidth}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commitWidth(); }
          if (event.key === 'Escape') { event.preventDefault(); setDraft(display(width)); setInvalid(false); }
        }} />
    </label>
    <label className="drawing-freehand-smoothing"><span>{t('smoothing')} · {Math.round(state.options.smoothing * 100)}%</span>
      <input type="range" min={0} max={100} value={Math.round(state.options.smoothing * 100)} data-testid={`${prefix}-smoothing`}
        onChange={event => setCadFreehandOptions(editor, { smoothing: Number(event.target.value) / 100 })} />
    </label>
    <label className="drawing-freehand-color"><span>{t('color')}</span><input type="color" value={state.options.color} data-testid={`${prefix}-color`}
      onChange={event => setCadFreehandOptions(editor, { color: event.target.value })} /></label>
    {state.options.mode === 'calligraphy' && <>
      <NibNumber value={state.options.nibAngle} min={-180} max={180} label={t('nibAngle')} error={t('invalidNibAngle')}
        testId={`${prefix}-nib-angle`} disabled={disabled} onCommit={nibAngle => setCadFreehandOptions(editor, { nibAngle })} />
      <NibNumber value={state.options.nibTilt} min={15} max={90} label={t('nibTilt')} error={t('invalidNibTilt')}
        testId={`${prefix}-nib-tilt`} disabled={disabled} onCommit={nibTilt => setCadFreehandOptions(editor, { nibTilt })} />
      <div className="drawing-freehand-nib-preview" title={t('nibPreview')}>
        <svg viewBox="0 0 64 48" aria-hidden="true" data-testid={`${prefix}-nib-preview`}>
          <path d="M4 24H60M32 2V46" className="drawing-freehand-nib-axis" />
          <ellipse cx="32" cy="24" rx="21" ry={21 * Math.sin(state.options.nibTilt * Math.PI / 180)}
            transform={`rotate(${state.options.nibAngle} 32 24)`} />
        </svg>{!compact && <span>{t('nibPreview')}</span>}
      </div>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.options.useTilt} data-testid={`${prefix}-use-tilt`}
        onChange={event => setCadFreehandOptions(editor, { useTilt: event.target.checked })} /><span>{t('useTilt')}</span></label>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.options.useBearing} data-testid={`${prefix}-use-bearing`}
        onChange={event => setCadFreehandOptions(editor, { useBearing: event.target.checked })} /><span>{t('useBearing')}</span></label>
      {!compact && (state.options.useTilt || state.options.useBearing) && <p className="drawing-help">{t('liveNibHelp')}</p>}
    </>}
    <label className="drawing-cad-check"><input type="checkbox" checked={state.options.autoClose} data-testid={`${prefix}-close`}
      onChange={event => setCadFreehandOptions(editor, { autoClose: event.target.checked })} /><span>{t('autoClose')}</span></label>
    {state.options.mode === 'curve' && <label className="drawing-cad-check"><input type="checkbox" checked={state.options.continueCurve} data-testid={`${prefix}-continue`}
      onChange={event => setCadFreehandOptions(editor, { continueCurve: event.target.checked })} /><span>{t('continueCurve')}</span></label>}
    <label className="drawing-cad-check"><input type="checkbox" checked={state.pen.pressure} data-testid={`${prefix}-pressure`}
      onChange={event => updateDrawingPenSettings(editor, { pressure: event.target.checked })} /><span>{t('pressure')}</span></label>
    {invalid && <p id={errorId} role="alert" className="drawing-help is-error">{t('invalidWidth')}</p>}
    {!compact && <p className="drawing-help">{t(state.options.mode === 'calligraphy' ? 'calligraphyHelp' : state.options.mode === 'ink' ? 'inkHelp' : 'strokeHelp')}</p>}
    {!compact && state.options.mode === 'curve' && state.options.continueCurve && <p className="drawing-help">{t('continueHelp')}</p>}
  </fieldset>;
}
