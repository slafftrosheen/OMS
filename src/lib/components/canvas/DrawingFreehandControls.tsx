import React, { useEffect, useId, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { canvasLengthToUnit, readCadSettings, unitLengthToCanvas } from './cad-settings';
import { readCadFreehandOptions, setCadFreehandOptions } from './cad-freehand';
import { cadFreehandPreview } from './CadFreehandTool';
import { readDrawingPenSettings, updateDrawingPenSettings } from './drawing-pen-settings';
import { usePenText } from './pen-copy';

const display = (value: number) => String(Number(value.toPrecision(8)));

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
      onChange={event => setCadFreehandOptions(editor, { mode: event.target.value as 'curve' | 'ink' })}>
      <option value="curve">{t('curve')}</option><option value="ink">{t('ink')}</option>
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
    <label className="drawing-cad-check"><input type="checkbox" checked={state.options.autoClose} data-testid={`${prefix}-close`}
      onChange={event => setCadFreehandOptions(editor, { autoClose: event.target.checked })} /><span>{t('autoClose')}</span></label>
    <label className="drawing-cad-check"><input type="checkbox" checked={state.pen.pressure} data-testid={`${prefix}-pressure`}
      onChange={event => updateDrawingPenSettings(editor, { pressure: event.target.checked })} /><span>{t('pressure')}</span></label>
    {invalid && <p id={errorId} role="alert" className="drawing-help is-error">{t('invalidWidth')}</p>}
    {!compact && <p className="drawing-help">{t(state.options.mode === 'ink' ? 'inkHelp' : 'strokeHelp')}</p>}
  </fieldset>;
}
