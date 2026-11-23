import React, { useId, useMemo, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { cadMmPerPixel, canvasLengthToUnit, unitLengthToCanvas, unitMm, type CadSettings } from './cad-settings';
import { drawingPageBounds, DRAWING_STOCK_PRESETS } from './drawing-pages';
import { applyNest, nestableSelection } from './cad-nest-apply';
import { nestMaterial, nestParts, type NestOptions, type NestResult } from './cad-nesting';
import { useNestText } from './nest-copy';

type Source = 'page' | keyof typeof DRAWING_STOCK_PRESETS | 'custom';
const SHEET_SPACING_MM = 100;
const number = (value: string) => value.trim() ? Number(value) : NaN;

function SheetPreview({ result, sheetW, sheetH, margin, label }: {
  result: NestResult; sheetW: number; sheetH: number; margin: number; label: (n: number) => string;
}) {
  const sheets = Math.max(1, result.sheets), pad = Math.max(sheetW, sheetH) * 0.04, space = sheetW * 0.08;
  const total = sheets * sheetW + (sheets - 1) * space;
  return <svg className="drawing-nest-preview" viewBox={`${-pad} ${-pad} ${total + pad * 2} ${sheetH + pad * 2}`} role="img"
    aria-label={result.utilisation.map((u, i) => `${label(i + 1)}: ${Math.round(u * 100)}%`).join(', ')}>
    {Array.from({ length: sheets }, (_, s) => <g key={s} transform={`translate(${s * (sheetW + space)} 0)`}>
      <rect className="drawing-nest-sheet" width={sheetW} height={sheetH} vectorEffect="non-scaling-stroke" />
      <rect className="drawing-nest-margin" x={margin} y={margin} width={Math.max(0, sheetW - 2 * margin)} height={Math.max(0, sheetH - 2 * margin)} vectorEffect="non-scaling-stroke" />
      {result.placements.filter(p => p.sheet === s).map((p, i) =>
        <rect key={p.id} className={`drawing-nest-part${p.rotated ? ' is-turned' : ''}`} x={p.x} y={p.y} width={p.w} height={p.h}
          style={{ ['--i' as string]: i }} vectorEffect="non-scaling-stroke" />)}
    </g>)}
  </svg>;
}

export function NestPanel({ settings, disabled, onSetup }: { settings: CadSettings | null; disabled: boolean; onSetup: () => void }) {
  const editor = useEditor();
  const t = useNestText();
  const errorId = useId();
  const parts = useValue('nestable selection', () => nestableSelection(editor), [editor]);
  const pageId = useValue('nest page id', () => editor.getCurrentPageId(), [editor]);
  const page = useValue('nest drawing page', () => drawingPageBounds(editor), [editor]);
  const key = JSON.stringify(parts);
  const unit = settings?.unit ?? 'mm';
  const [source, setSource] = useState<Source>(page ? 'page' : '1250 × 2500 mm');
  const [values, setValues] = useState({ width: '2500', height: '1250', margin: '10', gap: '6', maxSheets: '10', price: '' });
  const [rotate, setRotate] = useState(true);
  const [review, setReview] = useState<{ result: NestResult; key: string; optionsKey: string; options: NestOptions; origin: { x: number; y: number } }>();
  const [message, setMessage] = useState<{ text: string; error: boolean }>();

  // All nesting maths runs in canvas px so placements map 1:1 onto the drawing.
  const sheetPx = useMemo(() => {
    if (!settings) return null;
    if (source === 'page') return page ? { w: page.w, h: page.h, origin: { x: page.x, y: page.y } } : null;
    const mm = source === 'custom'
      ? { widthMm: number(values.width) * unitMm(unit), heightMm: number(values.height) * unitMm(unit) }
      : DRAWING_STOCK_PRESETS[source];
    const factor = cadMmPerPixel(settings);
    return { w: mm.widthMm / factor, h: mm.heightMm / factor, origin: null };
  }, [settings, source, page, values.width, values.height, unit]);

  const toPx = (value: string) => settings ? unitLengthToCanvas(number(value), settings) : NaN;
  const options: NestOptions | null = sheetPx ? {
    sheetW: sheetPx.w, sheetH: sheetPx.h, margin: toPx(values.margin), gap: toPx(values.gap),
    allowRotate: rotate, maxSheets: Math.floor(number(values.maxSheets))
  } : null;
  const optionsKey = JSON.stringify([pageId, sheetPx?.origin, settings && cadMmPerPixel(settings), options]);
  const stale = !!review && (review.key !== key || review.optionsKey !== optionsKey);
  const enough = parts.length >= 2;
  const editable = !!settings && !disabled;
  const fmt = (px: number) => settings ? canvasLengthToUnit(px, settings).toFixed(settings.precision ?? 1) : px.toFixed(0);

  function preview() {
    setMessage(undefined);
    if (!options || !enough) { setReview(undefined); setMessage({ text: t(settings ? 'selection' : 'documentRequired'), error: true }); return; }
    const result = nestParts(parts.map(({ id, w, h }) => ({ id, w, h })), options);
    if (typeof result === 'string') { setReview(undefined); setMessage({ text: t(result), error: true }); return; }
    const left = Math.min(...parts.map(p => p.x)), top = Math.min(...parts.map(p => p.y));
    setReview({ result, key, optionsKey, options, origin: sheetPx?.origin ?? { x: left, y: top } });
  }

  function apply() {
    if (!review || stale || !settings) return;
    const spacing = SHEET_SPACING_MM / cadMmPerPixel(settings);
    const ok = applyNest(editor, review.result, review.origin, review.options.sheetW, spacing);
    setMessage({ text: t(ok ? 'applied' : 'failed'), error: !ok });
    if (ok) setReview(undefined);
  }

  const result = !stale ? review?.result : undefined;
  const material = result && options && settings ? nestMaterial(result, options.sheetW * cadMmPerPixel(settings), options.sheetH * cadMmPerPixel(settings),
    values.price.trim() ? number(values.price) : undefined) : undefined;
  const turned = result?.placements.filter(p => p.rotated).length ?? 0;
  return <section className="drawing-nest" aria-label={t('title')} data-testid="drawing-nest">
    <p className="drawing-help">{t(settings ? 'help' : 'documentRequired')}</p>
    {!settings && <button type="button" onClick={onSetup}>{t('setup')}</button>}
    <form className="drawing-nest-form" onSubmit={event => { event.preventDefault(); preview(); }} aria-describedby={message?.error ? errorId : undefined}>
      <fieldset disabled={!editable} className="drawing-style-fields">
        <label><span>{t('sheet')}</span><select value={source} data-testid="drawing-nest-sheet"
          onChange={event => { setSource(event.target.value as Source); setReview(undefined); }}>
          {page && <option value="page">{t('page')} · {fmt(page.w)} × {fmt(page.h)} {unit}</option>}
          {Object.keys(DRAWING_STOCK_PRESETS).map(name => <option key={name} value={name}>{name}</option>)}
          <option value="custom">{t('custom')}</option>
        </select></label>
        {source === 'custom' && (['width', 'height'] as const).map(field => <label key={field}><span>{t(field)} ({unit})</span>
          <input type="number" min={0} step="any" required value={values[field]}
            onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} /></label>)}
        <label><span>{t('margin')} ({unit})</span><input type="number" min={0} step="any" required value={values.margin}
          onChange={event => setValues(current => ({ ...current, margin: event.target.value }))} /></label>
        <label><span>{t('gap')} ({unit})</span><input type="number" min={0} step="any" required value={values.gap} aria-describedby={`${errorId}-gap`}
          onChange={event => setValues(current => ({ ...current, gap: event.target.value }))} /></label>
        <p id={`${errorId}-gap`} className="drawing-help">{t('gapHint')}</p>
        <label><span>{t('maxSheets')}</span><input type="number" min={1} max={50} step={1} required value={values.maxSheets}
          onChange={event => setValues(current => ({ ...current, maxSheets: event.target.value }))} /></label>
        <label><span>{t('price')}</span><input type="number" min={0} step="any" value={values.price} placeholder="—" data-testid="drawing-nest-price"
          onChange={event => setValues(current => ({ ...current, price: event.target.value }))} /></label>
        <label className="drawing-cad-check"><input type="checkbox" checked={rotate} onChange={event => setRotate(event.target.checked)} /><span>{t('rotate')}</span></label>
      </fieldset>
      {!enough && settings && <p className="drawing-help">{t('selection')}</p>}
      <div className="drawing-nest-actions">
        <button type="submit" disabled={!editable || !enough} data-testid="drawing-nest-preview">{t('preview')}</button>
        <button type="button" className="is-primary" disabled={!editable || !result || !result.placements.length} onClick={apply} data-testid="drawing-nest-apply">{t('apply')}</button>
      </div>
    </form>
    {stale && <p className="drawing-help" role="status">{t('stale')}</p>}
    {result && options && <div className="drawing-nest-result rf-power-on" data-testid="drawing-nest-result">
      <SheetPreview result={result} sheetW={options.sheetW} sheetH={options.sheetH} margin={options.margin} label={n => t('sheetLabel', { n })} />
      <dl className="drawing-cad-values">
        <dt>{t('parts')}</dt><dd>{parts.length}</dd>
        <dt>{t('placed')}</dt><dd>{result.placements.length}</dd>
        <dt>{t('sheets')}</dt><dd>{result.sheets}</dd>
        {turned > 0 && <><dt>{t('turned')}</dt><dd>{turned}</dd></>}
        {result.utilisation.map((u, i) => <React.Fragment key={i}><dt>{t('usage')} · {t('sheetLabel', { n: i + 1 })}</dt>
          <dd><span className="drawing-nest-meter" style={{ ['--u' as string]: u }} aria-hidden="true" />{Math.round(u * 100)}%</dd></React.Fragment>)}
      </dl>
      {material && <dl className="drawing-cad-values drawing-nest-material" data-testid="drawing-nest-material">
        <dt>{t('material')}</dt><dd>{material.sheets} × · {material.areaM2.toFixed(2)} m²</dd>
        {material.cost !== null && <><dt>{t('cost')}</dt><dd>€{material.cost.toFixed(2)}</dd></>}
        {material.perPartCost !== null && <><dt>{t('perPart')}</dt><dd>€{material.perPartCost.toFixed(2)}</dd></>}
      </dl>}
      <p className="drawing-help">{t('usageHint')}</p>
      {result.sheets > 1 && <p className="drawing-help">{t('nextSheets')}</p>}
      {result.oversized.length > 0 && <p className="drawing-help is-error" role="alert">{t('oversized')}: {result.oversized.length}</p>}
      {result.unplaced.length > 0 && <p className="drawing-help is-error" role="alert">{t('unplaced')}: {result.unplaced.length}</p>}
    </div>}
    {message && <p id={errorId} className={`drawing-help${message.error ? ' is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </section>;
}
