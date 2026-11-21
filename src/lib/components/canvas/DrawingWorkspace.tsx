import {cadSnapIndicator} from './cad-snap';
import { setCanvasSurface, useCanvasSurface } from './canvas-surface';
import {cadConstruction} from './cad-construction';
import { getSelectedCadNodes, isCadNodeEditing, setCadNodeEditing } from './cad-node-selection';
import {CadPointEntry} from './CadPointEntry';
import {RepeatGrid} from './RepeatGrid';
import {DrawingAppearancePanel} from './DrawingAppearancePanel';
import {useAppearanceText} from './appearance-copy';
import {DrawingFindReplacePanel} from './DrawingFindReplacePanel';
import {useFindReplaceText} from './find-replace-copy';
import {DrawingSelectSamePanel} from './SelectSamePanel';
import {useSelectSameText} from './select-same-copy';
import {useParametricShapeText} from './parametric-shape-copy';
import {useRectangleShapeText} from './rectangle-shape-copy';
import {DrawingObjectsPanel} from './DrawingObjectsPanel';
import {DrawingPanelSession} from './DrawingPanelSession';
import {DrawingTransformPanel} from './DrawingTransformPanel';
import {DrawingGuidesPanel} from './DrawingGuidesPanel';
import {DrawingGuideAlignment} from './DrawingGuideAlignment';
import {useGuideText} from './guide-copy';
import {applyDrawingGuideChange, prepareDrawingGuideChange, readDrawingGuides, drawingGuidesAreValid, drawingGuidesBusy} from './drawing-guides';
import {beginDrawingGuideDrag, drawingGuideNotice} from './drawing-guide-drag';
import {isDrawingPointerGestureActive} from './drawing-pointer-gesture';
import {isDrawingSkewMode, setDrawingSkewMode, drawingSkewGesture, drawingSkewNotice} from './drawing-pick-skew';
import {readSkewSelection} from './drawing-skew';
import {usePickSkewText} from './pick-skew-copy';
import {drawingRotationNotice, drawingRotationPreview} from './drawing-pick-rotation';
import {useRotationPivotText} from './rotation-pivot-copy';
import {drawingPickGuideSnap} from './drawing-pick-guide-snap';
import {DrawingPenPanel} from './DrawingPenPanel';
import {DrawingFreehandControls} from './DrawingFreehandControls';
import {readCadFreehandOptions, setCadFreehandOptions} from './cad-freehand';
import {cadFreehandHover, cadFreehandNotice, cadFreehandPreview} from './CadFreehandTool';
import {drawingPenDiagnostics} from './drawing-pen-input';
import {enPen, usePenText} from './pen-copy';
import {enSkew, useSkewText} from './skew-copy';
import {openDrawingContextMenu} from './DrawingContextMenu';
import {DRAWING_UI_REQUEST, isDrawingUiRequest} from './drawing-ui-requests';
import {useObjectTreeText} from './object-tree-copy';
import {captureDrawingObjectStack, prepareDrawingObjectOrder, applyDrawingObjectOrder} from './drawing-object-tree';
import {RadialArrange} from './RadialArrange';
import {useArrangeTaskText, type ArrangeTask} from './arrange-task-copy';
import {cadPalettePatch} from './drawing-palette';
import {useOutlineText} from './outline-copy';
import {useOutlineToObjectText} from './outline-object-copy';
import {useNodeArrangeText} from './node-arrange-copy';
import {usePreflightText} from './preflight-copy';
import {TextPanel,ArrangePanel,MeasurePanel,FormScaleControl} from './WorkbenchPanels';
import {useWorkbenchText} from './workbench-copy';
import {textPointSize} from './workbench-operations';
import {applySelectedDrawingTextStyle, drawingTextPointSizeDisplay, type DrawingTextStylePatch} from './drawing-text-style';
import {getDrawingTextSpacing} from './drawing-text-spacing';
import {CadSnapPanel} from './CadSnapPanel';
import {useSnapText} from './snap-copy';
import {DrawingFontPicker, NextDrawingFontPicker} from './DrawingFonts';
import {applySelectedDrawingFont, clearSelectedDrawingFontOverrides, drawingFontValue, setNextDrawingFont} from './drawing-fonts';
import {useDrawingFontText} from './font-copy';
import {ProductionSaveButton} from './ProductionSaveButton';
import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowShapeArrowheadEndStyle, ArrowShapeArrowheadStartStyle, DefaultColorStyle, DefaultDashStyle,
  DefaultFillStyle, DefaultFontStyle, DefaultHorizontalAlignStyle, DefaultSizeStyle, DefaultTextAlignStyle,
  DefaultVerticalAlignStyle, GeoShapeGeoStyle, LineShapeSplineStyle, createShapeId,
  getDefaultColorTheme, useEditor, useIsDarkMode, useRelevantStyles, useValue,
  type EnumStyleProp, type TLDefaultColorStyle, type TLShapeId, type TLTextShape,
} from '@tldraw/tldraw';
import { captureToolkitControls } from './toolkit-controls';
import { applyDrawingCommand, drawingTransaction, transformDrawingSelection, type DrawingTransformField } from './drawing-commands';
import { useDrawingText, type DrawingLabel } from './drawing-copy';
import { DrawingPageNavigator } from './DrawingPageSetup';
import { CanvasModeContext } from './canvas-mode';
import { drawingPageBounds, fitDrawingPage, switchDrawingPage } from './drawing-pages';
import { planDrawingExport, type DrawingExportOptions } from './drawing-operations';
import { exportDrawingArtwork } from './drawing-artwork-export';
import { applyCadCompound, type CadCompoundOperation } from './cad-compound';
import { applyArrangePlan, arrangementRoots, prepareArrangePlan, type ArrangeOptions } from './drawing-arrange';
import { CadPanel } from './CadPanel';
import { cadCompoundFeedback, useCadAdvancedText } from './cad-advanced-copy';
import type { CadFocusRequest } from './CadAdvancedPanel';
import { useCadText, type CadLabel } from './cad-copy';
import { canvasLengthToUnit, canvasPointToCad, readCadSettings, type CadSettings } from './cad-settings';
import { getCadSelection, nudgeCadSelection, transformCadSelection, type CadAnchor } from './cad-geometry';
import { useVectorText } from './cad-vector-copy';
import './drawing-workspace.css';

type Alignment = Pick<Extract<ArrangeOptions, { kind: 'align' }>, 'axis' | 'alignment'>;
const alignmentKeys: Readonly<Partial<Record<string, Alignment>>> = {
  l: { axis: 'x', alignment: 'start' },
  c: { axis: 'x', alignment: 'center' },
  r: { axis: 'x', alignment: 'end' },
  t: { axis: 'y', alignment: 'start' },
  e: { axis: 'y', alignment: 'center' },
  b: { axis: 'y', alignment: 'end' },
};

const objectShortcuts: Readonly<Partial<Record<string, string>>> = {
  front: 'Home', back: 'End', forward: 'PageUp', backward: 'PageDown', group: 'G', ungroup: 'U',
};
const objectActionByKey = new Map(Object.entries(objectShortcuts).map(([action, key]) => [key?.toLowerCase(), action]));

