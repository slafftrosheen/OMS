import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { cadPointToCanvas, canvasPointToCad, type CadPoint, type CadSettings } from './cad-settings';
import { readCadSnapSettings, writeCadSnapSettings } from './cad-snap-settings';
import {
  MAX_DRAWING_GUIDES, DrawingGuideError, applyDrawingGuideChange, drawingGuideRotationPose, drawingGuidesAreValid, drawingGuidesBusy, drawingGuidesRevision,
  guidePositionFromUnit, guidePositionToUnit, prepareDrawingGuideChange, readDrawingGuides, selectDrawingGuide, selectedDrawingGuide,
  type DrawingGuide, type DrawingGuideGeometry, type DrawingGuideChange, type DrawingGuideErrorCode,
} from './drawing-guides';
import { useGuideText } from './guide-copy';

const display = (value: number) => Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '';
const numeric = (value: string) => value.trim() ? Number(value) : NaN;
type PoseDraft = { x: string; y: string; angle: string };
const defaultPose = (): PoseDraft => ({ x: '0', y: '0', angle: '45' });
function poseDraft(pivot: CadPoint, angle: number, settings: CadSettings | null): PoseDraft {
  const point = settings ? canvasPointToCad(pivot, settings) : pivot;
  return { x: display(point.x), y: display(point.y), angle: display(angle) };
}
function guidePose(draft: PoseDraft, settings: CadSettings | null) {
  const point = { x: numeric(draft.x), y: numeric(draft.y) };
  return { pivot: settings ? cadPointToCanvas(point, settings) : point, angle: numeric(draft.angle) };
}

function GuidePoseFields({ draft, change, unit, prefix }: {
  draft: PoseDraft; change: (draft: PoseDraft) => void; unit: string; prefix: 'add' | 'move';
}) {
  const t = useGuideText();
  const fields = [['x', t('pivotX'), unit], ['y', t('pivotY'), unit], ['angle', t('angle'), '°']] as const;
  return <>{fields.map(([key, label, suffix]) => <label key={key}><span>{label} ({suffix})</span>
    <input type="number" step="any" required value={draft[key]} data-testid={`drawing-guide-${prefix}-${key}`}
      onChange={event => change({ ...draft, [key]: event.target.value })} />
  </label>)}</>;
}

