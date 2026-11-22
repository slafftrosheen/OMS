import React, { useState } from 'react';
import { useCadText } from './cad-copy';
import type { DxfCutLengths } from './cad-dxf-cut-lengths';
import type { DxfPreview } from './cad-dxf-preview';

const sharedLayer = (name: string) => name === 'OMS_SHARED' || name.startsWith('OMS_SHARED_');

interface DxfReviewPreviewProps {
  preview: DxfPreview;
  layerLengths: DxfCutLengths['byLayer'];
  formatLength: (length: number | null) => string;
}

export function DxfReviewPreview({ preview, layerLengths, formatLength }: DxfReviewPreviewProps) {
  const { label } = useCadText();
  const [filter, setFilter] = useState('');
  const layer = preview.layers.find(item => item.name === filter);
  const length = layer ? layerLengths[layer.name] : undefined;
  const visible = layer ? [layer] : [...preview.layers].sort((a, b) => Number(sharedLayer(a.name)) - Number(sharedLayer(b.name)));
  return <section className="drawing-dxf-preview" aria-label={label('dxfPreviewTitle')} data-testid="drawing-dxf-preview">
    {preview.layers.length > 1 && <label className="drawing-cad-field">
      <span>{label('dxfPreviewLayer')}</span>
      <select value={layer?.name ?? ''} onChange={event => setFilter(event.target.value)}>
        <option value="">{label('dxfPreviewAll')}</option>
        {preview.layers.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
      </select>
    </label>}
    {length !== undefined && <dl className="drawing-cad-values" aria-live="polite">
      <dt>{label('dxfCutLength')}</dt><dd>{formatLength(length)}</dd>
    </dl>}
    <svg role="img" aria-label={label('dxfPreviewTitle')} viewBox={preview.viewBox} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {visible.map(item => {
        const shared = sharedLayer(item.name), width = shared ? 2.5 : 1.5;
        return <g key={item.name} data-dxf-layer={item.name}>
          {item.rgb && <path d={item.path} stroke="var(--ink-primary)" strokeWidth={width + 1.2} vectorEffect="non-scaling-stroke" />}
          <path d={item.path} stroke={item.rgb ?? (shared ? 'var(--rf-cv-snap, #dc2626)' : 'var(--ink-primary)')}
            strokeWidth={width} vectorEffect="non-scaling-stroke" />
        </g>;
      })}
    </svg>
  </section>;
}
