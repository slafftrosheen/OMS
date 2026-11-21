import React, { useId, useState } from 'react';
import { useEditor, useValue, type Editor, type TLShape } from '@tldraw/tldraw';
import { arcContour, curvePathData, mapContours, nodeAt, validContours, type CadBezierNode, type CadContour } from './cad-curves';
import { getSelectedCadNodes, isCadNodeEditing } from './cad-node-selection';
import { cadShapeDxfGeometry, cadShapeIsClipped } from './cad-dxf';
import { applyCadPlan, makeCadPlan, type CadPlannedShape } from './cad-plans';
import {
  angledCadSegment, measureCadEdgeAngle, measureCadSegment, parallelCadSegment,
  productionPresetGeometry, productionPresets, segmentContour, type CadSegment, type ProductionPreset
} from './cad-production-geometry';
import { cadMmPerPixel, readCadSettings, unitMm, type CadSettings } from './cad-settings';
import { useProductionToolsText } from './production-tools-copy';

function straightBezier(start: CadBezierNode, end: CadBezierNode): CadSegment | null {
  const { x, y, length } = measureCadSegment({ start, end });
  if (length <= 1e-6) return null;
  const controls = [start, { x: start.x + start.outX, y: start.y + start.outY },
    { x: end.x + end.inX, y: end.y + end.inY }, end];
  const positions = controls.map(p => {
    const dx = p.x - start.x, dy = p.y - start.y;
    return {
      along: (x * dx + y * dy) / length,
      across: (x * dy - y * dx) / length
    };
  });
  return positions.every((p, i) => Math.abs(p.across) < 1e-8 && (!i || p.along >= positions[i - 1].along))
    ? { start, end } : null;
}

function selectedBezierEdge(editor: Editor, shape: TLShape, settings: CadSettings): CadSegment | null {
  if (shape.type !== 'cad-bezier' || !isCadNodeEditing(editor)) return null;
  const nodes = getSelectedCadNodes(editor);
  if (nodes.length !== 2 || nodes[0].contourIndex !== nodes[1].contourIndex) return null;
  const [a, b] = nodes;
  const contour = (shape.props as { contours: CadContour[] }).contours[a.contourIndex];
  if (!contour || cadShapeIsClipped(editor, shape) || (shape.meta.omsVectorPaint as { clips?: unknown[] })?.clips?.length) return null;
  const next = (index: number) => contour.closed ? (index + 1) % contour.nodes.length : index + 1;
  if (next(a.nodeIndex) !== b.nodeIndex && next(b.nodeIndex) !== a.nodeIndex) return null;
  const [first, second] = next(a.nodeIndex) === b.nodeIndex ? [a, b] : [b, a];
  const transform = editor.getShapePageTransform(shape);
  const factor = cadMmPerPixel(settings);
  const [edge] = mapContours([{
    closed: false, nodes: [contour.nodes[first.nodeIndex], contour.nodes[second.nodeIndex]]
  }], point => {
    const page = transform.applyToPoint(point);
    return { x: (page.x - settings.originX) * factor, y: (settings.originY - page.y) * factor };
  });
  if (!validContours([edge])) return null;
  return straightBezier(edge.nodes[0], edge.nodes[1]);
}

function straightSegment(editor: Editor, shape: TLShape, settings: CadSettings): CadSegment | null {
  try {
    if (isCadNodeEditing(editor) && getSelectedCadNodes(editor).length === 2) return selectedBezierEdge(editor, shape, settings);
    const geometry = cadShapeDxfGeometry(editor, shape, settings);
    const entity = geometry.entity ?? (geometry.entities?.length === 1 ? geometry.entities[0] : undefined);
    if (entity?.type === 'polyline' && !entity.closed && entity.points.length === 2) {
      return { start: entity.points[0], end: entity.points[1] };
    }
    if (entity?.type === 'spline' && !entity.contour.closed && entity.contour.nodes.length === 2) {
      return straightBezier(entity.contour.nodes[0], entity.contour.nodes[1]);
    }
  } catch {
    // Malformed or out-of-range geometry does not supply a construction edge.
  }
  return null;
}

function selectedSegments(editor: Editor, settings: CadSettings | null) {
  const shapes = editor.getSelectedShapes();
  return settings && shapes.length <= 2
    ? shapes.map(shape => straightSegment(editor, shape, settings)) : [];
}

