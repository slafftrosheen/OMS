import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowShapeArrowheadEndStyle, ArrowShapeArrowheadStartStyle, DefaultColorStyle, DefaultDashStyle,
  DefaultFillStyle, DefaultFontStyle, DefaultHorizontalAlignStyle, DefaultSizeStyle, DefaultTextAlignStyle,
  DefaultVerticalAlignStyle, GeoShapeGeoStyle, LineShapeSplineStyle, createShapeId, exportToBlob,
  Box, getDefaultColorTheme, useEditor, useIsDarkMode, useRelevantStyles, useValue,
  type EnumStyleProp, type TLShapeId, type TLShape,
} from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';
import { applyDrawingCommand, drawingTransaction, toggleDrawingObjectLock, transformDrawingSelection, type DrawingTransformField } from './drawing-commands';
import { useDrawingText, type DrawingLabel } from './drawing-copy';
import { drawingObjectAlias, drawingObjectName, drawingPngSize, renameDrawingObject, repeatDrawingSelection, planDrawingExport, type DrawingExportOptions } from './drawing-operations';
import './drawing-workspace.css';

type Slot = 'commands' | 'properties' | 'tools' | 'docker' | 'palette' | 'status' | 'rulerX' | 'rulerY';
type Panel = 'properties' | 'objects' | null;
interface WorkspaceContext {
  hosts: Partial<Record<Slot, HTMLElement>>;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  root: React.RefObject<HTMLDivElement>;
  order: boolean;
  onImport?: (files: File[], point: { x: number; y: number }) => void | Promise<void>;
}
const Context = createContext<WorkspaceContext | null>(null);

/** One physical layout for both editors. The actual editor occupies only the
 * central viewport, so zoom-to-fit, drop coordinates and forms avoid the chrome. */
