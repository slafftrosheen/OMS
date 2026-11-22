import React, { useId, useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadText } from './cad-copy';
import { addProductionLayer, assignableProductionObjects, assignProductionLayer, MAX_PRODUCTION_LAYER_NAME,
  MAX_PRODUCTION_LAYERS, productionDxfNames, productionLayerId, readProductionLayers, removeProductionLayer, selectableProductionLayerObjects, selectProductionLayer, updateProductionLayer } from './cad-production-layers';

export function CadProductionLayers() {
  const editor = useEditor(), { label } = useCadText();
  const [name, setName] = useState(''), [picked, setPicked] = useState(''), [rename, setRename] = useState('');
  const [failed, setFailed] = useState(false);
  const [removal, setRemoval] = useState<{ source: string; destination: string }>();
  const removalHint = useId();
  const { layers, selected, readonly, counts } = useValue('production layers', () => {
    const counts = new Map<string, number>();
    for (const shape of editor.getCurrentPageShapesSorted()) {
      const id = productionLayerId(shape);
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return { layers: readProductionLayers(editor), selected: assignableProductionObjects(editor),
      readonly: editor.getInstanceState().isReadonly, counts };
  }, [editor]);
  const current = layers.find(layer => layer.id === picked) ?? layers[0];
  const names = productionDxfNames(layers);
  const pendingRemoval = current && removal?.source === current.id ? removal : undefined;
  const memberCount = current ? counts.get(current.id) ?? 0 : 0;
  const removalChoices = layers.filter(layer => layer.id !== current?.id);
  const removalDestination = pendingRemoval?.destination ?? '';
  const validRemoval = !memberCount || removalDestination === 'none' ||
    removalChoices.some(layer => removalDestination === `layer:${layer.id}`);
  const selectable = useValue('selectable layer objects', () => current ? selectableProductionLayerObjects(editor, current.id) : [], [editor, current?.id]);
  const ids = new Set(selected.map(shape => productionLayerId(shape) ?? ''));
  const assigned = ids.size === 1 ? ids.values().next().value : undefined;
  const assignment = assigned === undefined ? selected.length ? 'mixed' : '' : layers.some(layer => layer.id === assigned) ? assigned : '';
  return <details className="drawing-cad-section" data-testid="drawing-production-layers">
    <summary>{label('productionLayers')}</summary>
    <p className="drawing-help">{label('productionLayerHelp')}</p>
    <label className="drawing-cad-field">
      <span>{label('productionAssign')}</span>
      <select value={assignment} disabled={readonly || !selected.length} onChange={event => setFailed(!assignProductionLayer(editor, event.target.value || null))}>
        {assignment === 'mixed' && <option value="mixed" disabled>{label('productionMixed')}</option>}
        <option value="">{label('productionUnassigned')}</option>
        {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
      </select>
    </label>
    {current && <div className="drawing-cad-fields">
      <label className="drawing-cad-field"><span>{label('productionLayerEdit')}</span>
        <select value={current.id} onChange={event => {
          setPicked(event.target.value); setRename(''); setRemoval(undefined); setFailed(false);
        }}>
          {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name} ({counts.get(layer.id) ?? 0})</option>)}
        </select>
      </label>
      <button type="button" disabled={!selectable.length} onClick={() => setFailed(!selectProductionLayer(editor, current.id))}>
        {label('productionSelectLayer')}{selectable.length ? ` · ${selectable.length}` : ''}
      </button>
    </div>}
    <fieldset className="drawing-cad-fields" disabled={readonly}>
      {current && <>
        <p className="drawing-help"><code>{names.get(current.id)}</code></p>
        <label className="drawing-cad-check">
          <input type="checkbox" checked={current.visible} onChange={event => setFailed(!updateProductionLayer(editor, current.id, { visible: event.target.checked }))} />
          <span>{label('productionVisible')}</span>
        </label>
        <label className="drawing-cad-check">
          <input type="checkbox" checked={current.locked} onChange={event => setFailed(!updateProductionLayer(editor, current.id, { locked: event.target.checked }))} />
          <span>{label('productionLocked')}</span>
        </label>
        <label className="drawing-cad-check">
          <input type="checkbox" checked={current.includeInDxf} onChange={event => setFailed(!updateProductionLayer(editor, current.id, { includeInDxf: event.target.checked }))} />
          <span>{label('productionInclude')}</span>
        </label>
        <label className="drawing-cad-field"><span>{label('productionRename')}</span>
          <input placeholder={current.name} value={rename} maxLength={MAX_PRODUCTION_LAYER_NAME} onChange={event => setRename(event.target.value)} />
        </label>
        <button type="button" disabled={!rename.trim()} onClick={() => {
          const ok = updateProductionLayer(editor, current.id, { name: rename }); setFailed(!ok); if (ok) setRename('');
        }}>{label('productionRename')}</button>
        {pendingRemoval ? <div className="drawing-cad-fields drawing-production-layer-removal">
          <p className="drawing-help" id={removalHint}>
            {memberCount ? `${label('productionMoveMembers')} (${memberCount})` : label('productionRemoveEmpty')}
          </p>
          {memberCount > 0 && <label className="drawing-cad-field"><span>{label('productionMoveTo')}</span>
            <select value={validRemoval ? removalDestination : ''} aria-describedby={removalHint}
              onChange={event => setRemoval({ source: current.id, destination: event.target.value })}>
              <option value="" disabled>{label('productionChooseDestination')}</option>
              <option value="none">{label('productionUnassigned')}</option>
              {removalChoices.map(layer => <option key={layer.id} value={`layer:${layer.id}`}>
                {layer.name}{layer.visible ? '' : ` · ${label('productionLayerHidden')}`}
                {layer.locked ? ` · ${label('productionLayerLocked')}` : ''}
                {layer.includeInDxf ? '' : ` · ${label('productionLayerExcluded')}`}
              </option>)}
            </select>
          </label>}
          <button type="button" disabled={!validRemoval} onClick={() => {
            const target = memberCount && removalDestination.startsWith('layer:') ? removalDestination.slice('layer:'.length) : null;
            const ok = removeProductionLayer(editor, current.id, target);
            setFailed(!ok);
            if (ok) { setRemoval(undefined); setPicked(target ?? ''); setRename(''); }
          }}>{label('productionConfirmRemove')}</button>
          <button type="button" onClick={() => { setRemoval(undefined); setFailed(false); }}>{label('productionCancelRemove')}</button>
        </div> : <button type="button" onClick={() => {
          setRemoval({ source: current.id, destination: '' }); setFailed(false);
        }}>{label('productionRemoveLayer')}</button>}
      </>}
      <label className="drawing-cad-field"><span>{label('productionNewLayer')}</span>
        <input value={name} maxLength={MAX_PRODUCTION_LAYER_NAME} onChange={event => setName(event.target.value)} />
      </label>
      <button type="button" disabled={!name.trim() || layers.length >= MAX_PRODUCTION_LAYERS} onClick={() => {
        const ok = addProductionLayer(editor, name);
        setFailed(!ok);
        if (ok) {
          const created = readProductionLayers(editor).find(layer => layer.name === name.trim());
          setPicked(created?.id ?? ''); setName(''); setRename(''); setRemoval(undefined);
        }
      }}>{label('productionAddLayer')}</button>
    </fieldset>
    {failed && <p className="drawing-help is-error" role="alert">{label('failed')}</p>}
  </details>;
}
