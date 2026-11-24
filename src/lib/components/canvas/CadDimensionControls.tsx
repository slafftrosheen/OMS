import React, { useEffect, useId, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadText } from './cad-copy';
import { createCadDimension, detachCadDimension, relinkCadDimension } from './cad-geometry';
import { CAD_DIMENSION_KINDS, CAD_DIMENSION_SOURCE_LIMIT, angularDimensionPoints, circularDimensionPoints, dimensionSources, getDimensionEndpoints, radialDimensionKind, type CadDimensionKind, type DimensionSource } from './cad-dimension-links';
import { CAD_MAX_COORDINATE, canvasLengthToUnit, readCadSettings, unitLengthToCanvas, unitMm, type CadSettings } from './cad-settings';
import { captureToolkitControls } from './toolkit-controls';
import { CAD_DIMENSION_MARKERS, CAD_DIMENSION_MAX_ANNOTATION_SIZE, dimensionSettingsRevision, readDimensionOptions, updateCadDimensionOptions, validDimensionAnnotationSize, validDimensionOptions,
  type CadDimensionMarker, type CadDimensionOptions } from './cad-dimension-settings';
import type { CadDimensionShape } from './shapes/CadShapes';
import { canWriteCadSnapSettings } from './cad-snap-settings';
import { CAD_DIMENSION_BASE_TEXT_HEIGHT, dimensionDefaultsRevision, dimensionStyleForCreation, readDimensionDefaults, validateDimensionDefaults, writeDimensionDefaults,
  type CadDimensionDefaults } from './cad-dimension-defaults';

const numberDraft = (value: number) => String(Number(value.toPrecision(12)));
const draftNumber = (value: string) => value.trim() ? Number(value) : NaN;
const formIsHidden = (form: HTMLFormElement) => !!form.closest('[hidden], details:not([open])');
const dimensionHeight = (annotationSize: number, settings: CadSettings | null) => {
  const height = CAD_DIMENSION_BASE_TEXT_HEIGHT * annotationSize / 100;
  return settings ? canvasLengthToUnit(height, settings) : height;
};

