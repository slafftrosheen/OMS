import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { drawingPenDiagnostics, recordDrawingPenSample, resetDrawingPenDiagnostics } from './drawing-pen-input';
import { readDrawingPenSettings, resetDrawingPenSettings, updateDrawingPenSettings } from './drawing-pen-settings';
import { cadFreehandPreview } from './CadFreehandTool';
import { DrawingFreehandControls } from './DrawingFreehandControls';
import { enPen, usePenText } from './pen-copy';

const percent = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
type TestPoint = { x: number; y: number; pressure: number };

export function DrawingPenPanel({ onFreehand }: { onFreehand: () => void }) {
  const editor = useEditor(), t = usePenText(), pressureId = useId();
  const state = useValue('pen configuration and observed input', () => ({ settings: readDrawingPenSettings(editor),
    diagnostic: drawingPenDiagnostics(editor).get(), drawing: !!cadFreehandPreview(editor).get(), readonly: editor.getInstanceState().isReadonly }), [editor]);
  const [trail, setTrail] = useState<TestPoint[]>([]), pointer = useRef<number | null>(null);
  useEffect(() => {
    const doc = editor.getContainer().ownerDocument, win = doc.defaultView;
    const end = (event: PointerEvent) => {
      if (pointer.current !== event.pointerId) return;
      recordDrawingPenSample(editor, event); pointer.current = null;
    };
    const cancel = () => {
      if (pointer.current === null) return;
      pointer.current = null; resetDrawingPenDiagnostics(editor);
    };
    win?.addEventListener('pointerup', end); win?.addEventListener('pointercancel', end); win?.addEventListener('blur', cancel);
    return () => { cancel(); win?.removeEventListener('pointerup', end); win?.removeEventListener('pointercancel', end); win?.removeEventListener('blur', cancel); };
  }, [editor]);
  const d = state.diagnostic, disabled = state.drawing || d.contact;
  const sample = (event: React.PointerEvent<SVGSVGElement>, clear = false) => {
    recordDrawingPenSample(editor, event.nativeEvent);
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const point = { x: Math.max(0, Math.min(256, (event.clientX - bounds.left) / bounds.width * 256)),
      y: Math.max(0, Math.min(112, (event.clientY - bounds.top) / bounds.height * 112)),
      pressure: drawingPenDiagnostics(editor).get().mappedPressure };
    setTrail(previous => [...(clear ? [] : previous.slice(-127)), point]);
  };
  const release = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== event.pointerId) return;
    recordDrawingPenSample(editor, event.nativeEvent); pointer.current = null;
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* A canceled pointer has already lost capture. */ }
  };
  const notice = d.notice && Object.hasOwn(enPen, d.notice) ? t(d.notice as keyof typeof enPen) : '';
  return <section className="drawing-pen-panel" data-testid="drawing-pen-panel" aria-label={t('title')} onKeyDown={event => event.stopPropagation()}>
    <fieldset className="drawing-workbench-fields" disabled={disabled}>
      <label><span>{t('inputMode')}</span><select value={state.settings.mode} data-testid="drawing-pen-mode"
        onChange={event => updateDrawingPenSettings(editor, { mode: event.target.value as 'auto' | 'pen-only' })}>
        <option value="auto">{t('auto')}</option><option value="pen-only">{t('penOnly')}</option>
      </select></label>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.settings.pressure} data-testid="drawing-pen-pressure"
        onChange={event => updateDrawingPenSettings(editor, { pressure: event.target.checked })} /><span>{t('pressure')}</span></label>
      <label><span>{t('response')}</span><select value={state.settings.response} disabled={!state.settings.pressure} data-testid="drawing-pen-response"
        onChange={event => updateDrawingPenSettings(editor, { response: event.target.value as 'soft' | 'linear' | 'firm' })}>
        {(['soft', 'linear', 'firm'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></label>
      <label><span>{t('barrel')}</span><select value={state.settings.barrelAction} data-testid="drawing-pen-barrel"
        onChange={event => updateDrawingPenSettings(editor, { barrelAction: event.target.value as 'context' | 'pan' | 'eraser' })}>
        {(['context', 'pan', 'eraser'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></label>
      <button type="button" onClick={() => resetDrawingPenSettings(editor)} data-testid="drawing-pen-reset">{t('reset')}</button>
    </fieldset>
    <p className="drawing-help">{t('settingsHelp')}</p>
    {state.drawing && <p className="drawing-help" role="status">{t('busy')}</p>}
    {state.readonly && <p className="drawing-help" role="status">{t('readonly')}</p>}
    <section className="drawing-pen-test-section" aria-label={t('testTitle')}>
      <h3>{t('testTitle')}</h3><p className="drawing-help">{t('testHelp')}</p>
      <svg className="drawing-pen-test" viewBox="0 0 256 112" role="img" aria-label={t('testHelp')} data-testid="drawing-pen-test"
        onPointerDown={event => {
          if (pointer.current !== null || event.button !== 0 || event.isPrimary === false) return;
          event.preventDefault(); event.stopPropagation(); pointer.current = event.pointerId;
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Window release/blur also ends the local test. */ }
          sample(event, true);
        }} onPointerMove={event => {
          if (pointer.current !== event.pointerId) return;
          event.preventDefault(); event.stopPropagation(); sample(event);
        }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
        <path d="M0 56H256M128 0V112" className="drawing-pen-test-grid" />
        {trail.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={1 + point.pressure * 6} className="drawing-pen-test-dot" />)}
      </svg>
      <div className="drawing-pen-test-actions"><span data-testid="drawing-pen-detected">{t(d.detectedPen ? 'detected' : 'noPen')}</span>
        <button type="button" onClick={() => { setTrail([]); resetDrawingPenDiagnostics(editor); }} data-testid="drawing-pen-test-clear">{t('clear')}</button></div>
      <div className="drawing-pen-pressure-readout"><label htmlFor={pressureId}>{t('pressureRaw')}</label>
        <output data-testid="drawing-pen-pressure-value">{percent(d.pressure)}</output>
        <meter id={pressureId} min={0} max={1} value={d.pressure} /></div>
      <dl className="drawing-pen-metrics">
        <dt>{t('pressureMapped')}</dt><dd>{percent(d.mappedPressure)}</dd>
        <dt>{t('pressureRange')}</dt><dd>{percent(d.minPressure)} – {percent(d.maxPressure)}</dd>
        <dt>{t('tilt')}</dt><dd data-testid="drawing-pen-tilt">{Math.round(d.tiltX)}° / {Math.round(d.tiltY)}°</dd>
        <dt>{t('twist')}</dt><dd>{Math.round(d.twist)}°</dd>
        <dt>{t('buttons')}</dt><dd data-testid="drawing-pen-buttons">{d.buttons}</dd>
      </dl>
      <p className="drawing-help">{t(d.pointerType === 'pen' ? 'detected' : d.pointerType === 'mouse' ? 'mouse' : d.pointerType === 'touch' ? 'touch' : 'noPointer')}
        {' · '}{t(d.contact ? 'contact' : 'hover')}</p>
      <p className="drawing-help" data-testid="drawing-pen-sampling">{d.coalescedAvailable ? `${t('coalesced')}: ${d.coalescedSamples}` : t('regular')}</p>
      {!d.secureContext && <p className="drawing-help">{t('secureHint')}</p>}
    </section>
    {notice && <p className="drawing-help" role="status">{notice}</p>}
    <DrawingFreehandControls />
    <button type="button" disabled={state.readonly || state.drawing} onClick={onFreehand} data-testid="drawing-pen-freehand">{t('openFreehand')}</button>
    <details><summary>{t('deviceSetup')}</summary>
      <p className="drawing-help">{t('deviceHelp')}</p><p className="drawing-help">{t('tiltHelp')}</p><p className="drawing-help">{t('buttonHelp')}</p>
      <a href="https://www.huion.com/manual/inspiroy-2/735" target="_blank" rel="noopener noreferrer">{t('driverManual')}</a>
    </details>
  </section>;
}
