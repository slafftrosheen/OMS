import React, { useEffect, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { canvasLengthToUnit, type CadSettings } from './cad-settings';
import { polylineSession, resolveCadDraftPoint, type CadPointEntryMode } from './cad-polyline-draft';
import { useWorkbenchText } from './workbench-copy';

export function CadPointEntry({ settings }: { settings: CadSettings | null }) {
  const editor = useEditor(), t = useWorkbenchText(), session = polylineSession(editor);
  const draft = useValue('typed polyline points', () => session.state.get(), [session]);
  const readonly = useValue('typed point permission', () => editor.getInstanceState().isReadonly, [editor]);
  const [mode, setMode] = useState<CadPointEntryMode>('absolute'), [first, setFirst] = useState('0'), [second, setSecond] = useState('0'), [failed, setFailed] = useState(false);
  const count = draft?.points.length ?? 0, last = draft?.points.at(-1), unit = settings?.unit ?? 'px';
  useEffect(() => { setFirst('0'); setSecond('0'); setMode('absolute'); setFailed(false); }, [unit, settings?.scale, settings?.originX, settings?.originY]);
  const value = (s: string) => s.trim() ? Number(s) : NaN;
  const point = resolveCadDraftPoint(mode, value(first), value(second), last, settings);
  const complete = (closed: boolean) => { if (session.controller?.finish(closed)) editor.focus(); else setFailed(true); };
  return <form className="drawing-point-entry" aria-label={t('pointEntry')} onSubmit={event => {
    event.preventDefault(); setFailed(!point || !session.controller?.add(point));
  }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); session.controller?.cancel(); editor.focus(); }
  }}>
    <fieldset disabled={readonly || !draft}>
      <select aria-label={t('entryMode')} value={mode} onChange={event => { setMode(event.target.value as CadPointEntryMode); setFailed(false); }}>
        <option value="absolute">{t('absolutePoint')}</option><option value="offset" disabled={!count}>{t('offsetPoint')}</option><option value="polar" disabled={!count}>{t('polarPoint')}</option>
      </select>
      <label><span>{mode === 'polar' ? t('distance') : mode === 'offset' ? 'ΔX' : 'X'} ({unit})</span><input aria-label={`${mode === 'polar' ? t('distance') : mode === 'offset' ? 'ΔX' : 'X'} (${unit})`} type="number" step="any" required value={first} onChange={event => { setFirst(event.target.value); setFailed(false); }}/></label>
      <label><span>{mode === 'polar' ? `${t('angle')} (°)` : `${mode === 'offset' ? 'ΔY' : 'Y'} ↑ (${unit})`}</span><input aria-label={mode === 'polar' ? `${t('angle')} (°)` : `${mode === 'offset' ? 'ΔY' : 'Y'} (${unit})`} type="number" step="any" required value={second} onChange={event => { setSecond(event.target.value); setFailed(false); }}/></label>
      <button type="submit" disabled={!point}>{t('addPoint')}</button>
      <button type="button" disabled={!count} onClick={() => { session.controller?.back(); setFailed(false); }}>{t('previousPoint')}</button>
      <button type="button" disabled={count < 2} onClick={() => complete(false)}>{t('finishPath')}</button>
      <button type="button" disabled={count < 3} onClick={() => complete(true)}>{t('closePath')}</button>
    </fieldset>
    {failed && <span className="drawing-point-error" role="alert">{t('pointInvalid')}</span>}
    {!failed && last && draft?.pointer && <span className="drawing-point-live" aria-label={t('segmentPreview')}>
      {(settings ? canvasLengthToUnit(Math.hypot(draft.pointer.x - last.x, draft.pointer.y - last.y), settings) : Math.hypot(draft.pointer.x - last.x, draft.pointer.y - last.y)).toFixed(settings?.precision ?? 2)} {unit}
      {' · '}{((-Math.atan2(draft.pointer.y - last.y, draft.pointer.x - last.x) * 180 / Math.PI + 360) % 360).toFixed(1)}°
    </span>}
  </form>;
}