export function DrawingWorkspace({ children, order, hidden, onImport }: {
  children: ReactNode; order: boolean; hidden: boolean; onImport?: WorkspaceContext['onImport'];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<WorkspaceContext['hosts']>({});
  const [panel, setPanel] = useState<Panel>('properties');
  const [compact, setCompact] = useState(false);
  const refs = useMemo(() => Object.fromEntries(
    ['commands', 'properties', 'tools', 'docker', 'palette', 'status', 'rulerX', 'rulerY'].map(name => [name,
      (node: HTMLElement | null) => setHosts(previous => previous[name] === node ? previous : { ...previous, [name]: node })])
  ) as Record<Slot, (node: HTMLElement | null) => void>, []);
  useEffect(() => {
    if (!root.current) return;
    // Embedded order panels can be narrow even on a desktop screen.
    let initialized = false;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setCompact(width < 880);
      if (width && !initialized) { initialized = true; if (width < 880) setPanel(null); }
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const { label } = useDrawingText();
  return <Context.Provider value={{ hosts, panel, setPanel, root, order, onImport }}>
    <div ref={root} className={`drawing-workspace ${hidden ? 'drawing-workspace--hidden' : ''} ${panel ? 'has-docker' : ''} ${compact ? 'is-compact' : ''}`}
      data-testid="drawing-workspace" data-mode={order ? 'order' : 'idea'} aria-label={label('workspace')}>
      {!hidden && <><div className="drawing-commands" ref={refs.commands} />
        <div className="drawing-properties" ref={refs.properties} />
        <div className="drawing-toolbox" ref={refs.tools} />
      </>}
      <div className="drawing-page">
        {!hidden && <><span className="drawing-ruler-origin">px</span>
          <div className="drawing-ruler drawing-ruler-x" ref={refs.rulerX} />
          <div className="drawing-ruler drawing-ruler-y" ref={refs.rulerY} />
        </>}
        <div className="drawing-viewport">{children}</div>
      </div>
      {!hidden && <><aside className="drawing-docker" hidden={!panel} ref={refs.docker} />
        <div className="drawing-palette" ref={refs.palette} />
        <div className="drawing-status" ref={refs.status} />
      </>}
    </div>
  </Context.Provider>;
}

const iconPaths: Record<string, ReactNode> = {
  select: <path d="m5 3 14 10-7 1-3 7Z" />,
  hand: <><path d="M7 11V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-6 7s-5-2-7-5l-3-5c-1-2 1-3 3-1l3 3" /></>,
  draw: <><path d="m4 17 12-13 4 4L8 21H4Zm10-11 4 4M3 5c4-4 8 2 3 5s-5 4-2 5" /></>,
  line: <><path d="m4 20 16-16" /><circle cx="4" cy="20" r="1.5" /><circle cx="20" cy="4" r="1.5" /></>,
  arrow: <path d="M4 20 20 4M10 4h10v10" />,
  rectangle: <rect x="4" y="5" width="16" height="14" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="7" />,
  triangle: <path d="m12 3 10 17H2Z" />,
  diamond: <path d="m12 2 10 10-10 10L2 12Z" />,
  pentagon: <path d="m12 2 10 8-4 12H6L2 10Z" />,
  star: <path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" />,
  text: <path d="M4 5V3h16v2M12 3v18m-4 0h8" />,
  highlight: <><path d="m6 14 9-11 6 5-9 11ZM3 21h15m-12-7-3 5 4 2 5-2" /></>,
  eraser: <path d="m4 15 10-12 8 7-10 12H9Zm4-5 9 8M3 22h19" />,
  frame: <path d="M3 6h18M3 18h18M6 3v18M18 3v18" />,
  undo: <path d="M8 4 3 9l5 5M3 9h11c9 0 8 12 0 12" />,
  redo: <path d="m16 4 5 5-5 5m5-5H10c-9 0-8 12 0 12" />,
  import: <path d="M12 16V2M7 7l5-5 5 5M3 15v6h18v-6" />,
  properties: <><path d="M3 5h18M3 12h18M3 19h18" /><circle cx="8" cy="5" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="19" r="2" /></>,
  objects: <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8-1" /></>,
  close: <path d="m5 5 14 14M19 5 5 19" />,
};
function Icon({ name }: { name: string }) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name] ?? iconPaths.rectangle}</svg>; }
function ToolButton({ label, icon, active, disabled, onClick, children, testId }: {
  label: string; icon?: string; active?: boolean; disabled?: boolean; onClick: () => void; children?: ReactNode; testId?: string;
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
    onClick={onClick} className={`drawing-button ${active ? 'is-active' : ''}`} data-testid={testId}>
    {icon && <Icon name={icon} />}{children}
  </button>;
}

const geometryTools = ['rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'star'] as const;
const tools = ['select', 'hand', 'draw', 'line', 'arrow', ...geometryTools, 'text', 'highlight', 'eraser', 'frame'];
const toolKeys: Record<string, string> = { select: 'toolkit.draw.selectTitle', draw: 'toolkit.draw.drawTitle', text: 'toolkit.draw.textTitle', arrow: 'toolkit.draw.arrowTitle' };
const shortcut: Record<string, string> = { rectangle: 'F6', ellipse: 'F7', text: 'F8', select: 'V', draw: 'D', line: 'L', arrow: 'A', hand: 'H', eraser: 'E' };

function NumberField({ field, value, disabled, label }: { field: DrawingTransformField; value: number | undefined; disabled: boolean; label: string }) {
  const editor = useEditor();
  const [draft, setDraft] = useState('');
  const cancelBlur = useRef(false);
  useEffect(() => { setDraft(value === undefined ? '' : String(Math.round(value * 100) / 100)); }, [value]);
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    if (value !== undefined && Number(draft) === Math.round(value * 100) / 100) return;
    if (draft.trim() && transformDrawingSelection(editor, field, Number(draft))) return;
    setDraft(value === undefined ? '' : String(Math.round(value * 100) / 100));
  }
  return <label className="drawing-number"><span>{field === 'rotation' ? '∠' : field.toUpperCase()}</span>
    <input type="number" aria-label={label} value={draft} disabled={disabled || value === undefined}
      step={field === 'rotation' ? 15 : 1} onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelBlur.current = true; setDraft(value === undefined ? '' : String(Math.round(value * 100) / 100)); event.currentTarget.blur(); } }} />
  </label>;
}

function ObjectNameField({ shape, disabled }: { shape: TLShape; disabled: boolean }) {
  const editor = useEditor(); const { label } = useDrawingText();
  const alias = drawingObjectAlias(shape);
  const [draft, setDraft] = useState(alias);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setDraft(alias); setFailed(false); }, [shape.id, alias]);
  return <form className="drawing-object-name" onSubmit={event => {
    event.preventDefault(); setFailed(!renameDrawingObject(editor, shape.id, draft));
  }}>
    <label><span>{label('objectName')}</span><input value={draft} maxLength={80} disabled={disabled}
      placeholder={drawingObjectName(shape)} onChange={event => { setDraft(event.target.value); setFailed(false); }} /></label>
    <button type="submit" disabled={disabled}>{label('rename')}</button>
    <p className="drawing-help">{label('renameHint')}</p>
    {failed && <p role="alert" className="drawing-help">{label('changedFailed')}</p>}
  </form>;
}

