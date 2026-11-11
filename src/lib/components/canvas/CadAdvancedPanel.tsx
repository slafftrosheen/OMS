import { RasterTrace, VectorImport, VectorExport, CornerControls, VectorPaintControls, PolygonControls } from './CadVectorPanel';
import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useEditor, useValue, type Editor } from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';
import { drawingObjectName } from './drawing-operations';
import { useCadAdvancedText, type CadAdvancedLabel } from './cad-advanced-copy';
import { unitMm, type CadSettings, type CadUnit } from './cad-settings';
import { curveBounds, curvePathData, type CadBezierNode } from './cad-curves';
import { applyCadPlan, cadRevision, type CadPlan } from './cad-plans';
import { getCadCurveSelection, updateCadCurveNode, splitCadCurveSegment, deleteCadCurveNode, setCadCurveClosed, convertSelectionToCurves, reverseCadContour, setCadContourStart, breakCadCurveAtNode, setCadSegmentKind } from './cad-editing';
import { prepareCadJoin, type CadJoinOptions, type CadJoinPlan } from './cad-join';
import { applyCadCompound } from './cad-compound';
import { prepareCadShaping } from './cad-shaping';
import { decodeDxf } from './cad-dxf-decode';
import { prepareCadText, getCadFont, DEFAULT_TEXT_LAYOUT, type CadTextLayout } from './cad-text';
import { prepareCadImport, type CadImportPlan } from './cad-import';

