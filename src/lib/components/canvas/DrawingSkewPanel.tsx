import React, { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useValue, type Editor } from '@tldraw/tldraw';
import { cadRevision, CadOperationError } from './cad-plans';
import { canvasLengthToUnit, type CadSettings } from './cad-settings';
import { curvePathData } from './cad-curves';
import { TRANSFORM_ANCHORS, type TransformAnchor } from './drawing-transform';
import { useTransformText } from './transform-copy';
import { enSkew, useSkewText } from './skew-copy';
import { applySkewPlan, prepareSkewPlan, readSkewSelection, MAX_SKEW_ANGLE, type SkewAxis, type SkewOptions, type SkewPlan } from './drawing-skew';

interface Draft { axis: SkewAxis; angle: string; anchor: TransformAnchor; keepOriginal: boolean; }
const preferences = new WeakMap<Editor, Draft>();
const errorKey = (code: string): keyof typeof enSkew => Object.hasOwn(enSkew, code) ? code as keyof typeof enSkew : 'failed';

export function DrawingSkewPanel({ settings, focusRequest = 0 }: { settings: CadSettings | null; focusRequest?: number }) {
  const editor = useEditor(), t = useSkewText(), transformText = useTransformText(), id = useId();
  const first = useRef<HTMLInputElement>(null);
  const revision = useValue('skew revision', () => cadRevision(editor), [editor]);
  const selected = useValue('skew selection', () => readSkewSelection(editor), [editor]);
  const [draft, setDraft] = useState<Draft>(() => preferences.get(editor) ?? { axis: 'horizontal', angle: '15', anchor: 'center', keepOriginal: false });
  const [review, setReview] = useState<{ plan: SkewPlan; key: string }>();
  const [message, setMessage] = useState<{ key: keyof typeof enSkew; success?: boolean }>();
  useEffect(() => { preferences.set(editor, draft); }, [editor, draft]);
  useEffect(() => { if (focusRequest) first.current?.focus(); }, [focusRequest]);
  const options: SkewOptions = { ...draft, angle: draft.angle.trim() ? Number(draft.angle) : NaN };
  const key = JSON.stringify([options, settings]), stale = !!review && (review.key !== key || review.plan.revision !== revision);
  const disabled = selected.count === 0;
  const update = (patch: Partial<Draft>) => { setDraft(previous => ({ ...previous, ...patch })); setMessage(undefined); };
  const size = (value: number) => {
    const number = settings ? canvasLengthToUnit(value, settings) : value;
    return String(Number(number.toFixed(settings?.precision ?? 2)));
  };
  const preview = () => {
    setReview(undefined); setMessage(undefined);
    try { setReview({ plan: prepareSkewPlan(editor, options), key }); }
    catch (error) { setMessage({ key: errorKey(error instanceof CadOperationError ? error.code : '') }); }
  };
  return <section className="drawing-skew" aria-label={t('title')} data-testid="drawing-skew">
    <p className="drawing-help">{t('help')}</p>
    {selected.error && <p className="drawing-help" role="status">{t(errorKey(selected.error))}</p>}
    <form onSubmit={event => { event.preventDefault(); if (!disabled) preview(); }}>
      <fieldset className="drawing-workbench-fields" disabled={disabled}>
        <label><span>{t('axis')}</span><select value={draft.axis} onChange={event => update({ axis: event.target.value as SkewAxis })} data-testid="drawing-skew-axis">
          <option value="horizontal">{t('horizontal')}</option><option value="vertical">{t('vertical')}</option>
        </select></label>
        <label><span>{t('angle')}</span><input ref={first} type="number" required min={-MAX_SKEW_ANGLE} max={MAX_SKEW_ANGLE} step="any" value={draft.angle}
          onChange={event => update({ angle: event.target.value })} data-testid="drawing-skew-angle" /></label>
        <fieldset className="drawing-transform-anchor"><legend>{transformText('reference')}</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {TRANSFORM_ANCHORS.map(anchor => <button key={anchor} type="button" aria-label={transformText(anchor)} title={transformText(anchor)} aria-pressed={draft.anchor === anchor}
              onClick={() => update({ anchor })}><span aria-hidden="true">{draft.anchor === anchor ? '●' : '○'}</span></button>)}
          </div>
        </fieldset>
        <label className="drawing-cad-check"><input type="checkbox" checked={draft.keepOriginal} onChange={event => update({ keepOriginal: event.target.checked })} />
          <span>{t('keepOriginal')}</span></label>
        <p className="drawing-help" id={id + '-style'}>{t('styleHelp')}</p>
        <button type="submit" aria-describedby={id + '-style'} data-testid="drawing-skew-preview">{t('preview')}</button>
      </fieldset>
    </form>
    {review && <>
      <SkewPreview plan={review.plan} label={t('preview')} />
      <dl className="drawing-cad-values">
        <dt>{t('source')}</dt><dd>{size(review.plan.sourceBounds.w)} × {size(review.plan.sourceBounds.h)} {settings?.unit ?? 'px'}</dd>
        <dt>{t('result')}</dt><dd>{size(review.plan.resultBounds.w)} × {size(review.plan.resultBounds.h)} {settings?.unit ?? 'px'}</dd>
        <dt>{t('objects')}</dt><dd>{review.plan.generated}</dd>
      </dl>
      <p className="drawing-help">{t('previewHelp')}</p>
      <button type="button" disabled={disabled || stale} data-testid="drawing-skew-apply" onClick={() => {
        const ok = applySkewPlan(editor, review.plan);
        setMessage({ key: ok ? 'done' : 'failed', success: ok });
        if (ok) { setReview(undefined); editor.focus(); }
      }}>{t('apply')}</button>
    </>}
    {stale && <p className="drawing-help" role="status">{t('stale')}</p>}
    {message && <p className="drawing-help" role={message.success ? 'status' : 'alert'}>{t(message.key)}</p>}
  </section>;
}

function SkewPreview({ plan, label }: { plan: SkewPlan; label: string }) {
  const boxes = [plan.sourceBounds, plan.resultBounds];
  const minX = Math.min(...boxes.map(b => b.x)), minY = Math.min(...boxes.map(b => b.y));
  const width = Math.max(...boxes.map(b => b.x + b.w)) - minX, height = Math.max(...boxes.map(b => b.y + b.h)) - minY;
  const pad = Math.max(width, height, 1) * .08, arm = pad * .4;
  return <svg role="img" aria-label={label} viewBox={[minX - pad, minY - pad, width + 2 * pad, height + 2 * pad].join(' ')} style={{ width: '100%', height: 180 }}>
    <g fill="none" strokeWidth={1.5}>
      {plan.items.map(item => <path key={item.id + '-source'} d={curvePathData(item.source)} stroke="currentColor" strokeDasharray="4 3" opacity={.55} vectorEffect="non-scaling-stroke" />)}
      {plan.items.map(item => <path key={item.id} d={curvePathData(item.result)} stroke="var(--brand)" vectorEffect="non-scaling-stroke" />)}
      <path d={`M${plan.anchor.x - arm},${plan.anchor.y}h${2 * arm}M${plan.anchor.x},${plan.anchor.y - arm}v${2 * arm}`}
        stroke="currentColor" vectorEffect="non-scaling-stroke" />
    </g>
  </svg>;
}
