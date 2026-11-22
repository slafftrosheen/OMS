import React, { useState } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { useCadText } from './cad-copy';
import { addProductionLayer, assignableProductionObjects, assignProductionLayer, MAX_PRODUCTION_LAYER_NAME,
  MAX_PRODUCTION_LAYERS, productionDxfNames, productionLayerId, readProductionLayers, updateProductionLayer } from './cad-production-layers';

export function CadProductionLayers() {
  const editor = useEditor(), { label } = useCadText();
  const [name, setName] = useState(''), [picked, setPicked] = useState(''), [rename, setRename] = useState('');
  const [failed, setFailed] = useState(false);
  const { layers, selected, readonly } = useValue('production layers', () => ({
    layers: readProductionLayers(editor), selected: assignableProductionObjects(editor), readonly: editor.getInstanceState().isReadonly,
  }), [editor]);
  const current = layers.find(layer => layer.id === picked) ?? layers[0];
  const names = productionDxfNames(layers);
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
    <fieldset className="drawing-cad-fields" disabled={readonly}>
      {current && <>
        <label className="drawing-cad-field"><span>{label('productionLayerEdit')}</span>
          <select value={current.id} onChange={event => { setPicked(event.target.value); setRename(''); setFailed(false); }}>
            {layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select>
        </label>
        <p className="drawing-help"><code>{names.get(current.id)}</code></p>
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
      </>}
      <label className="drawing-cad-field"><span>{label('productionNewLayer')}</span>
        <input value={name} maxLength={MAX_PRODUCTION_LAYER_NAME} onChange={event => setName(event.target.value)} />
      </label>
      <button type="button" disabled={!name.trim() || layers.length >= MAX_PRODUCTION_LAYERS} onClick={() => {
        const ok = addProductionLayer(editor, name); setFailed(!ok); if (ok) setName('');
      }}>{label('productionAddLayer')}</button>
    </fieldset>
    {failed && <p className="drawing-help is-error" role="alert">{label('failed')}</p>}
  </details>;
}