export type CadFocusRequest = { section: 'nodes' | 'convert' | 'lettering' | 'document' | 'files' | 'shaping' | 'join' | 'trace' | 'paint'; sequence: number };
type SharedProps = { settings: CadSettings | null; revision: string; disabled: boolean };
type Review<T extends CadPlan = CadPlan> = { plan: T; inputKey: string };
const FILE_LIMIT = 8 * 1024 * 1024;
const number = (value: string) => value.trim() ? Number(value) : NaN;
const format = (value: number) => Number(value.toFixed(4)).toString();
const nodeFields = ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const;
function protectedSelection(editor: Editor) {
  return [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])].some(id => ['order-details', 'order-address', 'profile-7st'].includes(editor.getShape(id)?.type ?? ''));
}
function canChange(editor: Editor, selection = true) {
  const controls = captureToolkitControls(editor);
  return !controls.readOnly && (!selection || controls.canEditSelection && !protectedSelection(editor));
}
function errorLabel(error: unknown, fallback: CadAdvancedLabel = 'failed'): CadAdvancedLabel {
  const code = (error as { code?: string })?.code ?? (error as Error)?.message;
  return ({ 'join-selection': 'joinHelp', 'join-gap': 'joinGapError', 'fill-rule': 'compoundFailed', empty: 'empty', readonly: 'blocked', locked: 'blocked', font: 'invalidFont', 'missing-glyph': 'unsupportedFont', unit: 'unitRequired', format: 'invalidDxf', unsupported: 'unsupported', stale: 'stale', geometry: 'invalid', selection: 'selectionHelp', open: 'selectionHelp', limit: 'limit', capacity: 'limit', bound: 'bound' } as Record<string, CadAdvancedLabel>)[code ?? ''] ?? fallback;
}
function warningLabel(code: string): CadAdvancedLabel {
  return ({ 'join-arc-approximation': 'joinApproximation', 'curves-approximated': 'approximated', 'import-curves-approximated': 'importApproximation', 'import-font-substitution':'importFontSubstitution', 'import-3d-projection':'import3dProjection', 'import-elevation': 'importElevation', 'import-dimension': 'importDimension', 'import-hatch-boundary': 'importHatchBoundary', 'sources-overlap': 'sourcesOverlap', 'text-layout-review': 'textLayoutReview', 'font-outline-only': 'fontOutlineOnly' } as Record<string, CadAdvancedLabel>)[code] ?? 'unrecognizedWarning';
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="drawing-cad-field"><span>{label}</span>{children}</label>;
}
function Message({ value, error = false }: { value: CadAdvancedLabel | ''; error?: boolean }) {
  const { label } = useCadAdvancedText();
  return value ? <p className={`drawing-help drawing-cad-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{label(value)}</p> : null;
}
function useUnitDraft(settings: CadSettings | null, initial: Record<string, string>) {
  const [values, setValues] = useState(initial);
  const previousUnit = useRef(settings?.unit ?? 'mm');
  useEffect(() => {
    const unit = settings?.unit ?? 'mm'; const factor = unitMm(previousUnit.current) / unitMm(unit);
    previousUnit.current = unit;
    if (factor !== 1) setValues(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, Number.isFinite(number(value)) ? String(Number((number(value) * factor).toPrecision(14))) : value])));
  }, [settings?.unit]);
  return [values, setValues] as const;
}
function useFocusSection(ref: React.RefObject<HTMLDetailsElement>, active: boolean, sequence?: number) {
  const consumed = useRef<number>();
  useEffect(() => {
    if (sequence === consumed.current || !active || !ref.current) return;
    consumed.current = sequence;
    ref.current.open = true;
    ref.current.querySelector<HTMLElement>('summary')?.focus();
    ref.current.scrollIntoView({ block: 'nearest' });
  }, [active, sequence]);
}

/** Shared advanced CAD controls for the order and idea workspace docker. */
export function CadAdvancedPanel({ settings, focusRequest, task }: { settings: CadSettings | null; focusRequest?: CadFocusRequest; task: 'draw' | 'edit' | 'document' | 'files' | 'trace' }) {
  const editor = useEditor();
  const state = useValue('advanced cad permissions', () => ({ controls: captureToolkitControls(editor), protected: protectedSelection(editor), text: editor.getOnlySelectedShape()?.type === 'text' }), [editor]);
  const revision = useValue('advanced cad revision', () => cadRevision(editor), [editor]);
  const disabled = !state.controls.canEditSelection || state.protected;
  return <>
    {!settings && <Message value="settingsRequired" />}
    {(state.controls.readOnly || state.controls.selectionLocked || state.protected) && <Message value="blocked" />}
    <div hidden={task !== 'edit'}>
    <VectorPaintControls settings={settings} revision={revision} disabled={disabled} focusSequence={focusRequest?.section === 'paint' ? focusRequest.sequence : undefined} />
    <CornerControls settings={settings} revision={revision} disabled={disabled} />
    <CompoundControls disabled={disabled || !settings} settings={settings} />
    <CurveNodes settings={settings} revision={revision} disabled={disabled} focus={task === 'edit' && (focusRequest?.section === 'nodes' || focusRequest?.section === 'convert' && !state.text)} sequence={focusRequest?.sequence} />
    <JoinCurves settings={settings} revision={revision} disabled={disabled} focus={task === 'edit' && focusRequest?.section === 'join'} sequence={focusRequest?.sequence} />
    <Shaping settings={settings} revision={revision} disabled={disabled} focus={task === 'edit' && focusRequest?.section === 'shaping'} sequence={focusRequest?.sequence} />
    </div><div hidden={task !== 'draw'}>
    <PolygonControls settings={settings} revision={revision} disabled={state.controls.readOnly} />
    <TextOutlines settings={settings} revision={revision} disabled={state.controls.readOnly} focus={task === 'draw' && (focusRequest?.section === 'lettering' || focusRequest?.section === 'convert' && state.text)} newText={focusRequest?.section === 'lettering'} sequence={focusRequest?.sequence} />
    </div><div hidden={task !== 'files'}>
    <VectorImport settings={settings} revision={revision} disabled={state.controls.readOnly} />
    <VectorExport settings={settings} revision={revision} disabled={state.controls.readOnly} />
    <DxfImport settings={settings} revision={revision} disabled={state.controls.readOnly} />
    </div><div hidden={task !== 'trace'}><RasterTrace settings={settings} revision={revision} disabled={state.controls.readOnly} /></div>
  </>;
}

function CompoundControls({ settings, disabled }: { settings: CadSettings | null; disabled: boolean }) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const [failed, setFailed] = useState(false);
  return <section className="drawing-cad-section" aria-label={label('compound')}>
    <div className="drawing-cad-actions">{(['combine', 'breakApart'] as const).map(operation =>
      <button key={operation} type="button" disabled={disabled} data-testid={`drawing-cad-${operation}`}
        onClick={() => setFailed(!settings || !applyCadCompound(editor, settings, operation))}>{label(operation)}</button>)}</div>
    <p className="drawing-help">{label('compoundHelp')}</p>
    {failed && <Message value="compoundFailed" error />}
  </section>;
}

function PlanReview({ review, inputKey, revision, disabled, onApplied, blocked = false, children }: {
  review: Review; inputKey: string; revision: string; disabled: boolean; onApplied: (success: boolean) => void; blocked?: boolean; children?: ReactNode;
}) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const plan = review.plan; const stale = plan.revision !== revision || review.inputKey !== inputKey;
  const bounds = curveBounds(plan.contours);
  const padding = Math.max(bounds.w, bounds.h, 1) * 0.06;
  const closed = plan.contours.filter(contour => contour.closed).length;
  const hasGeometry = plan.contours.length > 0;
  const path = hasGeometry ? curvePathData(plan.contours) : '';
  return <div className="drawing-cad-report drawing-cad-plan" data-testid="drawing-cad-plan">
    <p className="drawing-cad-preview-title">{label('result')}</p>
    {hasGeometry && <svg className="drawing-cad-preview" role="img" aria-label={label('result')} viewBox={`${bounds.x - padding} ${bounds.y - padding} ${Math.max(bounds.w, 0.001) + padding * 2} ${Math.max(bounds.h, 0.001) + padding * 2}`}>
      <path d={path} className={closed === plan.contours.length ? 'is-closed' : undefined} fillRule={plan.fillRule ?? 'evenodd'} vectorEffect="non-scaling-stroke" />
    </svg>}
    <dl className="drawing-cad-values">
      <dt>{label('contours')}</dt><dd>{plan.contours.length}</dd>
      <dt>{label('closedContours')}</dt><dd>{closed}</dd>
      <dt>{label('openContours')}</dt><dd>{plan.contours.length - closed}</dd>
      <dt>{label('nodeCount')}</dt><dd>{plan.contours.reduce((sum, contour) => sum + contour.nodes.length, 0)}</dd>
      <dt>{label('bounds')}</dt><dd>{format(plan.widthMm)} × {format(plan.heightMm)}</dd>
      <dt>{label('removed')}</dt><dd>{plan.removeIds.length}</dd>
    </dl>
    {!!plan.warnings.length && <ul className="drawing-cad-warnings" aria-label={label('warning')}>{plan.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{label(warningLabel(warning))}</li>)}</ul>}
    {children}
    {stale && <Message value="stale" error />}
    {!hasGeometry && <Message value="empty" error />}
    <button type="button" data-testid="drawing-cad-apply-plan" disabled={disabled || blocked || stale || !hasGeometry} onClick={() => {
      if (disabled || blocked || stale || !hasGeometry || !canChange(editor, plan.sourceIds.length > 0) || cadRevision(editor) !== plan.revision) { onApplied(false); return; }
      onApplied(applyCadPlan(editor, plan));
    }}>{label('apply')}</button>
  </div>;
}

function CurveNodes({ settings, disabled, focus, sequence }: SharedProps & { focus: boolean; sequence?: number }) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const section = useRef<HTMLDetailsElement>(null); useFocusSection(section, focus, sequence);
  const selected = useValue('advanced curve nodes', () => settings ? getCadCurveSelection(editor, settings) : null, [editor, settings]);
  const selectedType = useValue('advanced curve conversion type', () => editor.getOnlySelectedShape()?.type, [editor]);
  const [contourIndex, setContourIndex] = useState(0); const [nodeIndex, setNodeIndex] = useState(0);
  const [values, setValues] = useState<Record<(typeof nodeFields)[number], string>>({ x: '', y: '', inX: '', inY: '', outX: '', outY: '' });
  const [mode, setMode] = useState<CadBezierNode['mode']>('corner'); const [message, setMessage] = useState<CadAdvancedLabel | ''>('');
  const [failed, setFailed] = useState(false); const errorId = useId();
  const contour = selected?.contours[Math.min(contourIndex, selected.contours.length - 1)];
  const node = contour?.nodes[Math.min(nodeIndex, contour.nodes.length - 1)];
  const signature = JSON.stringify([selected?.id, node, settings?.unit]);
  useEffect(() => { setContourIndex(0); setNodeIndex(0); }, [selected?.id]);
  useEffect(() => { if (selected && contourIndex >= selected.contours.length) setContourIndex(0); if (contour && nodeIndex >= contour.nodes.length) setNodeIndex(0); }, [selected, contour, contourIndex, nodeIndex]);
  useEffect(() => {
    if (node) { setValues(Object.fromEntries(nodeFields.map(key => [key, String(Number(node[key].toPrecision(14)))])) as typeof values); setMode(node.mode); }
  }, [signature]);
  const valid = nodeFields.every(key => Number.isFinite(number(values[key])) && Math.abs(number(values[key])) <= 1_000_000);
  function result(success: boolean, key: CadAdvancedLabel = 'updated') { setFailed(!success); setMessage(success ? key : 'failed'); }
  const hasNext = !!contour && (contour.closed || nodeIndex < contour.nodes.length - 1);
  const next = hasNext ? contour?.nodes[(nodeIndex + 1) % contour.nodes.length] : undefined;
  const isStraight = !!node && !!next && !node.outX && !node.outY && !next.inX && !next.inY;
  const canConvert = !selected && selectedType !== 'text';
  return <details ref={section} className="drawing-cad-section" data-testid="drawing-cad-nodes">
    <summary>{label('nodes')}</summary>
    {!selected || !contour || !node ? <>
      <p className="drawing-help">{label('noCurve')}</p>
      <p className="drawing-help">{label('convertHelp')}</p>
      <button type="button" disabled={disabled || !settings || !canConvert} onClick={() => { if (settings && canChange(editor)) result(convertSelectionToCurves(editor, settings), 'converted'); }}>{label('convert')}</button>
    </> : <form onSubmit={event => {
      event.preventDefault(); if (!valid || !settings || disabled || !canChange(editor)) return;
      const next = { ...Object.fromEntries(nodeFields.map(key => [key, number(values[key])])), mode } as CadBezierNode;
      result(updateCadCurveNode(editor, settings, contourIndex, nodeIndex, next));
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings} aria-describedby={errorId}>
        <Field label={label('contour')}><select value={contourIndex} onChange={event => { setContourIndex(Number(event.target.value)); setNodeIndex(0); setMessage(''); }}>
          {selected.contours.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select></Field>
        <Field label={label('node')}><select value={nodeIndex} onChange={event => { setNodeIndex(Number(event.target.value)); setMessage(''); }}>
          {contour.nodes.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}
        </select></Field>
        <Field label={label('mode')}><select value={mode} onChange={event => { setMode(event.target.value as CadBezierNode['mode']); setMessage(''); }}>
          {(['corner', 'smooth', 'symmetric'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></Field>
        {nodeFields.map(key => <Field key={key} label={`${label(key)} (${settings?.unit ?? 'mm'})`}><input type="number" step="any" required value={values[key]} aria-invalid={!Number.isFinite(number(values[key])) || Math.abs(number(values[key])) > 1_000_000} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setMessage(''); }} /></Field>)}
        <button type="submit" disabled={!valid}>{label('updateNode')}</button>
        <details className="drawing-node-tools" open><summary>{label('segmentTools')}</summary>
        <div className="drawing-cad-actions">
          <button type="button" disabled={!hasNext || isStraight} onClick={() => { if (canChange(editor)) result(setCadSegmentKind(editor, contourIndex, nodeIndex, 'line')); }}>{label('toLine')}</button>
          <button type="button" disabled={!hasNext || !isStraight} onClick={() => { if (canChange(editor)) result(setCadSegmentKind(editor, contourIndex, nodeIndex, 'curve')); }}>{label('toCurve')}</button>
          <button type="button" disabled={!contour.closed && nodeIndex === contour.nodes.length - 1} onClick={() => { if (canChange(editor)) result(splitCadCurveSegment(editor, contourIndex, nodeIndex)); }}>{label('split')}</button>
          <button type="button" disabled={contour.nodes.length <= 2} onClick={() => { if (canChange(editor)) result(deleteCadCurveNode(editor, contourIndex, nodeIndex)); }}>{label('deleteNode')}</button>
        </div></details>
        <details className="drawing-node-tools"><summary>{label('contourTools')}</summary>
        <div className="drawing-cad-actions">
          <button type="button" disabled={!contour.closed && (nodeIndex === 0 || nodeIndex === contour.nodes.length - 1)} onClick={() => { if (canChange(editor)) { result(breakCadCurveAtNode(editor, contourIndex, nodeIndex)); setNodeIndex(0); } }}>{label('breakNode')}</button>
          <button type="button" onClick={() => { if (canChange(editor)) { result(reverseCadContour(editor, contourIndex)); setNodeIndex(0); } }}>{label('reverse')}</button>
          <button type="button" disabled={!contour.closed || nodeIndex === 0} onClick={() => { if (canChange(editor)) { result(setCadContourStart(editor, contourIndex, nodeIndex)); setNodeIndex(0); } }}>{label('startNode')}</button>
        </div>
        <p className="drawing-help">{label('breakNodeHelp')}</p>
        <p className="drawing-help">{label('directionHelp')}</p>
        <label className="drawing-cad-check"><input type="checkbox" checked={contour.closed} disabled={!contour.closed && contour.nodes.length < 2} onChange={event => { if (canChange(editor)) result(setCadCurveClosed(editor, contourIndex, event.target.checked)); }} /><span>{label('closed')}</span></label>
        </details>
      </fieldset>
      <p id={errorId} className={`drawing-help${!valid ? ' is-error' : ''}`} role={!valid ? 'alert' : undefined}>{label(valid ? 'nodeHelp' : 'invalid')}</p>
    </form>}
    <Message value={message} error={failed} />
  </details>;
}

function TextOutlines({ settings, revision, disabled, focus, newText, sequence }: SharedProps & { focus: boolean; newText: boolean; sequence?: number }) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const section = useRef<HTMLDetailsElement>(null); useFocusSection(section, focus, sequence);
  const source = useValue('outline text source', () => { const shape = editor.getOnlySelectedShape(); return shape?.type === 'text' ? { id: shape.id, editable: canChange(editor) } : null; }, [editor]);
  const [mode, setMode] = useState<'new' | 'selected'>('new'); const [text, setText] = useState('');
  const [font, setFont] = useState<'sans' | 'serif' | 'mono' | 'draw' | 'custom'>('sans');
  const [fontData, setFontData] = useState<ArrayBuffer>(); const [fontName, setFontName] = useState('');
  const [values, setValues] = useUnitDraft(settings, { height: '20', x: '0', y: '0' });
  const [alignment, setAlignment] = useState<CadTextLayout['align']>('start');
  const [tracking, setTracking] = useState(String(DEFAULT_TEXT_LAYOUT.letterSpacing)), [lineHeight, setLineHeight] = useState(String(DEFAULT_TEXT_LAYOUT.lineHeight));
  const [keepSource, setKeepSource] = useState(true); const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState<CadAdvancedLabel | ''>(''); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false);
  const request = useRef(0); const fontRequest = useRef(0); const alive = useRef(true); const fontVersion = useRef(0);
  const [fontBusy, setFontBusy] = useState(false); const consumedFocus = useRef<number>();
  const inputKey = JSON.stringify([mode, source?.id, text, font, fontName, fontVersion.current, values, alignment, tracking, lineHeight, keepSource, settings]);
  const currentKey = useRef(inputKey); currentKey.current = inputKey;
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => {
    if (!focus || sequence === consumedFocus.current) return;
    consumedFocus.current = sequence;
    setMode(newText ? 'new' : 'selected');
  }, [focus, newText, sequence]);
  useEffect(() => { request.current++; setBusy(false); }, [revision, inputKey]);
  const valid = mode === 'selected' ? !!source?.editable : text.trim().length > 0 && [...text].length <= 500 && text.split('\n').length <= 20 && Object.values(values).every(value => Number.isFinite(number(value)) && Math.abs(number(value)) <= 1_000_000) && number(values.height) > 0 && (font !== 'custom' || !!fontData) && number(tracking) >= -50 && number(tracking) <= 200 && number(lineHeight) >= 0.5 && number(lineHeight) <= 5;
  async function readFont(file?: File) {
    const id = ++fontRequest.current; setFontData(undefined); setFontName(''); setReview(null); setMessage('');
    if (!file) return;
    if (file.size > FILE_LIMIT || !/\.(ttf|otf|woff2?)$/i.test(file.name)) { setFailed(true); setMessage(file.size > FILE_LIMIT ? 'fileTooLarge' : 'invalidFont'); return; }
    setFontBusy(true);
    try {
      const data = await file.arrayBuffer();
      if (!alive.current || id !== fontRequest.current || !canChange(editor, false)) return;
      fontVersion.current++; setFontData(data); setFontName(file.name);
    } catch { if (alive.current && id === fontRequest.current) { setFailed(true); setMessage('invalidFont'); } }
    finally { if (alive.current && id === fontRequest.current) setFontBusy(false); }
  }
  async function prepare() {
    if (!settings || !valid || disabled || !canChange(editor, mode === 'selected')) return;
    const id = ++request.current; const key = inputKey; const before = cadRevision(editor); setBusy(true); setReview(null); setMessage('');
    try {
      const plan = await prepareCadText(editor, settings, { text, font, fontData: font === 'custom' ? fontData : undefined, height: number(values.height), x: number(values.x), y: number(values.y), keepSource, sourceId: mode === 'selected' ? source?.id : undefined, layout: { align: alignment, letterSpacing: number(tracking), lineHeight: number(lineHeight) } });
      if (!alive.current || id !== request.current) return;
      if (currentKey.current !== key || cadRevision(editor) !== before || !canChange(editor, mode === 'selected')) { setFailed(true); setMessage('stale'); return; }
      setReview({ plan, inputKey: key });
    } catch (error) { if (alive.current && id === request.current) { setFailed(true); setMessage(errorLabel(error)); } }
    finally { if (alive.current && id === request.current) setBusy(false); }
  }
  return <details ref={section} className="drawing-cad-section" data-testid="drawing-cad-text">
    <summary>{label('textOutlines')}</summary>
    <form onSubmit={event => { event.preventDefault(); void prepare(); }} aria-busy={busy || fontBusy}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings || busy || fontBusy}>
        <Field label={label('textMode')}><select value={mode} onChange={event => { setMode(event.target.value as typeof mode); setMessage(''); }}><option value="new">{label('newText')}</option><option value="selected">{label('selectedText')}</option></select></Field>
        {mode === 'new' ? <>
          <label className="drawing-cad-points"><span>{label('text')}</span><textarea value={text} maxLength={500} rows={3} required onChange={event => { setText(event.target.value); setMessage(''); }} /></label>
          <Field label={label('font')}><select value={font} onChange={event => { setFont(event.target.value as typeof font); setMessage(''); }}>
            {(['sans', 'serif', 'mono', 'draw', 'custom'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}
          </select></Field>
          {font === 'custom' && <><label className="drawing-cad-points"><span>{label('fontFile')}</span><input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={event => { void readFont(event.target.files?.[0]); }} /></label><p className="drawing-help">{label('fontHelp')}</p></>}
          {(['height', 'x', 'y'] as const).map(key => <Field key={key} label={`${label(key)} (${settings?.unit ?? 'mm'})`}><input type="number" step="any" required min={key === 'height' ? 0.000001 : undefined} value={values[key]} aria-invalid={!Number.isFinite(number(values[key])) || key === 'height' && number(values.height) <= 0} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setMessage(''); }} /></Field>)}
          <Field label={label('textAlignment')}><select value={alignment} onChange={event => setAlignment(event.target.value as CadTextLayout['align'])}>{(['start','middle','end'] as const).map(value => <option key={value} value={value}>{label(value === 'start' ? 'textLeft' : value === 'middle' ? 'textCenter' : 'textRight')}</option>)}</select></Field>
          <Field label={label('letterSpacing')}><input type="number" min={-50} max={200} step="any" value={tracking} onChange={event => setTracking(event.target.value)}/></Field>
          <Field label={label('lineSpacing')}><input type="number" min={0.5} max={5} step="any" value={lineHeight} onChange={event => setLineHeight(event.target.value)}/></Field>
          <p className="drawing-help">{label('textSpacingHelp')}</p>
        </> : <><p className="drawing-help">{label(source?.editable ? 'selectedTextHelp' : 'noText')}</p>
          <label className="drawing-cad-check"><input type="checkbox" checked={keepSource} onChange={event => setKeepSource(event.target.checked)} /><span>{label('keepSource')}</span></label></>}
        <button type="submit" disabled={!valid}>{label('preview')}</button>
      </fieldset>
    </form>
    <p className="drawing-help">{label('textHelp')}</p>
    {(busy || fontBusy) && <Message value="preparing" />}
    {review && <PlanReview review={review} inputKey={inputKey} revision={revision} disabled={disabled || !settings || busy || fontBusy || mode === 'selected' && !source?.editable} onApplied={success => { setFailed(!success); setMessage(success ? 'applied' : 'failed'); if (success) setReview(null); }} />}
    <Message value={message} error={failed} />
  </details>;
}

function JoinCurves({ settings, revision, disabled, focus, sequence }: SharedProps & { focus: boolean; sequence?: number }) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const section = useRef<HTMLDetailsElement>(null); useFocusSection(section, focus, sequence);
  const [mode, setMode] = useState<CadJoinOptions['mode']>('bridge');
  const [pairing, setPairing] = useState<CadJoinOptions['pairing']>('nearest');
  const [tolerance, setTolerance] = useState('0.01');
  const [review, setReview] = useState<Review<CadJoinPlan> | null>(null);
  const [message, setMessage] = useState<CadAdvancedLabel | ''>(''); const [failed, setFailed] = useState(false);
  const inputKey = JSON.stringify([mode, pairing, tolerance, settings]);
  const valid = mode !== 'merge' || Number.isFinite(number(tolerance)) && number(tolerance) >= 0.001 && number(tolerance) <= 1;
  return <details ref={section} className="drawing-cad-section" data-testid="drawing-cad-join">
    <summary>{label('joinCurves')}</summary><p className="drawing-help">{label('joinHelp')}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (!settings || disabled || !valid || !canChange(editor)) return;
      setMessage(''); setReview(null);
      try { setReview({ plan: prepareCadJoin(editor, settings, { mode, pairing, toleranceMm: number(tolerance) }), inputKey }); }
      catch (error) { setFailed(true); setMessage(errorLabel(error)); }
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
        <Field label={label('joinMode')}><select value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
          <option value="bridge">{label('bridge')}</option><option value="merge">{label('merge')}</option>
        </select></Field>
        <Field label={label('pairing')}><select value={pairing} onChange={event => setPairing(event.target.value as typeof pairing)}>
          {(['nearest', 'end-start', 'start-start', 'end-end', 'start-end'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select></Field>
        {mode === 'merge' && <Field label={label('joinTolerance')}><input type="number" min="0.001" max="1" step="any" required value={tolerance} aria-invalid={!valid} onChange={event => setTolerance(event.target.value)} /></Field>}
        <p className="drawing-help">{label(mode === 'merge' ? 'joinMergeHelp' : 'joinBridgeHelp')}</p>
        <button type="submit" disabled={!valid}>{label('preview')}</button>
      </fieldset>
    </form>
    {review && <PlanReview review={review} inputKey={inputKey} revision={revision} disabled={disabled || !settings} onApplied={success => { setFailed(!success); setMessage(success ? 'applied' : 'failed'); if (success) setReview(null); }}>
      <dl className="drawing-cad-values"><dt>{label('joinGap')}</dt><dd>{format(review.plan.gapMm)}</dd><dt>{label('pairing')}</dt><dd>{label(review.plan.pairing)}</dd></dl>
    </PlanReview>}
    <Message value={message} error={failed} />
  </details>;
}

function Shaping({ settings, revision, disabled, focus, sequence }: SharedProps & { focus: boolean; sequence?: number }) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const section = useRef<HTMLDetailsElement>(null); useFocusSection(section, focus, sequence);
  const selected = useValue('shaping sources', () => [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])].flatMap(id => {
    const shape = editor.getShape(id); return shape && shape.type !== 'group' ? [{ id: shape.id, name: drawingObjectName(shape) }] : [];
  }), [editor]);
  const [operation, setOperation] = useState<'weld' | 'trim' | 'intersect' | 'offset'>('weld');
  const [tolerance, setTolerance] = useState('0.02'); const [values, setValues] = useUnitDraft(settings, { offset: '1' });
  const [join, setJoin] = useState<'round' | 'miter' | 'square'>('round'); const [keepSources, setKeepSources] = useState(true); const [targetId, setTargetId] = useState('');
  const [review, setReview] = useState<Review | null>(null); const [message, setMessage] = useState<CadAdvancedLabel | ''>(''); const [failed, setFailed] = useState(false);
  const inputKey = JSON.stringify([operation, tolerance, values.offset, join, keepSources, targetId, settings]);
  const valid = Number.isFinite(number(tolerance)) && number(tolerance) >= 0.001 && number(tolerance) <= 1 && selected.length >= (operation === 'offset' ? 1 : 2) &&
    (operation !== 'offset' || Number.isFinite(number(values.offset)) && number(values.offset) !== 0 && Math.abs(number(values.offset)) <= 1_000_000) && (operation !== 'trim' || selected.some(shape => shape.id === targetId));
  return <details ref={section} className="drawing-cad-section" data-testid="drawing-cad-shaping">
    <summary>{label('shaping')}</summary>
    <p className="drawing-help">{label('selectionHelp')}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (!settings || !valid || disabled || !canChange(editor)) return;
      setMessage(''); setReview(null);
      try { setReview({ plan: prepareCadShaping(editor, settings, { operation, toleranceMm: number(tolerance), offset: number(values.offset), join, keepSources, targetId: operation === 'trim' ? targetId : undefined }), inputKey }); }
      catch (error) { setFailed(true); setMessage(errorLabel(error)); }
    }}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings}>
        <Field label={label('operation')}><select value={operation} onChange={event => { setOperation(event.target.value as typeof operation); setMessage(''); }}>{(['weld', 'trim', 'intersect', 'offset'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
        {operation === 'trim' && <><Field label={label('target')}><select value={targetId} required onChange={event => setTargetId(event.target.value)}><option value="">{label('chooseTarget')}</option>{selected.map((shape, index) => <option key={shape.id} value={shape.id}>{index + 1}. {shape.name}</option>)}</select></Field><p className="drawing-help">{label('targetHelp')}</p></>}
        {operation === 'offset' && <>
          <Field label={`${label('distance')} (${settings?.unit ?? 'mm'})`}><input type="number" required step="any" value={values.offset} aria-invalid={!Number.isFinite(number(values.offset)) || number(values.offset) === 0} onChange={event => setValues(current => ({ ...current, offset: event.target.value }))} /></Field>
          <Field label={label('join')}><select value={join} onChange={event => setJoin(event.target.value as typeof join)}>{(['round', 'miter', 'square'] as const).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field>
          <p className="drawing-help">{label('offsetHelp')}</p>
        </>}
        <Field label={label('tolerance')}><input type="number" required step="any" min="0.001" max="1" value={tolerance} aria-invalid={!Number.isFinite(number(tolerance)) || number(tolerance) < 0.001 || number(tolerance) > 1} onChange={event => setTolerance(event.target.value)} /></Field>
        <label className="drawing-cad-check"><input type="checkbox" checked={keepSources} onChange={event => setKeepSources(event.target.checked)} /><span>{label('keepSources')}</span></label>
        <button type="submit" disabled={!valid}>{label('preview')}</button>
      </fieldset>
    </form>
    <p className="drawing-help">{label('shapingHelp')}</p>
    {review && <PlanReview review={review} inputKey={inputKey} revision={revision} disabled={disabled || !settings} onApplied={success => { setFailed(!success); setMessage(success ? 'applied' : 'failed'); if (success) setReview(null); }} />}
    <Message value={message} error={failed} />
  </details>;
}

function DxfImport({ settings, revision, disabled }: SharedProps) {
  const editor = useEditor(); const { label } = useCadAdvancedText();
  const [file, setFile] = useState<File>(); const [unit, setUnit] = useState<CadUnit | ''>(''); const [keepCoordinates, setKeepCoordinates] = useState(true);
  const [projection,setProjection]=useState<'strict'|'xy'|'xz'|'yz'>('strict');
  const [font,setFont]=useState<'sans'|'serif'|'mono'|'custom'>('sans');const [fontFile,setFontFile]=useState<File>();
  const [review, setReview] = useState<Review<CadImportPlan> | null>(null); const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<CadAdvancedLabel | ''>(''); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false);
  const request = useRef(0); const alive = useRef(true);
  const inputKey = JSON.stringify([file?.name, file?.size, file?.lastModified, unit, keepCoordinates, projection, font, fontFile?.name, fontFile?.lastModified, settings]);
  const currentKey = useRef(inputKey); currentKey.current = inputKey;
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => { request.current++; setBusy(false); setAcknowledged(false); }, [revision, inputKey]);
  async function prepare() {
    if (!settings || !file || disabled || !canChange(editor, false)) return;
    if (file.size > FILE_LIMIT || !/\.dxf$/i.test(file.name)) { setFailed(true); setMessage(file.size > FILE_LIMIT ? 'fileTooLarge' : 'invalidDxf'); return; }
    const id = ++request.current; const key = inputKey; const before = cadRevision(editor); setBusy(true); setReview(null); setAcknowledged(false); setMessage('');
    try {
      const [bytes,fontData]=await Promise.all([file.arrayBuffer(),font==='custom'?fontFile?.arrayBuffer():Promise.resolve(undefined)]);
      const content = decodeDxf(new Uint8Array(bytes)), selectedFont=await getCadFont(font,fontData);
      if (!alive.current || id !== request.current) return;
      if (currentKey.current !== key || cadRevision(editor) !== before || !canChange(editor, false)) { setFailed(true); setMessage('stale'); return; }
      const plan = prepareCadImport(editor, settings, content, { unit: unit || undefined, keepCoordinates, font:selectedFont, projection });
      if (currentKey.current !== key || cadRevision(editor) !== before || !canChange(editor, false)) { setFailed(true); setMessage('stale'); return; }
      setReview({ plan, inputKey: key });
    } catch (error) { if (alive.current && id === request.current) { setFailed(true); setMessage(errorLabel(error, 'invalidDxf')); } }
    finally { if (alive.current && id === request.current) setBusy(false); }
  }
  return <details className="drawing-cad-section" data-testid="drawing-cad-import">
    <summary>{label('import')}</summary>
    <p className="drawing-help">{label('importHelp')}</p>
    <form onSubmit={event => { event.preventDefault(); void prepare(); }} aria-busy={busy}>
      <fieldset className="drawing-cad-fields" disabled={disabled || !settings || busy}>
        <label className="drawing-cad-points"><span>{label('dxfFile')}</span><input type="file" accept=".dxf,application/dxf" onChange={event => { request.current++; setFile(event.target.files?.[0]); setReview(null); setMessage(''); setAcknowledged(false); }} /></label>
        <Field label={label('sourceUnit')}><select value={unit} onChange={event => { setUnit(event.target.value as typeof unit); setMessage(''); }}><option value="">{label('automatic')}</option>{(['mm', 'cm', 'm', 'in'] as const).map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
        <Field label={label('projection')}><select value={projection} onChange={event=>setProjection(event.target.value as typeof projection)}>{(['strict','xy','xz','yz'] as const).map(value=><option key={value} value={value}>{label(value==='strict'?'projection2d':value==='xy'?'projectionTop':value==='xz'?'projectionFront':'projectionSide')}</option>)}</select></Field>
        <Field label={label('importFont')}><select value={font} onChange={event=>setFont(event.target.value as typeof font)}>{(['sans','serif','mono','custom'] as const).map(value=><option key={value} value={value}>{label(value==='custom'?'custom':value)}</option>)}</select></Field>
        {font==='custom'&&<Field label={label('fontFile')}><input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={event=>setFontFile(event.target.files?.[0])}/></Field>}
        <label className="drawing-cad-check"><input type="checkbox" checked={keepCoordinates} onChange={event => setKeepCoordinates(event.target.checked)} /><span>{label('keepCoordinates')}</span></label>
        <button type="submit" disabled={!file}>{label('preview')}</button>
      </fieldset>
    </form>
    <p className="drawing-help">{label('coordinatesHelp')}</p>
    {busy && <Message value="preparing" />}
    {review && <PlanReview review={review} inputKey={inputKey} revision={revision} disabled={disabled || !settings || busy} blocked={review.plan.requiresUnit || (review.plan.omitted.length > 0 || review.plan.warnings.length > 0) && !acknowledged} onApplied={success => { setFailed(!success); setMessage(success ? 'applied' : 'failed'); if (success) setReview(null); }}>
      <dl className="drawing-cad-values"><dt>{label('sourceUnit')}</dt><dd>{review.plan.sourceUnit || '—'}</dd><dt>{label('omitted')}</dt><dd>{review.plan.omitted.length}</dd></dl>
      {review.plan.requiresUnit && <Message value="chooseUnit" error />}
      {review.plan.omitted.length || review.plan.warnings.length ? <>
        <ul className="drawing-cad-omissions">{review.plan.omitted.map((item, index) => <li key={`${item.type}-${index}`}><strong>{item.type}</strong><span>{label(errorLabel({ code: item.reason }, 'unsupported'))}</span></li>)}</ul>
        <label className="drawing-cad-check"><input type="checkbox" checked={acknowledged} disabled={disabled || busy || review.plan.revision !== revision || review.inputKey !== inputKey} onChange={event => setAcknowledged(event.target.checked)} /><span>{label('acceptOmissions')}</span></label>
      </> : <p className="drawing-help">{label('noOmissions')}</p>}
    </PlanReview>}
    <Message value={message} error={failed} />
  </details>;
}
