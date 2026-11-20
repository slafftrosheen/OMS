import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { cadMmPerPixel, type CadSettings } from './cad-settings';
import { cadRevision } from './cad-plans';
import { vectorPaint } from './cad-vector';
import { DEFAULT_TRACE_OPTIONS, TRACE_PRESETS, DEFAULT_CENTERLINE_STROKE_WIDTH_MM, MIN_CENTERLINE_STROKE_WIDTH_MM,
  MAX_CENTERLINE_STROKE_WIDTH_MM, applyTracePreset, resolveTraceBackground, resolveTraceMethod, type TraceOptions, type TracePresetId } from './cad-trace-options';
import { runRasterTrace } from './cad-trace-client';
import { decodeTraceRaster, prepareSelectedRasterTracePlan, selectedRasterTraceSource, selectedAttachedRasterTraceSource,
  prepareAttachedRasterTracePlan, prepareRasterTraceFilePlan, styleCenterlineTracePlan, type TraceResolution } from './cad-trace-source';
import { RasterTraceReview, type RasterTraceReviewData } from './RasterTraceReview';
import { useVectorText, vectorError } from './cad-vector-copy';
import { drawingObjectName } from './drawing-operations';

export function RasterTrace({ settings, revision, disabled }: { settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), t = useVectorText();
  const [file, setFile] = useState<File>(), [useSelected, setUseSelected] = useState(false);
  const [options, setOptions] = useState<TraceOptions>({ ...DEFAULT_TRACE_OPTIONS });
  const [preset, setPreset] = useState<TracePresetId | 'custom'>('logo');
  const [resolution, setResolution] = useState<TraceResolution>(2048), [width, setWidth] = useState('100');
  const [strokeWidth, setStrokeWidth] = useState(String(DEFAULT_CENTERLINE_STROKE_WIDTH_MM));
  const [replace, setReplace] = useState(false), [groupResult, setGroupResult] = useState(true), [review, setReview] = useState<RasterTraceReviewData>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const controller = useRef<AbortController>(), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const method = resolveTraceMethod(options), centerline = method === 'centerline';
  const key = JSON.stringify([file?.name, file?.lastModified, useSelected, options, resolution, width, strokeWidth, replace, groupResult, settings]);
  const selected = useValue('trace selected image', () => {
    const shape = editor.getOnlySelectedShape();
    const kind = shape?.type === 'document' && (shape.props as any).kind === 'image' ? 'attached'
      : shape?.type === 'image' || shape?.type === 'cad-bezier' && !!vectorPaint(shape.meta).raster ? 'bitmap' : undefined;
    if (!shape || !kind) return { kind, valid: false, name: '', error: 'imageError' };
    try {
      if (kind === 'attached') selectedAttachedRasterTraceSource(editor); else selectedRasterTraceSource(editor);
      return { kind, valid: true, name: drawingObjectName(shape), error: '' };
    } catch (error) { return { kind, valid: false, name: drawingObjectName(shape), error: vectorError(error) }; }
  }, [editor]);
  const attached = useSelected && selected.kind === 'attached', needsWidth = !useSelected || attached;
  const sourceReady = useSelected ? selected.valid : !!file;
  const editOptions = (patch: Partial<TraceOptions>) => { setOptions(current => ({ ...current, ...patch })); setPreset('custom'); setMessage(''); };
  const strokeWidthMm = strokeWidth.trim() ? Number(strokeWidth) : NaN;
  const validStrokeWidth = Number.isFinite(strokeWidthMm) && strokeWidthMm >= MIN_CENTERLINE_STROKE_WIDTH_MM && strokeWidthMm <= MAX_CENTERLINE_STROKE_WIDTH_MM &&
    !!settings && strokeWidthMm / cadMmPerPixel(settings) <= 1e6;
  const valid = Number.isFinite(options.smoothing) && options.smoothing >= .1 && options.smoothing <= 5 &&
    Number.isInteger(options.noise) && options.noise >= 0 && options.noise <= 100 &&
    (centerline || options.mode === 'mono' ? Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 255
      : Number.isInteger(options.colors) && options.colors >= 2 && options.colors <= 32) &&
    (!centerline || validStrokeWidth) &&
    (!needsWidth || width.trim() !== '' && Number.isFinite(Number(width)) && Number(width) > 0 && Number(width) <= 1e6);
  async function prepare() {
    if (disabled || busy || !settings || !valid || !sourceReady) return;
    controller.current?.abort();
    const next = new AbortController(), { signal } = next; controller.current = next;
    // Keep the previous review mounted while recomputing so an inspected
    // corner stays at the same zoom/scroll position. Apply is disabled while busy.
    setBusy(true); setMessage('');
    try {
      const before = cadRevision(editor);
      let blob: Blob | undefined = file;
      if (useSelected) {
        let url: string | null;
        if (attached) url = selectedAttachedRasterTraceSource(editor).url;
        else {
          const { source, rasterPaint } = selectedRasterTraceSource(editor);
          url = rasterPaint?.raster?.png ?? await editor.resolveAssetUrl((source.props as any).assetId, { shouldResolveToOriginal: true });
        }
        if (!url) throw new Error('image');
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('image');
        blob = await response.blob();
      }
      if (!blob) throw new Error('image');
      const decoded = await decodeTraceRaster(blob, resolution, signal);
      const document = await runRasterTrace(decoded.image, options, signal);
      if (signal.aborted) throw new Error('cancelled');
      if (before !== cadRevision(editor)) throw new Error('stale');
      const placed = attached ? prepareAttachedRasterTracePlan(editor, settings, document, Number(width), decoded)
        : useSelected ? prepareSelectedRasterTracePlan(editor, settings, document, replace)
        : prepareRasterTraceFilePlan(editor, settings, document, Number(width), file!.name, decoded);
      const plan = centerline ? styleCenterlineTracePlan(placed, settings, strokeWidthMm) : placed;
      const sourceName = useSelected ? selected.name : file!.name;
      plan.groupResult = groupResult; plan.groupName = `${t('trace')} · ${sourceName}`;
      plan.shapes = plan.shapes?.map(shape => ({ ...shape, opacity: 1 }));
      if (mounted.current && controller.current === next) setReview({ plan, key, document, sourceName, method, strokeWidthMm, decoded: {
        preview: decoded.preview, originalWidth: decoded.originalWidth, originalHeight: decoded.originalHeight, reduced: decoded.reduced,
      } });
    } catch (error) {
      if (mounted.current && controller.current === next) setMessage(signal.aborted ? 'cancelled' : vectorError(error));
    } finally { if (mounted.current && controller.current === next) setBusy(false); }
  }
  const numeric: Array<[keyof Pick<TraceOptions, 'threshold' | 'colors' | 'smoothing' | 'noise'>, string, number, number, number]> = [
    centerline || options.mode === 'mono' ? ['threshold', 'threshold', 0, 255, 1] : ['colors', 'colors', 2, 32, 1],
    ['smoothing', 'traceTolerance', .1, 5, .05], ['noise', centerline ? 'traceComponentLength' : 'traceNoiseLength', 0, 100, 1],
  ];
  return <section className="drawing-cad-section" data-testid="raster-trace" aria-busy={busy}>
    <h3>{t('trace')}</h3><p className="drawing-help">{t('traceHelp')}</p>
    <fieldset className="drawing-cad-fields" disabled={disabled || busy || !settings} onKeyDown={event => event.stopPropagation()}>
      <label className="drawing-cad-field"><span>{t('source')}</span><input type="file" accept="image/png,image/jpeg,image/webp"
        data-testid="trace-source-file" onChange={event => { setFile(event.target.files?.[0]); setUseSelected(false); setReview(undefined); setMessage(''); }} /></label>
      <div className="drawing-cad-actions">
        {file && <button type="button" aria-pressed={!useSelected} data-testid="trace-use-file"
          onClick={() => { setUseSelected(false); setReview(undefined); setMessage(''); }}>{t('traceUseFile')}</button>}
        <button type="button" disabled={!selected.valid} aria-pressed={useSelected} data-testid="trace-use-selected"
          onClick={() => { setUseSelected(true); setReview(undefined); setMessage(''); }}>{t(selected.kind === 'attached' ? 'traceAttachedImage' : 'selectedImage')}</button>
      </div>
      <p className="drawing-help" data-testid="trace-source-summary">{useSelected ? selected.name || t('imageError') : file?.name || t('traceChooseSource')}</p>
      {selected.kind && !selected.valid && <p className="drawing-help" data-testid="trace-source-unavailable">{t(selected.error)}</p>}
      <label className="drawing-cad-field"><span>{t('traceMethod')}</span><select value={method} data-testid="trace-method"
        onChange={event => {
          const nextPreset = event.target.value === 'centerline' ? 'technical' : 'logo';
          setOptions(current => applyTracePreset(current, nextPreset)); setPreset(nextPreset); setMessage('');
        }}>
        <option value="outline">{t('traceMethod-outline')}</option><option value="centerline">{t('traceMethod-centerline')}</option>
      </select></label>
      <p className="drawing-help" data-testid="trace-method-help">{t(centerline ? 'traceCenterlineHelp' : 'traceOutlineHelp')}</p>
      <label className="drawing-cad-field"><span>{t('tracePreset')}</span><select value={preset} data-testid="trace-preset"
        onChange={event => {
          const value = event.target.value as TracePresetId | 'custom'; setPreset(value); setMessage('');
          if (value !== 'custom') setOptions(current => applyTracePreset(current, value));
        }}>
        {(Object.keys(TRACE_PRESETS) as TracePresetId[])
          .filter(value => resolveTraceMethod({ ...DEFAULT_TRACE_OPTIONS, ...TRACE_PRESETS[value] }) === method)
          .map(value => <option value={value} key={value}>{t(`tracePreset-${value}`)}</option>)}
        <option value="custom">{t('tracePreset-custom')}</option>
      </select></label>
      {!centerline && <label className="drawing-cad-field"><span>{t('mode')}</span><select value={options.mode} data-testid="trace-mode"
        onChange={event => editOptions({ mode: event.target.value as TraceOptions['mode'],
          threshold: Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 255 ? options.threshold : DEFAULT_TRACE_OPTIONS.threshold,
          colors: Number.isInteger(options.colors) && options.colors >= 2 && options.colors <= 32 ? options.colors : DEFAULT_TRACE_OPTIONS.colors })}>
        <option value="mono">{t('mono')}</option><option value="color">{t('color')}</option>
      </select></label>}
      <label className="drawing-cad-field"><span>{t('traceResolution')}</span><select value={resolution} data-testid="trace-resolution"
        onChange={event => setResolution(Number(event.target.value) as TraceResolution)}>
        <option value={1024}>1024 px</option><option value={2048}>2048 px</option>
      </select></label>
      {numeric.map(([name, label, min, max, step]) => <label className="drawing-cad-field" key={name}><span>{t(label)}</span>
        <input type="number" min={min} max={max} step={step} data-testid={`trace-${name}`}
          aria-invalid={!Number.isFinite(options[name]) || options[name] < min || options[name] > max || (name === 'noise' || name === 'colors') && !Number.isInteger(options[name])}
          value={Number.isFinite(options[name]) ? options[name] : ''}
          onChange={event => editOptions({ [name]: event.target.value === '' ? NaN : Number(event.target.value) })} />
      </label>)}
      {centerline && <p className="drawing-help">{t('traceComponentLengthHelp')}</p>}
      <label className="drawing-vector-check"><input type="checkbox" checked={options.preserveCorners} data-testid="trace-preserve-corners"
        onChange={event => editOptions({ preserveCorners: event.target.checked })} />{t('tracePreserveCorners')}</label>
      {!centerline && <><label className="drawing-cad-field"><span>{t('traceBackground')}</span><select value={resolveTraceBackground(options)} data-testid="trace-background"
        onChange={event => { setOptions(current => ({ ...current, background: event.target.value as TraceOptions['background'] })); setMessage(''); }}>
        {(['keep', 'border', 'all'] as const).map(value => <option value={value} key={value}>{t(`traceBackground-${value}`)}</option>)}
      </select></label>
      <p className="drawing-help">{t(options.mode === 'mono' ? 'traceBackgroundMonoHelp' : 'traceBackgroundColorHelp')}</p></>}
      {useSelected && !attached && <label className="drawing-vector-check"><input type="checkbox" checked={replace} data-testid="trace-replace"
        onChange={event => setReplace(event.target.checked)} />{t('replace')}</label>
      }
      {needsWidth && <label className="drawing-cad-field"><span>{t('width')}</span><input type="number" min="0.001" max="1000000" value={width}
          aria-invalid={!width.trim() || !Number.isFinite(Number(width)) || Number(width) <= 0 || Number(width) > 1e6}
          data-testid="trace-width" onChange={event => setWidth(event.target.value)} /></label>}
      {centerline && <><label className="drawing-cad-field"><span>{t('traceStrokeWidth')}</span><input type="number" min={MIN_CENTERLINE_STROKE_WIDTH_MM} max={MAX_CENTERLINE_STROKE_WIDTH_MM} step="any" value={strokeWidth}
        aria-invalid={!validStrokeWidth} data-testid="trace-stroke-width"
        onChange={event => { setStrokeWidth(event.target.value); setMessage(''); }} /></label>
        <p className="drawing-help">{t('traceStrokeWidthHelp')}</p></>}
      <label className="drawing-vector-check"><input type="checkbox" checked={groupResult} data-testid="trace-group-result"
        onChange={event => setGroupResult(event.target.checked)} />{t('traceGroupResult')}</label>
      <p className="drawing-help" data-testid="trace-output-summary">{t(attached ? 'traceAttachedHelp' : useSelected ? replace ? 'traceReplaceHelp' : 'traceOverlayHelp' : 'traceCenteredHelp')}</p>
      <p className="drawing-help">{t('traceToleranceHelp')}</p>
      {!valid && <p className="drawing-help" role="alert">{t(centerline && !validStrokeWidth ? 'traceStrokeWidthError' : 'traceSettings')}</p>}
      <button type="button" disabled={!valid || !sourceReady} data-testid="trace-prepare" onClick={() => void prepare()}>{t('preview')}</button>
    </fieldset>
    {busy && <p role="status">{t('working')} <button type="button" data-testid="trace-cancel" onClick={() => controller.current?.abort()}>{t('cancel')}</button></p>}
    {message && <p className="drawing-help" role="status" data-testid="trace-status">{t(message)}</p>}
    {review && <RasterTraceReview review={review} inputKey={key} revision={revision} disabled={disabled || busy || !settings}
      onApplied={() => { setReview(undefined); setUseSelected(false); setMessage('done'); }} />}
  </section>;
}