function addGeometry(editor: Editor, settings: CadSettings, contours: CadContour[], name: string, shapes: CadPlannedShape[], groupResult = false) {
  try {
    return applyCadPlan(editor, makeCadPlan(editor, settings, contours, {
      name, shapes: shapes.map(shape => ({ ...shape, opacity: 1 })), groupResult
    }));
  } catch {
    return false;
  }
}

function addSegments(editor: Editor, settings: CadSettings, segments: CadSegment[], name: string) {
  const factor = cadMmPerPixel(settings);
  const contours = mapContours(segments.map(segmentContour), p => ({
    x: settings.originX + p.x / factor,
    y: settings.originY - p.y / factor
  }));
  const shapes: CadPlannedShape[] = contours.map(({ nodes }) => ({
    type: 'cad-path', x: nodes[0].x, y: nodes[0].y,
    props: { points: nodes.map(p => ({ x: p.x - nodes[0].x, y: p.y - nodes[0].y })), closed: false }
  }));
  return addGeometry(editor, settings, contours, name, shapes);
}

const numeric = (text: string) => text.trim() ? Number(text) : NaN;

export function CadStraightEdgeTools({ settings }: { settings: CadSettings | null }) {
  const editor = useEditor();
  const t = useProductionToolsText();
  const readOnly = useValue('CAD construction read-only', () => editor.getInstanceState().isReadonly, [editor]);
  const segments = useValue('Selected CAD straight edges', () => selectedSegments(editor, settings), [editor, settings]);
  const [offset, setOffset] = useState('10');
  const [side, setSide] = useState<'left' | 'right' | 'both'>('left');
  const [length, setLength] = useState('100');
  const [heading, setHeading] = useState('45');
  const [result, setResult] = useState<'created' | 'failed'>();
  const unit = settings?.unit ?? 'mm';
  const unitFactor = unitMm(unit);
  const [first, second] = segments;
  const measurement = first && measureCadSegment(first);
  const angle = first && second ? measureCadEdgeAngle(first, second) : undefined;
  const separation = first && second && measurement && angle !== undefined && angle < 1e-8
    ? Math.abs(measurement.x * (second.start.y - first.start.y) - measurement.y * (second.start.x - first.start.x)) / measurement.length
    : undefined;
  const format = (value: number) => value.toFixed(settings?.precision ?? 2);
  const distance = (mm: number) => `${format(mm / unitFactor)} ${unit}`;
  const offsetMm = numeric(offset) * unitFactor;
  const lengthMm = numeric(length) * unitFactor;
  const headingDegrees = numeric(heading);
  const validOffset = Number.isFinite(offsetMm) && offsetMm > 1e-6;
  const validLine = Number.isFinite(lengthMm) && lengthMm > 1e-6 && Number.isFinite(headingDegrees);
  const editable = !!settings && !readOnly;

  function construct(kind: 'parallel' | 'angled') {
    const current = readCadSettings(editor);
    if (!current || editor.getInstanceState().isReadonly) return;
    const selection = selectedSegments(editor, current);
    let lines: CadSegment[];
    let name: string;
    if (kind === 'parallel') {
      if (selection.length !== 1 || !selection[0] || !validOffset) return;
      const edge = selection[0];
      const mm = numeric(offset) * unitMm(current.unit);
      lines = (side === 'both' ? [mm, -mm] : [side === 'left' ? mm : -mm]).map(value => parallelCadSegment(edge, value));
      name = t('createParallel');
    } else {
      if (!validLine) return;
      const center = editor.getViewportPageBounds().center;
      const factor = cadMmPerPixel(current);
      const start = selection.length === 1 && selection[0] ? selection[0].start
        : { x: (center.x - current.originX) * factor, y: (current.originY - center.y) * factor };
      lines = [angledCadSegment(start, numeric(length) * unitMm(current.unit), headingDegrees)];
      name = t('angledLine');
    }
    setResult(addSegments(editor, current, lines, name) ? 'created' : 'failed');
  }

  return <section className="drawing-production-section" aria-label={t('construction')}>
    <h3>{t('construction')}</h3>
    <p className="drawing-help">{t(settings ? 'measureEdges' : 'documentRequired')}</p>
    {measurement && segments.length === 1 && <dl className="drawing-cad-values">
      <dt>{t('length')}</dt><dd>{distance(measurement.length)}</dd>
      <dt>{t('deltaX')}</dt><dd>{distance(Math.abs(measurement.x))}</dd>
      <dt>{t('deltaY')}</dt><dd>{distance(Math.abs(measurement.y))}</dd>
      <dt>{t('heading')}</dt><dd>{format(measurement.heading)}°</dd>
    </dl>}
    {angle !== undefined && <dl className="drawing-cad-values">
      <dt>{t('angle')}</dt><dd>{format(angle)}°</dd>
      {separation !== undefined && <><dt>{t('parallelDistance')}</dt><dd>{distance(separation)}</dd></>}
    </dl>}
    {first && segments.length === 1 && <form className="drawing-cad-fields" onSubmit={event => { event.preventDefault(); construct('parallel'); }}>
      <label className="drawing-cad-field"><span>{t('offset')} ({unit})</span><input type="number" step="any" min="0" value={offset}
        aria-invalid={!validOffset} disabled={!editable} onChange={event => { setResult(undefined); setOffset(event.target.value); }} /></label>
      <label className="drawing-cad-field"><span>{t('side')}</span><select value={side} disabled={!editable}
        onChange={event => { setResult(undefined); setSide(event.target.value as typeof side); }}>
        <option value="left">{t('left')}</option><option value="right">{t('right')}</option><option value="both">{t('both')}</option>
      </select></label>
      <button type="submit" disabled={!editable || !validOffset} data-testid="drawing-create-parallel">{t('createParallel')}</button>
    </form>}
    <form className="drawing-cad-fields" onSubmit={event => { event.preventDefault(); construct('angled'); }}>
      <h4>{t('angledLine')}</h4>
      <label className="drawing-cad-field"><span>{t('length')} ({unit})</span><input type="number" step="any" min="0" value={length}
        aria-invalid={!Number.isFinite(lengthMm) || lengthMm <= 1e-6} disabled={!editable}
        onChange={event => { setResult(undefined); setLength(event.target.value); }} /></label>
      <label className="drawing-cad-field"><span>{t('heading')} (°)</span><input type="number" step="any" value={heading}
        aria-invalid={!Number.isFinite(headingDegrees)} disabled={!editable}
        onChange={event => { setResult(undefined); setHeading(event.target.value); }} /></label>
      <p className="drawing-help">{t('headingHelp')}</p>
      <button type="submit" disabled={!editable || !validLine} data-testid="drawing-create-angled">{t('createAngled')}</button>
    </form>
    {result && <p className={`drawing-help${result === 'failed' ? ' is-error' : ''}`} role={result === 'failed' ? 'alert' : 'status'}>{t(result)}</p>}
  </section>;
}

