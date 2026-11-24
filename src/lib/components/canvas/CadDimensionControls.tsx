import React, { useEffect, useId, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadText } from './cad-copy';
import { createCadDimension, detachCadDimension, relinkCadDimension } from './cad-geometry';
import { CAD_DIMENSION_KINDS, CAD_DIMENSION_SOURCE_LIMIT, angularDimensionPoints, circularDimensionPoints, dimensionSources, getDimensionEndpoints, radialDimensionKind, type CadDimensionKind, type DimensionSource } from './cad-dimension-links';
import type { CadSettings } from './cad-settings';
import { captureToolkitControls } from './toolkit-controls';
import { CAD_DIMENSION_MARKERS, CAD_DIMENSION_MAX_ANNOTATION_SIZE, dimensionSettingsRevision, readDimensionOptions, updateCadDimensionOptions, validDimensionAnnotationSize, validDimensionOptions,
  type CadDimensionMarker, type CadDimensionOptions } from './cad-dimension-settings';
import type { CadDimensionShape } from './shapes/CadShapes';
import { canWriteCadSnapSettings } from './cad-snap-settings';

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
  if (!state.count && !state.dimensionCount) return null;
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
  return <section className="drawing-cad-section" data-testid="drawing-dimension-links">
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
  </section>;
}

function DimensionSettings({ shape, settings, revision, disabled }: { shape: CadDimensionShape; settings: CadSettings | null; revision: string; disabled: boolean }) {
  const editor = useEditor(), { label } = useCadText(), errorId = useId();
  const endpoints = getDimensionEndpoints(editor, shape);
  const options = () => {
    const saved = readDimensionOptions(shape, settings, endpoints.angleSweep);
    return { ...saved, offset: String(Number(saved.offset.toPrecision(12))), annotationSize: String(Number(saved.annotationSize.toPrecision(12))) };
  };
  const [draft, setDraft] = useState(options), [baseline, setBaseline] = useState(revision), [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const reset = () => { setDraft(options()); setBaseline(revision); setDirty(false); setResult(null); };
  useEffect(() => { if (!dirty && baseline !== revision) reset(); }, [revision, dirty, baseline]);
  const proposed: CadDimensionOptions = { ...draft, offset: draft.offset.trim() ? Number(draft.offset) : NaN,
    annotationSize: draft.annotationSize.trim() ? Number(draft.annotationSize) : NaN };
  const rayLength = endpoints.angleSweep === null ? undefined : Math.hypot(endpoints.end.x - endpoints.start.x, endpoints.end.y - endpoints.start.y);
  const valid = validDimensionOptions(proposed, settings, rayLength), stale = dirty && baseline !== revision;
  const edit = (change: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...change })); setDirty(true); setResult(null); };
  return <details className="drawing-cad-section" open data-testid="drawing-dimension-settings">
    <summary>{label('dimensionSettings')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      if (disabled || stale || !valid || event.currentTarget.closest('[hidden]')) return;
      const ok = updateCadDimensionOptions(editor, shape.id, baseline, proposed);
      setResult(ok ? 'saved' : 'failed');
      if (ok) { setDirty(false); setBaseline(dimensionSettingsRevision(editor, editor.getShape(shape.id) as CadDimensionShape)); }
    }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); reset(); (event.target as HTMLElement).blur(); }
    }} onKeyUp={event => event.stopPropagation()}>
      <fieldset className="drawing-cad-fields" disabled={disabled} aria-describedby={errorId}>
        <label className="drawing-cad-field"><span>{label('dimensionOffset')} ({settings?.unit ?? 'px'})</span>
          <input data-testid="drawing-dimension-offset" type="number" step="any" required value={draft.offset}
            aria-invalid={!Number.isFinite(proposed.offset)} onChange={event => edit({ offset: event.target.value })}/>
        </label>
        <label className="drawing-cad-field"><span>{label('dimensionAnnotationSize')}</span>
          <input data-testid="drawing-dimension-size" type="number" min={0} max={CAD_DIMENSION_MAX_ANNOTATION_SIZE} step="any" required value={draft.annotationSize}
            aria-invalid={!validDimensionAnnotationSize(proposed.annotationSize)}
            onChange={event => edit({ annotationSize: event.target.value })}/>
        </label>
        <label className="drawing-cad-field"><span>{label('precision')}</span>
          <select data-testid="drawing-dimension-precision" value={draft.precision ?? 'document'}
            onChange={event => edit({ precision: event.target.value === 'document' ? null : Number(event.target.value) })}>
            <option value="document">{label('dimensionDocumentPrecision')} ({settings?.precision ?? 2})</option>
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
