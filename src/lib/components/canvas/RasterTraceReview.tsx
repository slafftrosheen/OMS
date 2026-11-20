import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '@tldraw/tldraw';
import { curvePathData } from './cad-curves';
import { applyCadPlan, type CadPlan } from './cad-plans';
import type { VectorDocument } from './cad-vector';
import type { DecodedTraceRaster } from './cad-trace-source';
import { useVectorText } from './cad-vector-copy';
import { VectorArtwork } from './VectorArtwork';

export interface RasterTraceReviewData {
  plan: CadPlan; key: string; document: VectorDocument; sourceName: string;
  method: 'outline' | 'centerline'; strokeWidthMm: number;
  decoded: Omit<DecodedTraceRaster, 'image'>;
}
const informational = new Set(['trace-approximation', 'trace-centerline-approximation', 'trace-resolution', 'trace-topology', 'trace-noise']);
const zoomLevels = [1, 2, 4, 8] as const;
type PreviewZoom = typeof zoomLevels[number];

function centerViewport(viewport: HTMLDivElement | null, center: { x: number; y: number }) {
  if (!viewport?.clientWidth || !viewport.clientHeight) return;
  const left = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, center.x * viewport.scrollWidth - viewport.clientWidth / 2));
  const top = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, center.y * viewport.scrollHeight - viewport.clientHeight / 2));
  if (Math.abs(viewport.scrollLeft - left) > .5) viewport.scrollLeft = left;
  if (Math.abs(viewport.scrollTop - top) > .5) viewport.scrollTop = top;
}

/** A cubic with collinear control points is still a straight geometric span.
 * Counting SVG C commands or nonzero handles would overstate curve fitting. */
export function rasterTraceCounts(document: VectorDocument) {
  let contours = 0, open = 0, closed = 0, nodes = 0, curves = 0, lines = 0;
  for (const path of document.paths) for (const contour of path.contours) {
    contours++; nodes += contour.nodes.length;
    if (contour.closed) closed++; else open++;
    for (let i = 0; i < contour.nodes.length - (contour.closed ? 0 : 1); i++) {
      const a = contour.nodes[i], b = contour.nodes[(i + 1) % contour.nodes.length], x = b.x - a.x, y = b.y - a.y;
      const length = Math.hypot(x, y);
      const curved = length > 1e-9
        ? Math.max(Math.abs(x * a.outY - y * a.outX), Math.abs(x * b.inY - y * b.inX)) > 1e-9 * length
        : Math.abs(a.outX * b.inY - a.outY * b.inX) > 1e-9;
      if (curved) curves++; else lines++;
    }
  }
  const colors = new Set<string>();
  for (const { paint } of document.paths) {
    if (paint.fill !== 'none' && paint.fillOpacity > 0) colors.add(`${paint.fill.toLowerCase()}:${paint.fillOpacity}`);
    if (paint.stroke !== 'none' && paint.strokeOpacity > 0 && paint.strokeWidth > 0) colors.add(`${paint.stroke.toLowerCase()}:${paint.strokeOpacity}`);
  }
  return { objects: document.paths.length, colors: colors.size, contours, open, closed, nodes, curves, lines };
}