const clipartCategories = ['mounting', 'signBlanks', 'printMarks'] as const;

function ClipartPreview({ entities, width, height }: {
  entities: ReturnType<typeof productionPresetGeometry>; width: number; height: number;
}) {
  const pad = Math.max(width, height) * 0.08;
  return <svg viewBox={`${-width / 2 - pad} ${-height / 2 - pad} ${width + pad * 2} ${height + pad * 2}`}
    fill="none" stroke="currentColor" aria-hidden="true">
    {entities.map((entity, index) => entity.type === 'circle'
      ? <circle key={index} cx={entity.center.x} cy={-entity.center.y} r={entity.radius} vectorEffect="non-scaling-stroke" />
      : <path key={index} d={curvePathData(mapContours([entity.type === 'spline'
        ? entity.contour : { closed: entity.closed, nodes: entity.points.map(nodeAt) }], p => ({ x: p.x, y: -p.y })))}
        vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

export function CadProductionClipart({ settings, onSetup }: { settings: CadSettings | null; onSetup: () => void }) {
  const editor = useEditor();
  const t = useProductionToolsText();
  const readOnly = useValue('Production clipart read-only', () => editor.getInstanceState().isReadonly, [editor]);
  const [result, setResult] = useState<'created' | 'failed'>();
  const firstPreset = productionPresets[0];
  const [category, setCategory] = useState<typeof clipartCategories[number]>(firstPreset.category);
  const [presetId, setPresetId] = useState<ProductionPreset>(firstPreset.id);
  const [draft, setDraft] = useState({ width: String(firstPreset.width), height: String(firstPreset.height) });
  const dimensionError = useId();
  const preset = productionPresets.find(item => item.id === presetId)!;
  const width = numeric(draft.width);
  const square = 'square' in preset;
  const height = square ? width : numeric(draft.height);
  const entities = productionPresetGeometry(presetId, { width, height });
  const canInsert = !!settings && !readOnly && entities.length > 0;

  function selectPreset(id: ProductionPreset) {
    const next = productionPresets.find(item => item.id === id)!;
    setPresetId(id);
    setDraft({ width: String(next.width), height: String(next.height) });
    setResult(undefined);
  }

  function insert() {
    const current = readCadSettings(editor);
    if (!current || editor.getInstanceState().isReadonly || !entities.length) return;
    const factor = cadMmPerPixel(current);
    const center = editor.getViewportPageBounds().center;
    const toLocal = (p: { x: number; y: number }) => ({ x: p.x / factor, y: -p.y / factor });
    const shapes: CadPlannedShape[] = entities.map(entity => {
      switch (entity.type) {
        case 'circle': {
          const p = toLocal(entity.center);
          const r = entity.radius / factor;
          return { type: 'cad-ellipse', x: center.x + p.x - r, y: center.y + p.y - r, props: { w: 2 * r, h: 2 * r } };
        }
        case 'polyline':
          return { type: 'cad-path', x: center.x, y: center.y, props: { points: entity.points.map(toLocal), closed: entity.closed } };
        case 'spline':
          return { type: 'cad-bezier', x: center.x, y: center.y, props: { contours: mapContours([entity.contour], toLocal), fillRule: 'evenodd' } };
      }
    });
    const contours = mapContours(entities.map(entity => entity.type === 'circle'
      ? arcContour(entity.center.x, entity.center.y, entity.radius, entity.radius, 0, Math.PI * 2)
      : entity.type === 'spline' ? entity.contour : { closed: entity.closed, nodes: entity.points.map(nodeAt) }),
      p => { const local = toLocal(p); return { x: center.x + local.x, y: center.y + local.y }; });
    setResult(addGeometry(editor, current, contours, t(presetId), shapes, shapes.length > 1) ? 'created' : 'failed');
  }

  return <section className="drawing-production-section" aria-label={t('clipart')}>
    <p className="drawing-help">{t(settings ? 'clipartHelp' : 'documentRequired')}</p>
    {!settings && !readOnly && <button type="button" onClick={onSetup}>{t('setDocumentUnits')}</button>}
    <div className="drawing-clipart-categories" role="group" aria-label={t('clipartCategories')}>
      {clipartCategories.map(item => <button type="button" key={item} aria-pressed={category === item}
        onClick={() => {
          if (item === category) return;
          setCategory(item);
          selectPreset(productionPresets.find(preset => preset.category === item)!.id);
        }}>{t(item)}</button>)}
    </div>
    <ul className="drawing-clipart-list">
      {productionPresets.filter(item => item.category === category).map(({ id, width, height }) => <li key={id}>
        <button type="button" aria-pressed={presetId === id} onClick={() => selectPreset(id)} data-testid={`drawing-clipart-${id}`}>
          <ClipartPreview entities={productionPresetGeometry(id)} width={width} height={height} />
          <span><strong>{t(id)}</strong><small>{width} × {height} mm</small></span>
        </button>
      </li>)}
    </ul>
    <form className="drawing-clipart-form" onSubmit={event => { event.preventDefault(); if (canInsert) insert(); }}>
      <h4>{t(presetId)}</h4>
      {entities.length > 0 && <div className="drawing-clipart-preview"><ClipartPreview entities={entities} width={width} height={height} /></div>}
      <p className="drawing-help">{t(`${presetId}Detail`)}</p>
      <div className="drawing-clipart-dimensions">
        {(square ? ['width'] as const : ['width', 'height'] as const).map(axis =>
          <label key={axis}><span>{t(axis === 'width' ? presetId === 'cableEntry' ? 'diameterMm' : 'widthMm' : 'heightMm')}</span>
            <input type="number" min="0" step="any" value={draft[axis]} disabled={!settings || readOnly}
              aria-invalid={!entities.length} aria-describedby={entities.length ? undefined : dimensionError}
              onChange={event => { setResult(undefined); setDraft(previous => ({ ...previous, [axis]: event.target.value })); }} />
          </label>
        )}
      </div>
      {!entities.length && <p id={dimensionError} className="drawing-help is-error">{t('invalidClipartSize')}</p>}
      <button type="submit" className="drawing-clipart-insert" disabled={!canInsert} data-testid="drawing-clipart-insert">{t('insertClipart')}</button>
    </form>
    {result && <p className={`drawing-help${result === 'failed' ? ' is-error' : ''}`} role={result === 'failed' ? 'alert' : 'status'}>{t(result)}</p>}
  </section>;
}