type Slot = 'commands' | 'standard' | 'properties' | 'tools' | 'docker' | 'dockerTabs' | 'palette' | 'status' | 'rulerX' | 'rulerY' | 'rulerOrigin';
type Panel = 'properties' | 'objects' | 'cad' | 'text' | 'arrange' | 'measure' | 'snap' | 'guides' | 'pen' | null;
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
    ['commands', 'standard', 'properties', 'tools', 'docker', 'dockerTabs', 'palette', 'status', 'rulerX', 'rulerY', 'rulerOrigin'].map(name => [name,
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
        <div className="drawing-standard" role="toolbar" aria-label={label('standardToolbar')} ref={refs.standard} />
        <div className="drawing-properties" ref={refs.properties} />
        <div className="drawing-toolbox" ref={refs.tools} />
      </>}
      <div className="drawing-page">
        {!hidden && <><span className="drawing-ruler-origin" ref={refs.rulerOrigin} />
          <div className="drawing-ruler drawing-ruler-x" ref={refs.rulerX} />
          <div className="drawing-ruler drawing-ruler-y" ref={refs.rulerY} />
        </>}
        <div className="drawing-viewport">{children}</div>
      </div>
      {!hidden && <><aside className="drawing-docker" hidden={!panel} ref={refs.docker} />
        <div className="drawing-docker-rail" ref={refs.dockerTabs} />
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
  'cad-freehand': <><path d="m4 20 3-10 9-7 5 5-7 9-10 3Zm3-10 7 7M4 20l7-7" /><circle cx="12" cy="12" r="1.5" /></>,
  pen: <><path d="m4 20 3-10 9-7 5 5-7 9-10 3ZM4 20l8-8M18 17v5m-3-2h6" /><circle cx="12" cy="12" r="1.5" /></>,
  line: <><path d="m4 20 16-16" /><circle cx="4" cy="20" r="1.5" /><circle cx="20" cy="4" r="1.5" /></>,
  'cad-polyline': <><path d="M4 19 9 5l10 7-6 7Z" /><rect x="2" y="17" width="4" height="4" /><rect x="7" y="3" width="4" height="4" /><rect x="17" y="10" width="4" height="4" /></>,
  'cad-bezier': <><path d="M4 18C5 3 19 21 20 6M4 18 6 7M18 17 20 6" /><rect x="2" y="16" width="4" height="4" /><rect x="18" y="4" width="4" height="4" /><circle cx="6" cy="7" r="1.5" /><circle cx="18" cy="17" r="1.5" /></>,
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
  duplicate: <><rect x="8" y="8" width="12" height="12" /><path d="M16 5V3H3v13h2" /></>,
  fit: <><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5" /><rect x="7" y="8" width="10" height="8" /></>,
  'fit-selection': <><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M9 12h6m-3-3v6" /></>,
  files: <><path d="M3 7V4h7l3 3h8v13H3Z" /><path d="M3 10h18" /></>,
  paint: <><path d="m4 11 7-7 8 8-7 7-8-8Zm0 0h15M7 3l5 5m-9 13h18" /><path d="M20 14s-2 3-2 4a2 2 0 0 0 4 0c0-1-2-4-2-4Z" /></>,
  properties: <><path d="M3 5h18M3 12h18M3 19h18" /><circle cx="8" cy="5" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="8" cy="19" r="2" /></>,
  objects: <><path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5" /></>,
  guides: <><path d="M3 4h18M4 3v18"/><path d="M3 12h18M12 3v18" strokeDasharray="3 2"/><path d="M7 4v3m5-3v3m5-3v3M4 7h3m-3 5h3m-3 5h3"/></>,
  skew: <><path d="m8 6 12 0-4 12H4ZM3 3h15m-3-2 3 2-3 2M6 21h15m-12-2-3 2 3 2"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></>,
  unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8-1" /></>,
  'cad-arc-three': <><path d="M4 18A9 9 0 1 1 20 7"/><circle cx="4" cy="18" r="1.5"/><circle cx="6" cy="5" r="1.5"/><circle cx="20" cy="7" r="1.5"/></>,
  'cad-circle-three': <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19" cy="16" r="2"/></>,
  'cad-circle': <><circle cx="12" cy="12" r="8"/><path d="M12 12h8M10 12h4m-2-2v4"/></>,
  'cad-dimension': <><path d="M3 4v16M21 4v16M3 12h18m-14-3-4 3 4 3m10-6 4 3-4 3"/></>,
  snap: <><path d="M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4ZM5 8h5m4 0h5"/></>,
  nodes: <><path d="M4 18C4 4 20 20 20 6"/><rect x="2" y="16" width="4" height="4"/><rect x="18" y="4" width="4" height="4"/></>,
  arrange: <><path d="M3 3v18M3 7h18M3 17h13"/><rect x="6" y="4" width="12" height="6"/><rect x="6" y="14" width="7" height="6"/></>,
  'text-curves': <><path d="M4 20 12 4l8 16M8 13h8"/><rect x="2" y="18" width="4" height="4"/><rect x="10" y="2" width="4" height="4"/><rect x="18" y="18" width="4" height="4"/></>,
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
const toolGroups = [
  { id: 'select', tools: ['select'] }, { id: 'nodes', tools: ['nodes'] }, { id: 'hand', tools: ['hand'] },
  { id: 'curves', tools: ['cad-freehand', 'cad-polyline', 'cad-bezier', 'cad-arc-three', 'line', 'draw'] },
  { id: 'rectangle', tools: ['rectangle'] },
  { id: 'ellipse', tools: ['ellipse', 'cad-circle', 'cad-circle-three'] },
  { id: 'shapes', tools: ['pentagon', 'triangle', 'diamond', 'star'] },
  { id: 'text', tools: ['text'] }, { id: 'dimension', tools: ['cad-dimension'] },
  { id: 'annotations', tools: ['arrow', 'highlight', 'eraser', 'frame'] },
];
const toolKeys: Record<string, string> = { select: 'toolkit.draw.selectTitle', draw: 'toolkit.draw.drawTitle', text: 'toolkit.draw.textTitle', arrow: 'toolkit.draw.arrowTitle' };
const shortcut: Record<string, string> = { 'cad-freehand': 'F5', rectangle: 'F6', ellipse: 'F7', text: 'F8', select: 'V', draw: 'D', line: 'L', arrow: 'A', hand: 'H', eraser: 'E' };

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

const textNumericFields = {
  pointSize: { label: 'fontSize', min: 1, max: 3000, testId: 'drawing-text-point-size' },
  letterSpacing: { label: 'letterSpacing', min: -50, max: 200, testId: 'drawing-text-letter-spacing' },
  lineHeight: { label: 'lineSpacing', min: 50, max: 500, testId: 'drawing-text-line-spacing' },
} as const;

function TextNumericStyleField({ field, selected, value, disabled }: {
  field: keyof typeof textNumericFields; selected: readonly TLShapeId[]; value: number | undefined; disabled: boolean;
}) {
  const editor = useEditor();
  const { label, tr } = useDrawingText();
  const workbenchLabel = useWorkbenchText();
  const config = textNumericFields[field];
  const errorId = useId();
  const displayed = value === undefined ? '' : String(drawingTextPointSizeDisplay(value));
  const [draft, setDraft] = useState(displayed);
  const [error, setError] = useState<'invalid' | 'changedFailed' | null>(null);
  const dirty = useRef(false), cancelBlur = useRef(false);
  useEffect(() => { setDraft(displayed); setError(null); dirty.current = false; }, [value, field]);
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    if (!dirty.current) return;
    const number = draft.trim() ? Number(draft) : NaN;
    if (!Number.isFinite(number) || number < config.min || number > config.max) { setError('invalid'); return; }
    if (!applySelectedDrawingTextStyle(editor, selected, { [field]: field === 'lineHeight' ? number / 100 : number })) { setError('changedFailed'); return; }
    dirty.current = false; setError(null);
  }
  return <>
    <label className={`drawing-property-field ${field === 'pointSize' ? 'drawing-property-point-size' : 'drawing-property-text-spacing'}`}><span title={workbenchLabel(config.label)}>{workbenchLabel(config.label)}</span>
      <input type="number" aria-label={workbenchLabel(config.label)} min={config.min} max={config.max} step="any" value={draft}
        placeholder={value === undefined ? tr('toolkit.toolbar.styleFields.mixed') : undefined} disabled={disabled}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined} data-testid={config.testId}
        onChange={event => { dirty.current = true; setDraft(event.target.value); setError(null); }} onBlur={commit}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') {
            event.preventDefault(); cancelBlur.current = true; dirty.current = false;
            setDraft(displayed); setError(null); event.currentTarget.blur();
          }
        }} />
    </label>
    {error && <span className="drawing-property-error" id={errorId} role="alert">{
      error === 'changedFailed' ? label(error) : field === 'pointSize' ? label('textSizeInvalid') : workbenchLabel(field === 'letterSpacing' ? 'letterSpacingInvalid' : 'lineSpacingInvalid')
    }</span>}
  </>;
}

function SelectedTextProperties({ shapes, disabled, onEdit, onOutlines, onFonts }: {
  shapes: TLTextShape[]; disabled: boolean; onEdit: () => void; onOutlines: () => void; onFonts: () => void;
}) {
  const editor = useEditor();
  const { label, tr } = useDrawingText();
  const workbenchLabel = useWorkbenchText();
  const fontLabel = useDrawingFontText();
  const [failed, setFailed] = useState(false);
  const [fontFailed, setFontFailed] = useState(false);
  const selected = shapes.map(shape => shape.id);
  const shared = <T,>(read: (shape: TLTextShape) => T): T | undefined => {
    const value = read(shapes[0]);
    return shapes.every(shape => read(shape) === value) ? value : undefined;
  };
  const font = shared(drawingFontValue), align = shared(shape => shape.props.textAlign);
  const points = shared(shape => drawingTextPointSizeDisplay(textPointSize(shape))), autoWidth = shared(shape => shape.props.autoSize);
  const letterSpacing = shared(shape => drawingTextPointSizeDisplay(getDrawingTextSpacing(shape).letterSpacing));
  const lineSpacing = shared(shape => drawingTextPointSizeDisplay(getDrawingTextSpacing(shape).lineHeight * 100));
  const mixed = tr('toolkit.toolbar.styleFields.mixed');
  const apply = (patch: DrawingTextStylePatch) => setFailed(!applySelectedDrawingTextStyle(editor, selected, patch));
  return <div className="drawing-context-properties" role="group" aria-label={label('selectedText')} data-testid="drawing-selected-text-properties">
    <DrawingFontPicker compact value={font} disabled={disabled} testId="drawing-text-font" onManage={onFonts}
      onChange={value => { setFailed(false); setFontFailed(!applySelectedDrawingFont(editor, selected, value)); }} />
    <TextNumericStyleField field="pointSize" selected={selected} value={points} disabled={disabled} />
    <TextNumericStyleField field="letterSpacing" selected={selected} value={letterSpacing} disabled={disabled} />
    <TextNumericStyleField field="lineHeight" selected={selected} value={lineSpacing} disabled={disabled} />
    <label className="drawing-property-field"><span>{workbenchLabel('align')}</span>
      <select aria-label={workbenchLabel('align')} disabled={disabled} value={align ?? ''} data-testid="drawing-text-align"
        onChange={event => apply({ textAlign: event.target.value as TLTextShape['props']['textAlign'] })}>
        {align === undefined && <option value="" disabled>{mixed}</option>}
        {DefaultTextAlignStyle.values.map(value => <option key={value} value={value}>{tr(`toolkit.toolbar.styleValues.horizontal.${value}`)}</option>)}
      </select>
    </label>
    <label className="drawing-property-field"><span>{workbenchLabel('width')}</span>
      <select aria-label={workbenchLabel('autoWidth')} disabled={disabled} value={autoWidth === undefined ? '' : String(autoWidth)} data-testid="drawing-text-auto-width"
        onChange={event => apply({ autoSize: event.target.value === 'true' })}>
        {autoWidth === undefined && <option value="" disabled>{mixed}</option>}
        <option value="true">{workbenchLabel('autoWidth')}</option><option value="false">{label('fixedTextWidth')}</option>
      </select>
    </label>
    <span className="drawing-divider" />
    <div className="drawing-property-actions">
      <ToolButton icon="text" label={label('editText')} disabled={disabled || shapes.length !== 1} onClick={onEdit} testId="drawing-text-edit">{label('editText')}</ToolButton>
      <ToolButton icon="text-curves" label={workbenchLabel('outlines')} disabled={disabled || shapes.length !== 1} onClick={onOutlines} testId="drawing-text-outlines">{workbenchLabel('outlines')}</ToolButton>
    </div>
    {failed && <span className="drawing-property-error" role="alert">{label('changedFailed')}</span>}
    {fontFailed && <span className="drawing-property-error" role="alert">{fontLabel('applyFailed')}</span>}
  </div>;
}

function CadNumberField({ field, value, disabled, label, settings, anchor, proportional }: {
  field: DrawingTransformField; value: number | undefined; disabled: boolean; label: string;
  settings: CadSettings; anchor: CadAnchor; proportional: boolean;
}) {
  const editor = useEditor(); const { label: cadLabel } = useCadText(); const errorId = useId();
  const displayed = value === undefined ? '' : String(Number(value.toFixed(settings.precision)));
  const [draft, setDraft] = useState(displayed); const [failed, setFailed] = useState(false);
  const [editedFor, setEditedFor] = useState<string | null>(null);
  const editIdentity = JSON.stringify([value, settings.precision, settings.unit, settings.scale, anchor]);
  const cancelBlur = useRef(false);
  useEffect(() => { setDraft(displayed); setFailed(false); setEditedFor(null); }, [value, settings.precision, settings.unit, settings.scale, anchor]);
  const valid = !!draft.trim() && Number.isFinite(Number(draft)) && Math.abs(Number(draft)) <= 1_000_000 && (!['w', 'h'].includes(field) || Number(draft) > 0);
  // A horizontal or vertical line legitimately displays a zero extent. Validate
  // edited input only; selecting existing geometry must not announce an error.
  const hasError = value !== undefined && editedFor === editIdentity && ((draft !== displayed && !valid) || failed);
  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    if (draft === displayed) return;
    if (!valid) return;
    if (!transformCadSelection(editor, field, Number(draft), settings, anchor, proportional)) { setFailed(true); return; }
    setFailed(false);
  }
  return <label className="drawing-number"><span>{field === 'rotation' ? '∠' : field.toUpperCase()}</span>
    <input type="number" aria-label={`${label} (${field === 'rotation' ? '°' : settings.unit})`} aria-invalid={hasError}
      aria-describedby={hasError ? errorId : undefined} title={hasError && failed ? cadLabel('failed') : label}
      value={draft} disabled={disabled || value === undefined} step={field === 'rotation' ? 1 : settings.nudge}
      onChange={event => { setDraft(event.target.value); setFailed(false); setEditedFor(editIdentity); }} onBlur={commit}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { cancelBlur.current = true; setDraft(displayed); setFailed(false); setEditedFor(null); event.currentTarget.blur(); } }} />
    {hasError && <span className="drawing-sr-only" id={errorId} role="alert">{cadLabel(failed ? 'failed' : 'invalidNumber')}</span>}
  </label>;
}

