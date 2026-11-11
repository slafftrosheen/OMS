import { useVectorText } from './cad-vector-copy';
import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';
import { useCadAdvancedText } from './cad-advanced-copy';
import { useCadText, type CadLabel } from './cad-copy';
import {
  DEFAULT_CAD_SETTINGS, unitMm, validateCadSettings, validCadPoints, writeCadSettings,
  type CadPoint, type CadSettings,
} from './cad-settings';
import {
  calibrateCadSelection, convertSelectionToCadPath, createCadDimension, createCadGeometry, getCadArc, getCadPathPoints, getCadSelection,
  setCadOriginToSelection, updateCadArc, updateCadPathPoints, type CadGeometryInput,
} from './cad-geometry';
import { buildCadDxf } from './cad-dxf';
import { CadAdvancedPanel, type CadFocusRequest } from './CadAdvancedPanel';

function numeric(value: string): number { return value.trim() ? Number(value) : NaN; }
function format(value: number, precision: number): string { return Number(value.toFixed(precision)).toString(); }
function parsePoints(text: string, closed: boolean): CadPoint[] | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < (closed ? 3 : 2) || lines.length > 256) return null;
  const points: CadPoint[] = [];
  for (const line of lines) {
    const pair = line.split(',');
    if (pair.length !== 2 || pair.some(value => !value.trim())) return null;
    points.push({ x: Number(pair[0]), y: Number(pair[1]) });
  }
  return validCadPoints(points, closed) ? points : null;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="drawing-cad-field"><span>{label}</span>{children}</label>;
}
function Message({ text, error = false }: { text: string; error?: boolean }) {
  return text ? <p className={`drawing-help drawing-cad-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{text}</p> : null;
}

/** CAD is part of the shared docker, so order and idea editors have identical controls. */
export function CadPanel({ settings, focusRequest }: { settings: CadSettings | null; focusRequest?: CadFocusRequest }) {
  const editor = useEditor(); const { label } = useCadText();
  const { label: advancedLabel } = useCadAdvancedText(); const vectorLabel = useVectorText();
  const [task, setTask] = useState<'draw' | 'edit' | 'document' | 'files' | 'trace'>(settings ? 'edit' : 'document');
  const sourceIsText = useValue('cad focus text', () => editor.getOnlySelectedShape()?.type === 'text', [editor]);
  const consumedFocus = useRef<number>();
  useEffect(() => {
    if (!focusRequest || consumedFocus.current === focusRequest.sequence) return;
    consumedFocus.current = focusRequest.sequence;
    setTask(focusRequest.section === 'trace' ? 'trace' : focusRequest.section === 'files' ? 'files' : focusRequest.section === 'document' ? 'document' : focusRequest.section === 'convert' && sourceIsText ? 'draw' : 'edit');
  }, [focusRequest, sourceIsText]);
  const controls = useValue('cad panel permissions', () => captureToolkitControls(editor), [editor]);
  const protectedSelection = useValue('cad protected selection', () => [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])].some(id => ['order-details', 'order-address', 'profile-7st'].includes(editor.getShape(id)?.type ?? '')), [editor]);
  const selected = useValue('cad selected measurement', () => settings ? getCadSelection(editor, settings, 'bottom-left') : null, [editor, settings]);
  const [message, setMessage] = useState<CadLabel | ''>('');
  const settingsKey = JSON.stringify(settings);
  const [draft, setDraft] = useState(() => {
    const value = settings ?? DEFAULT_CAD_SETTINGS;
    return { unit: value.unit, scale: String(value.scale), precision: String(value.precision), nudge: String(value.nudge) };
  });
  useEffect(() => {
    const value = settings ?? DEFAULT_CAD_SETTINGS;
    setDraft({ unit: value.unit, scale: String(value.scale), precision: String(value.precision), nudge: String(value.nudge) });
  }, [settingsKey]);
  const proposed = validateCadSettings({ ...(settings ?? DEFAULT_CAD_SETTINGS), unit: draft.unit, scale: numeric(draft.scale), precision: numeric(draft.precision), nudge: numeric(draft.nudge) });
  const settingsErrorId = useId();
  const [known, setKnown] = useState('');
  useEffect(() => { setKnown(''); }, [settings?.unit]);
  const knownInvalid = known !== '' && (!Number.isFinite(numeric(known)) || numeric(known) <= 0);
  const knownErrorId = useId();
  const [axis, setAxis] = useState<'width' | 'height'>('width');
  const [direction, setDirection] = useState<'horizontal' | 'vertical' | 'aligned'>('horizontal');
  const unit = settings?.unit ?? 'mm';
  const precision = settings?.precision ?? 2;
  function perform(success: boolean, successLabel: CadLabel) { setMessage(success ? successLabel : 'failed'); }
  return <div className="drawing-cad" data-testid="drawing-cad-panel">
    <label className="drawing-cad-task"><span>{advancedLabel('task')}</span>
      <select data-testid="drawing-cad-task" value={task} onChange={event => setTask(event.target.value as typeof task)}>
        {(['draw', 'edit', 'document', 'files', 'trace'] as const).map(value => <option key={value} value={value}>{value === 'trace' ? vectorLabel('trace') : value === 'files' ? vectorLabel('files') : advancedLabel(`${value}Task`)}</option>)}
      </select>
    </label>
    {controls.readOnly && <p className="drawing-help">{label('readOnly')}</p>}
    <div hidden={task !== 'document'}>
    <details className="drawing-cad-section" open>
      <summary>{label('document')}</summary>
      <form onSubmit={event => { event.preventDefault(); if (proposed) perform(writeCadSettings(editor, proposed), 'settingsSaved'); }}>
        {!settings && <p className="drawing-help">{label('legacy')}</p>}
        <fieldset disabled={controls.readOnly} className="drawing-cad-fields" aria-describedby={settingsErrorId}>
          <Field label={label('unit')}><select value={draft.unit} onChange={event => {
            const unit = event.target.value as CadSettings['unit'];
            setDraft(previous => ({ ...previous, unit, nudge: Number.isFinite(numeric(previous.nudge))
              ? String(numeric(previous.nudge) * unitMm(previous.unit) / unitMm(unit)) : previous.nudge }));
            setMessage('');
          }}>
            {['mm', 'cm', 'm', 'in'].map(value => <option key={value} value={value}>{value}</option>)}
          </select></Field>
          <Field label={label('scale')}><input type="number" min="0.001" max="10000" step="any" required value={draft.scale} aria-invalid={!Number.isFinite(numeric(draft.scale)) || numeric(draft.scale) < 0.001 || numeric(draft.scale) > 10000}
            onChange={event => { setDraft(previous => ({ ...previous, scale: event.target.value })); setMessage(''); }} /></Field>
          <Field label={label('precision')}><input type="number" min="0" max="6" step="1" required value={draft.precision} aria-invalid={!Number.isInteger(numeric(draft.precision)) || numeric(draft.precision) < 0 || numeric(draft.precision) > 6}
            onChange={event => { setDraft(previous => ({ ...previous, precision: event.target.value })); setMessage(''); }} /></Field>
          <Field label={`${label('nudge')} (${draft.unit})`}><input type="number" min="0.000001" max="10000" step="any" required value={draft.nudge} aria-invalid={!Number.isFinite(numeric(draft.nudge)) || numeric(draft.nudge) <= 0 || numeric(draft.nudge) > 10000}
            onChange={event => { setDraft(previous => ({ ...previous, nudge: event.target.value })); setMessage(''); }} /></Field>
          <button type="submit" disabled={!proposed} data-testid="drawing-cad-apply">{label('apply')}</button>
        </fieldset>
        <p id={settingsErrorId} className={`drawing-help${!proposed ? ' is-error' : ''}`} role={!proposed ? 'alert' : undefined}>{!proposed ? label('settingsInvalid') : label('scaleHelp')}</p>
      </form>
      {settings && <div className="drawing-cad-origin" aria-label={label('origin')}>
        <p className="drawing-help">{label('coordinateHelp')}</p>
        <button type="button" disabled={controls.readOnly || !controls.selected} onClick={() => perform(setCadOriginToSelection(editor, settings), 'settingsSaved')}>{label('selectionOrigin')}</button>
        <button type="button" disabled={controls.readOnly || settings.originX === 0 && settings.originY === 0} onClick={() => perform(writeCadSettings(editor, { ...settings, originX: 0, originY: 0 }), 'settingsSaved')}>{label('resetOrigin')}</button>
      </div>}
    </details>
    {message && <Message text={label(message)} error={message === 'failed'} />}
    <details className="drawing-cad-section">
      <summary>{label('measure')}</summary>
      {selected ? <dl className="drawing-cad-values" aria-label={label('selectionSize')}>
        <dt>{label('width')}</dt><dd>{format(selected.w, precision)} {unit}</dd>
        <dt>{label('height')}</dt><dd>{format(selected.h, precision)} {unit}</dd>
      </dl> : <p className="drawing-help">{label('selectionRequired')}</p>}
      <fieldset className="drawing-cad-fields" disabled={!settings || !selected || !controls.canEditSelection || protectedSelection}>
        <Field label={label('dimensionKind')}><select value={direction} onChange={event => setDirection(event.target.value as typeof direction)}>
          {(['horizontal', 'vertical', 'aligned'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></Field>
        <button type="button" onClick={() => settings && perform(createCadDimension(editor, settings, direction), 'dimensionCreated')}>{label('addDimension')}</button>
      </fieldset>
      <p className="drawing-help">{label('dimensionHelp')}</p>
      <form onSubmit={event => { event.preventDefault(); if (settings && selected && numeric(known) > 0) perform(calibrateCadSelection(editor, numeric(known), axis, settings), 'calibrated'); }}>
        <fieldset className="drawing-cad-fields" disabled={!settings || !selected || controls.readOnly}>
          <Field label={label('calibrateAxis')}><select value={axis} onChange={event => setAxis(event.target.value as typeof axis)}>
            <option value="width">{label('width')}</option><option value="height">{label('height')}</option>
          </select></Field>
          <Field label={`${label('knownLength')} (${unit})`}><input type="number" min="0.000001" step="any" value={known} required aria-invalid={knownInvalid} aria-describedby={knownInvalid ? knownErrorId : undefined} onChange={event => setKnown(event.target.value)} /></Field>
          <button type="submit" disabled={!Number.isFinite(numeric(known)) || numeric(known) <= 0}>{label('calibrate')}</button>
        </fieldset>
      </form>
      {knownInvalid && <p id={knownErrorId} className="drawing-help is-error" role="alert">{label('invalidLength')}</p>}
      <p className="drawing-help">{label('calibrateHelp')}</p>
    </details>
    </div>
    <div hidden={task !== 'draw'}><GeometryForm settings={settings} disabled={controls.readOnly} /></div>
    <div hidden={task !== 'edit'}>
      <PathVertices settings={settings} disabled={!controls.canEditSelection} />
      <ArcFields settings={settings} disabled={!controls.canEditSelection} />
    </div>
    <CadAdvancedPanel settings={settings} focusRequest={focusRequest} task={task} />
    <div hidden={task !== 'files'}><DxfExport settings={settings} /></div>
  </div>;
}

type GeometryKind = 'rectangle' | 'ellipse' | 'circle' | 'line' | 'arc' | 'polyline';
function GeometryForm({ settings, disabled }: { settings: CadSettings | null; disabled: boolean }) {
  const editor = useEditor(); const { label } = useCadText();
  const [kind, setKind] = useState<GeometryKind>('rectangle');
  const [values, setValues] = useState({ x: '0', y: '0', width: '100', height: '50', radius: '25', length: '100', angle: '0', rotation: '0', startAngle: '0', endAngle: '90' });
  const [vertices, setVertices] = useState('0,0\n100,0\n100,50');
  const previousUnit = useRef(settings?.unit ?? 'mm');
  useEffect(() => {
    const unit = settings?.unit ?? 'mm', factor = unitMm(previousUnit.current) / unitMm(unit);
    previousUnit.current = unit;
    if (factor === 1) return;
    const convert = (text: string) => Number.isFinite(numeric(text)) ? String(Number((numeric(text) * factor).toPrecision(14))) : text;
    setValues(current => ({ ...current, ...Object.fromEntries(['x', 'y', 'width', 'height', 'radius', 'length'].map(key => [key, convert(current[key as keyof typeof current])])) }));
    setVertices(current => current.split('\n').map(line => { const pair = line.split(','); return pair.length === 2 ? pair.map(convert).join(',') : line; }).join('\n'));
  }, [settings?.unit]);
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState<CadLabel | ''>('');
  const errorId = useId();
  const fields: (keyof typeof values)[] = kind === 'polyline' ? [] : ['x', 'y', ...(kind === 'line' ? ['length', 'angle'] as const : kind === 'arc' ? ['radius', 'startAngle', 'endAngle'] as const : kind === 'circle' ? ['radius'] as const : ['width', 'height', 'rotation'] as const)];
  const points = parsePoints(vertices, closed);
  const isPositive = (field: string) => ['width', 'height', 'length', 'radius'].includes(field);
  const valid = kind === 'polyline' ? !!points : fields.every(field => Number.isFinite(numeric(values[field])) && Math.abs(numeric(values[field])) <= 1_000_000 && (!isPositive(field) || numeric(values[field]) > 0)) &&
    (kind !== 'arc' || numeric(values.endAngle) - numeric(values.startAngle) > 0 && numeric(values.endAngle) - numeric(values.startAngle) < 360);
  return <details className="drawing-cad-section">
    <summary>{label('create')}</summary>
    <form onSubmit={event => {
      event.preventDefault(); if (!valid || !settings) return;
      const n = (key: keyof typeof values) => numeric(values[key]);
      let input: CadGeometryInput;
      if (kind === 'polyline') input = { kind, points: points!, closed };
      else if (kind === 'line') input = { kind, x: n('x'), y: n('y'), length: n('length'), angle: n('angle') };
      else if (kind === 'arc') input = { kind, x: n('x'), y: n('y'), radius: n('radius'), startAngle: n('startAngle'), endAngle: n('endAngle') };
      else if (kind === 'circle') input = { kind: 'ellipse', x: n('x') - n('radius'), y: n('y') - n('radius'), width: n('radius') * 2, height: n('radius') * 2 };
      else input = { kind, x: n('x'), y: n('y'), width: n('width'), height: n('height'), rotation: n('rotation') };
      setMessage(createCadGeometry(editor, input, settings) ? 'created' : 'failed');
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings} aria-describedby={errorId}>
        <Field label={label('kind')}><select value={kind} onChange={event => { setKind(event.target.value as GeometryKind); setMessage(''); }}>
          {(['rectangle', 'ellipse', 'circle', 'line', 'arc', 'polyline'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></Field>
        {fields.map(field => <Field key={field} label={`${label(field)}${['angle', 'rotation', 'startAngle', 'endAngle'].includes(field) ? '' : ` (${settings?.unit ?? 'mm'})`}`}>
          <input type="number" step="any" required value={values[field]} min={isPositive(field) ? 0.000001 : undefined} aria-invalid={!Number.isFinite(numeric(values[field])) || isPositive(field) && numeric(values[field]) <= 0}
            onChange={event => { setValues(previous => ({ ...previous, [field]: event.target.value })); setMessage(''); }} />
        </Field>)}
        {kind === 'polyline' && <>
          <label className="drawing-cad-points"><span>{label('points')} ({settings?.unit ?? 'mm'})</span><textarea value={vertices} rows={5} maxLength={16384} spellCheck={false} aria-invalid={!points} onChange={event => { setVertices(event.target.value); setMessage(''); }} /></label>
          <label className="drawing-cad-check"><input type="checkbox" checked={closed} onChange={event => { setClosed(event.target.checked); setMessage(''); }} /><span>{label('closed')}</span></label>
        </>}
        <button type="submit" disabled={!valid} data-testid="drawing-cad-create">{label('createObject')}</button>
      </fieldset>
      <p id={errorId} className={`drawing-help${settings && !valid ? ' is-error' : ''}`} role={settings && !valid ? 'alert' : undefined}>
        {kind === 'polyline' ? label(valid ? 'pointsHelp' : 'invalidPoints') : label(valid ? 'geometryHelp' : 'invalidGeometry')}
      </p>
      <Message text={message ? label(message) : ''} error={message === 'failed'} />
    </form>
  </details>;
}

function PathVertices({ settings, disabled }: { settings: CadSettings | null; disabled: boolean }) {
  const editor = useEditor(); const { label } = useCadText();
  const selected = useValue('cad path vertex editor', () => settings ? getCadPathPoints(editor, settings) : null, [editor, settings]);
  const selectedId = useValue('cad path selection', () => editor.getOnlySelectedShape()?.id ?? '', [editor]);
  const canConvert = useValue('cad straight line', () => { const shape = editor.getOnlySelectedShape(); return shape?.type === 'line' && (shape.props as { spline?: string }).spline === 'line'; }, [editor]);
  const signature = JSON.stringify([selectedId, selected]);
  const [text, setText] = useState(''); const [closed, setClosed] = useState(false); const [message, setMessage] = useState<CadLabel | ''>('');
  const errorId = useId();
  useEffect(() => {
    // Keep enough digits to avoid rounding untouched vertices during a node edit.
    setText(selected ? selected.points.map(point => `${Number(point.x.toPrecision(14))},${Number(point.y.toPrecision(14))}`).join('\n') : '');
    setClosed(selected?.closed ?? false); setMessage('');
  }, [signature]);
  const points = parsePoints(text, closed);
  return <details className="drawing-cad-section">
    <summary>{label('editPoints')}</summary>
    {!selected ? <><p className="drawing-help">{label('noPath')}</p>
      {canConvert && <><button type="button" disabled={disabled || !settings} onClick={() => setMessage(convertSelectionToCadPath(editor) ? 'converted' : 'failed')}>{label('convertPath')}</button><p className="drawing-help">{label('copyContourHelp')}</p></>}
      <Message text={message ? label(message) : ''} error={message === 'failed'} />
    </> : <form onSubmit={event => { event.preventDefault(); if (points && settings) setMessage(updateCadPathPoints(editor, points, closed, settings) ? 'pointsUpdated' : 'failed'); }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings} aria-describedby={errorId}>
        <label className="drawing-cad-points"><span>{label('points')} ({settings?.unit})</span><textarea rows={6} maxLength={16384} value={text} aria-invalid={!points} spellCheck={false} onChange={event => { setText(event.target.value); setMessage(''); }} /></label>
        <label className="drawing-cad-check"><input type="checkbox" checked={closed} onChange={event => { setClosed(event.target.checked); setMessage(''); }} /><span>{label('closed')}</span></label>
        <button type="submit" disabled={!points}>{label('updatePoints')}</button>
      </fieldset>
      <p id={errorId} className={`drawing-help${!points ? ' is-error' : ''}`} role={!points ? 'alert' : undefined}>{label(points ? 'pointsHelp' : 'invalidPoints')}</p>
      <Message text={message ? label(message) : ''} error={message === 'failed'} />
    </form>}
  </details>;
}

function ArcFields({ settings, disabled }: { settings: CadSettings | null; disabled: boolean }) {
  const editor = useEditor(); const { label } = useCadText(); const errorId = useId();
  const selected = useValue('cad selected arc', () => settings ? getCadArc(editor, settings) : null, [editor, settings]);
  const selectedId = useValue('cad arc selection', () => editor.getOnlySelectedShape()?.id ?? '', [editor]);
  const signature = JSON.stringify([selectedId, selected]);
  const [values, setValues] = useState({ x: '', y: '', radius: '', startAngle: '', endAngle: '' });
  const [message, setMessage] = useState<CadLabel | ''>('');
  useEffect(() => {
    if (selected) setValues({ x: String(Number(selected.x.toPrecision(14))), y: String(Number(selected.y.toPrecision(14))), radius: String(Number(selected.radius.toPrecision(14))), startAngle: String(selected.startAngle), endAngle: String(selected.endAngle) });
    setMessage('');
  }, [signature]);
  const valid = Object.values(values).every(value => Number.isFinite(numeric(value))) && numeric(values.radius) > 0 && numeric(values.endAngle) - numeric(values.startAngle) > 0 && numeric(values.endAngle) - numeric(values.startAngle) < 360;
  return <details className="drawing-cad-section">
    <summary>{label('arcEdit')}</summary>
    {!selected ? <p className="drawing-help">{label('noArc')}</p> : <form onSubmit={event => {
      event.preventDefault(); if (!valid || !settings) return;
      setMessage(updateCadArc(editor, { x: numeric(values.x), y: numeric(values.y), radius: numeric(values.radius), startAngle: numeric(values.startAngle), endAngle: numeric(values.endAngle) }, settings) ? 'arcUpdated' : 'failed');
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings} aria-describedby={!valid ? errorId : undefined}>
        {(['x', 'y', 'radius', 'startAngle', 'endAngle'] as const).map(key => <Field key={key} label={`${label(key)}${['x', 'y', 'radius'].includes(key) ? ` (${settings?.unit})` : ''}`}>
          <input type="number" value={values[key]} required step="any" min={key === 'radius' ? 0.000001 : undefined} aria-invalid={!Number.isFinite(numeric(values[key])) || key === 'radius' && numeric(values.radius) <= 0}
            onChange={event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setMessage(''); }} />
        </Field>)}
        <button type="submit" disabled={!valid}>{label('updateArc')}</button>
      </fieldset>
      {!valid && <p id={errorId} className="drawing-help is-error" role="alert">{label('invalidGeometry')}</p>}
      <Message text={message ? label(message) : ''} error={message === 'failed'} />
    </form>}
  </details>;
}

function DxfExport({ settings }: { settings: CadSettings | null }) {
  const editor = useEditor(); const { label } = useCadText();
  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [curves, setCurves] = useState<'spline' | 'polyline'>('spline');
  const [tolerance, setTolerance] = useState('0.01');
  const toleranceErrorId = useId();
  const validTolerance = Number.isFinite(numeric(tolerance)) && numeric(tolerance) >= 0.001 && numeric(tolerance) <= 1;
  const validOptions = curves === 'spline' || validTolerance;
  const optionsKey = JSON.stringify([curves, tolerance]);
  const [report, setReport] = useState<{ data: ReturnType<typeof buildCadDxf>; revision: string; scope: 'selected' | 'all'; optionsKey: string; curves: 'spline' | 'polyline'; toleranceMm: number } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<CadLabel | ''>('');
  const revision = useValue('cad dxf source revision', () => JSON.stringify([editor.getCurrentPage().id, editor.getCurrentPageShapesSorted(), editor.getSelectedShapeIds(), settings]), [editor, settings]);
  const hasObjects = useValue('cad dxf scope availability', () => scope === 'selected' ? !!editor.getSelectedShapeIds().length : !!editor.getCurrentPageShapeIds().size, [editor, scope]);
  const stale = !!report && (report.revision !== revision || report.scope !== scope || report.optionsKey !== optionsKey);
  const reasonLabels: Record<string, CadLabel> = { unsupported: 'unsupported', text: 'annotation', annotation: 'annotation', form: 'form', invalid: 'invalid', curved: 'curved', clipped: 'clipped', empty: 'empty' };
  function prepare() {
    if (!settings || !validOptions) return;
    setAcknowledged(false); setMessage('');
    const toleranceMm = validTolerance ? numeric(tolerance) : 0.01;
    try { setReport({ data: buildCadDxf(editor, scope, settings, { curves, toleranceMm }), revision, scope, optionsKey, curves, toleranceMm }); }
    catch (error) { setReport(null); setMessage((error as { code?: string })?.code === 'empty' ? 'noEntities' : 'exportFailed'); }
  }
  function download() {
    if (!report || stale || !report.data.entities || report.data.omitted.length && !acknowledged) return;
    try {
      const url = URL.createObjectURL(new Blob([report.data.text], { type: 'application/dxf' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'oms-drawing-mm.dxf'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000); setMessage('exported');
    } catch { setMessage('exportFailed'); }
  }
  return <details className="drawing-cad-section" open>
    <summary>{label('dxf')}</summary>
    <p className="drawing-help">{label('dxfHelp')}</p>
    <div className="drawing-cad-fields">
      <Field label={label('exportScope')}><select value={scope} onChange={event => { setScope(event.target.value as typeof scope); setAcknowledged(false); setMessage(''); }}>
        <option value="selected">{label('selected')}</option><option value="all">{label('all')}</option>
      </select></Field>
      <Field label={label('curveExport')}><select value={curves} onChange={event => { setCurves(event.target.value as typeof curves); setAcknowledged(false); setMessage(''); }}>
        <option value="spline">{label('splineExport')}</option><option value="polyline">{label('polylineExport')}</option>
      </select></Field>
      <Field label={label('exportTolerance')}><input type="number" min="0.001" max="1" step="any" value={tolerance} disabled={curves === 'spline'} aria-invalid={curves === 'polyline' && !validTolerance} aria-describedby={curves === 'polyline' && !validTolerance ? toleranceErrorId : undefined} onChange={event => { setTolerance(event.target.value); setAcknowledged(false); setMessage(''); }} /></Field>
      <p className="drawing-help">{label(curves === 'spline' ? 'splineExportHelp' : 'polylineExportHelp')}</p>
      {curves === 'polyline' && !validTolerance && <p id={toleranceErrorId} className="drawing-help is-error" role="alert">{label('exportToleranceInvalid')}</p>}
      <button type="button" disabled={!settings || !hasObjects || !validOptions} onClick={prepare} data-testid="drawing-cad-review">{label('review')}</button>
    </div>
    {report && <div className="drawing-cad-report" data-testid="drawing-cad-report">
      <dl className="drawing-cad-values">
        <dt>{label('curveExport')}</dt><dd>{label(report.curves === 'spline' ? 'splineExport' : 'polylineExport')}</dd>
        {report.curves === 'polyline' && <><dt>{label('exportTolerance')}</dt><dd>{format(report.toleranceMm, 4)}</dd></>}
        <dt>{label('entities')}</dt><dd>{report.data.entities}</dd>
        <dt>{label('closedContours')}</dt><dd>{report.data.closedContours}</dd>
        <dt>{label('openContours')}</dt><dd>{report.data.openContours}</dd>
        <dt>{label('dimensions')}</dt><dd>{format(report.data.widthMm, 4)} × {format(report.data.heightMm, 4)}</dd>
        <dt>{label('omitted')}</dt><dd>{report.data.omitted.length}</dd>
      </dl>
      {report.data.omitted.length ? <>
        <ul className="drawing-cad-omissions">{report.data.omitted.map(item => <li key={item.id}><strong>{item.name}</strong><span>{label(reasonLabels[item.reason] ?? 'unsupported')}</span></li>)}</ul>
        <label className="drawing-cad-check"><input type="checkbox" checked={acknowledged} disabled={stale} onChange={event => setAcknowledged(event.target.checked)} /><span>{label('acknowledge')}</span></label>
      </> : <p className="drawing-help">{label('noOmissions')}</p>}
      {stale && <Message text={label('stale')} error />}
      {!report.data.entities && <Message text={label('noEntities')} error />}
      <button type="button" disabled={stale || !report.data.entities || !!report.data.omitted.length && !acknowledged} onClick={download} data-testid="drawing-cad-download">{label('download')}</button>
    </div>}
    <Message text={message ? label(message) : ''} error={message === 'exportFailed' || message === 'noEntities'} />
  </details>;
}
