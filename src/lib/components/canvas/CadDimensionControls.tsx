import React, { useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadText } from './cad-copy';
import { createCadDimension, detachCadDimension, relinkCadDimension } from './cad-geometry';
import { CAD_DIMENSION_SOURCE_LIMIT, dimensionSources, getDimensionEndpoints, type CadDimensionKind, type DimensionSource } from './cad-dimension-links';
import type { CadSettings } from './cad-settings';
import { captureToolkitControls } from './toolkit-controls';

const dimensionKinds = ['horizontal', 'vertical', 'aligned'] as const;

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
      status: dimension && getDimensionEndpoints(editor, dimension).status,
      kind: dimension?.props.link?.kind,
      editable: captureToolkitControls(editor).canEditSelection &&
        !sources.some(shape => ['order-details', 'order-address', 'profile-7st'].includes(shape.type)),
    };
  }, [editor]);
  if (!state.count && !state.dimensionCount) return null;
  const kind = direction ?? state.kind ?? 'horizontal';
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
          {dimensionKinds.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </label>
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
      {state.status === 'linked' && <button type="button" disabled={!state.editable} onClick={() => run(() => detachCadDimension(editor))}>
        {label('dimensionDetach')}
      </button>}
      {state.status !== 'linked' && <p className="drawing-help">{label('dimensionRelinkHelp')}</p>}
    </>}
    {overLimit && (canRelink || canCreate && linked) && <p className="drawing-help">{label('dimensionLinkLimit')}</p>}
    {result?.selection === state.selection && !result.ok && <p role="alert" className="drawing-help is-error">{label('failed')}</p>}
  </section>;
}