export function RasterTraceReview({ review, inputKey, revision, disabled, onApplied }: {
  review: RasterTraceReviewData; inputKey: string; revision: string; disabled: boolean; onApplied: () => void;
}) {
  const editor = useEditor(), t = useVectorText();
  const [mode, setMode] = useState<'side' | 'overlay' | 'outline'>('side');
  const [zoom, setZoom] = useState<PreviewZoom>(1), [sourceOpacity, setSourceOpacity] = useState(100), [vectorOpacity, setVectorOpacity] = useState(55);
  const sourceViewport = useRef<HTMLDivElement>(null), resultViewport = useRef<HTMLDivElement>(null), center = useRef({ x: .5, y: .5 });
  const [ack, setAck] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { setAck(false); setFailed(false); }, [review]);
  useLayoutEffect(() => {
    centerViewport(sourceViewport.current, center.current); centerViewport(resultViewport.current, center.current);
  }, [zoom, mode, review]);
  function syncScroll(viewport: HTMLDivElement) {
    if (!viewport.scrollWidth || !viewport.scrollHeight) return;
    center.current = { x: (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight };
    centerViewport(viewport === sourceViewport.current ? resultViewport.current : sourceViewport.current, center.current);
  }
  const { document: doc, decoded, plan } = review, counts = rasterTraceCounts(doc);
  const centerline = review.method === 'centerline';
  const stale = review.key !== inputKey || plan.revision !== revision;
  const warnings = [...new Set([...plan.warnings, ...(decoded.reduced ? ['trace-resolution'] : [])])];
  const needsAck = warnings.some(warning => !informational.has(warning));
  const viewBox = `0 0 ${doc.width} ${doc.height}`;
  const source = <image href={decoded.preview} width={doc.width} height={doc.height} opacity={mode === 'side' ? 1 : sourceOpacity / 100} />;
  const surfaceStyle = { width: `${zoom * 100}%`, height: `${zoom * 100}%` };
  return <div className="drawing-cad-report drawing-trace-review" data-testid="vector-review" onKeyDown={event => event.stopPropagation()}>
    <p className="drawing-help" data-testid="trace-review-source">{review.sourceName}</p>
    <p className="drawing-help" data-testid="trace-review-method">{t('traceMethod')}: {t(`traceMethod-${review.method}`)}</p>
    <label className="drawing-cad-field"><span>{t('traceComparison')}</span>
      <select value={mode} data-testid="trace-preview-mode" onChange={event => { center.current = { x: .5, y: .5 }; setMode(event.target.value as typeof mode); }}>
        <option value="side">{t('traceSide')}</option><option value="overlay">{t('traceOverlay')}</option><option value="outline">{t(centerline ? 'traceCenterlineOverlay' : 'traceOutline')}</option>
      </select>
    </label>
    <label className="drawing-cad-field"><span>{t('traceZoom')}</span>
      <select value={zoom} data-testid="trace-preview-zoom" onChange={event => {
        const next = Number(event.target.value); if (zoomLevels.includes(next as PreviewZoom)) setZoom(next as PreviewZoom);
      }}>{zoomLevels.map(value => <option value={value} key={value}>{value}×</option>)}</select>
    </label>
    {mode !== 'side' && <label className="drawing-cad-field"><span>{t('traceSourceOpacity')} · {sourceOpacity}%</span>
      <input type="range" min={0} max={100} step={1} value={sourceOpacity} data-testid="trace-source-opacity"
        onChange={event => setSourceOpacity(Number(event.target.value))} />
    </label>}
    {mode === 'overlay' && <label className="drawing-cad-field"><span>{t('traceVectorOpacity')} · {vectorOpacity}%</span>
      <input type="range" min={0} max={100} step={1} value={vectorOpacity} data-testid="trace-vector-opacity"
        onChange={event => setVectorOpacity(Number(event.target.value))} />
    </label>}
    <p className="drawing-help">{t('traceZoomHelp')}</p>
    {centerline && <p className="drawing-help" data-testid="trace-centerline-inspection">{t('traceCenterlineInspection')}</p>}
    <div className={`drawing-vector-comparison${mode !== 'side' ? ' is-trace-overlay' : ''}`}>
      {mode === 'side' && <figure><figcaption>{t('traceSourcePixels')}</figcaption>
        <div className="drawing-trace-viewport" ref={sourceViewport} data-testid="trace-source-viewport" tabIndex={0}
          role="region" aria-label={t('traceSourcePixels')} onScroll={event => syncScroll(event.currentTarget)}>
          <div className="drawing-trace-surface" style={surfaceStyle} data-testid="trace-source-surface">
            <svg role="img" aria-label={t('traceSourcePixels')} viewBox={viewBox} data-testid="trace-source-preview">{source}</svg>
          </div>
        </div>
      </figure>}
      <figure><figcaption>{t(mode === 'side' ? 'result' : mode === 'overlay' ? 'traceOverlay' : centerline ? 'traceCenterlineOverlay' : 'traceOutline')}</figcaption>
        <div className="drawing-trace-viewport" ref={resultViewport} data-testid="trace-result-viewport" tabIndex={0}
          role="region" aria-label={t(mode === 'side' ? 'result' : mode === 'overlay' ? 'traceOverlay' : centerline ? 'traceCenterlineOverlay' : 'traceOutline')}
          onScroll={event => syncScroll(event.currentTarget)}>
          <div className="drawing-trace-surface" style={surfaceStyle} data-testid="trace-result-surface">
            <svg role="img" aria-label={t(mode === 'side' ? 'result' : mode === 'overlay' ? 'traceOverlay' : centerline ? 'traceCenterlineOverlay' : 'traceOutline')} viewBox={viewBox} data-testid="trace-result-preview">
              {mode !== 'side' && source}
              <g opacity={mode === 'overlay' ? vectorOpacity / 100 : 1}>
                {doc.paths.map((path, index) => centerline
                  ? <path key={index} d={curvePathData(path.contours)} fill="none" stroke={path.paint.stroke}
                    strokeOpacity={path.paint.strokeOpacity} strokeLinecap="round" strokeLinejoin="round"
                    className={mode === 'outline' ? 'drawing-trace-outline' : undefined}
                    strokeWidth={1.5} vectorEffect="non-scaling-stroke" data-testid="trace-centerline-path" />
                  : mode === 'outline'
                  ? <path key={index} d={curvePathData(path.contours)} fill="none" className="drawing-trace-outline"
                    strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
                  : <VectorArtwork key={index} id={`trace-review-${index}`} contours={path.contours} fillRule={path.fillRule} paint={path.paint} />)}
              </g>
            </svg>
          </div>
        </div>
      </figure>
    </div>
    <dl className="drawing-cad-values">
      <dt>{t('traceOriginalSize')}</dt><dd data-testid="trace-original-size">{decoded.originalWidth} × {decoded.originalHeight} px</dd>
      <dt>{t('traceWorkingSize')}</dt><dd data-testid="trace-working-size">{doc.width} × {doc.height} px</dd>
      <dt>{t('traceObjects')}</dt><dd data-testid="trace-object-count">{counts.objects}</dd>
      <dt>{t('tracePaletteColors')}</dt><dd data-testid="trace-color-count">{counts.colors}</dd>
      <dt>{t(centerline ? 'paths' : 'traceContours')}</dt><dd data-testid="trace-contour-count">{counts.contours}</dd>
      {centerline && <><dt>{t('traceOpenPaths')}</dt><dd data-testid="trace-open-count">{counts.open}</dd>
        <dt>{t('traceClosedLoops')}</dt><dd data-testid="trace-closed-count">{counts.closed}</dd></>}
      <dt>{t('nodes')}</dt><dd data-testid="trace-node-count">{counts.nodes}</dd>
      <dt>{t('traceCurves')}</dt><dd data-testid="trace-curve-count">{counts.curves}</dd>
      <dt>{t('traceLines')}</dt><dd data-testid="trace-line-count">{counts.lines}</dd>
      <dt>{t('bounds')}</dt><dd>{Number(plan.widthMm.toFixed(3))} × {Number(plan.heightMm.toFixed(3))}</dd>
      {centerline && <><dt>{t('traceAppliedStrokeWidth')}</dt><dd data-testid="trace-output-stroke-width">{review.strokeWidthMm}</dd></>}
    </dl>
    <p className="drawing-help" data-testid="trace-result-grouping">{t(centerline
      ? plan.groupResult && counts.objects > 1 ? 'traceGroupedCenterlines' : 'traceSeparateCenterlines'
      : plan.groupResult && counts.objects > 1 ? 'traceGroupedResult' : 'traceSeparateResult')}</p>
    {!!warnings.length && <ul className="drawing-cad-warnings">{warnings.map(warning => <li key={warning}>{t(centerline && warning === 'trace-noise' ? 'traceCenterlineNoise' : warning)}</li>)}</ul>}
    {needsAck && <label className="drawing-vector-check"><input type="checkbox" checked={ack} data-testid="trace-review-ack"
      onChange={event => setAck(event.target.checked)} />{t('omissions')}</label>}
    {stale && <p role="status">{t('stale')}</p>}
    <button type="button" data-testid="vector-apply" disabled={disabled || stale || needsAck && !ack} onClick={() => {
      if (disabled || stale || needsAck && !ack) return;
      if (applyCadPlan(editor, plan)) onApplied(); else setFailed(true);
    }}>{t('apply')}</button>
    {failed && <p role="alert">{t('failed')}</p>}
  </div>;
}