export function DrawingGuidesPanel({ settings, focusRequest = 0, renderAlignment, onDocument }: {
  settings: CadSettings | null;
  focusRequest?: number;
  renderAlignment?: (guide: DrawingGuide | null) => ReactNode;
  onDocument?: () => void;
}) {
  const editor = useEditor(), t = useGuideText(), errorId = useId();
  const [activity, setActivity] = useState(0);
  useEffect(() => {
    let mounted = true, queued = false, previous = drawingGuidesBusy(editor);
    const changed = () => {
      if (queued) return;
      queued = true;
      // CAD tools update their draft after the editor event is announced. A
      // two-point tool's first click may not create a store record yet.
      queueMicrotask(() => {
        queued = false; if (!mounted) return;
        const busy = drawingGuidesBusy(editor);
        if (busy !== previous) { previous = busy; setActivity(value => value + 1); }
      });
    };
    editor.on('event', changed);
    return () => { mounted = false; editor.off('event', changed); };
  }, [editor]);
  const state = useValue('document guidelines', () => ({ pageId: editor.getCurrentPageId(), guides: readDrawingGuides(editor),
    valid: drawingGuidesAreValid(editor), revision: drawingGuidesRevision(editor), selected: selectedDrawingGuide(editor).get(),
    readonly: editor.getInstanceState().isReadonly, busy: drawingGuidesBusy(editor), snapping: readCadSnapSettings(editor).guidelines, master: editor.user.getIsSnapMode() }), [editor, activity]);
  const guide = state.guides.guides.find(guide => guide.id === state.selected) ?? null;
  const [axis, setAxis] = useState<DrawingGuideGeometry['axis']>('y'), [addDraft, setAddDraft] = useState('0');
  const [addPose, setAddPose] = useState(defaultPose), [movePose, setMovePose] = useState(defaultPose);
  const addPosition = useRef(guidePositionFromUnit('y', 0, settings)), addInput = useRef<HTMLInputElement>(null), guideList = useRef<HTMLSelectElement>(null);
  const [moveDraft, setMoveDraft] = useState(''), [moveRevision, setMoveRevision] = useState<string | null>(null);
  const [rotateAxisGuide, setRotateAxisGuide] = useState(false);
  const movePosition = useRef<number>(NaN), moveInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<DrawingGuideErrorCode | 'done' | null>(null);
  const stale = moveRevision !== null && moveRevision !== state.revision;
  const readonly = state.readonly || !state.valid || state.busy, geometryDisabled = readonly || state.guides.locked;
  const resetMove = () => {
    movePosition.current = guide?.position ?? NaN;
    if (guide?.axis === 'angle') setMovePose(poseDraft(guide.pivot, guide.angle, settings));
    setMoveDraft(guide && guide.axis !== 'angle' ? display(guidePositionToUnit(guide.axis, guide.position, settings)) : '');
    setRotateAxisGuide(false); setMoveRevision(null); setMessage(null);
  };
  useEffect(() => {
    setMessage(null); setAddDraft('0'); setAddPose(defaultPose());
    addPosition.current = guidePositionFromUnit(axis === 'angle' ? 'y' : axis, 0, settings);
  }, [state.pageId]);
  useEffect(resetMove, [state.pageId, guide?.id]);
  useEffect(() => {
    if (moveRevision === null) resetMove();
  }, [guide?.position, guide?.angle, guide?.pivot?.x, guide?.pivot?.y]);
  useEffect(() => {
    if (axis !== 'angle') setAddDraft(display(guidePositionToUnit(axis, addPosition.current, settings)));
    if (guide && guide.axis !== 'angle') setMoveDraft(display(guidePositionToUnit(guide.axis, movePosition.current, settings)));
    if (guide?.axis === 'angle' && moveRevision === null) setMovePose(poseDraft(guide.pivot, guide.angle, settings));
  }, [settings?.unit, settings?.scale, settings?.originX, settings?.originY]);
  useEffect(() => { if (state.selected && !guide) selectDrawingGuide(editor, null); }, [state.selected, guide?.id]);
  useEffect(() => {
    if (!focusRequest) return;
    const request = requestAnimationFrame(() => { [moveInput.current, addInput.current, guideList.current].find(input => input && !input.matches(':disabled'))?.focus(); });
    return () => cancelAnimationFrame(request);
  }, [focusRequest]);
  function apply(change: DrawingGuideChange, expectedRevision = state.revision) {
    try {
      const plan = prepareDrawingGuideChange(editor, change, expectedRevision);
      if (!applyDrawingGuideChange(editor, plan)) { setMessage('failed'); return false; }
      setMessage('done'); return true;
    } catch (error) { setMessage(error instanceof DrawingGuideError ? error.code : 'failed'); return false; }
  }
  const unit = settings?.unit ?? 'px';
  const order = { y: 0, x: 1, angle: 2 } as const;
  const ordered = [...state.guides.guides].sort((a, b) => order[a.axis] - order[b.axis] ||
    (a.axis !== 'angle' && b.axis !== 'angle'
      ? guidePositionToUnit(a.axis, a.position, settings) - guidePositionToUnit(b.axis, b.position, settings)
      : (a.angle ?? 0) - (b.angle ?? 0)));
  const description = (item: DrawingGuide) => item.axis === 'angle' ? `${t('angled')} · ${display(item.angle)}°`
    : `${t(item.axis === 'x' ? 'vertical' : 'horizontal')} · ${display(guidePositionToUnit(item.axis, item.position, settings))} ${unit}`;
  return <section className="drawing-guides" aria-label={t('title')} data-testid="drawing-guides-panel" onKeyDown={event => event.stopPropagation()}>
    <p className="drawing-help">{t('help')}</p>
    {!state.valid && <p className="drawing-help is-error" role="alert">{t('corrupt')}</p>}
    {state.readonly && <p className="drawing-help" role="status">{t('readonly')}</p>}
    {state.busy && <p className="drawing-help" role="status">{t('busy')}</p>}
    <fieldset className="drawing-workbench-fields" disabled={readonly}>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.guides.visible} data-testid="drawing-guides-visible"
        onChange={event => apply({ kind: 'settings', visible: event.target.checked })} /><span>{t('showGuides')}</span></label>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.guides.locked} data-testid="drawing-guides-locked"
        onChange={event => apply({ kind: 'settings', locked: event.target.checked })} /><span>{t('lockEditing')}</span></label>
      <label className="drawing-cad-check"><input type="checkbox" checked={state.snapping} data-testid="drawing-guides-snap"
        onChange={event => setMessage(editor.getCurrentPageId() === state.pageId && writeCadSnapSettings(editor, { guidelines: event.target.checked }) ? 'done' : 'failed')} /><span>{t('snapGuides')}</span></label>
    </fieldset>
    {!state.master && <p className="drawing-help">{t('masterOff')}</p>}
    {state.guides.locked && <p className="drawing-help">{t('lockHelp')}</p>}
    {!settings && <p className="drawing-help">{t('pixelHelp')} {onDocument && <button type="button" onClick={onDocument}>{t('document')}</button>}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      if (!geometryDisabled) apply(axis === 'angle' ? { kind: 'add', axis, ...guidePose(addPose, settings) }
        : { kind: 'add', axis, position: addPosition.current });
    }}>
      <fieldset className="drawing-workbench-fields" disabled={geometryDisabled || state.guides.guides.length >= MAX_DRAWING_GUIDES}>
        <legend>{t('add')}</legend>
        <label><span>{t('orientation')}</span><select value={axis} data-testid="drawing-guide-add-axis" onChange={event => {
          const next = event.target.value as DrawingGuideGeometry['axis'];
          setAxis(next);
          if (next !== 'angle') addPosition.current = guidePositionFromUnit(next, numeric(addDraft), settings);
          setMessage(null);
        }}><option value="y">{t('horizontal')}</option><option value="x">{t('vertical')}</option><option value="angle">{t('angled')}</option></select></label>
        {axis === 'angle' ? <>
          <GuidePoseFields draft={addPose} change={value => { setAddPose(value); setMessage(null); }} unit={unit} prefix="add" />
          <button type="button" onClick={() => {
            const center = editor.getSelectionPageBounds()?.center ?? editor.getViewportPageBounds().center;
            const point = poseDraft(center, 0, settings);
            setAddPose(previous => ({ ...point, angle: previous.angle }));
          }}>{t('useCenter')}</button>
        </> : <label><span>{t('position')} ({axis.toUpperCase()}, {unit})</span>
          <input ref={addInput} type="number" step="any" required value={addDraft} data-testid="drawing-guide-add-position"
            onChange={event => { setAddDraft(event.target.value); addPosition.current = guidePositionFromUnit(axis, numeric(event.target.value), settings); setMessage(null); }} />
        </label>}
        <button type="submit" data-testid="drawing-guide-add">{t('add')}</button>
      </fieldset>
    </form>
    <p className="drawing-help" aria-live="polite">{t('count').replace('{count}', String(state.guides.guides.length)).replace('{maximum}', String(MAX_DRAWING_GUIDES))}</p>
    {ordered.length ? <label className="drawing-guide-list"><span>{t('guides')}</span>
      <select ref={guideList} size={Math.min(7, ordered.length + 1)} value={guide?.id ?? ''} data-testid="drawing-guides-list" onChange={event => selectDrawingGuide(editor, event.target.value || null)}>
        <option value="">{t('selectGuide')}</option>
        {ordered.map(guide => <option key={guide.id} value={guide.id}>{description(guide)}{guide.locked ? ` · ${t('lockedLabel')}` : ''}{!guide.visible ? ` · ${t('hiddenLabel')}` : ''}</option>)}
      </select>
    </label> : <p className="drawing-help">{t('empty')}</p>}
    {guide && <section className="drawing-guide-selected" aria-label={t('selected')}>
      <form onKeyDown={event => {
        if (event.key === 'Escape' && moveRevision !== null) { event.preventDefault(); resetMove(); }
      }} onSubmit={event => {
        event.preventDefault();
        if (geometryDisabled || guide.locked || stale || moveRevision === null) return;
        const change: DrawingGuideChange = guide.axis === 'angle' || rotateAxisGuide ? { kind: 'pose', id: guide.id, ...guidePose(movePose, settings) }
          : { kind: 'move', id: guide.id, position: movePosition.current };
        if (apply(change, moveRevision)) { setRotateAxisGuide(false); setMoveRevision(null); }
      }}>
        <fieldset className="drawing-workbench-fields" disabled={geometryDisabled || guide.locked}>
          <legend>{t('selected')}</legend>
          {guide.axis === 'angle' || rotateAxisGuide ? <>
            <GuidePoseFields draft={movePose} change={value => { setMovePose(value); setMoveRevision(previous => previous ?? state.revision); setMessage(null); }} unit={unit} prefix="move" />
            <p className="drawing-help">{t('angleHelp')}</p>
          </> : <><label><span>{t('position')} ({guide.axis.toUpperCase()}, {unit})</span>
            <input ref={moveInput} type="number" step="any" required value={moveDraft} data-testid="drawing-guide-move-position"
              aria-invalid={stale || message === 'invalid'} aria-describedby={stale || message ? errorId : undefined}
              onChange={event => { setMoveDraft(event.target.value); movePosition.current = guidePositionFromUnit(guide.axis, numeric(event.target.value), settings); setMoveRevision(state.revision); setMessage(null); }} />
          </label><button type="button" data-testid="drawing-guide-rotate-angle" disabled={moveRevision !== null} onClick={() => {
            const point = editor.getSelectionPageBounds()?.center ?? editor.getViewportPageBounds().center;
            const pose = drawingGuideRotationPose(guide, point);
            if (!pose) return;
            setMovePose(poseDraft(pose.pivot, pose.angle, settings));
            setRotateAxisGuide(true);
            setMoveRevision(state.revision);
            setMessage(null);
          }}>{t('convertAngle')}</button></>}
          <div className="drawing-guide-actions"><button type="submit" disabled={stale || moveRevision === null} data-testid="drawing-guide-move">{t('move')}</button>
            <button type="button" onClick={resetMove} disabled={moveRevision === null} data-testid="drawing-guide-reset">{t('reset')}</button></div>
        </fieldset>
      </form>
      <fieldset className="drawing-workbench-fields" disabled={readonly}>
        <label className="drawing-cad-check"><input type="checkbox" checked={guide.visible} data-testid="drawing-guide-visible"
          onChange={event => apply({ kind: 'guide-visible', id: guide.id, visible: event.target.checked })} /><span>{t('guideVisible')}</span></label>
        <label className="drawing-cad-check"><input type="checkbox" checked={guide.locked} data-testid="drawing-guide-locked"
          onChange={event => apply({ kind: 'guide-locked', id: guide.id, locked: event.target.checked })} /><span>{t('guideLocked')}</span></label>
        <button type="button" disabled={geometryDisabled || guide.locked} data-testid="drawing-guide-delete" onClick={() => apply({ kind: 'remove', ids: [guide.id] })}>{t('remove')}</button>
      </fieldset>
    </section>}
    {renderAlignment?.(guide)}
    <details className="drawing-guide-help"><summary>{t('howGuidesWork')}</summary>
      <p className="drawing-help">{t('snapHelp')}</p><p className="drawing-help">{t('axesHelp')}</p>
    </details>
    {(stale || message) && <p id={errorId} className={`drawing-help${stale || message !== 'done' ? ' is-error' : ''}`} role={stale || message !== 'done' ? 'alert' : 'status'}>{t(stale ? 'stale' : message!)}</p>}
  </section>;
}