export function CadDimensionControls({ settings }: { settings: CadSettings | null }) {
  const editor = useEditor(), { label } = useCadText();
  const [direction, setDirection] = useState<CadDimensionKind>();
  const [linked, setLinked] = useState(true);
  const [result, setResult] = useState<{ selection: string; ok: boolean }>();
  const state = useValue('dimension selection and reference', () => {
    const ids = [...editor.getSelectedShapeIds()];
    const dimensions = editor.getSelectedShapes().filter(shape => shape.type === 'cad-dimension') as DimensionSource[];
    const sources = dimensionSources(editor, ids);
    const dimension = dimensions.length === 1 ? dimensions[0] : undefined;
    return {
      selection: ids.join(' '), count: sources.length, dimensionCount: dimensions.length,
      dimension: dimension as CadDimensionShape | undefined,
      revision: dimension && dimensionSettingsRevision(editor, dimension as CadDimensionShape),
      status: dimension && getDimensionEndpoints(editor, dimension).status,
      kind: dimension?.props.link?.kind ?? dimension?.props.radialKind ?? (dimension?.props.angleSweep ? 'angular' as const : undefined),
      angular: !!angularDimensionPoints(editor, sources),
      circular: sources.length === 1 && !!circularDimensionPoints(sources[0]),
      editable: canWriteCadSnapSettings(editor) && captureToolkitControls(editor).canEditSelection &&
        !sources.some(shape => ['order-details', 'order-address', 'profile-7st'].includes(shape.type)),
    };
  }, [editor]);
  const preferred = direction ?? state.kind ?? 'horizontal';
  const available = (kind: CadDimensionKind) => kind === 'angular' ? state.angular : !radialDimensionKind(kind) || state.circular;
  const kind = available(preferred) ? preferred : 'horizontal';
  const canCreate = !state.dimensionCount && !!state.count && !!settings;
  const canRelink = state.dimensionCount === 1 && !!state.count;
  const overLimit = state.count > CAD_DIMENSION_SOURCE_LIMIT;
  function run(operation: () => boolean) {
    const ok = operation();
    setResult({ selection: editor.getSelectedShapeIds().join(' '), ok });
  }
  return <>
    {!!(state.count || state.dimensionCount) && <section className="drawing-cad-section" data-testid="drawing-dimension-links">
    {state.status && <p className="drawing-help" role={state.status === 'broken' ? 'status' : undefined}>
      {label(state.status === 'broken' ? 'dimensionBroken' : state.status === 'linked' ? 'dimensionLinked' : 'dimensionManual')}
    </p>}
    {(canCreate || canRelink) && <fieldset className="drawing-cad-fields" disabled={!state.editable}>
      <label className="drawing-cad-field">
        <span>{label('dimensionKind')}</span>
        <select value={kind} onChange={event => setDirection(event.target.value as CadDimensionKind)}>
          {CAD_DIMENSION_KINDS.map(value =>
            <option key={value} value={value} disabled={!available(value)}>{label(value)}</option>)}
        </select>
      </label>
      {kind === 'angular' && <p className="drawing-help">{label('dimensionAngularHelp')}</p>}
      {radialDimensionKind(kind) && <p className="drawing-help">{label('dimensionRadialHelp')}</p>}
      {canCreate && <>
        <label className="drawing-cad-check"><input type="checkbox" checked={linked} onChange={event => setLinked(event.target.checked)} />
          <span>{label('dimensionLink')}</span>
        </label>
        <button type="button" disabled={linked && overLimit} onClick={() => settings && run(() => createCadDimension(editor, settings, kind, linked))}>
          {label('addDimension')}
        </button>
      </>}
      {canRelink && <button type="button" disabled={overLimit} onClick={() => run(() => relinkCadDimension(editor, kind))}>
        {label('dimensionRelink')}
      </button>}
    </fieldset>}
    {state.dimensionCount === 1 && !state.count && <>
      {state.dimension && <DimensionSettings key={state.dimension.id} shape={state.dimension} settings={settings}
        revision={state.revision!} disabled={!state.editable || state.status === 'broken'} />}
      {state.status === 'linked' && <button type="button" disabled={!state.editable} onClick={() => run(() => detachCadDimension(editor))}>
        {label('dimensionDetach')}
      </button>}
      {state.status !== 'linked' && <p className="drawing-help">{label('dimensionRelinkHelp')}</p>}
    </>}
    {overLimit && (canRelink || canCreate && linked) && <p className="drawing-help">{label('dimensionLinkLimit')}</p>}
    {result?.selection === state.selection && !result.ok && <p role="alert" className="drawing-help is-error">{label('failed')}</p>}
    </section>}
    <DimensionDefaults hasSelectedDimension={!!state.dimensionCount} />
  </>;
}