function RepeatGrid({ selected, disabled }: { selected: readonly TLShapeId[]; disabled: boolean }) {
  const editor = useEditor(); const { label } = useDrawingText();
  const [values, setValues] = useState({ rows: '2', columns: '2', gapX: '24', gapY: '24' });
  const [message, setMessage] = useState('');
  return <details className="drawing-repeat"><summary>{label('repeatGrid')}</summary>
    <form onSubmit={event => {
      event.preventDefault();
      const result = repeatDrawingSelection(editor, { rows: Number(values.rows), columns: Number(values.columns), gapX: values.gapX.trim() ? Number(values.gapX) : NaN, gapY: values.gapY.trim() ? Number(values.gapY) : NaN }, [...selected]);
      setMessage(result.ok === true ? `${label('copiesCreated')}: ${result.value}` : label(result.error));
    }}>
      <fieldset className="drawing-style-fields" disabled={disabled}>
        {(['rows', 'columns', 'gapX', 'gapY'] as const).map(key => <label key={key}><span>{label(key)}</span><input type="number" step="1" value={values[key]}
          min={key === 'rows' || key === 'columns' ? 1 : -10000} max={key === 'rows' || key === 'columns' ? 20 : 10000} required
          onChange={event => { setValues(previous => ({ ...previous, [key]: event.target.value })); setMessage(''); }} /></label>)}
        <button type="submit">{label('createCopies')}</button>
      </fieldset>
      <p className="drawing-help">{label('repeatHint')}</p>
      {message && <p className="drawing-help" role="status">{message}</p>}
    </form>
  </details>;
}

function Ruler({ vertical = false }: { vertical?: boolean }) {
  const editor = useEditor();
  const bounds = useValue('drawing ruler', () => editor.getViewportPageBounds(), [editor]);
  const zoom = useValue('drawing ruler zoom', () => editor.getZoomLevel(), [editor]);
  const origin = vertical ? bounds.y : bounds.x;
  const length = vertical ? bounds.h : bounds.w;
  const magnitude = Math.pow(10, Math.floor(Math.log10(70 / zoom)));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n * zoom >= 60) ?? magnitude * 10;
  const first = Math.ceil(origin / step) * step;
  const ticks: ReactNode[] = [];
  for (let value = first, count = 0; value <= origin + length && count < 100; value += step, count++) {
    const point = (value - origin) * zoom;
    ticks.push(<g key={count}>{vertical ? <><path d={`M13 ${point}h7`} /><text x="9" y={point + 3} transform={`rotate(-90 9 ${point + 3})`}>{Math.round(value * 100) / 100}</text></> :
      <><path d={`M${point} 13v7`} /><text x={point + 3} y="10">{Math.round(value * 100) / 100}</text></>}</g>);
  }
  return <svg width={vertical ? '20' : '100%'} height={vertical ? '100%' : '20'} aria-hidden="true">{ticks}</svg>;
}

const styleFields = [
  { id: 'fill', style: DefaultFillStyle }, { id: 'dash', style: DefaultDashStyle }, { id: 'size', style: DefaultSizeStyle },
  { id: 'font', values: 'font', style: DefaultFontStyle }, { id: 'textAlign', values: 'horizontal', style: DefaultTextAlignStyle },
  { id: 'horizontalAlign', values: 'horizontal', style: DefaultHorizontalAlignStyle },
  { id: 'verticalAlign', values: 'vertical', style: DefaultVerticalAlignStyle },
  { id: 'spline', values: 'spline', style: LineShapeSplineStyle },
  { id: 'arrowheadStart', values: 'arrowhead', style: ArrowShapeArrowheadStartStyle },
  { id: 'arrowheadEnd', values: 'arrowhead', style: ArrowShapeArrowheadEndStyle },
  { id: 'geo', values: 'geo', style: GeoShapeGeoStyle },
] as Array<{ id: string; values?: string; style: EnumStyleProp<string> }>;

