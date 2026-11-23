import React, { useEffect, useRef, useState } from 'react';
import { atom, useEditor, useValue, type Editor, type TLShapeId } from '@tldraw/tldraw';
import { isMirrorGuide, prepareMirrorCopy, type MirrorCopyAxis, type MirrorCopyPlan } from './cad-mirror-copy';
import { applyCadPlan, cadRevision, CadOperationError } from './cad-plans';
import { cadPointToCanvas, unitMm, type CadSettings } from './cad-settings';
import { drawingObjectName } from './drawing-operations';
import { mirrorCopyError, useMirrorCopyText, type MirrorCopyLabel } from './mirror-copy';

const createPreview = () => atom<MirrorCopyPlan | null>('drawing mirror copy preview', null);
const previews = new WeakMap<Editor, ReturnType<typeof createPreview>>();
function mirrorPreview(editor: Editor) {
  let preview = previews.get(editor);
  if (!preview) {
    preview = createPreview();
    previews.set(editor, preview);
  }
  return preview;
}

export function DrawingMirrorCopyOverlay() {
  const editor = useEditor();
  const plan = useValue('mirror copy overlay', () => mirrorPreview(editor).get(), [editor]);
  if (!plan) return null;
  return <svg width={1} height={1} className="drawing-repeat-overlay" data-testid="drawing-mirror-copy-overlay" aria-hidden="true">
    <line className="drawing-repeat-overlay-margin" x1={plan.start.x} y1={plan.start.y} x2={plan.end.x} y2={plan.end.y} vectorEffect="non-scaling-stroke" />
    <path className="drawing-repeat-overlay-copy" style={{ fill: 'none' }} d={plan.outline} vectorEffect="non-scaling-stroke" />
  </svg>;
}

const number = (value: string) => value.trim() ? Number(value) : NaN;

export function MirrorCopyPanel({ settings, onSetup }: { settings: CadSettings | null; onSetup: () => void }) {
  const editor = useEditor();
  const t = useMirrorCopyText();
  const axisRef = useRef<HTMLSelectElement>(null);
  const state = useValue('mirror copy selection', () => {
    const selected = editor.getSelectedShapes();
    return { guides: selected.filter(isMirrorGuide), count: selected.length,
      readOnly: editor.getInstanceState().isReadonly, revision: cadRevision(editor) };
  }, [editor]);
  const [mode, setMode] = useState<'guide' | 'coordinates'>(() => state.count > 1 && state.guides.length ? 'guide' : 'coordinates');
  const [picked, setPicked] = useState<TLShapeId>();
  const guide = state.guides.find(shape => shape.id === picked) ?? state.guides.at(-1);
  const [values, setValues] = useState(() => ({ startX: '0', startY: '0', endX: '0', endY: String(Number((100 / unitMm(settings?.unit ?? 'mm')).toFixed(6))) }));
  const [review, setReview] = useState<{ plan: MirrorCopyPlan; key: string }>();
  const [status, setStatus] = useState<MirrorCopyLabel>();
  const enabled = !!settings && !state.readOnly && (mode === 'guide' ? !!guide && state.count > 1 : state.count > 0);
  const key = JSON.stringify([mode, guide?.id, values, settings]);
  const ready = enabled && review && review.key === key && review.plan.drawing.revision === state.revision ? review.plan : null;

  useEffect(() => { axisRef.current?.focus(); }, []);
  useEffect(() => {
    const preview = mirrorPreview(editor);
    preview.set(ready);
    return () => { if (preview.get() === ready) preview.set(null); };
  }, [editor, ready]);

  function preview() {
    if (!enabled || !settings) return;
    const axis: MirrorCopyAxis = mode === 'guide' && guide ? { guideId: guide.id } : {
      start: cadPointToCanvas({ x: number(values.startX), y: number(values.startY) }, settings),
      end: cadPointToCanvas({ x: number(values.endX), y: number(values.endY) }, settings),
    };
    setStatus(undefined);
    try { setReview({ plan: prepareMirrorCopy(editor, axis), key }); }
    catch (error) {
      setReview(undefined);
      setStatus(error instanceof CadOperationError ? mirrorCopyError(error.code) : 'failed');
    }
  }

  function apply() {
    if (!ready) return;
    setStatus(applyCadPlan(editor, ready.drawing) ? 'done' : 'failed');
    setReview(undefined);
  }

  return <section className="drawing-cad-section" aria-label={t('title')} data-testid="drawing-mirror-copy">
    <p className="drawing-help">{t(settings ? 'help' : 'mirrorDocument')}</p>
    {!settings && <button type="button" onClick={onSetup}>{t('setup')}</button>}
    <form onSubmit={event => { event.preventDefault(); preview(); }}>
      <fieldset className="drawing-cad-fields" disabled={!settings || state.readOnly}>
        <label className="drawing-cad-field"><span>{t('axis')}</span>
          <select ref={axisRef} value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
            <option value="guide">{t('selectedGuide')}</option><option value="coordinates">{t('coordinates')}</option>
          </select>
        </label>
        {mode === 'guide' ? <label className="drawing-cad-field"><span>{t('guide')}</span>
          <select value={guide?.id ?? ''} onChange={event => setPicked(event.target.value as TLShapeId)} data-testid="drawing-mirror-guide">
            {!guide && <option value="">—</option>}
            {state.guides.map(shape => <option key={shape.id} value={shape.id}>{drawingObjectName(shape)}</option>)}
          </select>
        </label> : (['startX', 'startY', 'endX', 'endY'] as const).map(field => <label className="drawing-cad-field" key={field}>
          <span>{t(field)} ({settings?.unit ?? 'mm'})</span>
          <input type="number" step="any" required value={values[field]}
            onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} />
        </label>)}
      </fieldset>
      {settings && !state.readOnly && !enabled && <p className="drawing-help">
        {t(mode === 'coordinates' ? 'selectArtwork' : guide ? 'mirrorSelection' : 'mirrorGuide')}
      </p>}
      <div className="drawing-nest-actions">
        <button type="submit" disabled={!enabled} data-testid="drawing-mirror-preview">{t('preview')}</button>
        <button type="button" disabled={!ready} onClick={apply} data-testid="drawing-mirror-apply">{t('apply')}</button>
        {review && <button type="button" onClick={() => setReview(undefined)}>{t('clear')}</button>}
      </div>
    </form>
    {ready && <dl className="drawing-cad-values"><dt>{t('result')}</dt><dd>{ready.drawing.shapes?.length}</dd></dl>}
    {review && !ready && <p className="drawing-help" role="status">{t('stale')}</p>}
    {status && <p className="drawing-help" role={status === 'done' ? 'status' : 'alert'}>{t(status)}</p>}
  </section>;
}
