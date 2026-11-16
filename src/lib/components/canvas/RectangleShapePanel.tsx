import React, { useEffect, useRef, useState } from 'react';
import { useEditor, type Editor } from '@tldraw/tldraw';
import { curveBounds, curvePathData } from './cad-curves';
import { applyCadPlan, type CadPlan } from './cad-plans';
import { canvasPointToCad, unitMm, type CadSettings, type CadUnit } from './cad-settings';
import { prepareRectangleShape, RECTANGLE_CORNERS, type RectangleCorner, type RectangleCornerKind, type RectangleShapeOptions } from './cad-rectangle-shapes';
import { rectangleShapeError, useRectangleShapeText } from './rectangle-shape-copy';

const numeric = (value: string) => value.trim() ? Number(value) : NaN;
interface RectangleDraft {
  unit: CadUnit; linked: boolean; proportions: boolean; aspectRatio: number;
  values: Record<'width' | 'height' | 'centerX' | 'centerY' | 'rotation', string>;
  corners: Record<RectangleCorner, { kind: RectangleCornerKind; size: string }>;
}
const drafts = new WeakMap<Editor, RectangleDraft>();
function inUnit(draft: RectangleDraft, unit: CadUnit): RectangleDraft {
  const factor = unitMm(draft.unit) / unitMm(unit), result = structuredClone(draft); result.unit = unit;
  if (factor === 1) return result;
  for (const key of ['width', 'height', 'centerX', 'centerY'] as const)
    if (Number.isFinite(numeric(result.values[key]))) result.values[key] = String(numeric(result.values[key]) * factor);
  for (const key of RECTANGLE_CORNERS)
    if (Number.isFinite(numeric(result.corners[key].size))) result.corners[key].size = String(numeric(result.corners[key].size) * factor);
  return result;
}