function DimensionSettings({ shape, settings, revision, disabled }: { shape: CadDimensionShape; settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), { label } = useCadText(), errorId = useId();
  const endpoints = getDimensionEndpoints(editor, shape);
  const options = () => {
    const saved = readDimensionOptions(shape, settings, endpoints.angleSweep);
    return { ...saved, offset: numberDraft(saved.offset), annotationSize: numberDraft(saved.annotationSize),
      textHeight: numberDraft(dimensionHeight(saved.annotationSize, settings)) };
  };
  const [draft, setDraft] = useState(options), [baseline, setBaseline] = useState(revision), [dirty, setDirty] = useState(false);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const zoom = useValue('dimension annotation zoom', () => editor.getZoomLevel(), [editor]);
  const reset = () => { setDraft(options()); setDraftSettings(settings); setBaseline(revision); setDirty(false); setResult(null); };
  useEffect(() => { if (!dirty && baseline !== revision) reset(); }, [revision, dirty, baseline]);
  const proposed: CadDimensionOptions = { ...draft, offset: draftNumber(draft.offset), annotationSize: draftNumber(draft.annotationSize) };
  const rayLength = endpoints.angleSweep === null ? undefined : Math.hypot(endpoints.end.x - endpoints.start.x, endpoints.end.y - endpoints.start.y);
  const valid = validDimensionOptions(proposed, draftSettings, rayLength) && Number.isFinite(draftNumber(draft.textHeight)) && draftNumber(draft.textHeight) > 0;
  const stale = dirty && baseline !== revision;
  const edit = (change: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...change })); setDirty(true); setResult(null); };
  const fitToView = () => {
    if (disabled || stale || !valid || !Number.isFinite(zoom) || zoom <= 0) return;
    const annotationSize = 100 / zoom, ratio = annotationSize / proposed.annotationSize;
    const currentOffset = draftSettings ? unitLengthToCanvas(proposed.offset, draftSettings) : proposed.offset;
    const offset = rayLength === undefined ? currentOffset * ratio :
      Math.max(8 * annotationSize / 100, Math.max(8 * proposed.annotationSize / 100, rayLength + currentOffset) * ratio) - rayLength;
    edit({ annotationSize: numberDraft(annotationSize), textHeight: numberDraft(dimensionHeight(annotationSize, draftSettings)),
      offset: numberDraft(draftSettings ? canvasLengthToUnit(offset, draftSettings) : offset) });
  };
  return <details className="drawing-cad-section" open data-testid="drawing-dimension-settings">
    <summary>{label('dimensionSettings')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      if (disabled || !dirty || stale || !valid || formIsHidden(event.currentTarget)) return;
      const ok = updateCadDimensionOptions(editor, shape.id, baseline, proposed);
      setResult(ok ? 'saved' : 'failed');
      if (ok) { setDirty(false); setBaseline(dimensionSettingsRevision(editor, editor.getShape(shape.id) as CadDimensionShape)); }
    }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); reset(); (event.target as HTMLElement).blur(); }
    }} onKeyUp={event => event.stopPropagation()}>
      <fieldset className="drawing-cad-fields" disabled={disabled} aria-describedby={errorId}>
        <label className="drawing-cad-field"><span>{label('dimensionOffset')} ({draftSettings?.unit ?? 'px'})</span>
          <input data-testid="drawing-dimension-offset" type="number" step="any" required value={draft.offset}
            aria-describedby={errorId} aria-invalid={!Number.isFinite(proposed.offset)} onChange={event => edit({ offset: event.target.value })}/>
        </label>
        <label className="drawing-cad-field"><span>{label('dimensionTextHeight')} ({draftSettings?.unit ?? 'px'})</span>
          <input data-testid="drawing-dimension-text-height" type="number" min={0} step="any" required value={draft.textHeight}
            aria-describedby={errorId} aria-invalid={!validDimensionAnnotationSize(proposed.annotationSize)} onChange={event => {
              const textHeight = event.target.value, height = draftNumber(textHeight);
              const canvasHeight = draftSettings ? unitLengthToCanvas(height, draftSettings) : height;
              edit({ textHeight, annotationSize: Number.isFinite(height) ? numberDraft(canvasHeight / CAD_DIMENSION_BASE_TEXT_HEIGHT * 100) : '' });
            }}/>
        </label>
        <label className="drawing-cad-field"><span>{label('dimensionAnnotationSize')}</span>
          <input data-testid="drawing-dimension-size" type="number" min={0} max={CAD_DIMENSION_MAX_ANNOTATION_SIZE} step="any" required value={draft.annotationSize}
            aria-describedby={errorId} aria-invalid={!validDimensionAnnotationSize(proposed.annotationSize)}
            onChange={event => {
              const annotationSize = event.target.value, size = draftNumber(annotationSize);
              edit({ annotationSize, textHeight: Number.isFinite(size) ? numberDraft(dimensionHeight(size, draftSettings)) : '' });
            }}/>
        </label>
        <button data-testid="drawing-dimension-fit-view" type="button" disabled={!valid || stale || !Number.isFinite(zoom) || zoom <= 0} onClick={fitToView}>
          {label('dimensionFitView')}
        </button>
        <label className="drawing-cad-field"><span>{label('precision')}</span>
          <select data-testid="drawing-dimension-precision" value={draft.precision ?? 'document'}
            onChange={event => edit({ precision: event.target.value === 'document' ? null : Number(event.target.value) })}>
            <option value="document">{label('dimensionDocumentPrecision')} ({draftSettings?.precision ?? 2})</option>
            {[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="drawing-cad-field"><span>{label('dimensionEndMarker')}</span>
          <select data-testid="drawing-dimension-markers" value={draft.marker} onChange={event => edit({ marker: event.target.value as CadDimensionMarker })}>
            {CAD_DIMENSION_MARKERS.map(marker => <option key={marker} value={marker}>{label(marker === 'auto' ? 'dimensionMarkerAuto' : marker === 'arrow' ? 'dimensionMarkerArrow' : marker === 'tick' ? 'dimensionMarkerTick' : 'dimensionMarkerNone')}</option>)}
          </select>
        </label>
        {endpoints.angleSweep === null ? <label className="drawing-cad-check">
          <input type="checkbox" checked={draft.showUnit} onChange={event => edit({ showUnit: event.target.checked })}/><span>{label('dimensionShowUnit')}</span>
        </label> : <label className="drawing-cad-check">
          <input data-testid="drawing-dimension-reflex" type="checkbox" checked={draft.angleReflex === true}
            disabled={Math.abs(Math.abs(endpoints.angleSweep) - Math.PI) < 1e-8} onChange={event => edit({ angleReflex: event.target.checked })}/><span>{label('dimensionReflex')}</span>
        </label>}
        <button data-testid="drawing-dimension-apply" type="submit" disabled={!dirty || !valid || stale}>{label('dimensionUpdate')}</button>
      </fieldset>
      {(dirty || stale) && <button data-testid="drawing-dimension-reload" type="button" onClick={reset}>{label('dimensionReset')}</button>}
      <p id={errorId} className={`drawing-help${!valid || stale ? ' is-error' : ''}`} role={!valid || stale ? 'alert' : undefined}>
        {stale ? label('dimensionOptionsStale') : !valid ? label('dimensionOptionsInvalid') : label('dimensionOffsetHelp')}
      </p>
      {result && <p role={result === 'failed' ? 'alert' : 'status'} className={`drawing-help${result === 'failed' ? ' is-error' : ''}`}>
        {label(result === 'failed' ? 'failed' : 'dimensionUpdated')}
      </p>}
    </form>
    {endpoints.angleSweep !== null && endpoints.status === 'free' && <p className="drawing-help">{label('dimensionAngleHandles')}</p>}
  </details>;
}

type DimensionDefaultsDraft = Omit<CadDimensionDefaults, 'textHeightMm' | 'offsetMm'> & { textHeight: string; offset: string };

function DimensionDefaults({ hasSelectedDimension }: { hasSelectedDimension: boolean }) {
  const editor = useEditor(), { label } = useCadText(), errorId = useId();
  const [expanded, setExpanded] = useState(!hasSelectedDimension);
  const state = useValue('new dimension settings', () => ({
    defaults: readDimensionDefaults(editor), settings: readCadSettings(editor),
    revision: dimensionDefaultsRevision(editor), editable: canWriteCadSnapSettings(editor),
  }), [editor]);
  const options = (): DimensionDefaultsDraft => {
    const { textHeightMm, offsetMm, ...saved } = state.defaults, factor = unitMm(state.settings?.unit ?? 'mm');
    return { ...saved, textHeight: numberDraft(textHeightMm / factor), offset: numberDraft(offsetMm / factor) };
  };
  const [draft, setDraft] = useState(options), [draftSettings, setDraftSettings] = useState(state.settings);
  const [baseline, setBaseline] = useState(state.revision), [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const reset = () => { setDraft(options()); setDraftSettings(state.settings); setBaseline(state.revision); setDirty(false); setResult(null); };
  useEffect(() => { if (!dirty && baseline !== state.revision) reset(); }, [state.revision, dirty, baseline]);
  const factor = unitMm(draftSettings?.unit ?? 'mm');
  const textHeightMm = draftNumber(draft.textHeight) * factor, offsetMm = draftNumber(draft.offset) * factor;
  const validHeight = Number.isFinite(textHeightMm) && textHeightMm > 0 && textHeightMm <= CAD_MAX_COORDINATE;
  const validOffset = Number.isFinite(offsetMm) && Math.abs(offsetMm) <= CAD_MAX_COORDINATE;
  // View mode can be saved independently of an unfinished physical draft.
  // Preserve valid physical edits and retain saved values for inactive errors.
  const proposed = validateDimensionDefaults({ version: 1, mode: draft.mode,
    textHeightMm: draft.mode === 'view' && !validHeight ? state.defaults.textHeightMm : textHeightMm,
    offsetMm: draft.mode === 'view' && !validOffset ? state.defaults.offsetMm : offsetMm,
    precision: draft.precision, showUnit: draft.showUnit, marker: draft.marker });
  const calibrated = draft.mode !== 'physical' || !!draftSettings;
  const valid = !!proposed && calibrated && (draft.mode === 'view' || !!dimensionStyleForCreation(1, draftSettings, proposed));
  const stale = dirty && baseline !== state.revision;
  const edit = (change: Partial<DimensionDefaultsDraft>) => { setDraft(current => ({ ...current, ...change })); setDirty(true); setResult(null); };
  return <details className="drawing-cad-section" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} data-testid="drawing-dimension-defaults">
    <summary>{label('dimensionDefaults')}</summary>
    <p className="drawing-help">{label('dimensionDefaultsHelp')}</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (!state.editable || !dirty || stale || !valid || !proposed || formIsHidden(event.currentTarget)) return;
      const ok = writeDimensionDefaults(editor, baseline, proposed);
      setResult(ok ? 'saved' : 'failed');
      if (ok) { setDirty(false); setBaseline(dimensionDefaultsRevision(editor)); }
    }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); reset(); (event.target as HTMLElement).blur(); }
    }} onKeyUp={event => event.stopPropagation()}>
      <fieldset className="drawing-cad-fields" disabled={!state.editable} aria-describedby={errorId}>
        <label className="drawing-cad-field"><span>{label('dimensionDefaultsMode')}</span>
          <select data-testid="drawing-dimension-defaults-mode" value={draft.mode}
            onChange={event => edit({ mode: event.target.value as CadDimensionDefaults['mode'] })}>
            <option value="view">{label('dimensionDefaultsView')}</option>
            <option value="physical" disabled={!draftSettings}>{label('dimensionDefaultsPhysical')}</option>
          </select>
        </label>
        {!draftSettings && <p className="drawing-help">{label('dimensionDefaultsCalibration')}</p>}
        {draft.mode === 'physical' && <>
          <label className="drawing-cad-field"><span>{label('dimensionTextHeight')} ({draftSettings?.unit ?? 'mm'})</span>
            <input data-testid="drawing-dimension-defaults-height" type="number" min={0} step="any" required value={draft.textHeight}
              disabled={!draftSettings} aria-describedby={errorId} aria-invalid={!validHeight}
              onChange={event => edit({ textHeight: event.target.value })}/>
          </label>
          <label className="drawing-cad-field"><span>{label('dimensionOffset')} ({draftSettings?.unit ?? 'mm'})</span>
            <input data-testid="drawing-dimension-defaults-offset" type="number" step="any" required value={draft.offset}
              disabled={!draftSettings} aria-describedby={errorId} aria-invalid={!validOffset}
              onChange={event => edit({ offset: event.target.value })}/>
          </label>
        </>}
        <label className="drawing-cad-field"><span>{label('precision')}</span>
          <select data-testid="drawing-dimension-defaults-precision" value={draft.precision ?? 'document'}
            onChange={event => edit({ precision: event.target.value === 'document' ? null : Number(event.target.value) })}>
            <option value="document">{label('dimensionDocumentPrecision')} ({draftSettings?.precision ?? 2})</option>
            {[0, 1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="drawing-cad-field"><span>{label('dimensionEndMarker')}</span>
          <select data-testid="drawing-dimension-defaults-markers" value={draft.marker} onChange={event => edit({ marker: event.target.value as CadDimensionMarker })}>
            {CAD_DIMENSION_MARKERS.map(marker => <option key={marker} value={marker}>{label(marker === 'auto' ? 'dimensionMarkerAuto' : marker === 'arrow' ? 'dimensionMarkerArrow' : marker === 'tick' ? 'dimensionMarkerTick' : 'dimensionMarkerNone')}</option>)}
          </select>
        </label>
        <label className="drawing-cad-check">
          <input data-testid="drawing-dimension-defaults-unit" type="checkbox" checked={draft.showUnit} onChange={event => edit({ showUnit: event.target.checked })}/>
          <span>{label('dimensionShowUnit')}</span>
        </label>
        <button data-testid="drawing-dimension-defaults-save" type="submit" disabled={!dirty || !valid || stale}>{label('dimensionDefaultsSave')}</button>
      </fieldset>
      {(dirty || stale) && <button data-testid="drawing-dimension-defaults-reload" type="button" onClick={reset}>{label('dimensionDefaultsReload')}</button>}
      <p id={errorId} className={`drawing-help${!valid || stale ? ' is-error' : ''}`} role={!valid || stale ? 'alert' : undefined}>
        {stale ? label('dimensionDefaultsStale') : !calibrated ? label('dimensionDefaultsCalibration') : !valid ? label('dimensionDefaultsInvalid') :
          label(draft.mode === 'view' ? 'dimensionDefaultsViewHelp' : 'dimensionDefaultsPhysicalHelp')}
      </p>
      {result && <p role={result === 'failed' ? 'alert' : 'status'} className={`drawing-help${result === 'failed' ? ' is-error' : ''}`}>
        {label(result === 'failed' ? 'failed' : 'dimensionDefaultsSaved')}
      </p>}
    </form>
  </details>;
}
