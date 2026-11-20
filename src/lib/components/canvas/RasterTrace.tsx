import React, { useEffect, useRef, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import type { CadSettings } from './cad-settings';
import { cadRevision } from './cad-plans';
import { prepareVectorImport, vectorPaint } from './cad-vector';
import { DEFAULT_TRACE_OPTIONS, type TraceOptions } from './cad-trace';
import { runRasterTrace } from './cad-trace-client';
import { decodeTraceRaster, prepareSelectedRasterTracePlan, selectedRasterTraceSource, type TraceResolution } from './cad-trace-source';
import { RasterTraceReview, type RasterTraceReviewData } from './RasterTraceReview';
import { useVectorText, vectorError } from './cad-vector-copy';

export function RasterTrace({ settings, revision, disabled }: { settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), t = useVectorText();
  const [file, setFile] = useState<File>(), [useSelected, setUseSelected] = useState(false);
  const [options, setOptions] = useState<TraceOptions>({ ...DEFAULT_TRACE_OPTIONS });
  const [resolution, setResolution] = useState<TraceResolution>(2048), [width, setWidth] = useState('100');
  const [replace, setReplace] = useState(false), [review, setReview] = useState<RasterTraceReviewData>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const controller = useRef<AbortController>(), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const key = JSON.stringify([file?.name, file?.lastModified, useSelected, options, resolution, width, replace, settings]);
  const selected = useValue('trace selected image', () => {
    const shape = editor.getOnlySelectedShape();
    return shape?.type === 'image' || shape?.type === 'cad-bezier' && !!vectorPaint(shape.meta).raster;
  }, [editor]);
  const valid = Number.isFinite(options.smoothing) && options.smoothing >= .1 && options.smoothing <= 5 &&
    Number.isInteger(options.noise) && options.noise >= 0 && options.noise <= 100 &&
    (options.mode === 'mono' ? Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 255
      : Number.isInteger(options.colors) && options.colors >= 2 && options.colors <= 32) &&
    (useSelected || width.trim() !== '' && Number.isFinite(Number(width)) && Number(width) > 0 && Number(width) <= 1e6);
  async function prepare() {
    if (disabled || busy || !settings || !valid) return;
    controller.current?.abort();
    const next = new AbortController(), { signal } = next; controller.current = next;
    setBusy(true); setMessage(''); setReview(undefined);
    try {
      const before = cadRevision(editor);
      let blob: Blob | undefined = file;
      if (useSelected) {
        const { source, rasterPaint } = selectedRasterTraceSource(editor);
        const url = rasterPaint?.raster?.png ?? await editor.resolveAssetUrl((source.props as any).assetId, { shouldResolveToOriginal: true });
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
      const plan = useSelected ? prepareSelectedRasterTracePlan(editor, settings, document, replace)
        : prepareVectorImport(editor, settings, document, Number(width), editor.getViewportPageBounds().center, file!.name);
      if (mounted.current && controller.current === next) setReview({ plan, key, document, decoded: {
        preview: decoded.preview, originalWidth: decoded.originalWidth, originalHeight: decoded.originalHeight, reduced: decoded.reduced,
      } });
    } catch (error) {
      if (mounted.current && controller.current === next) setMessage(signal.aborted ? 'cancelled' : vectorError(error));
    } finally { if (mounted.current && controller.current === next) setBusy(false); }
  }
  const numeric: Array<[keyof Pick<TraceOptions, 'threshold' | 'colors' | 'smoothing' | 'noise'>, string, number, number, number]> = [
    options.mode === 'mono' ? ['threshold', 'threshold', 0, 255, 1] : ['colors', 'colors', 2, 32, 1],
    ['smoothing', 'traceTolerance', .1, 5, .05], ['noise', 'traceNoiseLength', 0, 100, 1],
  ];
  return <section className="drawing-cad-section" data-testid="raster-trace">
    <h3>{t('trace')}</h3><p className="drawing-help">{t('traceHelp')}</p>
    <fieldset className="drawing-cad-fields" disabled={disabled || busy || !settings} onKeyDown={event => event.stopPropagation()}>
      <label className="drawing-cad-field"><span>{t('source')}</span><input type="file" accept="image/png,image/jpeg,image/webp"
        data-testid="trace-source-file" onChange={event => { setFile(event.target.files?.[0]); setUseSelected(false); setReview(undefined); }} /></label>
      <button type="button" disabled={!selected} aria-pressed={useSelected} data-testid="trace-use-selected"
        onClick={() => { setUseSelected(true); setReview(undefined); }}>{t('selectedImage')}</button>
      <label className="drawing-cad-field"><span>{t('mode')}</span><select value={options.mode} data-testid="trace-mode"
        onChange={event => setOptions({ ...options, mode: event.target.value as TraceOptions['mode'],
          threshold: Number.isFinite(options.threshold) && options.threshold >= 0 && options.threshold <= 255 ? options.threshold : DEFAULT_TRACE_OPTIONS.threshold,
          colors: Number.isInteger(options.colors) && options.colors >= 2 && options.colors <= 32 ? options.colors : DEFAULT_TRACE_OPTIONS.colors })}>
        <option value="mono">{t('mono')}</option><option value="color">{t('color')}</option>
      </select></label>
      <label className="drawing-cad-field"><span>{t('traceResolution')}</span><select value={resolution} data-testid="trace-resolution"
        onChange={event => setResolution(Number(event.target.value) as TraceResolution)}>
        <option value={1024}>1024 px</option><option value={2048}>2048 px</option>
      </select></label>
      {numeric.map(([name, label, min, max, step]) => <label className="drawing-cad-field" key={name}><span>{t(label)}</span>
        <input type="number" min={min} max={max} step={step} data-testid={`trace-${name}`}
          aria-invalid={!Number.isFinite(options[name]) || options[name] < min || options[name] > max || (name === 'noise' || name === 'colors') && !Number.isInteger(options[name])}
          value={Number.isFinite(options[name]) ? options[name] : ''}
          onChange={event => setOptions({ ...options, [name]: event.target.value === '' ? NaN : Number(event.target.value) })} />
      </label>)}
      <label className="drawing-vector-check"><input type="checkbox" checked={options.preserveCorners} data-testid="trace-preserve-corners"
        onChange={event => setOptions({ ...options, preserveCorners: event.target.checked })} />{t('tracePreserveCorners')}</label>
      <label className="drawing-vector-check"><input type="checkbox" checked={options.removeWhite} data-testid="trace-remove-white"
        onChange={event => setOptions({ ...options, removeWhite: event.target.checked })} />{t('removeWhite')}</label>
      {useSelected ? <label className="drawing-vector-check"><input type="checkbox" checked={replace} data-testid="trace-replace"
        onChange={event => setReplace(event.target.checked)} />{t('replace')}</label>
        : <label className="drawing-cad-field"><span>{t('width')}</span><input type="number" min="0.001" max="1000000" value={width}
          aria-invalid={!width.trim() || !Number.isFinite(Number(width)) || Number(width) <= 0 || Number(width) > 1e6}
          data-testid="trace-width" onChange={event => setWidth(event.target.value)} /></label>}
      <p className="drawing-help">{t('traceToleranceHelp')}</p>
      {!valid && <p className="drawing-help" role="alert">{t('traceSettings')}</p>}
      <button type="button" disabled={!valid || !file && !useSelected} data-testid="trace-prepare" onClick={() => void prepare()}>{t('preview')}</button>
    </fieldset>
    {busy && <p role="status">{t('working')} <button type="button" data-testid="trace-cancel" onClick={() => controller.current?.abort()}>{t('cancel')}</button></p>}
    {message && <p className="drawing-help" role="status" data-testid="trace-status">{t(message)}</p>}
    {review && <RasterTraceReview review={review} inputKey={key} revision={revision} disabled={disabled || busy || !settings}
      onApplied={() => { setReview(undefined); setMessage('done'); }} />}
  </section>;
}