const cadAnchors: Array<[CadAnchor, CadLabel]> = [
  ['top-left', 'anchorTopLeft'], ['top', 'anchorTop'], ['top-right', 'anchorTopRight'],
  ['left', 'anchorLeft'], ['center', 'anchorCenter'], ['right', 'anchorRight'],
  ['bottom-left', 'anchorBottomLeft'], ['bottom', 'anchorBottom'], ['bottom-right', 'anchorBottomRight'],
];
function CadAnchorControl({ value, onChange }: { value: CadAnchor; onChange: (anchor: CadAnchor) => void }) {
  const { label } = useCadText();
  return <label className="drawing-cad-anchor" title={label('anchor')}>
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">{cadAnchors.map(([anchor], index) =>
      <rect key={anchor} x={4 + index % 3 * 8} y={4 + Math.floor(index / 3) * 8} width="4" height="4" fill={anchor === value ? 'var(--brand)' : 'currentColor'} opacity={anchor === value ? 1 : .35} />)}</svg>
    <select value={value} aria-label={label('anchor')} onChange={event => onChange(event.target.value as CadAnchor)}>
      {cadAnchors.map(([anchor, key]) => <option key={anchor} value={anchor}>{label(key)}</option>)}
    </select>
  </label>;
}

function Ruler({ vertical = false, settings, onGuides }: { vertical?: boolean; settings: CadSettings | null; onGuides: () => void }) {
  const editor = useEditor();
  const t = useGuideText();
  const bounds = useValue('drawing ruler', () => editor.getViewportPageBounds(), [editor]);
  const zoom = useValue('drawing ruler zoom', () => editor.getZoomLevel(), [editor]);
  const canvasOrigin = vertical ? bounds.y : bounds.x;
  const length = vertical ? bounds.h : bounds.w;
  const unitsPerCanvas = settings ? canvasLengthToUnit(1, settings) : 1;
  const unitPixels = zoom / unitsPerCanvas;
  const start = settings ? canvasPointToCad({ x: bounds.x, y: bounds.y }, settings)[vertical ? 'y' : 'x'] : canvasOrigin;
  const end = start + length * unitsPerCanvas * (vertical && settings ? -1 : 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(70 / unitPixels)));
  const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n * unitPixels >= 60) ?? magnitude * 10;
  const first = Math.ceil(Math.min(start, end) / step) * step;
  const ticks: ReactNode[] = [];
  const precision = Math.min(6, Math.max(settings?.precision ?? 2, -Math.floor(Math.log10(step))));
  for (let value = first, count = 0; value <= Math.max(start, end) && count < 100; value += step, count++) {
    const point = (value - start) * unitPixels * (vertical && settings ? -1 : 1);
    const text = Number(value.toFixed(precision));
    ticks.push(<g key={count}>{vertical ? <><path d={`M13 ${point}h7`} /><text x="9" y={point + 3} transform={`rotate(-90 9 ${point + 3})`}>{text}</text></> :
      <><path d={`M${point} 13v7`} /><text x={point + 3} y="10">{text}</text></>}</g>);
  }
  const description = t(vertical ? 'dragVertical' : 'dragHorizontal');
  return <div className={`drawing-ruler-guide-control${vertical ? ' is-vertical' : ''}`} role="button" tabIndex={0}
    aria-label={description} title={description} data-testid={vertical ? 'drawing-ruler-vertical' : 'drawing-ruler-horizontal'}
    onPointerDown={event => {
      if (beginDrawingGuideDrag(editor, { axis: vertical ? 'x' : 'y' }, event.nativeEvent, event.currentTarget)) {
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
      }
    }}
    onDoubleClick={onGuides} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onGuides(); }
    }}>
    <svg width={vertical ? '20' : '100%'} height={vertical ? '100%' : '20'} aria-hidden="true">{ticks}</svg>
  </div>;
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
  const { label: cadLabel } = useCadText();
  const { label: advancedLabel } = useCadAdvancedText();
  const vectorLabel = useVectorText();
  const appearanceLabel = useAppearanceText();
  const findReplaceLabel = useFindReplaceText();
  const selectSameLabel = useSelectSameText();
  const parametricShapeLabel = useParametricShapeText();
  const rectangleShapeLabel = useRectangleShapeText();
  const arrangeTaskLabel = useArrangeTaskText();
  const outlineLabel = useOutlineText();
  const outlineObjectLabel = useOutlineToObjectText();
  const objectTreeLabel = useObjectTreeText();
  const guideLabel = useGuideText();
  const pickSkewLabel = usePickSkewText();
  const rotationLabel = useRotationPivotText();
  const penLabel = usePenText();
  const skewLabel = useSkewText();
  const skewErrorText = (code: string) => skewLabel(Object.hasOwn(enSkew, code) ? code as keyof typeof enSkew : 'failed');
  const nodeArrangeLabel = useNodeArrangeText();
  const preflightLabel = usePreflightText();
  const [arrangeTask, setArrangeTask] = useState<ArrangeTask>('align');
  const [transformFocusRequest, setTransformFocusRequest] = useState(0);
  const workbenchLabel = useWorkbenchText();
  const snapLabel = useSnapText();
  const activeSnap = useValue('CAD snap target', () => editor.snaps.getIndicators().some(value => value.id === 'oms-cad-snap') ? cadSnapIndicator(editor).get() : null, [editor]);
  const construction = useValue('CAD construction status', () => cadConstruction(editor).get(), [editor]);
  const nodeEditing = useValue('CAD node editing mode', () => isCadNodeEditing(editor), [editor]);
  const nodeCount = useValue('Selected CAD node count', () =>
    nodeEditing && editor.getOnlySelectedShape()?.type === 'cad-bezier' ? getSelectedCadNodes(editor).length : null,
    [editor, nodeEditing]);
  const constructionHint = construction ? workbenchLabel(construction.points.length === 0 ? 'pickFirst' : construction.points.length === 1 ? 'pickThrough' : construction.kind === 'arc' ? 'pickArcEnd' : 'pickThird') : '';
  const [toolGroup, setToolGroup] = useState<string | null>(null);
  const [groupTools, setGroupTools] = useState<Record<string, string>>({});
  const [flyoutPosition, setFlyoutPosition] = useState({ left: 0, top: 0, maxHeight: 0 });
  const flyoutTrigger = useRef<HTMLButtonElement | null>(null);
  const [saveFormat,setSaveFormat]=useState<'svg'|'png'>('png');
  const [lastPanel, setLastPanel] = useState<Exclude<Panel, null>>('properties');
  const [fontFocusRequest, setFontFocusRequest] = useState(0);
  const [repeatFocusRequest, setRepeatFocusRequest] = useState(0);
  const [appearanceFocusRequest, setAppearanceFocusRequest] = useState(0);
  const [findFocusRequest, setFindFocusRequest] = useState(0);
  const [selectSameFocusRequest, setSelectSameFocusRequest] = useState(0);
  const [objectOrderFocusRequest, setObjectOrderFocusRequest] = useState(0);
  const [guidesFocusRequest, setGuidesFocusRequest] = useState(0);
  useEffect(() => { if (context?.panel) setLastPanel(context.panel); }, [context?.panel]);
  const [cadFocus, setCadFocus] = useState<CadFocusRequest>();
  const multiplePages = useContext(CanvasModeContext) === 'toolkit';
  const pages = useValue('drawing page list', () => editor.getPages(), [editor]);
  const pageBounds = useValue('drawing page for export', () => drawingPageBounds(editor), [editor]);
  const settings = useValue('drawing cad settings', () => readCadSettings(editor), [editor]);
  const [cadAnchor, setCadAnchor] = useState<CadAnchor>('bottom-left');
  const [proportional, setProportional] = useState(false);
  const cadSelection = useValue('drawing cad transform', () => settings ? getCadSelection(editor, settings, cadAnchor) : null, [editor, settings, cadAnchor]);
  const isDarkMode = useIsDarkMode();
  const canvasSurface = useCanvasSurface();
  const styles = useRelevantStyles();
  const controls = useValue('drawing controls', () => captureToolkitControls(editor, editor.getStyleForNextShape(GeoShapeGeoStyle)), [editor]);
  const state = useValue('drawing display', () => ({ page: editor.getCurrentPageId(), shapes: editor.getCurrentPageShapesSorted(), selected: editor.getSelectedShapeIds(), selectedShapes: editor.getSelectedShapes(),
    zoom: editor.getZoomLevel(), grid: editor.getInstanceState().isGridMode, snap: editor.user.getIsSnapMode(),
    opacity: editor.getSharedOpacity(), single: editor.getOnlySelectedShape() }), [editor]);
  const [notice, setNotice] = useState('');
  const guides = useValue('Guidelines toolbar state', () => ({ ...readDrawingGuides(editor), valid: drawingGuidesAreValid(editor) }), [editor]);
  const guideNotice = useValue('Guideline editing message', () => drawingGuideNotice(editor).get(), [editor]);
  const skewMode = useValue('Pick rotate skew state', () => isDrawingSkewMode(editor), [editor]);
  const skewSelection = useValue('Pick skew eligibility', () => readSkewSelection(editor), [editor]);
  const skewGesture = useValue('Pick skew preview', () => drawingSkewGesture(editor).get(), [editor]);
  const skewNotice = useValue('Pick skew message', () => drawingSkewNotice(editor).get(), [editor]);
  const rotationPreview = useValue('Custom rotation status', () => drawingRotationPreview(editor).get(), [editor]);
  const rotationNotice = useValue('Custom rotation notice', () => drawingRotationNotice(editor).get(), [editor]);
  const pickGuideSnap = useValue('Pick guideline target', () => drawingPickGuideSnap(editor).get(), [editor]);
  const rotationNoticeText = rotationNotice ? rotationLabel(rotationNotice) : '';
  const freehandOptions = useValue('Next freehand stroke', () => readCadFreehandOptions(editor), [editor]);
  const freehandStatus = useValue('Freehand gesture status', () => {
    const preview = cadFreehandPreview(editor).get();
    return preview ? preview.error ?? (preview.continuation ? preview.continuation.closing ? 'closing' : 'continuing' : 'drawing') : null;
  }, [editor]);
  const freehandHover = useValue('Freehand continuation target', () => editor.getCurrentToolId() === 'cad-freehand' && !!cadFreehandHover(editor).get(), [editor]);
  const freehandNotice = useValue('Freehand completion notice', () => cadFreehandNotice(editor).get(), [editor]);
  const penNotice = useValue('Pen interruption notice', () => drawingPenDiagnostics(editor).get().notice, [editor]);
  const penMessage = (code: string) => penLabel(Object.hasOwn(enPen, code) ? code as keyof typeof enPen : 'failed');
  const freehandHint = freehandStatus ? freehandStatus === 'drawing' ? penLabel('drawHelp') : penMessage(freehandStatus) : freehandHover ? penLabel('continueStart') : null;
  const freehandNoticeText = freehandNotice ? penMessage(freehandNotice) : '';
  const penNoticeText = penNotice ? penMessage(penNotice) : '';
  const guideNoticeText = guideNotice ? guideLabel(guideNotice) : '';
  const skewNoticeText = skewNotice ? skewNotice === 'canceled' ? pickSkewLabel('canceled') : skewErrorText(skewNotice) : '';
  useEffect(() => { if (guideNoticeText) setNotice(guideNoticeText); }, [guideNoticeText]);
  useEffect(() => { if (skewNoticeText) setNotice(skewNoticeText); }, [skewNoticeText]);
  useEffect(() => { if (rotationNoticeText) setNotice(rotationNoticeText); }, [rotationNoticeText]);
  useEffect(() => { if (freehandNoticeText) setNotice(freehandNoticeText); }, [freehandNoticeText]);
  useEffect(() => { if (penNoticeText) setNotice(penNoticeText); }, [penNoticeText]);
  const [busy, setBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<DrawingExportOptions>({ scope: 'selected', scale: 1, background: false, padding: 24 });
  const exportPlans = useValue('drawing export eligibility', () => openMenu === 'file' ? {
    svg: planDrawingExport(editor, 'svg', exportOptions),
    png: planDrawingExport(editor, 'png', exportOptions),
  } : null, [editor, openMenu, exportOptions]);
  const [exportError, setExportError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const exportLifetime = useRef<AbortController>();
  useEffect(() => {
    alive.current = true; const controller = new AbortController(); exportLifetime.current = controller;
    return () => { alive.current = false; controller.abort(); };
  }, []);
  useEffect(() => {
    const container = editor.getContainer();
    const listen = (event: Event) => { const detail = (event as CustomEvent).detail; setNotice(detail?.message ?? ''); setBusy(!!detail?.busy); };
    container.addEventListener('oms:canvas-upload', listen);
    return () => container.removeEventListener('oms:canvas-upload', listen);
  }, [editor]);

  const toolLabel = (tool: string) => tool === 'cad-freehand' ? penLabel('freehand') : tool === 'draw' ? penLabel('sketch') : tool === 'cad-arc-three' ? workbenchLabel('arcThree') : tool === 'cad-circle-three' ? workbenchLabel('circleThree') : tool === 'cad-circle' ? workbenchLabel('circle') : tool === 'cad-dimension' ? workbenchLabel('dimension') : tool === 'nodes' ? workbenchLabel('nodes') : tool === 'cad-polyline' ? cadLabel('drawPolyline') : tool === 'cad-bezier' ? advancedLabel('bezierTool') : tr(toolKeys[tool] ?? (tool === 'pentagon' ? 'toolkit.toolbar.styleValues.geo.pentagon' : `toolkit.toolbar.${tool}`));
  function chooseTool(tool: string) {
    if (editor.getInstanceState().isReadonly && !['hand', 'select', 'nodes'].includes(tool)) return;
    if(tool==='nodes'){focusCad('nodes');setToolGroup(null);return;}
    setDrawingSkewMode(editor, false);
    setCadNodeEditing(editor, false);
    setToolGroup(null);
    const group = toolGroups.find(group => group.tools.includes(tool));
    if (group) setGroupTools(previous => ({ ...previous, [group.id]: tool }));
    if(tool==='text')context?.setPanel('text');
    if(['cad-dimension','cad-arc-three','cad-circle-three','cad-circle'].includes(tool))context?.setPanel('measure');
    editor.complete();
    if (readCadSettings(editor) && (geometryTools.includes(tool as any) || tool === 'line')) {
      editor.setStyleForNextShapes(DefaultDashStyle, 'solid'); editor.setStyleForNextShapes(DefaultFillStyle, 'none');
      if (tool === 'line') editor.setStyleForNextShapes(LineShapeSplineStyle, 'line');
    }
    if (geometryTools.includes(tool as any)) { editor.setStyleForNextShapes(GeoShapeGeoStyle, tool as any); editor.setCurrentTool('geo'); }
    else editor.setCurrentTool(tool);
    editor.focus();
  }
  function toggleToolGroup(group: typeof toolGroups[number], trigger: HTMLButtonElement, focusFirst = false) {
    const focus = () => context?.root.current?.querySelector<HTMLButtonElement>('.drawing-tool-flyout button:not(:disabled)')?.focus();
    if (toolGroup === group.id) { if (focusFirst) focus(); else setToolGroup(null); return; }
    const rootBounds = context?.root.current?.getBoundingClientRect();
    const toolboxBounds = context?.hosts.tools?.getBoundingClientRect();
    if (!rootBounds || !toolboxBounds) return;
    const maxHeight = Math.max(0, toolboxBounds.height - 8);
    const flyoutHeight = Math.min(maxHeight, group.tools.length * 40 + 8);
    const top = Math.max(toolboxBounds.top + 4, Math.min(trigger.getBoundingClientRect().top, toolboxBounds.bottom - flyoutHeight - 4));
    flyoutTrigger.current = trigger;
    setFlyoutPosition({ left: toolboxBounds.right - rootBounds.left, top: top - rootBounds.top, maxHeight: Math.max(0, toolboxBounds.bottom - top - 4) });
    setToolGroup(group.id);
    if (focusFirst) requestAnimationFrame(focus);
  }
  useEffect(() => {
    if (toolGroup === null) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.drawing-toolbox, .drawing-tool-flyout')) setToolGroup(null);
    };
    const close = () => setToolGroup(null);
    document.addEventListener('pointerdown', closeOutside);
    context?.hosts.tools?.addEventListener('scroll', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      context?.hosts.tools?.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [toolGroup, context?.hosts.tools]);
  function command(action: string) { if (!applyDrawingCommand(editor, action)) setNotice(label('changedFailed')); else setNotice(''); }
  function focusCad(section: CadFocusRequest['section']) {
    if (section === 'nodes' || section === 'nodeArrange' || section === 'nodeReduce' || section === 'convert') {
      editor.complete(); editor.setCurrentTool('select'); setCadNodeEditing(editor, true);
    }
    context?.setPanel('cad'); closeMenus();
    setCadFocus(previous => ({ section, sequence: (previous?.sequence ?? 0) + 1 }));
  }
  function compound(operation: CadCompoundOperation) {
    const settings = readCadSettings(editor);
    let code: string | undefined;
    const applied = settings && applyCadCompound(editor, settings, operation, issue => { code = issue; });
    setNotice(advancedLabel(applied && !code ? 'applied' : settings ? cadCompoundFeedback(code) : 'settingsRequired'));
    closeMenus();
  }
  function closeMenus(restoreFocus = false) {
    const trigger = restoreFocus && openMenu ? context?.root.current?.querySelector<HTMLElement>(`[data-drawing-menu="${openMenu}"] > summary`) : null;
    setOpenMenu(null); trigger?.focus();
  }
  function openArrange(task: ArrangeTask = 'align') {
    context?.setPanel('arrange');
    setArrangeTask(task);
    closeMenus();
  }
  function openTransform() {
    openArrange('transform');
    setTransformFocusRequest(value => value + 1);
  }
  function openRepeat() {
    openArrange('repeat');
    setRepeatFocusRequest(value => value + 1);
    closeMenus();
  }
  function openAppearance() {
    context?.setPanel('properties');
    setAppearanceFocusRequest(value => value + 1);
    closeMenus();
  }
  function openFindReplace() {
    context?.setPanel('text');
    setFindFocusRequest(value => value + 1);
    closeMenus();
  }
  function openSelectSame() {
    context?.setPanel('objects');
    setSelectSameFocusRequest(value => value + 1);
    closeMenus();
  }
  function openObjectOrder() {
    context?.setPanel('objects');
    setObjectOrderFocusRequest(value => value + 1);
    closeMenus();
  }
  function openGuides() {
    context?.setPanel('guides');
    setGuidesFocusRequest(value => value + 1);
    closeMenus();
  }
  function toggleGuides() {
    try {
      const plan = prepareDrawingGuideChange(editor, { kind: 'settings', visible: !readDrawingGuides(editor).visible });
      if (!applyDrawingGuideChange(editor, plan)) setNotice(guideLabel('failed'));
    } catch { setNotice(guideLabel('failed')); }
    closeMenus();
  }
  function togglePickSkew() {
    setToolGroup(null); closeMenus(); drawingGuideNotice(editor).set(null);
    if (setDrawingSkewMode(editor, !isDrawingSkewMode(editor))) { setNotice(''); editor.focus(); }
    else setNotice(skewErrorText(readSkewSelection(editor).error ?? 'failed'));
  }
  function reverseObjectOrder() {
    const plan = prepareDrawingObjectOrder(editor, { kind: 'reverse' });
    setNotice(plan && applyDrawingObjectOrder(editor, plan) ? '' : label('changedFailed'));
    closeMenus();
  }
  useEffect(() => {
    const container = editor.getContainer();
    const requested = (event: Event) => {
      const request = (event as CustomEvent<unknown>).detail;
      if (!isDrawingUiRequest(request)) return;
      setToolGroup(null); closeMenus();
      if (request.kind === 'command') command(request.action);
      else if (request.kind === 'cad') focusCad(request.action);
      else if (request.kind === 'objects') {
        if (request.action === 'reverse') reverseObjectOrder(); else openObjectOrder();
      }
      else if (request.action === 'transform') openTransform();
      else if (request.action === 'repeat') openRepeat();
      else if (request.action === 'guides') openGuides();
      else if (request.action === 'align' || request.action === 'radial') openArrange(request.action);
      else context?.setPanel(request.action);
    };
    container.addEventListener(DRAWING_UI_REQUEST, requested);
    return () => container.removeEventListener(DRAWING_UI_REQUEST, requested);
  }, [editor, context?.setPanel, label]);
  function menuSummary(name: string, text: string) {
    return <summary aria-expanded={openMenu === name} onClick={event => { event.preventDefault(); setOpenMenu(openMenu === name ? null : name); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation(); setOpenMenu(name);
          const trigger = event.currentTarget;
          const menu = trigger.parentElement;
          const last = event.key === 'ArrowUp';
          requestAnimationFrame(() => {
            const choices = Array.from(menu?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),details > summary') ?? [])
              .filter(choice => choice !== trigger && choice.getClientRects().length > 0);
            choices[last ? choices.length - 1 : 0]?.focus();
          });
        }
      }}>{text}</summary>;
  }
  function navigateMenus(event: React.KeyboardEvent<HTMLElement>) {
    if (!(event.target instanceof HTMLElement) || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const menu = event.target.closest<HTMLElement>('[data-drawing-menu]');
    if (!menu || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const trigger = menu.querySelector<HTMLElement>(':scope > summary');
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.target === trigger && ['Home','End'].includes(event.key)) {
      const menus = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-drawing-menu]'));
      const index = menus.indexOf(menu);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? menus.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
      event.preventDefault(); event.stopPropagation();
      if (openMenu) setOpenMenu(menus[next].dataset.drawingMenu ?? null);
      menus[next].querySelector<HTMLElement>(':scope > summary')?.focus();
      return;
    }
    if (!event.target.matches('button,summary')) return;
    const choices = Array.from(menu.querySelectorAll<HTMLElement>('.drawing-menu-popover button:not(:disabled),.drawing-menu-popover summary'))
      .filter(choice => choice.getClientRects().length > 0 && !choice.closest('fieldset:disabled'));
    const index = choices.indexOf(event.target);
    if (index < 0 || !choices.length) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
    choices[next]?.focus();
  }
  useEffect(() => {
    const root = context?.root.current;
    if (!root) return;
    const guardControlKeys = (event: KeyboardEvent) => {
      // Custom page-space controls own their keyboard events. Mark the native
      // event before tldraw's container listener; let the control handle it.
      if (isDrawingPointerGestureActive(editor) || event.target instanceof Element &&
          event.target.closest('[data-drawing-guide-control],[data-drawing-skew-edge],[data-drawing-rotation-pivot],[data-drawing-rotate-corner][data-custom-pivot="true"]')) {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return false;
        (event as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
        if (isDrawingPointerGestureActive(editor)) event.preventDefault();
        return true;
      }
      return false;
    };
    const keys = (event: KeyboardEvent) => {
      if (guardControlKeys(event)) return;
      // Radix handles menu navigation. Arrows here must not nudge the artwork
      // underneath a context menu or trigger single-letter drawing shortcuts.
      if (event.target instanceof Element && event.target.closest('.tlui-menu')) {
        // Radix handles Escape in document capture and removes openMenus before
        // tldraw's bubble listener sees it. Mark the same event handled so closing
        // a menu cannot also cancel the selection or a drawing interaction.
        (event as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
        return;
      }
      if(event.key==='Escape' && toolGroup!==null){event.preventDefault();event.stopPropagation();setToolGroup(null);flyoutTrigger.current?.focus();return;}
      if (event.key === 'Escape' && openMenu) { event.preventDefault(); event.stopPropagation(); closeMenus(true); return; }
      if (!(event.target instanceof Element) || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'F12') { event.preventDefault(); event.stopPropagation(); focusCad('outline'); return; }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && event.key === 'F2') { event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'fit-selection'); return; }
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const inDrawing = !!event.target.closest('.drawing-viewport');
      if (inDrawing && !modifier && !event.altKey && !event.isComposing &&
          (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) openDrawingContextMenu(editor);
        return;
      }
      if (inDrawing && modifier && !event.shiftKey && !event.altKey && !event.isComposing && key === 'f') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) openFindReplace();
        return;
      }
      if (inDrawing && modifier && event.shiftKey && !event.altKey && !event.isComposing && key === 'd') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) openRepeat();
        return;
      }
      if (inDrawing && modifier && !event.shiftKey && !event.altKey && !event.isComposing && key === 't') {
        event.preventDefault(); event.stopPropagation();
        context?.setPanel('text');
        return;
      }
      if (inDrawing && modifier && event.shiftKey && !event.altKey && key === 'a') {
        event.preventDefault();
        event.stopPropagation();
        openArrange('align');
        return;
      }
      if (inDrawing && modifier && event.shiftKey && !event.altKey && !event.isComposing && key === 'q') {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) focusCad('outlineObject');
        return;
      }
      const alignment = alignmentKeys[key];
      if (inDrawing && alignment && !modifier && !event.shiftKey && !event.altKey && !event.isComposing &&
          !openMenu && toolGroup === null && editor.isIn('select.idle') && !isCadNodeEditing(editor)) {
        const roots = arrangementRoots(editor);
        if (roots.length > 1) {
          event.preventDefault();
          event.stopPropagation();
          if (event.repeat || !captureToolkitControls(editor).canEditSelection) return;
          try {
            const plan = prepareArrangePlan(editor, { kind: 'align', ...alignment, reference: roots[roots.length - 1] });
            setNotice(applyArrangePlan(editor, plan) ? '' : label('changedFailed'));
          } catch {
            setNotice(label('changedFailed'));
          }
          return;
        }
      }
      const objectAction = inDrawing && modifier && !event.altKey && !event.shiftKey && !event.isComposing &&
        !openMenu && toolGroup === null && editor.isIn('select.idle') && !isCadNodeEditing(editor) &&
        !event.target.closest('button,a[href],[role="button"],[role="textbox"]')
        ? objectActionByKey.get(key) : undefined;
      if (objectAction && editor.getSelectedShapeIds().length) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) command(objectAction);
        return;
      }
      const lockedSelection = captureToolkitControls(editor).selectionLocked;
      if ((!modifier && !event.altKey && !event.shiftKey && event.key === 'F10') || (modifier && !event.altKey && !event.shiftKey && !event.isComposing && event.key.toLowerCase() === 'q')) {
        event.preventDefault(); event.stopPropagation();
        focusCad(event.key === 'F10' ? 'nodes' : 'convert');
        return;
      }
      if (lockedSelection && event.target.closest('.drawing-viewport') && (['Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
          modifier && ['x', 'd', 'g', '[', ']'].includes(event.key.toLowerCase()))) {
        // Native group shortcuts do not inspect locked descendants. Keep their
        // behaviour consistent with the disabled OMS object commands.
        event.preventDefault(); event.stopPropagation(); return;
      }
      if (modifier && !event.altKey && !event.shiftKey && ['k', 'l'].includes(event.key.toLowerCase()) && event.target.closest('.drawing-viewport') && editor.isIn('select.idle')) {
        event.preventDefault(); event.stopPropagation();
        compound(event.key.toLowerCase() === 'l' ? 'combine' : 'breakApart');
        return;
      }
      const cad = readCadSettings(editor);
      if (cad && editor.isIn('select.idle') && editor.getSelectedShapeIds().length && event.target.closest('.drawing-viewport') &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !event.altKey) {
        const amount = cad.nudge * (event.shiftKey ? 10 : modifier ? 0.1 : 1);
        const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
        const dy = event.key === 'ArrowDown' ? -amount : event.key === 'ArrowUp' ? amount : 0;
        event.preventDefault(); event.stopPropagation();
        if (!nudgeCadSelection(editor, dx, dy, cad)) setNotice(cadLabel('failed'));
        return;
      }
      const tool = ({ F5: 'cad-freehand', F6: 'rectangle', F7: 'ellipse', F8: 'text' } as Record<string, string>)[event.key];
      if (tool && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); chooseTool(tool); }
      else if (event.key === 'F3') { event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'zoom-out'); }
      else if (event.key === 'F4') { event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'fit'); }
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault(); event.stopPropagation(); applyDrawingCommand(editor, 'duplicate');
      }
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.drawing-menu')) closeMenus(); };
    root.addEventListener('keydown', keys, true);
    root.addEventListener('keyup', guardControlKeys, true);
    document.addEventListener('pointerdown', outside);
    return () => { root.removeEventListener('keydown', keys, true); root.removeEventListener('keyup', guardControlKeys, true); document.removeEventListener('pointerdown', outside); };
  }, [context?.root, context?.setPanel, editor, openMenu, toolGroup, cadLabel, advancedLabel, label]);
  if (!context) return null;
  const { hosts, panel, setPanel, order, onImport } = context;
  const activePanel = panel ?? lastPanel;
  function focusFonts() { setPanel('text'); setFontFocusRequest(value => value + 1); }
  function portal(slot: Slot, children: ReactNode) { const host = hosts[slot]; return host ? createPortal(children, host, slot) : null; }
  const position = state.single ? editor.getShapePageTransform(state.single).point() : undefined;
  const bounds = state.single ? editor.getShapeGeometry(state.single).bounds : undefined;
  const canResize = !!state.single && state.single.type !== 'group' && controls.canEditSelection && editor.getShapeUtil(state.single).canResize(state.single);
  const canRotate = !!state.single && controls.canEditSelection && (state.single.type === 'cad-arc' || !editor.getShapeUtil(state.single).hideRotateHandle(state.single));
  const protectedForm = !!state.single && ['order-details', 'order-address', 'profile-7st'].includes(state.single.type);
  const theme = getDefaultColorTheme({ isDarkMode });
  const color = styles?.get(DefaultColorStyle);
  const selectedText = controls.tool === 'select' && state.selectedShapes.length > 0 && state.selectedShapes.every(shape => shape.type === 'text')
    ? state.selectedShapes as TLTextShape[] : null;
  const nextText = controls.tool === 'text';
  const textProperties = !!selectedText || nextText;
  const cadStyleSelection = controls.tool === 'select' && [...editor.getShapeAndDescendantIds([...state.selected])]
    .some(id => editor.getShape(id)?.type.startsWith('cad-'));
  const nativePropertyFields = !cadStyleSelection && !controls.tool.startsWith('cad-')
    ? styleFields.filter(field => ['fill', 'dash', 'size', 'spline', 'arrowheadStart', 'arrowheadEnd'].includes(field.id) && styles?.get(field.style)) : [];

  function styleChange(style: EnumStyleProp<string>, value: string) {
    if (editor.getCurrentToolId() === 'cad-freehand' && style === DefaultColorStyle && style.values.includes(value)) {
      if (!editor.getInstanceState().isReadonly && !cadFreehandPreview(editor).get()) setCadFreehandOptions(editor, { color: getDefaultColorTheme({ isDarkMode: false })[value as TLDefaultColorStyle].solid });
      return;
    }
    if (!style.values.includes(value) || !captureToolkitControls(editor).canStyle) return;
    drawingTransaction(editor, () => {
      if (style === DefaultFontStyle && editor.isIn('select')) clearSelectedDrawingFontOverrides(editor);
      if (style === DefaultColorStyle && editor.isIn('select')) {
        for (const id of editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])) {
          const shape = editor.getShape(id);
          const patch = shape && cadPalettePatch(shape, getDefaultColorTheme({ isDarkMode: false })[value].solid, 'fill');
          if (patch) editor.updateShape(patch);
        }
      }
      if (editor.isIn('select')) editor.setStyleForSelectedShapes(style, value);
      if (style === DefaultFontStyle) setNextDrawingFont(editor, value);
      else editor.setStyleForNextShapes(style, value);
    });
  }
  function renderStyleSelect(field: typeof styleFields[number], compact = false) {
    if (field.id === 'font' && nextText) return <NextDrawingFontPicker key={field.id} compact={compact} disabled={!controls.canStyle} onManage={focusFonts} />;
    if (field.id === 'font' && selectedText) {
      const first = drawingFontValue(selectedText[0]);
      const value = selectedText.every(shape => drawingFontValue(shape) === first) ? first : undefined;
      return <DrawingFontPicker key={field.id} value={value} compact={compact} disabled={!controls.canStyle} testId={`drawing-${compact ? 'property' : 'style'}-font`}
        onChange={font => { if (!applySelectedDrawingFont(editor, state.selected, font)) setNotice(label('changedFailed')); }} />;
    }
    const shared = styles?.get(field.style);
    if (!shared) return null;
    const value = shared.type === 'shared' ? shared.value.replace(/-legacy$/, '') : '';
    const name = compact && field.id === 'dash' ? label('outlinePattern') : compact && field.id === 'size' ? label(nextText ? 'textSizePreset' : 'sizePreset')
      : ['fill', 'dash', 'size'].includes(field.id) ? label(field.id as DrawingLabel) : tr(`toolkit.toolbar.styleFields.${field.id}`);
    const labelValue = (value: string) => field.values ? tr(`toolkit.toolbar.styleValues.${field.values}.${value}`)
      : label(({ s: 'small', m: 'medium', l: 'large', xl: 'extraLarge', fill: 'solid' } as Record<string, DrawingLabel>)[value] ?? value as DrawingLabel);
    return <label key={field.id} className={compact ? `drawing-property-field${field.id === 'font' ? ' drawing-property-font' : ''}` : undefined}>
      <span>{name}</span><select aria-label={name} value={value} data-testid={`drawing-${compact ? 'property' : 'style'}-${field.id}`}
        onChange={event => styleChange(field.style, event.target.value)}>
        {shared.type === 'mixed' && <option value="" disabled>{tr('toolkit.toolbar.styleFields.mixed')}</option>}
        {field.style.values.filter(value => !value.endsWith('-legacy')).map(value => <option key={value} value={value}>{labelValue(value)}</option>)}
      </select>
    </label>;
  }
  async function importFiles(files: File[]) {
    if (!files.length || !onImport || editor.getInstanceState().isReadonly) return;
    setBusy(true); setNotice('');
    try { await onImport(files, editor.getViewportPageBounds().center); }
    catch { if (alive.current) setNotice(label('uploadFailed')); }
    finally { if (alive.current) setBusy(false); }
  }
  function exportFailure(error: unknown) {
    const code = error instanceof Error ? error.message : '';
    if (['asset-fetch', 'limit', 'cancelled'].includes(code)) return vectorLabel(code);
    if (code === 'stale') return workbenchLabel('changed');
    return label(['invalidOptions', 'exportEmpty', 'exportTooLarge', 'exportReduced', 'pageNeedsSize'].includes(code) ? code as DrawingLabel : 'exportFailed');
  }
  async function exportDrawing(format: 'svg' | 'png') {
    if (busy) return;
    setBusy(true); setExportError(''); setNotice(label('exportPreparing'));
    try {
      const { blob, plan, reduced, ...output } = await exportDrawingArtwork(editor, format, exportOptions, exportLifetime.current!.signal);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `oms-drawing.${format}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      const size = output.physical ? `${output.physical.widthMm.toFixed(3)} × ${output.physical.heightMm.toFixed(3)} mm` : `${output.width} × ${output.height}`;
      setNotice(`${label(output.physical ? 'exportPhysicalSize' : 'exportSize')}: ${size}. ${label('exportOmitted')}: ${plan.omitted}.${reduced ? ` ${label('exportReduced')}` : ''}`);
      closeMenus();
    } catch (error) { if (alive.current) { const message = exportFailure(error); setExportError(message); setNotice(message); } }
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
  const menuActions = (actions: string[], showShortcuts = false) => actions.map(action => {
    const key = objectShortcuts[action];
    const name = actionLabel(action);
    return <button type="button" key={action} disabled={!actionEnabled(action)}
      aria-keyshortcuts={key ? `Control+${key} Meta+${key}` : undefined} title={key ? `${name} (Ctrl/⌘+${key})` : undefined}
      onClick={() => { command(action); closeMenus(); }} data-testid={`drawing-action-${action}`}>
      {name}{showShortcuts && key && <span aria-hidden="true"> · Ctrl/⌘+{key}</span>}
    </button>;
  });
  const fieldNames = { x: 'positionX', y: 'positionY', w: 'width', h: 'height', rotation: 'rotation' } as const;
  const transformField = (field: DrawingTransformField) => settings ? <CadNumberField key={`cad-${state.selected.join(',')}-${field}`} field={field} label={label(fieldNames[field])}
    value={cadSelection?.[field]} settings={settings} anchor={cadAnchor} proportional={proportional}
    disabled={protectedForm || (field === 'w' || field === 'h' ? !canResize : field === 'rotation' ? !canRotate : !controls.canEditSelection)} /> : <NumberField key={field} field={field} label={label(fieldNames[field])}
    value={field === 'x' ? position?.x : field === 'y' ? position?.y : field === 'w' ? bounds?.w : field === 'h' ? bounds?.h : state.single ? editor.getShapePageTransform(state.single).rotation() * 180 / Math.PI : undefined}
    disabled={field === 'w' || field === 'h' ? !canResize : field === 'rotation' ? !canRotate : !controls.canEditSelection} />;
  const panelModes = ['properties', 'text', 'pen', 'arrange', 'measure', 'guides', 'snap', 'objects', 'cad'] as const;
  const panelLabel = (mode: Exclude<Panel, null>) => mode === 'pen' ? penLabel('title') : mode === 'guides' ? guideLabel('title') : mode === 'snap' ? snapLabel('title') : mode === 'cad' ? cadLabel('cad') : mode === 'properties' || mode === 'objects' ? label(mode) : workbenchLabel(mode);
  const groupLabel = (group: typeof toolGroups[number]) => group.id === 'curves' || group.id === 'shapes' || group.id === 'annotations' ? workbenchLabel(group.id) : toolLabel(group.tools[0]);
  const activeToolGroup = toolGroups.find(group => group.id === toolGroup);
  const statusText = freehandHint ? freehandHint : rotationPreview ? rotationPreview.error ? rotationLabel(rotationPreview.error) : rotationPreview.kind === 'pivot' ? rotationLabel('help') : `${pickSkewLabel('mode')}: ${Number(rotationPreview.angle.toFixed(2))}°` : skewGesture ? skewGesture.error ? skewErrorText(skewGesture.error) : `${pickSkewLabel('mode')}: ${Number(skewGesture.angle.toFixed(2))}°${skewGesture.limited ? ` · ${pickSkewLabel('limit')}` : ''}` : pickGuideSnap ? snapLabel('guidelines') : notice || (activeSnap ? snapLabel(activeSnap.kind) : controls.readOnly ? label('readOnly') : controls.tool === 'cad-freehand' ? penLabel('drawHelp') : controls.selectionLocked ? label('locked') : skewMode ? pickSkewLabel('help') : constructionHint ? `${constructionHint} · ${workbenchLabel('constructionKeys')}` : controls.tool === 'cad-polyline' ? cadLabel('polylineKeys') : controls.tool === 'cad-bezier' ? advancedLabel('bezierKeys') : `${controls.selected} ${label('selected')} · ${state.shapes.length} ${label('items')}`);

  return <>
    {portal('commands', <>
      <strong className="drawing-title">OMS<span> DRAW</span></strong>
      <nav className="drawing-menus" aria-label={label('workspace')} onKeyDown={navigateMenus}>
        <details className="drawing-menu" data-drawing-menu="file" open={openMenu === 'file'}>{menuSummary('file', label('file'))}<div className="drawing-menu-popover">
          <button type="button" disabled={controls.readOnly || busy || !onImport} onClick={() => { closeMenus(); input.current?.click(); }}>{label('import')}</button>
          <fieldset className="drawing-export-options" disabled={busy}>
            <label><span>{label('exportScope')}</span><select value={exportOptions.scope} onChange={event => { setExportOptions(previous => ({ ...previous, scope: event.target.value as DrawingExportOptions['scope'] })); setExportError(''); }}>
              <option value="selected">{label('selectedOnly')}</option><option value="all">{label('allArtwork')}</option>
              <option value="page" disabled={!pageBounds}>{label('pageExport')}</option>
            </select></label>
            <label><span>{label('pngScale')}</span><select value={exportOptions.scale} onChange={event => { setExportOptions(previous => ({ ...previous, scale: Number(event.target.value) as 1 | 2 | 4 })); setExportError(''); }}>
              {[1, 2, 4].map(scale => <option key={scale} value={scale}>{scale}×</option>)}
            </select></label>
            <label><span>{label('background')}</span><select value={exportOptions.background ? 'solid' : 'transparent'} onChange={event => setExportOptions(previous => ({ ...previous, background: event.target.value === 'solid' }))}>
              <option value="transparent">{label('transparent')}</option><option value="solid">{label('solidBackground')}</option>
            </select></label>
            {exportOptions.scope !== 'page' && <label><span>{label('padding')}</span><input type="number" min="0" max="1000" step="1" value={Number.isNaN(exportOptions.padding) ? '' : exportOptions.padding}
              onChange={event => { setExportOptions(previous => ({ ...previous, padding: event.target.value.trim() ? Number(event.target.value) : NaN })); setExportError(''); }} /></label>}
          </fieldset>
          <button type="button" disabled={busy || !exportPlans?.svg.ok} onClick={() => void exportDrawing('svg')}>{label('exportSvg')}</button>
          <button type="button" disabled={busy || !exportPlans?.png.ok} onClick={() => void exportDrawing('png')}>{label('exportPng')}</button>
          <button type="button" onClick={() => focusCad('publishPdf')}>{vectorLabel('publishPdf')}</button>
          <button type="button" onClick={() => focusCad('files')}>{vectorLabel('files')}</button>
          <button type="button" onClick={() => focusCad('preflight')}>{preflightLabel('title')}</button>
          {order&&<><label className="drawing-export-format">{workbenchLabel('exportFormat')}<select value={saveFormat} onChange={e=>setSaveFormat(e.target.value as 'svg'|'png')}><option value="png">PNG</option><option value="svg">SVG</option></select></label><ProductionSaveButton extension={saveFormat} disabled={busy||!!exportPlans&&!exportPlans[saveFormat].ok} errorMessage={exportFailure} onStatus={setNotice} createFile={async(signal)=>{
            const output=await exportDrawingArtwork(editor,saveFormat,exportOptions,signal);
            if(output.reduced)throw new Error('exportReduced');
            return output.blob;
          }}/></>}
          {exportError && <p role="alert">{exportError}</p>}
          {exportPlans && <p className="drawing-help" role="status">{exportPlans.svg.ok === false ? label(exportPlans.svg.error) : exportPlans.png.ok === false ? label(exportPlans.png.error) : `${label('exportOmitted')}: ${exportPlans.svg.value.omitted}`}</p>}
          <p>{label('exportHint')}</p>
          <p>{label('exportScaleHint')}</p>
        </div></details>
        <details className="drawing-menu" data-drawing-menu="edit" open={openMenu === 'edit'}>{menuSummary('edit', label('edit'))}<div className="drawing-menu-popover">{menuActions(['undo', 'redo', 'select-all', 'duplicate', 'delete'])}
          <button type="button" onClick={openFindReplace} aria-keyshortcuts="Control+F Meta+F">{findReplaceLabel('title')} · Ctrl/⌘+F</button>
          <button type="button" onClick={openSelectSame}>{selectSameLabel('title')}</button>
          <button type="button" onClick={openAppearance}>{appearanceLabel('title')}</button>
          <button type="button" onClick={openRepeat} aria-keyshortcuts="Control+Shift+D Meta+Shift+D">{label('repeatGrid')} · Ctrl/⌘+Shift+D</button>
        </div></details>
        <details className="drawing-menu" data-drawing-menu="object" open={openMenu === 'object'}>{menuSummary('object', label('object'))}<div className="drawing-menu-popover drawing-menu-popover--wide">{menuActions(['group', 'ungroup', 'lock'], true)}
          <details>
            <summary>{label('objectOrder')} ▸</summary>
            <div className="drawing-arrange">{menuActions(['front', 'back', 'forward', 'backward'], true)}</div>
            <button type="button" onClick={openObjectOrder}>{objectTreeLabel('relativeOrder')}</button>
            <button type="button" disabled={(captureDrawingObjectStack(editor)?.selected.length ?? 0) < 2} onClick={reverseObjectOrder} data-testid="drawing-menu-reverse-order">{objectTreeLabel('reverse')}</button>
          </details>
          <hr />
          <button type="button" disabled={!controls.canEditSelection || !settings} onClick={() => compound('combine')}>{advancedLabel('combine')}</button>
          <button type="button" disabled={!controls.canEditSelection || !settings} onClick={() => compound('breakApart')}>{advancedLabel('breakApart')}</button>
          <button type="button" onClick={() => focusCad('paint')}>{vectorLabel('paint')}</button>
          <button type="button" onClick={() => focusCad('outline')} aria-keyshortcuts="F12">{outlineLabel('title')} · F12</button>
          <button type="button" onClick={() => focusCad('outlineObject')} aria-keyshortcuts="Control+Shift+Q Meta+Shift+Q">{outlineObjectLabel('title')} · Ctrl/⌘+Shift+Q</button>
          <button type="button" onClick={() => focusCad('nodes')}>{advancedLabel('nodes')}</button>
          <button type="button" onClick={() => focusCad('nodeArrange')}>{nodeArrangeLabel('title')}</button>
          <button type="button" onClick={() => focusCad('convert')}>{advancedLabel('convert')}</button>
          <button type="button" onClick={() => focusCad('join')}>{advancedLabel('joinCurves')}</button>
          <button type="button" onClick={() => focusCad('shaping')}>{advancedLabel('shaping')}</button>
          <button type="button" onClick={() => focusCad('offset')}>{advancedLabel('offset')}</button>
          <button type="button" onClick={() => focusCad('midline')}>{advancedLabel('midline')}</button>
          <button type="button" onClick={() => focusCad('ellipse')}>{vectorLabel('ellipseSegments')}</button>
          <button type="button" onClick={() => focusCad('polygon')}>{parametricShapeLabel('title')}</button>
          <button type="button" onClick={() => focusCad('rectangle')}>{rectangleShapeLabel('title')}</button>
          <button type="button" onClick={openTransform}>{arrangeTaskLabel('transform')}</button>
          <button type="button" aria-pressed={skewMode} disabled={!skewMode && !!skewSelection.error} onClick={togglePickSkew}
            title={skewSelection.error ? skewErrorText(skewSelection.error) : pickSkewLabel('help')} data-testid="drawing-menu-skew-mode">{pickSkewLabel('mode')}</button>
          <button type="button" aria-keyshortcuts="Control+Shift+A Meta+Shift+A" title={`${advancedLabel('arrange')} (Ctrl/⌘+Shift+A)`} onClick={()=>openArrange('align')}>{advancedLabel('arrange')}</button>
        </div></details>
        <details className="drawing-menu" data-drawing-menu="bitmaps" open={openMenu === 'bitmaps'}>{menuSummary('bitmaps', vectorLabel('bitmaps'))}<div className="drawing-menu-popover"><button type="button" disabled={controls.readOnly} onClick={() => focusCad('trace')}>{vectorLabel('trace')}</button></div></details>
        <details className="drawing-menu" data-drawing-menu="layout" open={openMenu === 'layout'}>{menuSummary('layout', cadLabel('layout'))}<div className="drawing-menu-popover">
          <button type="button" onClick={() => focusCad('pageSetup')}>{label('pageSetup')}</button>
          <button type="button" onClick={() => focusCad('document')}>{cadLabel('document')}</button><button type="button" onClick={()=>{setPanel('measure');closeMenus();}}>{workbenchLabel('measure')}</button>
          <button type="button" onClick={openGuides}>{guideLabel('open')}</button>
        </div></details>
        <details className="drawing-menu" data-drawing-menu="view" open={openMenu === 'view'}>{menuSummary('view', label('view'))}<div className="drawing-menu-popover">{menuActions(['fit', 'fit-selection', 'zoom-reset'])}
          <button type="button" aria-pressed={state.grid} onClick={() => command('grid')}>{state.grid ? '✓ ' : ''}{label('grid')}</button>
          <button type="button" aria-pressed={state.snap} onClick={() => command('snap')}>{state.snap ? '✓ ' : ''}{label('snap')}</button>
          <hr />
          <button type="button" aria-pressed={canvasSurface === 'blueprint'} title={label('surfaceHint')} onClick={() => { setCanvasSurface(canvasSurface === 'blueprint' ? 'paper' : 'blueprint'); closeMenus(); }} data-testid="drawing-menu-surface">{canvasSurface === 'blueprint' ? '✓ ' : ''}{label('surfaceBlueprint')}</button>
          <hr />
          <button type="button" onClick={() => { setPanel('snap'); closeMenus(); }} data-testid="drawing-menu-snap-options">{snapLabel('open')}</button>
          <button type="button" aria-pressed={guides.visible} disabled={controls.readOnly || !guides.valid || drawingGuidesBusy(editor)} onClick={toggleGuides} data-testid="drawing-menu-guides-visible">{guides.visible ? '✓ ' : ''}{guideLabel('showGuides')}</button>
          <button type="button" onClick={openGuides} data-testid="drawing-menu-guides">{guideLabel('open')}</button>
          <button type="button" onClick={() => { setPanel('pen'); closeMenus(); }} data-testid="drawing-menu-pen">{penLabel('title')}</button>
        </div></details>
      </nav>
    </>)}
    {portal('standard', <>
      <ToolButton icon="import" testId="drawing-import" label={label('import')} disabled={controls.readOnly || busy || !onImport} onClick={() => input.current?.click()} />
      <span className="drawing-divider" />
      <ToolButton icon="undo" testId="drawing-undo" label={`${actionLabel('undo')} (Ctrl+Z)`} disabled={!controls.canUndo} onClick={() => command('undo')} />
      <ToolButton icon="redo" testId="drawing-redo" label={`${actionLabel('redo')} (Ctrl+Shift+Z)`} disabled={!controls.canRedo} onClick={() => command('redo')} />
      <ToolButton icon="duplicate" testId="drawing-duplicate" label={`${actionLabel('duplicate')} (Ctrl+D)`} disabled={!actionEnabled('duplicate')} onClick={() => command('duplicate')} />
      <span className="drawing-divider" />
      <ToolButton icon="fit" testId="drawing-fit" label={`${actionLabel('fit')} (F4)`} disabled={!actionEnabled('fit')} onClick={() => command('fit')} />
      <ToolButton icon="fit-selection" testId="drawing-fit-selection" label={`${actionLabel('fit-selection')} (Shift+F2)`} disabled={!actionEnabled('fit-selection')} onClick={() => command('fit-selection')} />
      <span className="drawing-divider" />
      <ToolButton icon="files" testId="drawing-files" label={vectorLabel('files')} onClick={() => focusCad('files')} />
      <input ref={input} type="file" hidden multiple accept={order
          ? '.pdf,.png,.jpg,.jpeg,.webp,.gif,.cdr,.dxf'
          : 'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.pdf,.mp3,.wav,.ogg,.m4a'}
        onChange={event => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    </>)}
    {portal('properties', <>
      {textProperties ? <span className="drawing-property-caption">{label(nextText ? 'nextText' : 'selectedText')}{selectedText && selectedText.length > 1 ? ` · ${selectedText.length}` : ''}</span>
        : <span className="drawing-tool-name">{toolLabel(nodeEditing ? 'nodes' : controls.tool)}</span>}<span className="drawing-divider" />
      {selectedText ? <SelectedTextProperties key={state.selected.join('|')} shapes={selectedText} disabled={!controls.canEditSelection}
        onEdit={() => setPanel('text')} onOutlines={() => focusCad('convert')} onFonts={focusFonts} />
      : nextText ? <fieldset className="drawing-context-properties" disabled={!controls.canStyle} aria-label={label('nextText')} data-testid="drawing-next-text-properties">
        <NextDrawingFontPicker disabled={!controls.canStyle} onManage={focusFonts} />
        {['size', 'textAlign'].map(id => renderStyleSelect(styleFields.find(field => field.id === id)!, true))}
      </fieldset>
      : controls.tool === 'cad-freehand' ? <><DrawingFreehandControls compact /><ToolButton icon="pen" label={penLabel('title')} onClick={() => setPanel('pen')} testId="drawing-property-pen" /></>
      : controls.tool === 'cad-polyline' ? <CadPointEntry settings={settings}/>
      : nodeEditing ? <div className="drawing-property-actions" data-testid="drawing-node-properties">
        {nodeCount === null ? <span className="drawing-unit">{nodeArrangeLabel('none')}</span> : <>
          <span className="drawing-unit" data-testid="drawing-node-selection-count">{nodeArrangeLabel('selection')} · {nodeCount}</span>
          <ToolButton icon="nodes" label={advancedLabel('nodeCoordinates')} onClick={() => focusCad('nodes')} testId="drawing-property-node-coordinates">{advancedLabel('nodeCoordinates')}</ToolButton>
          <ToolButton icon="arrange" label={nodeArrangeLabel('title')} onClick={() => focusCad('nodeArrange')} testId="drawing-property-node-arrange">{nodeArrangeLabel('title')}</ToolButton>
          <ToolButton label={advancedLabel('reduceNodes')} disabled={!controls.canEditSelection} onClick={() => focusCad('nodeReduce')} testId="drawing-property-node-reduce">{advancedLabel('reduceNodes')}</ToolButton>
        </>}
      </div> : <>
      {settings && <CadAnchorControl value={cadAnchor} onChange={setCadAnchor} />}
      <div className="drawing-property-pair">{transformField('x')}{transformField('y')}</div>
      <span className="drawing-divider" />
      <div className="drawing-property-pair">{transformField('w')}{transformField('h')}</div>
      {settings && <ToolButton icon={proportional ? 'lock' : 'unlock'} label={cadLabel('proportional')} active={proportional} onClick={() => setProportional(value => !value)} testId="drawing-cad-proportional" />}
      <span className="drawing-divider" />
      {transformField('rotation')}
      {controls.tool === 'select' && !nodeEditing && <ToolButton icon="skew" label={skewSelection.error ? `${pickSkewLabel('mode')}: ${skewErrorText(skewSelection.error)}` : pickSkewLabel('mode')}
        active={skewMode} disabled={!skewMode && !!skewSelection.error} onClick={togglePickSkew} testId="drawing-skew-mode">{pickSkewLabel('mode')}</ToolButton>}
      <span className="drawing-unit">{settings ? `${settings.unit} · 1:${settings.scale}` : label('units')}</span>
      {cadStyleSelection ? <div className="drawing-property-actions"><ToolButton icon="paint" label={vectorLabel('paint')} onClick={() => focusCad('paint')} testId="drawing-property-paint">{vectorLabel('paint')}</ToolButton></div>
        : nativePropertyFields.length > 0 && <><span className="drawing-divider" /><fieldset className="drawing-context-properties" disabled={!controls.canStyle}
          aria-label={label(controls.selected && controls.tool === 'select' ? 'selectionStyle' : 'nextObject')} data-testid="drawing-native-properties">
          {nativePropertyFields.map(field => renderStyleSelect(field, true))}
        </fieldset></>}
      {order && <div className="drawing-annotations">{(['comment', 'warning', 'explanation'] as const).map((kind, index) =>
        <button type="button" key={kind} aria-label={label((['orderNote', 'orderWarning', 'orderExplain'] as const)[index])} disabled={controls.readOnly} onClick={() => annotation(kind)}>{['✎', '⚠', 'ℹ'][index]} {label((['orderNote', 'orderWarning', 'orderExplain'] as const)[index])}</button>)}</div>}
      </>}
    </>)}
    {portal('tools', <div role="toolbar" aria-label={label('toolbox')} aria-orientation="vertical" className="drawing-tools">
      {toolGroups.map(group => {
        const current = group.tools.includes(controls.tool) ? controls.tool : (groupTools[group.id] ?? group.tools[0]);
        return <div className="drawing-tool-group" key={group.id}>
          <ToolButton icon={current} label={`${toolLabel(current)}${shortcut[current] ? ` (${shortcut[current]})` : ''}`} active={current === 'nodes' ? nodeEditing : current === 'select' ? controls.tool === 'select' && !nodeEditing : group.tools.includes(controls.tool)} disabled={controls.readOnly && !['select', 'hand', 'nodes'].includes(current)} onClick={() => chooseTool(current)} testId={`drawing-tool-${current}`} />
          {group.tools.length > 1 && <button type="button" className="drawing-tool-expand" title={`${workbenchLabel('more')}: ${groupLabel(group)}`} aria-label={`${workbenchLabel('more')}: ${groupLabel(group)}`} aria-expanded={toolGroup === group.id} onClick={event => toggleToolGroup(group, event.currentTarget, event.detail === 0)}
            onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); toggleToolGroup(group, event.currentTarget, true); } }} data-testid={`drawing-tools-${group.id}`}>▸</button>}
        </div>;
      })}
      <div className="drawing-tool-paint"><ToolButton icon="paint" label={vectorLabel('paint')} onClick={() => { setToolGroup(null); focusCad('paint'); }} testId="drawing-paint" /></div>
    </div>)}
    {activeToolGroup && hosts.tools && context.root.current && createPortal(<div className="drawing-tool-flyout" role="group" aria-label={groupLabel(activeToolGroup)} style={flyoutPosition}>
      {activeToolGroup.tools.map(tool => <button type="button" key={tool} disabled={controls.readOnly} aria-pressed={controls.tool === tool} title={`${toolLabel(tool)}${shortcut[tool] ? ` (${shortcut[tool]})` : ''}`} onClick={() => chooseTool(tool)} data-testid={`drawing-flyout-${tool}`}><Icon name={tool} /><span>{toolLabel(tool)}</span>{shortcut[tool] && <kbd>{shortcut[tool]}</kbd>}</button>)}
    </div>, context.root.current, 'tool-flyout')}
    {portal('rulerOrigin', settings?.unit ?? 'px')}
    {portal('rulerX', <Ruler settings={settings} onGuides={openGuides} />)}{portal('rulerY', <Ruler vertical settings={settings} onGuides={openGuides} />)}
    {portal('docker', <>
      <div className="drawing-docker-title"><strong>{panelLabel(activePanel)}</strong>
        <ToolButton icon="close" label={label('closePanel')} onClick={() => {
          const current = panel;
          setPanel(null);
          if (current) context.root.current?.querySelector<HTMLElement>(`[data-testid="drawing-${current}-toggle"]`)?.focus();
        }} />
      </div>
      <div className="drawing-docker-content" role="region" aria-label={panelLabel(activePanel)}>
        {/* Pen preferences persist outside its panel; unmount the test pad on
            deactivation so an in-progress diagnostic stroke releases capture. */}
        {panelModes.map(mode => <DrawingPanelSession key={`${editor.store.id}:${state.page}:${mode}`} active={activePanel === mode}>
        {mode === 'guides' ? <DrawingGuidesPanel settings={settings} focusRequest={guidesFocusRequest} onDocument={() => focusCad('document')}
          renderAlignment={guide => <DrawingGuideAlignment key={guide?.id ?? 'none'} guide={guide}/>}/>
        : mode === 'pen' ? panel === 'pen' && <DrawingPenPanel onFreehand={() => chooseTool('cad-freehand')} />
        : mode === 'snap' ? <CadSnapPanel settings={settings}/> : mode === 'text' ? <><DrawingFindReplacePanel focusRequest={findFocusRequest}/><TextPanel onOutlines={()=>focusCad('convert')} onLettering={()=>focusCad('lettering')} fontFocusRequest={fontFocusRequest}/></> : mode === 'measure' ? <MeasurePanel settings={settings} onTool={chooseTool} onDocument={()=>focusCad('document')}/> : mode === 'arrange' ? <>
          <label className="drawing-cad-task"><span>{arrangeTaskLabel('task')}</span><select value={arrangeTask} data-testid="drawing-arrange-task" onChange={event => setArrangeTask(event.target.value as ArrangeTask)}>
            {(['transform','align','repeat','radial'] as const).map(task => <option key={task} value={task}>{arrangeTaskLabel(task)}</option>)}
          </select></label>
          <div hidden={arrangeTask !== 'transform'}><DrawingTransformPanel settings={settings} focusRequest={arrangeTask === 'transform' ? transformFocusRequest : 0}/></div>
          <div hidden={arrangeTask !== 'align'}><ArrangePanel settings={settings}><details><summary>{label('object')}</summary><div className="drawing-align-grid">{menuActions(['front','back','forward','backward','rotate-left','rotate-right','flip-horizontal','flip-vertical','group','ungroup'])}</div></details></ArrangePanel></div>
          <div hidden={arrangeTask !== 'repeat'}><RepeatGrid selected={state.selected} disabled={!controls.canEditSelection} settings={settings} focusRequest={arrangeTask === 'repeat' ? repeatFocusRequest : 0} expanded/></div>
          <div hidden={arrangeTask !== 'radial'}><RadialArrange settings={settings} expanded/></div>
        </> : mode === 'cad' ? <CadPanel settings={settings} focusRequest={cadFocus} multiplePages={multiplePages} /> : mode === 'objects' ? <>
          <DrawingSelectSamePanel focusRequest={selectSameFocusRequest}/>
          <DrawingObjectsPanel focusRequest={objectOrderFocusRequest}/>
          <section className="drawing-selection-actions" aria-label={label('selectionActions')}>{menuActions(['fit-selection', 'duplicate', 'delete'])}</section>
        </> : <>
          <FormScaleControl/>
          <DrawingAppearancePanel focusRequest={appearanceFocusRequest}/>
          <p className="drawing-help">{label(controls.readOnly ? 'readOnly' : controls.selectionLocked ? 'locked' : controls.selected && controls.tool === 'select' ? 'selectionStyle' : 'nextObject')}</p>
          <fieldset className="drawing-style-fields" disabled={!controls.canStyle}>
            {styleFields.map(field => renderStyleSelect(field))}
            {state.opacity && <label><span>{label('opacity')}</span><select aria-label={label('opacity')} value={state.opacity.type === 'shared' ? state.opacity.value : ''}
              onChange={event => { if (!captureToolkitControls(editor).canStyle) return; const value = Number(event.target.value); drawingTransaction(editor, () => { if (editor.isIn('select')) editor.setOpacityForSelectedShapes(value); editor.setOpacityForNextShapes(value); }); }}>
              {state.opacity.type === 'mixed' && <option value="" disabled>{tr('toolkit.toolbar.styleFields.mixed')}</option>}
              {[1, 0.75, 0.5, 0.25, 0.1].map(value => <option key={value} value={value}>{value * 100}%</option>)}
            </select></label>}
          </fieldset>
          {!styles?.size && <p className="drawing-help">{label('noStyles')}</p>}
          <p className="drawing-help">{arrangeTaskLabel('paletteHint')}</p>
          <details className="drawing-shortcuts"><summary>{tr('toolkit.toolbar.selection')}</summary><div className="drawing-arrange">{menuActions(['group', 'ungroup', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical'])}</div></details>

        </>}
        </DrawingPanelSession>)}
      </div>
    </>)}
    {portal('dockerTabs', <div className="drawing-docker-tabs" role="toolbar" aria-label={label('panels')} aria-orientation="vertical" onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (index < 0) return;
      event.preventDefault(); event.stopPropagation();
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }}>
      {panelModes.map(mode => <button key={mode} type="button" className="drawing-docker-tab" data-testid={`drawing-${mode}-toggle`} title={panelLabel(mode)} aria-label={panelLabel(mode)} aria-pressed={panel === mode} onClick={() => { setToolGroup(null); setPanel(panel === mode ? null : mode); }}>
        <Icon name={mode === 'measure' ? 'cad-dimension' : mode === 'cad' ? 'cad-polyline' : mode} /><span>{panelLabel(mode)}</span>
      </button>)}
    </div>)}
    {portal('palette', <div className="drawing-swatches" role="toolbar" aria-label={label('palette')}>
      {DefaultColorStyle.values.map(value => <button key={value} type="button" title={`${label('palette')}: ${label(value)}`}
        aria-label={`${label('palette')}: ${label(value)}`} aria-pressed={controls.tool === 'cad-freehand' ? freehandOptions.color.toLowerCase() === getDefaultColorTheme({ isDarkMode: false })[value].solid.toLowerCase() : color?.type === 'shared' && color.value === value}
        disabled={controls.tool === 'cad-freehand' ? controls.readOnly || !!freehandStatus : !controls.canStyle || !color}
        onContextMenu={event => {
          event.preventDefault(); if (!captureToolkitControls(editor).canStyle || !editor.isIn('select')) return;
          drawingTransaction(editor, () => {
            for (const id of editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])) {
              const shape = editor.getShape(id);
              const patch = shape && cadPalettePatch(shape, getDefaultColorTheme({ isDarkMode: false })[value].solid, 'stroke');
              if (patch) editor.updateShape(patch);
            }
          });
        }} onClick={() => styleChange(DefaultColorStyle, value)} style={{ backgroundColor: controls.tool === 'cad-freehand' ? getDefaultColorTheme({ isDarkMode: false })[value].solid : theme[value].solid }} data-testid={`drawing-colour-${value}`} />)}
    </div>)}
    {portal('status', <>
      {multiplePages && pages.length > 1 && <DrawingPageNavigator pages={pages} active={editor.getCurrentPageId()}
        onSelect={id => { if (!switchDrawingPage(editor, id)) setNotice(label('changedFailed')); else setNotice(''); }} />}
      <span className="drawing-status-text" role="status" title={statusText}>{statusText}</span>
      <span className={`drawing-keyboard-hint${settings ? ' drawing-cad-status-unit' : ''}`} title={settings ? cadLabel('nudgeHelp') : label('keyboard')}>{settings ? <>{settings.unit} · 1:{settings.scale}<span className="drawing-cad-status-nudge"> · {cadLabel('nudge')}: {settings.nudge} {settings.unit}</span></> : label('units')}</span>
      <button type="button" onClick={() => command('grid')} aria-pressed={state.grid}>{label('grid')}</button>
      <button type="button" onClick={() => command('snap')} aria-pressed={state.snap}>{label('snap')}</button>
      <button type="button" className="drawing-snap-options-shortcut" onClick={() => setPanel('snap')} aria-pressed={panel === 'snap'} data-testid="drawing-status-snap-options">{snapLabel('open')}</button>
      <div className="drawing-zoom" aria-label={label('zoom')}>
        <ToolButton label={label('zoomOut')} onClick={() => command('zoom-out')}>−</ToolButton>
        <select aria-label={label('zoom')} value="current" onChange={event => { if (event.target.value === 'page') { if (!fitDrawingPage(editor)) setNotice(label('changedFailed')); } else if (event.target.value === 'fit') command('fit'); else if (event.target.value === 'selection') command('fit-selection'); else { editor.setCamera({ ...editor.getCamera(), z: Number(event.target.value) }); } }}>
          <option value="current" disabled>{Math.round(state.zoom * 100)}%</option>
          {[0.25, 0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value * 100}%</option>)}
          {pageBounds && <option value="page">{label('pageFit')}</option>}
          <option value="fit" disabled={!controls.hasShapes}>{actionLabel('fit')}</option><option value="selection" disabled={!controls.canFitSelection}>{actionLabel('fit-selection')}</option>
        </select>
        <ToolButton label={label('zoomIn')} onClick={() => command('zoom-in')}>+</ToolButton>
      </div>
    </>)}
  </>;
}