export function RectangleShapePanel({ settings, revision, disabled, focusSequence }: {
  settings: CadSettings | null; revision: string; disabled: boolean; focusSequence?: number;
}) {
  const editor = useEditor(), t = useRectangleShapeText(), section = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<RectangleDraft>(() => {
    const unit = settings?.unit ?? 'mm', stored = drafts.get(editor);
    if (stored) return inUnit(stored, unit);
    const center = settings ? canvasPointToCad(editor.getViewportPageBounds().center, settings) : { x: 0, y: 0 }, mm = unitMm(unit);
    return { unit, linked: true, proportions: false, aspectRatio: 100 / 60,
      values: { width: String(100 / mm), height: String(60 / mm), centerX: String(center.x), centerY: String(center.y), rotation: '0' },
      corners: { topLeft: { kind: 'round', size: String(5 / mm) }, topRight: { kind: 'round', size: String(5 / mm) },
        bottomRight: { kind: 'round', size: String(5 / mm) }, bottomLeft: { kind: 'round', size: String(5 / mm) } } };
  });
  const [review, setReview] = useState<{ plan: CadPlan; key: string }>(), [message, setMessage] = useState<Parameters<typeof t>[0]>();
  useEffect(() => { drafts.set(editor, draft); }, [editor, draft]);
  useEffect(() => { setDraft(current => inUnit(current, settings?.unit ?? 'mm')); }, [settings?.unit]);
  useEffect(() => {
    if (focusSequence === undefined) return;
    if (section.current) section.current.open = true;
    section.current?.scrollIntoView({ block: 'nearest' }); section.current?.querySelector('input')?.focus();
  }, [focusSequence]);
  const options: RectangleShapeOptions = { width: numeric(draft.values.width), height: numeric(draft.values.height),
    centerX: numeric(draft.values.centerX), centerY: numeric(draft.values.centerY), rotation: numeric(draft.values.rotation),
    corners: Object.fromEntries(RECTANGLE_CORNERS.map(key => [key, { kind: draft.corners[key].kind,
      size: draft.corners[key].kind === 'sharp' ? 0 : numeric(draft.corners[key].size) }])) as RectangleShapeOptions['corners'] };
  const key = JSON.stringify([settings, options]), stale = !!review && (review.key !== key || review.plan.revision !== revision);
  const unitReady = draft.unit === (settings?.unit ?? 'mm');
  function change(field: keyof RectangleDraft['values'], value: string) {
    setMessage(undefined); setDraft(current => {
      const values = { ...current.values, [field]: value };
      if (current.proportions && (field === 'width' || field === 'height')) {
        const other = field === 'width' ? 'height' : 'width', n = numeric(value);
        const paired = field === 'width' ? n / current.aspectRatio : n * current.aspectRatio;
        if ([n, paired].every(v => Number.isFinite(v) && v > 0)) values[other] = String(paired);
      }
      const ratio = numeric(values.width) / numeric(values.height);
      return { ...current, values, aspectRatio: !current.proportions && Number.isFinite(ratio) && ratio > 0 ? ratio : current.aspectRatio };
    });
  }
  function changeCorner(corner: RectangleCorner, value: Partial<RectangleDraft['corners'][RectangleCorner]>) {
    setMessage(undefined); setDraft(current => {
      const corners = { ...current.corners };
      for (const key of current.linked ? RECTANGLE_CORNERS : [corner]) corners[key] = { ...corners[key], ...value };
      return { ...current, corners };
    });
  }
  function field(name: keyof RectangleDraft['values']) {
    const dimension = name === 'width' || name === 'height';
    return <label className="drawing-cad-field"><span>{t(name)}{name === 'rotation' ? '' : ` (${draft.unit})`}</span>
      <input type="number" step="any" required min={dimension ? 0.000001 : name === 'rotation' ? -360 : undefined}
        max={name === 'rotation' ? 360 : undefined} value={draft.values[name]} onChange={e => change(name, e.target.value)}/></label>;
  }
  const bounds = review ? curveBounds(review.plan.contours) : null, padding = bounds ? Math.max(bounds.w, bounds.h, 1) * 0.05 : 1;
  const maximum = Math.min(options.width, options.height) / 2;
  return <details ref={section} className="drawing-cad-section" data-testid="vector-rectangle">
    <summary>{t('title')}</summary>
    {!settings && <p className="drawing-help">{t('setup')}</p>}
    <form onSubmit={event => {
      event.preventDefault(); setMessage(undefined);
      if (!settings || disabled || !unitReady) return;
      try { setReview({ plan: prepareRectangleShape(editor, settings, options), key }); }
      catch (error) { setReview(undefined); setMessage(rectangleShapeError(error)); }
    }}><fieldset className="drawing-cad-fields" disabled={disabled || !settings || !unitReady}>
      {field('width')}{field('height')}
      <label className="drawing-cad-check"><input type="checkbox" checked={draft.proportions} onChange={e => setDraft(current => ({ ...current, proportions: e.target.checked }))}/><span>{t('proportions')}</span></label>
      {field('centerX')}{field('centerY')}{field('rotation')}
      <button type="button" onClick={() => {
        if (!settings) return;
        const center = canvasPointToCad(editor.getViewportPageBounds().center, settings);
        setDraft(current => ({ ...current, values: { ...current.values, centerX: String(center.x), centerY: String(center.y) } })); setMessage(undefined);
      }}>{t('viewCenter')}</button>
      <label className="drawing-cad-check"><input type="checkbox" checked={draft.linked} onChange={e => {
        const linked = e.target.checked; setMessage(undefined);
        setDraft(current => ({ ...current, linked, corners: linked ? {
          topLeft: { ...current.corners.topLeft }, topRight: { ...current.corners.topLeft },
          bottomRight: { ...current.corners.topLeft }, bottomLeft: { ...current.corners.topLeft }
        } : current.corners }));
      }}/><span>{t('linked')}</span></label>
      <p className="drawing-help">{t('linkedHelp')}</p>
      {(draft.linked ? ['topLeft'] as const : RECTANGLE_CORNERS).map(corner => <fieldset className="drawing-cad-fields" key={corner}>
        <legend>{t(draft.linked ? 'allCorners' : corner)}</legend>
        <label className="drawing-cad-field"><span>{t('cornerKind')}</span><select value={draft.corners[corner].kind} onChange={e => changeCorner(corner, { kind: e.target.value as RectangleCornerKind })}>
          {(['sharp', 'round', 'scallop', 'chamfer'] as const).map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}
        </select></label>
        {draft.corners[corner].kind !== 'sharp' && <label className="drawing-cad-field"><span>{t(draft.corners[corner].kind === 'chamfer' ? 'cut' : 'radius')} ({draft.unit})</span>
          <input type="number" step="any" required min={0} max={Number.isFinite(maximum) && maximum > 0 ? maximum : undefined} value={draft.corners[corner].size} onChange={e => changeCorner(corner, { size: e.target.value })}/></label>}
      </fieldset>)}
      <p className="drawing-help">{t('cornerLimit')}{Number.isFinite(maximum) && maximum > 0 ? ` ${maximum.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${draft.unit}.` : ''}</p>
      <button type="submit">{t('preview')}</button>
    </fieldset></form>
    <p className="drawing-help">{t('dimensionsHelp')}</p>
    <p className="drawing-help">{t('curveHelp')}</p>
    {review && bounds && <div className="drawing-cad-report">
      <svg className="drawing-radial-preview" viewBox={[bounds.x - padding, bounds.y - padding, bounds.w + 2 * padding, bounds.h + 2 * padding].join(' ')} role="img" aria-label={t('preview')}>
        <path d={curvePathData(review.plan.contours)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      </svg>
      <dl className="drawing-cad-values"><dt>{t('actualSize')}</dt><dd>{(review.plan.widthMm / unitMm(settings?.unit ?? 'mm')).toFixed(settings?.precision ?? 2)} × {(review.plan.heightMm / unitMm(settings?.unit ?? 'mm')).toFixed(settings?.precision ?? 2)} {settings?.unit ?? 'mm'}</dd></dl>
      {stale && <p role="status">{t('stale')}</p>}
      <button type="button" disabled={disabled || !settings || stale || !unitReady} onClick={() => {
        const applied = applyCadPlan(editor, review.plan); setMessage(applied ? 'created' : 'failed'); if (applied) setReview(undefined);
      }}>{t('apply')}</button>
    </div>}
    {message && <p className="drawing-help" role={message === 'created' ? 'status' : 'alert'}>{t(message)}</p>}
  </details>;
}
