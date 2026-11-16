import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '@tldraw/tldraw';
import { curveBounds, curvePathData } from './cad-curves';
import { applyCadPlan, type CadPlan } from './cad-plans';
import { canvasPointToCad, unitMm, type CadSettings } from './cad-settings';
import { prepareParametricShape, type ParametricShapeKind, type ParametricShapeOptions } from './cad-parametric-shapes';
import { useParametricShapeText, parametricShapeError } from './parametric-shape-copy';

const numeric = (value: string) => value.trim() ? Number(value) : NaN;
export function ParametricShapePanel({ settings, revision, disabled, focusSequence }: {
  settings: CadSettings | null; revision: string; disabled: boolean; focusSequence?: number;
}) {
  const editor = useEditor(), t = useParametricShapeText(), section = useRef<HTMLDetailsElement>(null);
  const [kind, setKind] = useState<ParametricShapeKind>('polygon'), [proportions, setProportions] = useState(true);
  const [corner, setCorner] = useState<ParametricShapeOptions['corner']>('sharp');
  const [values, setValues] = useState(() => {
    const center = settings ? canvasPointToCad(editor.getViewportPageBounds().center, settings) : { x: 0, y: 0 };
    const mm = unitMm(settings?.unit ?? 'mm');
    return { points: '6', step: '2', innerRatio: '50', width: String(100 / mm), height: String(100 / mm),
      centerX: String(center.x), centerY: String(center.y), rotation: '0', cornerSize: String(2 / mm) };
  });
  const [review, setReview] = useState<{ plan: CadPlan; key: string }>(), [message, setMessage] = useState<Parameters<typeof t>[0]>();
  const oldUnit = useRef(settings?.unit ?? 'mm');
  useEffect(() => {
    const next = settings?.unit ?? 'mm', factor = unitMm(oldUnit.current) / unitMm(next);
    if (factor !== 1) setValues(current => {
      const nextValues = { ...current };
      for (const key of ['width', 'height', 'centerX', 'centerY', 'cornerSize'] as const)
        if (Number.isFinite(numeric(current[key]))) nextValues[key] = String(numeric(current[key]) * factor);
      return nextValues;
    });
    oldUnit.current = next;
  }, [settings?.unit]);
  useEffect(() => {
    if (focusSequence === undefined) return;
    if (section.current) section.current.open = true;
    section.current?.scrollIntoView({ block: 'nearest' });
    section.current?.querySelector('select')?.focus();
  }, [focusSequence]);
  const options: ParametricShapeOptions = { kind, corner: kind === 'polygon' ? corner : 'sharp', points: numeric(values.points),
    step: numeric(values.step), innerRatio: numeric(values.innerRatio) / 100, width: numeric(values.width), height: numeric(values.height),
    centerX: numeric(values.centerX), centerY: numeric(values.centerY), rotation: numeric(values.rotation), cornerSize: numeric(values.cornerSize) };
  const key = JSON.stringify([settings, options]), stale = !!review && (review.key !== key || review.plan.revision !== revision);
  function change(field: keyof typeof values, value: string) {
    setMessage(undefined);
    setValues(current => {
      const next = { ...current, [field]: value };
      if (proportions && (field === 'width' || field === 'height')) {
        const other = field === 'width' ? 'height' : 'width', previous = numeric(current[field]), paired = numeric(current[other]), proposed = numeric(value);
        if ([previous, paired, proposed].every(n => Number.isFinite(n) && n > 0)) next[other] = String(paired * proposed / previous);
      }
      return next;
    });
  }
  function field(name: keyof typeof values, min?: number, max?: number, step: number | 'any' = 'any') {
    const labelKey = name === 'innerRatio' ? 'ratio' : name;
    return <label className="drawing-cad-field" key={name}><span>{t(labelKey)}{['width', 'height', 'centerX', 'centerY', 'cornerSize'].includes(name) ? ' (' + (settings?.unit ?? 'mm') + ')' : ''}</span>
      <input type="number" value={values[name]} min={min} max={max} step={step} required onChange={event => change(name, event.target.value)}/></label>;
  }
  const bounds = review ? curveBounds(review.plan.contours) : null, padding = bounds ? Math.max(bounds.w, bounds.h, 1) * 0.05 : 1;
  return <details ref={section} className="drawing-cad-section" data-testid="vector-polygon">
    <summary>{t('title')}</summary>
    {!settings && <p className="drawing-help">{t('setup')}</p>}
    <form onSubmit={event => {
      event.preventDefault(); setMessage(undefined);
      if (!settings || disabled) return;
      try { setReview({ plan: prepareParametricShape(editor, settings, options), key }); }
      catch (error) { setReview(undefined); setMessage(parametricShapeError(error)); }
    }}><fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
      <label className="drawing-cad-field"><span>{t('kind')}</span><select value={kind} onChange={event => { setKind(event.target.value as ParametricShapeKind); setMessage(undefined); }}>
        {(['polygon', 'star', 'complex-star'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></label>
      {field('points', kind === 'complex-star' ? 5 : 3, 64, 1)}
      {kind === 'star' && field('innerRatio', 10, 99.99)}
      {kind === 'complex-star' && field('step', 2, Number.isInteger(options.points) ? Math.floor((options.points - 1) / 2) : undefined, 1)}
      {field('width', 0.000001)}{field('height', 0.000001)}
      <label className="drawing-vector-check"><input type="checkbox" checked={proportions} onChange={event => setProportions(event.target.checked)}/>{t('proportions')}</label>
      {field('centerX')}{field('centerY')}{field('rotation', -360, 360)}
      <button type="button" onClick={() => {
        if (!settings) return;
        const center = canvasPointToCad(editor.getViewportPageBounds().center, settings);
        setValues(current => ({ ...current, centerX: String(center.x), centerY: String(center.y) })); setMessage(undefined);
      }}>{t('viewCenter')}</button>
      {kind === 'polygon' && <><label className="drawing-cad-field"><span>{t('corner')}</span><select value={corner} onChange={event => { setCorner(event.target.value as typeof corner); setMessage(undefined); }}>
        {(['sharp', 'fillet', 'chamfer'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
      </select></label>{corner !== 'sharp' && field('cornerSize', 0.000001)}</>}
      <button type="submit">{t('preview')}</button>
    </fieldset></form>
    <p className="drawing-help">{t('dimensionsHelp')}</p>
    {kind === 'complex-star' && <p className="drawing-help">{t('crossingHelp')}</p>}
    {kind === 'polygon' && corner !== 'sharp' && <p className="drawing-help">{t('cornerHelp')}</p>}
    {review && bounds && <div className="drawing-cad-report">
      <svg className="drawing-radial-preview" viewBox={[bounds.x - padding, bounds.y - padding, bounds.w + 2 * padding, bounds.h + 2 * padding].join(' ')} role="img" aria-label={t('preview')}>
        <path d={curvePathData(review.plan.contours)} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
      </svg>
      <dl className="drawing-cad-values"><dt>{t('size')}</dt><dd>{(review.plan.widthMm / unitMm(settings?.unit ?? 'mm')).toFixed(settings?.precision ?? 2)} × {(review.plan.heightMm / unitMm(settings?.unit ?? 'mm')).toFixed(settings?.precision ?? 2)} {settings?.unit ?? 'mm'}</dd>
        <dt>{t('contours')}</dt><dd>{review.plan.contours.length}</dd><dt>{t('nodeCount')}</dt><dd>{review.plan.contours.reduce((n, c) => n + c.nodes.length, 0)}</dd></dl>
      {stale && <p role="status">{t('stale')}</p>}
      <button type="button" disabled={disabled || !settings || stale} onClick={() => {
        const applied = applyCadPlan(editor, review.plan); setMessage(applied ? 'created' : 'failed');
        if (applied) setReview(undefined);
      }}>{t('apply')}</button>
    </div>}
    {message && <p className="drawing-help" role="status">{t(message)}</p>}
  </details>;
}