export function DrawingChrome() {
  const context = useContext(Context);
  const editor = useEditor();
  const { label, tr } = useDrawingText();
  const isDarkMode = useIsDarkMode();
  const styles = useRelevantStyles();
  const controls = useValue('drawing controls', () => captureToolkitControls(editor, editor.getStyleForNextShape(GeoShapeGeoStyle)), [editor]);
  const state = useValue('drawing display', () => ({ shapes: editor.getCurrentPageShapesSorted(), selected: editor.getSelectedShapeIds(),
    zoom: editor.getZoomLevel(), grid: editor.getInstanceState().isGridMode, snap: editor.user.getIsSnapMode(),
    opacity: editor.getSharedOpacity(), single: editor.getOnlySelectedShape() }), [editor]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<DrawingExportOptions>({ scope: 'selected', scale: 1, background: false, padding: 24 });
  const [exportError, setExportError] = useState('');
  const tabsId = useId();
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const container = editor.getContainer();
    const listen = (event: Event) => { const detail = (event as CustomEvent).detail; setNotice(detail?.message ?? ''); setBusy(!!detail?.busy); };
    container.addEventListener('oms:canvas-upload', listen);
    return () => container.removeEventListener('oms:canvas-upload', listen);
  }, [editor]);

  const toolLabel = (tool: string) => tr(toolKeys[tool] ?? (tool === 'pentagon' ? 'toolkit.toolbar.styleValues.geo.pentagon' : `toolkit.toolbar.${tool}`));
  function chooseTool(tool: string) {
    if (editor.getInstanceState().isReadonly && !['hand', 'select'].includes(tool)) return;
    editor.complete();
    if (geometryTools.includes(tool as any)) { editor.setStyleForNextShapes(GeoShapeGeoStyle, tool as any); editor.setCurrentTool('geo'); }
    else editor.setCurrentTool(tool);
    editor.focus();
  }
  function command(action: string) { if (!applyDrawingCommand(editor, action)) setNotice(label('changedFailed')); else setNotice(''); }
  function closeMenus(restoreFocus = false) {
    const trigger = restoreFocus && openMenu ? context?.root.current?.querySelector<HTMLElement>(`[data-drawing-menu="${openMenu}"] > summary`) : null;
    setOpenMenu(null); trigger?.focus();
  }
  function menuSummary(name: string, text: string) {
    return <summary aria-expanded={openMenu === name} onClick={event => { event.preventDefault(); setOpenMenu(openMenu === name ? null : name); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpenMenu(name); const menu = event.currentTarget.parentElement; queueMicrotask(() => menu?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')?.focus()); }
      }}>{text}</summary>;
  }
  useEffect(() => {
    const root = context?.root.current;
    if (!root) return;
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openMenu) { event.preventDefault(); event.stopPropagation(); closeMenus(true); return; }
      if (!(event.target instanceof Element) || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      const lockedSelection = captureToolkitControls(editor).selectionLocked;
      const modifier = event.ctrlKey || event.metaKey;
      if (lockedSelection && event.target.closest('.drawing-viewport') && (['Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
          modifier && ['x', 'd', 'g', '[', ']'].includes(event.key.toLowerCase()))) {
        // Native group shortcuts do not inspect locked descendants. Keep their
        // behaviour consistent with the disabled OMS object commands.
        event.preventDefault(); event.stopPropagation(); return;
      }
      const tool = ({ F6: 'rectangle', F7: 'ellipse', F8: 'text' } as Record<string, string>)[event.key];
      if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); chooseTool(tool); }
      else if (event.key === 'F4') { event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'fit'); }
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'duplicate');
      }
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.drawing-menu')) closeMenus(); };
    root.addEventListener('keydown', keys, true);
    document.addEventListener('pointerdown', outside);
    return () => { root.removeEventListener('keydown', keys, true); document.removeEventListener('pointerdown', outside); };
  }, [context?.root, editor, openMenu]);
  if (!context) return null;
  const { hosts, panel, setPanel, order, onImport } = context;
  function portal(slot: Slot, children: ReactNode) { const host = hosts[slot]; return host ? createPortal(children, host, slot) : null; }
  const position = state.single ? editor.getShapePageTransform(state.single).point() : undefined;
  const bounds = state.single ? editor.getShapeGeometry(state.single).bounds : undefined;
  const canResize = !!state.single && state.single.type !== 'group' && controls.canEditSelection && editor.getShapeUtil(state.single).canResize(state.single);
  const canRotate = !!state.single && controls.canEditSelection && !editor.getShapeUtil(state.single).hideRotateHandle(state.single);
  const theme = getDefaultColorTheme({ isDarkMode });
  const color = styles?.get(DefaultColorStyle);

  function styleChange(style: EnumStyleProp<string>, value: string) {
    if (!style.values.includes(value) || !captureToolkitControls(editor).canStyle) return;
    drawingTransaction(editor, () => {
      if (editor.isIn('select')) editor.setStyleForSelectedShapes(style, value);
      editor.setStyleForNextShapes(style, value);
    });
  }
  async function importFiles(files: File[]) {
    if (!files.length || !onImport || editor.getInstanceState().isReadonly) return;
    setBusy(true); setNotice('');
    try { await onImport(files, editor.getViewportPageBounds().center); }
    catch { if (alive.current) setNotice(label('uploadFailed')); }
    finally { if (alive.current) setBusy(false); }
  }
  async function exportDrawing(format: 'svg' | 'png') {
    if (busy) return;
    const result = planDrawingExport(editor, format, exportOptions);
    if (result.ok === false) { setExportError(label(result.error)); return; }
    const plan = result.value;
    setBusy(true); setExportError('');
    try {
      const blob = await exportToBlob({ editor, ids: plan.ids, format, opts: {
        background: exportOptions.background, padding: exportOptions.padding, scale: plan.nativeScale,
        bounds: new Box(plan.bounds.x, plan.bounds.y, plan.bounds.w, plan.bounds.h)
      } });
      const output = format === 'png' ? await drawingPngSize(blob) : plan;
      const reduced = format === 'png' && (output.width < plan.width - 1 || output.height < plan.height - 1);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `oms-drawing.${format}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(`${label('exportSize')}: ${output.width} × ${output.height}. ${label('exportOmitted')}: ${plan.omitted}.${reduced ? ` ${label('exportReduced')}` : ''}`);
      closeMenus();
    } catch { if (alive.current) setExportError(label('exportFailed')); }
    finally { if (alive.current) setBusy(false); }
  }
  function annotation(kind: 'comment' | 'warning' | 'explanation') {
    if (editor.getInstanceState().isReadonly) return;
    const center = editor.getViewportPageBounds().center; const id = createShapeId();
    editor.complete(); editor.setCurrentTool('select');
    drawingTransaction(editor, () => { editor.createShape({ id, type: 'order-annotation', x: center.x - 150, y: center.y - 100,
      props: { kind, icon: kind === 'warning' ? '⚠' : kind === 'explanation' ? 'ℹ' : '✎', text: '' } } as any); editor.select(id); });
    editor.focus();
  }
  const actionLabel = (action: string) => ({
    undo: tr('toolkit.canvas.undoTitle'), redo: tr('toolkit.canvas.redoTitle'), delete: tr('toolkit.canvas.deleteSelected'),
    'select-all': label('selectAll'), 'rotate-left': label('rotateLeft'), 'rotate-right': label('rotateRight'),
    'flip-horizontal': label('flipHorizontal'), 'flip-vertical': label('flipVertical'), forward: label('forward'), backward: label('backward'),
    lock: label('lock'), fit: tr('toolkit.canvas.fit'), 'fit-selection': tr('toolkit.toolbar.fitSelection'), 'zoom-reset': tr('toolkit.toolbar.actualSize'),
    'distribute-horizontal': tr('toolkit.toolbar.distributeHorizontal'), 'distribute-vertical': tr('toolkit.toolbar.distributeVertical'),
  } as Record<string, string>)[action] ?? (action.startsWith('align-') ? tr(`toolkit.toolbar.align.${action.slice(6)}`) : tr(`toolkit.toolbar.${action}`));
  const actionEnabled = (action: string) => {
    if (action === 'undo') return controls.canUndo; if (action === 'redo') return controls.canRedo;
    if (['fit', 'select-all'].includes(action)) return controls.hasShapes;
    if (action === 'fit-selection') return controls.canFitSelection;
    if (action === 'zoom-reset') return true;
    if (action === 'group') return controls.canGroup; if (action === 'ungroup') return controls.canUngroup;
    if (action.startsWith('align-')) return controls.canAlign;
    if (action.startsWith('distribute-')) return controls.canDistribute;
    return controls.canEditSelection;
  };
  const menuActions = (actions: string[]) => actions.map(action => <button type="button" key={action} disabled={!actionEnabled(action)}
    onClick={() => { command(action); closeMenus(); }} data-testid={`drawing-action-${action}`}>{actionLabel(action)}</button>);
  const fieldNames = { x: 'positionX', y: 'positionY', w: 'width', h: 'height', rotation: 'rotation' } as const;

  return <>
    {portal('commands', <>
      <strong className="drawing-title">OMS<span> DRAW</span></strong>
      <nav className="drawing-menus" aria-label={label('workspace')}>
        <details className="drawing-menu" data-drawing-menu="file" open={openMenu === 'file'}>{menuSummary('file', label('file'))}<div className="drawing-menu-popover">
          <button type="button" disabled={controls.readOnly || busy || !onImport} onClick={() => { closeMenus(); input.current?.click(); }}>{label('import')}</button>
          <fieldset className="drawing-export-options" disabled={busy}>
            <label><span>{label('exportScope')}</span><select value={exportOptions.scope} onChange={event => { setExportOptions(previous => ({ ...previous, scope: event.target.value as 'selected' | 'all' })); setExportError(''); }}>
              <option value="selected">{label('selectedOnly')}</option><option value="all">{label('allArtwork')}</option>
            </select></label>
            <label><span>{label('pngScale')}</span><select value={exportOptions.scale} onChange={event => { setExportOptions(previous => ({ ...previous, scale: Number(event.target.value) as 1 | 2 | 4 })); setExportError(''); }}>
              {[1, 2, 4].map(scale => <option key={scale} value={scale}>{scale}×</option>)}
            </select></label>
            <label><span>{label('background')}</span><select value={exportOptions.background ? 'solid' : 'transparent'} onChange={event => setExportOptions(previous => ({ ...previous, background: event.target.value === 'solid' }))}>
              <option value="transparent">{label('transparent')}</option><option value="solid">{label('solidBackground')}</option>
            </select></label>
            <label><span>{label('padding')}</span><input type="number" min="0" max="1000" step="1" value={Number.isNaN(exportOptions.padding) ? '' : exportOptions.padding}
              onChange={event => { setExportOptions(previous => ({ ...previous, padding: event.target.value.trim() ? Number(event.target.value) : NaN })); setExportError(''); }} /></label>
          </fieldset>
          <button type="button" disabled={busy || !controls.hasShapes} onClick={() => void exportDrawing('svg')}>{label('exportSvg')}</button>
          <button type="button" disabled={busy || !controls.hasShapes} onClick={() => void exportDrawing('png')}>{label('exportPng')}</button>
          {exportError && <p role="alert">{exportError}</p>}
          <p>{label('exportHint')}</p>
        </div></details>
        <details className="drawing-menu" data-drawing-menu="edit" open={openMenu === 'edit'}>{menuSummary('edit', label('edit'))}<div className="drawing-menu-popover">{menuActions(['undo', 'redo', 'select-all', 'duplicate', 'delete'])}</div></details>
        <details className="drawing-menu" data-drawing-menu="object" open={openMenu === 'object'}>{menuSummary('object', label('object'))}<div className="drawing-menu-popover drawing-menu-popover--wide">{menuActions(['group', 'ungroup', 'front', 'back', 'forward', 'backward', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', 'lock'])}
          <hr />{menuActions(['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', 'distribute-horizontal', 'distribute-vertical'])}
        </div></details>
        <details className="drawing-menu" data-drawing-menu="view" open={openMenu === 'view'}>{menuSummary('view', label('view'))}<div className="drawing-menu-popover">{menuActions(['fit', 'fit-selection', 'zoom-reset'])}
          <button type="button" aria-pressed={state.grid} onClick={() => command('grid')}>{state.grid ? '✓ ' : ''}{label('grid')}</button>
          <button type="button" aria-pressed={state.snap} onClick={() => command('snap')}>{state.snap ? '✓ ' : ''}{label('snap')}</button>
        </div></details>
      </nav>
      <span className="drawing-divider" />
      <ToolButton icon="undo" testId="drawing-undo" label={actionLabel('undo')} disabled={!controls.canUndo} onClick={() => command('undo')} />
      <ToolButton icon="redo" testId="drawing-redo" label={actionLabel('redo')} disabled={!controls.canRedo} onClick={() => command('redo')} />
      <ToolButton icon="import" testId="drawing-import" label={label('import')} disabled={controls.readOnly || busy || !onImport} onClick={() => input.current?.click()} />
      <input ref={input} type="file" hidden multiple accept={order
          ? '.pdf,.png,.jpg,.jpeg,.webp,.gif,.cdr,.dxf'
          : 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.pdf,.mp3,.wav,.ogg,.m4a'}
        onChange={event => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <span className="drawing-spacer" />
      <ToolButton icon="properties" label={label('properties')} active={panel === 'properties'} onClick={() => setPanel(panel === 'properties' ? null : 'properties')} testId="drawing-properties-toggle" />
      <ToolButton icon="objects" label={label('objects')} active={panel === 'objects'} onClick={() => setPanel(panel === 'objects' ? null : 'objects')} testId="drawing-objects-toggle" />
    </>)}
    {portal('properties', <>
      <span className="drawing-tool-name">{toolLabel(controls.tool)}</span><span className="drawing-divider" />
      {(['x', 'y', 'w', 'h', 'rotation'] as const).map(field => <NumberField key={field} field={field} label={label(fieldNames[field])}
        value={field === 'x' ? position?.x : field === 'y' ? position?.y : field === 'w' ? bounds?.w : field === 'h' ? bounds?.h : state.single ? editor.getShapePageTransform(state.single).rotation() * 180 / Math.PI : undefined}
        disabled={field === 'w' || field === 'h' ? !canResize : field === 'rotation' ? !canRotate : !controls.canEditSelection} />)}
      <span className="drawing-unit">{label('units')}</span>
      {order && <div className="drawing-annotations">{(['comment', 'warning', 'explanation'] as const).map((kind, index) =>
        <button type="button" key={kind} aria-label={label((['orderNote', 'orderWarning', 'orderExplain'] as const)[index])} disabled={controls.readOnly} onClick={() => annotation(kind)}>{['✎', '⚠', 'ℹ'][index]} {label((['orderNote', 'orderWarning', 'orderExplain'] as const)[index])}</button>)}</div>}
    </>)}
    {portal('tools', <div role="toolbar" aria-label={label('toolbox')} className="drawing-tools">
      {tools.map(tool => <ToolButton key={tool} icon={tool} label={`${toolLabel(tool)}${shortcut[tool] ? ` (${shortcut[tool]})` : ''}`}
        active={controls.tool === tool} disabled={controls.readOnly && !['select', 'hand'].includes(tool)} onClick={() => chooseTool(tool)} testId={`drawing-tool-${tool}`} />)}
    </div>)}
    {portal('rulerX', <Ruler />)}{portal('rulerY', <Ruler vertical />)}
    {portal('docker', <>
      <div className="drawing-docker-title"><div role="tablist" aria-label={label('properties')} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'properties' : event.key === 'End' ? 'objects' : panel === 'properties' ? 'objects' : 'properties';
        setPanel(next); document.getElementById(`${tabsId}-${next}`)?.focus();
      }}>
        <button type="button" role="tab" id={`${tabsId}-properties`} aria-controls={`${tabsId}-panel`} tabIndex={panel === 'properties' ? 0 : -1} aria-selected={panel === 'properties'} onClick={() => setPanel('properties')}>{label('properties')}</button>
        <button type="button" role="tab" id={`${tabsId}-objects`} aria-controls={`${tabsId}-panel`} tabIndex={panel === 'objects' ? 0 : -1} aria-selected={panel === 'objects'} onClick={() => setPanel('objects')}>{label('objects')}</button>
      </div><ToolButton icon="close" label={label('closePanel')} onClick={() => setPanel(null)} /></div>
      <div className="drawing-docker-content" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${panel === 'objects' ? 'objects' : 'properties'}`}>
        {panel === 'objects' ? <>
          <p className="drawing-help">{state.shapes.length} {label('items')} · {controls.selected} {label('selected')}</p>
          <label className="drawing-object-search"><span>{label('searchObjects')}</span><input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} /></label>
          {state.single && <ObjectNameField key={state.single.id} shape={state.single} disabled={!controls.canEditSelection} />}
          <div className="drawing-object-list">{[...state.shapes].reverse().filter(shape => drawingObjectName(shape).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(shape => {
            const props = shape.props as Record<string, unknown>;
            const name = drawingObjectName(shape);
            const locked = editor.isShapeOrAncestorLocked(shape);
            const parent = editor.getShape(shape.parentId as TLShapeId);
            return <div key={shape.id} className={`drawing-object-row ${state.selected.includes(shape.id) ? 'is-selected' : ''}`} data-testid="drawing-object-row">
              <button type="button" className="drawing-object-select" aria-pressed={state.selected.includes(shape.id)} title={name}
                onClick={event => { editor.complete(); editor.setCurrentTool('select'); editor.setSelectedShapes(event.shiftKey ? state.selected.includes(shape.id) ? state.selected.filter(id => id !== shape.id) : [...state.selected, shape.id] : [shape.id]); }}
                onDoubleClick={() => editor.zoomToSelection()}><Icon name={shape.type === 'geo' ? String(props.geo) : iconPaths[shape.type] ? shape.type : 'objects'} /><span>{parent ? '↳ ' : ''}{name}</span></button>
              <ToolButton icon={locked ? 'lock' : 'unlock'} label={label(shape.isLocked ? 'unlock' : 'lock')} disabled={controls.readOnly || !!parent && editor.isShapeOrAncestorLocked(parent)}
                onClick={() => { if (!toggleDrawingObjectLock(editor, shape.id)) setNotice(label('lockedParent')); }} />
            </div>;
          })}</div>{!state.shapes.length && <p className="drawing-help">{label('empty')}</p>}
          {state.shapes.length > 0 && !state.shapes.some(shape => drawingObjectName(shape).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <p className="drawing-help">{label('noMatches')}</p>}
          <section className="drawing-selection-actions" aria-label={label('selectionActions')}>{menuActions(['fit-selection', 'duplicate', 'delete'])}</section>
        </> : <>
          <p className="drawing-help">{label(controls.readOnly ? 'readOnly' : controls.selectionLocked ? 'locked' : controls.selected && controls.tool === 'select' ? 'selectionStyle' : 'nextObject')}</p>
          <fieldset className="drawing-style-fields" disabled={!controls.canStyle}>
            {styleFields.map(field => { const shared = styles?.get(field.style); if (!shared) return null;
              const value = shared.type === 'shared' ? shared.value.replace(/-legacy$/, '') : '';
              const name = ['fill', 'dash', 'size'].includes(field.id) ? label(field.id as DrawingLabel) : tr(`toolkit.toolbar.styleFields.${field.id}`);
              const labelValue = (value: string) => field.values ? tr(`toolkit.toolbar.styleValues.${field.values}.${value}`) : label(({ s: 'small', m: 'medium', l: 'large', xl: 'extraLarge', fill: 'solid' } as Record<string, DrawingLabel>)[value] ?? value as DrawingLabel);
              return <label key={field.id}><span>{name}</span><select aria-label={name} value={value} data-testid={`drawing-style-${field.id}`} onChange={event => styleChange(field.style, event.target.value)}>
                {shared.type === 'mixed' && <option value="" disabled>{tr('toolkit.toolbar.styleFields.mixed')}</option>}
                {field.style.values.filter(value => !value.endsWith('-legacy')).map(value => <option key={value} value={value}>{labelValue(value)}</option>)}
              </select></label>;
            })}
            {state.opacity && <label><span>{label('opacity')}</span><select aria-label={label('opacity')} value={state.opacity.type === 'shared' ? state.opacity.value : ''}
              onChange={event => { if (!captureToolkitControls(editor).canStyle) return; const value = Number(event.target.value); drawingTransaction(editor, () => { if (editor.isIn('select')) editor.setOpacityForSelectedShapes(value); editor.setOpacityForNextShapes(value); }); }}>
              {state.opacity.type === 'mixed' && <option value="" disabled>{tr('toolkit.toolbar.styleFields.mixed')}</option>}
              {[1, 0.75, 0.5, 0.25, 0.1].map(value => <option key={value} value={value}>{value * 100}%</option>)}
            </select></label>}
          </fieldset>
          {!styles?.size && <p className="drawing-help">{label('noStyles')}</p>}
          <p className="drawing-help">{label('colourHint')}</p>
          <details className="drawing-shortcuts"><summary>{tr('toolkit.toolbar.selection')}</summary><div className="drawing-arrange">{menuActions(['group', 'ungroup', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical'])}</div></details>
          <RepeatGrid selected={state.selected} disabled={!controls.canEditSelection} />
        </>}
      </div>
    </>)}
    {portal('palette', <div className="drawing-swatches" role="toolbar" aria-label={label('palette')}>
      {DefaultColorStyle.values.map(value => <button key={value} type="button" title={`${label('palette')}: ${label(value)}`}
        aria-label={`${label('palette')}: ${label(value)}`} aria-pressed={color?.type === 'shared' && color.value === value} disabled={!controls.canStyle || !color}
        onClick={() => styleChange(DefaultColorStyle, value)} style={{ backgroundColor: theme[value].solid }} data-testid={`drawing-colour-${value}`} />)}
    </div>)}
    {portal('status', <>
      <span className="drawing-status-text" role="status">{notice || (controls.readOnly ? label('readOnly') : controls.selectionLocked ? label('locked') : `${controls.selected} ${label('selected')} · ${state.shapes.length} ${label('items')}`)}</span>
      <span className="drawing-keyboard-hint" title={label('keyboard')}>{label('units')}</span>
      <button type="button" onClick={() => command('grid')} aria-pressed={state.grid}>{label('grid')}</button>
      <button type="button" onClick={() => command('snap')} aria-pressed={state.snap}>{label('snap')}</button>
      <div className="drawing-zoom" aria-label={label('zoom')}>
        <ToolButton label={label('zoomOut')} onClick={() => command('zoom-out')}>−</ToolButton>
        <select aria-label={label('zoom')} value="current" onChange={event => { if (event.target.value === 'fit') command('fit'); else if (event.target.value === 'selection') command('fit-selection'); else { editor.setCamera({ ...editor.getCamera(), z: Number(event.target.value) }); } }}>
          <option value="current" disabled>{Math.round(state.zoom * 100)}%</option>
          {[0.25, 0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value * 100}%</option>)}
          <option value="fit" disabled={!controls.hasShapes}>{actionLabel('fit')}</option><option value="selection" disabled={!controls.canFitSelection}>{actionLabel('fit-selection')}</option>
        </select>
        <ToolButton label={label('zoomIn')} onClick={() => command('zoom-in')}>+</ToolButton>
      </div>
    </>)}
  </>;
}
