import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue, type TLShapeId } from '@tldraw/tldraw';
import { MAX_PATH_REPEAT_COPIES, type PathRepeatOptions } from './cad-path-repeat-layout';
import { canvasLengthToUnit, unitLengthToCanvas, unitMm, type CadSettings } from './cad-settings';
import { cadRevision, CadOperationError } from './cad-plans';
import { drawingObjectName } from './drawing-operations';
import { applyPathRepeat, isPathRepeatGuide, preparePathRepeat, type DrawingPathRepeatPlan } from './drawing-path-repeat';
import { drawingPathRepeatPreview } from './DrawingPathRepeatOverlay';
import { isPathRepeatLabel, usePathRepeatText, type PathRepeatLabel } from './path-repeat-copy';

const number = (value: string) => value.trim() ? Number(value) : NaN;

export function PathRepeatPanel({ settings, onSetup }: { settings: CadSettings | null; onSetup: () => void }) {
  const editor = useEditor();
  const t = usePathRepeatText();
  const guideRef = useRef<HTMLSelectElement>(null);
  const offsetHint = useId();
  const state = useValue('path repeat selection', () => {
    const page = editor.getCurrentPageId();
    const shapes = editor.getSelectedShapes();
    return { guides: shapes.filter(shape => isPathRepeatGuide(shape, page)), count: shapes.length,
      readOnly: editor.getInstanceState().isReadonly, revision: cadRevision(editor) };
  }, [editor]);
  const [picked, setPicked] = useState<TLShapeId>();
  const guide = state.guides.find(shape => shape.id === picked) ?? state.guides.at(-1);
  const [mode, setMode] = useState<PathRepeatOptions['mode']>('count');
  const [values, setValues] = useState(() => ({
    count: '6', pitch: String(Number((50 / unitMm(settings?.unit ?? 'mm')).toFixed(4))),
    start: '0', end: '0', offset: '0',
  }));
  const [tangent, setTangent] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [review, setReview] = useState<{ plan: DrawingPathRepeatPlan; key: string }>();
  const [status, setStatus] = useState<PathRepeatLabel>();
  const enabled = !!settings && !state.readOnly && !!guide && state.count > 1;
  const key = JSON.stringify([guide?.id, mode, values, tangent, reverse, settings]);
  const ready = enabled && review && review.key === key && review.plan.revision === state.revision ? review.plan : null;
  useEffect(() => { guideRef.current?.focus(); }, []);
  useEffect(() => {
    const atom = drawingPathRepeatPreview(editor);
    atom.set(ready);
    return () => { if (atom.get() === ready) atom.set(null); };
  }, [editor, ready]);

  function preview() {
    if (!enabled || !settings || !guide) return;
    setStatus(undefined);
    const length = (value: string) => unitLengthToCanvas(number(value), settings);
    const common = { startInset: length(values.start), endInset: length(values.end), offset: length(values.offset), reverse, followTangent: tangent };
    const options: PathRepeatOptions = mode === 'count' ? { ...common, mode, count: number(values.count) } : { ...common, mode, pitch: length(values.pitch) };
    try { setReview({ plan: preparePathRepeat(editor, guide.id, options), key }); }
    catch (error) {
      setReview(undefined);
      setStatus(error instanceof CadOperationError && isPathRepeatLabel(error.code) ? error.code : 'failed');
    }
  }

  function apply() {
    if (!ready) return;
    setStatus(applyPathRepeat(editor, ready) ? 'applied' : 'failed');
    setReview(undefined);
  }

  const formatted = (value: number) => settings ? `${Number(canvasLengthToUnit(value, settings).toFixed(settings.precision))} ${settings.unit}` : '';
  const field = (name: keyof typeof values, label: PathRepeatLabel, min?: number, max?: number, step: number | 'any' = 'any') =>
    <label className="drawing-cad-field"><span>{t(label)}{name !== 'count' ? ` (${settings?.unit ?? 'mm'})` : ''}</span>
      <input type="number" value={values[name]} required min={min} max={max} step={step}
        aria-describedby={name === 'offset' ? offsetHint : undefined}
        onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} data-testid={`drawing-path-repeat-${name}`} />
    </label>;

  return <section className="drawing-cad-section" aria-label={t('title')} data-testid="drawing-path-repeat">
    <p className="drawing-help">{t(settings ? 'help' : 'pathDocument')}</p>
    {!settings && <button type="button" onClick={onSetup}>{t('setup')}</button>}
    <form onSubmit={event => { event.preventDefault(); preview(); }}>
      <fieldset className="drawing-cad-fields" disabled={!settings || state.readOnly}>
        <label className="drawing-cad-field"><span>{t('guide')}</span>
          <select ref={guideRef} value={guide?.id ?? ''} onChange={event => setPicked(event.target.value as TLShapeId)} data-testid="drawing-path-repeat-guide">
            {!guide && <option value="">—</option>}
            {state.guides.map(shape => <option key={shape.id} value={shape.id}>{drawingObjectName(shape)}</option>)}
          </select>
        </label>
        <label className="drawing-cad-field"><span>{t('mode')}</span>
          <select value={mode} onChange={event => setMode(event.target.value as PathRepeatOptions['mode'])}>
            <option value="count">{t('countMode')}</option><option value="pitch">{t('pitchMode')}</option>
          </select>
        </label>
        {mode === 'count' ? field('count', 'count', 1, MAX_PATH_REPEAT_COPIES, 1) : field('pitch', 'pitch', 0)}
        {field('start', 'start', 0)}{field('end', 'end', 0)}{field('offset', 'offset')}
        <p id={offsetHint} className="drawing-help">{t('offsetHelp')}</p>
        <label className="drawing-cad-check"><input type="checkbox" checked={tangent} onChange={event => setTangent(event.target.checked)} />{t('tangent')}</label>
        <label className="drawing-cad-check"><input type="checkbox" checked={reverse} onChange={event => setReverse(event.target.checked)} />{t('reverse')}</label>
      </fieldset>
      <div className="drawing-nest-actions">
        <button type="submit" disabled={!enabled} data-testid="drawing-path-repeat-preview">{t('preview')}</button>
        <button type="button" disabled={!ready} onClick={apply} data-testid="drawing-path-repeat-apply">{t('apply')}</button>
        {review && <button type="button" onClick={() => setReview(undefined)}>{t('clear')}</button>}
      </div>
    </form>
    {review && !ready && <p className="drawing-help" role="status">{t('stale')}</p>}
    {ready && <dl className="drawing-cad-values" data-testid="drawing-path-repeat-summary">
      <dt>{t('length')}</dt><dd>{formatted(ready.length)}</dd>
      <dt>{t('count')}</dt><dd>{ready.positions.length}</dd>
      {ready.positions.length > 1 && <><dt>{t('actualPitch')}</dt><dd>{formatted(ready.pitch)}</dd></>}
      <dt>{t('generated')}</dt><dd>{ready.created}</dd>
    </dl>}
    {status && <p className="drawing-help" role={status === 'applied' ? 'status' : 'alert'}>{t(status)}</p>}
  </section>;
}
