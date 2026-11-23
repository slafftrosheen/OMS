import {cadSnapIndicator} from './cad-snap';
import { CadProductionClipart, CadStraightEdgeTools } from './CadProductionTools';
import { NestPanel } from './NestPanel';
import { useProductionToolsText } from './production-tools-copy';
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
import { DRAWING_REVIEW_FILE_TYPES, DRAWING_UI_REQUEST, isDrawingUiRequest } from './drawing-ui-requests';
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
import { DrawingIcon } from './drawing-icons';
import {
  ariaDrawingKeys, drawingCommands, drawingCycleIndex, drawingEventKeys, drawingOwnCommandForKeys,
  drawingReadOnlyTools, drawingRepeatable, drawingToolbox, drawingToolForKeys, drawingToolKeys,
  drawingToolTargets, formatDrawingKeys, isDrawingToolId,
  type DrawingCommandId, type DrawingCommandSpec, type DrawingDocker, type DrawingMenuId, type DrawingToolId,
} from './drawing-command-map';
import { useDrawingCommandText } from './drawing-command-copy';
import { DrawingMenuBar, DrawingQuickAccess, buildQuickAccessItems, type DrawingCommandState } from './DrawingCommandUi';
import { summarizeDrawingSelection, type DrawingStatusPaint } from './drawing-status';
import { useActions } from '@tldraw/tldraw';
import { drawingMotion, drawingMoves } from './drawing-motion';
import './drawing-workspace.css';

type Alignment = Pick<Extract<ArrangeOptions, { kind: 'align' }>, 'axis' | 'alignment'>;
const alignments = {
  'align-left': { axis: 'x', alignment: 'start' },
  'align-center': { axis: 'x', alignment: 'center' },
  'align-right': { axis: 'x', alignment: 'end' },
  'align-top': { axis: 'y', alignment: 'start' },
  'align-middle': { axis: 'y', alignment: 'center' },
  'align-bottom': { axis: 'y', alignment: 'end' },
} as const satisfies Partial<Record<DrawingCommandId, Alignment>>;
type AlignmentCommand = keyof typeof alignments;
const alignmentKeys = new Map((Object.keys(alignments) as AlignmentCommand[]).map(id => [drawingCommands[id].keys as string, id]));
function isAlignmentCommand(id: string): id is AlignmentCommand {
  return Object.hasOwn(alignments, id);
}
const editorCommands = ['undo', 'redo', 'duplicate', 'delete', 'select-all', 'group', 'ungroup', 'front', 'back', 'forward', 'backward', 'lock',
  'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', 'fit', 'fit-selection', 'zoom-reset',
  'align-left', 'align-right', 'align-top', 'align-bottom', 'align-center', 'align-middle', 'distribute-horizontal', 'distribute-vertical'] as const satisfies readonly DrawingCommandId[];
function isEditorCommand(id: DrawingCommandId): id is typeof editorCommands[number] {
  return (editorCommands as readonly DrawingCommandId[]).includes(id);
}
const selectionShortcuts: ReadonlySet<DrawingCommandId> = new Set([
  'selectNext', 'selectPrevious', 'centerToPage', 'duplicateInPlace', 'combine', 'breakApart', 'group', 'ungroup',
  'front', 'back', 'forward', 'backward',
]);

type Slot = 'commands' | 'standard' | 'properties' | 'tools' | 'docker' | 'dockerTabs' | 'palette' | 'status' | 'rulerX' | 'rulerY' | 'rulerOrigin';
type Panel = DrawingDocker | null;
interface WorkspaceContext {
  hosts: Partial<Record<Slot, HTMLElement>>;
  panel: Panel;
  setPanel: (panel: Panel) => void;
  root: React.RefObject<HTMLDivElement>;
  order: boolean;
  fullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
  rulers: boolean;
  setRulers: (visible: boolean) => void;
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
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rulers, setRulersState] = useState(() => {
    try { return globalThis.localStorage?.getItem('oms-draw-rulers') !== 'off'; } catch { return true; }
  });
  const setRulers = (visible: boolean) => {
    setRulersState(visible);
    try { globalThis.localStorage?.setItem('oms-draw-rulers', visible ? 'on' : 'off'); } catch { /* private mode */ }
  };
  const fullscreenPending = useRef(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const owner = node.ownerDocument;
    let wasFullscreen = false;
    const update = () => {
      setNativeFullscreen(owner.fullscreenElement === node);
      if (wasFullscreen && !owner.fullscreenElement && !node.contains(owner.activeElement))
        node.querySelector<HTMLButtonElement>('[data-testid="drawing-fullscreen"]')?.focus();
      wasFullscreen = owner.fullscreenElement === node;
    };
    owner.addEventListener('fullscreenchange', update);
    return () => owner.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const node = root.current;
    const owner = node?.ownerDocument;
    // A transformed or clipped order panel can contain a fixed-position child.
    // Move the mounted workspace into the top layer when native fullscreen is unavailable.
    if (node?.showPopover) {
      node.setAttribute('popover', 'manual');
      try { node.showPopover(); }
      catch { node.removeAttribute('popover'); }
    }
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setExpanded(false);
      node?.querySelector<HTMLButtonElement>('[data-testid="drawing-fullscreen"]')?.focus();
    };
    owner?.addEventListener('keydown', exit);
    return () => {
      owner?.removeEventListener('keydown', exit);
      if (node?.hasAttribute('popover')) {
        if (node.matches(':popover-open')) node.hidePopover();
        node.removeAttribute('popover');
      }
    };
  }, [expanded]);
  async function toggleFullscreen() {
    const node = root.current;
    if (!node || fullscreenPending.current) return;
    const owner = node.ownerDocument;
    if (expanded) { setExpanded(false); return; }
    fullscreenPending.current = true;
    try {
      if (owner.fullscreenElement === node) {
        await owner.exitFullscreen();
      } else {
        // An embed can forbid native fullscreen. Keep a view-filling mode in that document.
        try {
          if (owner.fullscreenEnabled && node.requestFullscreen) await node.requestFullscreen();
          else if (node.isConnected) setExpanded(true);
        } catch {
          if (node.isConnected) setExpanded(true);
        }
      }
    } finally { fullscreenPending.current = false; }
  }
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
  return <Context.Provider value={{ hosts, panel, setPanel, root, order, onImport, fullscreen: nativeFullscreen || expanded, toggleFullscreen, rulers, setRulers }}>
    <div ref={root} className={`drawing-workspace ${hidden ? 'drawing-workspace--hidden' : ''} ${panel ? 'has-docker' : ''} ${compact ? 'is-compact' : ''} ${rulers ? '' : 'no-rulers'}`}
      data-testid="drawing-workspace" data-fullscreen={nativeFullscreen || expanded} data-expanded={expanded || undefined} data-mode={order ? 'order' : 'idea'} aria-label={label('workspace')}>
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

/** Keys belong to a text field only while someone types in it. The canvas keeps a
 * hidden label field focused after selection; that is not typing unless a shape is
 * actually being edited. */
function isTypingTarget(editor: { getEditingShapeId: () => unknown }, target: Element): boolean {
  const field = target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  if (!field) return false;
  if (field.matches('textarea.tl-text-input') && !editor.getEditingShapeId()) return false;
  return true;
}
function Icon({ name }: { name: string }) { return <DrawingIcon name={name} />; }
function ToolButton({ label, icon, active, disabled, onClick, onDoubleClick, children, testId }: {
  label: string; icon?: string; active?: boolean; disabled?: boolean; onClick: () => void; onDoubleClick?: () => void; children?: ReactNode; testId?: string;
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
    onClick={onClick} onDoubleClick={onDoubleClick} className={`drawing-button ${active ? 'is-active' : ''}`} data-testid={testId}>
    {icon && <Icon name={icon} />}{children}
  </button>;
}

const toolCategories = drawingToolbox;
const toolGroups = toolCategories.flatMap(category => category.groups);
const toolKeys: Record<string, string> = { select: 'toolkit.draw.selectTitle', draw: 'toolkit.draw.drawTitle', text: 'toolkit.draw.textTitle', arrow: 'toolkit.draw.arrowTitle' };
const shortcut: Record<string, string> = Object.fromEntries(Object.entries(drawingToolKeys).map(([tool, keys]) => [tool, formatDrawingKeys(keys)]));
/** Tool name with its key, without repeating a key the name already carries. */
const withKey = (name: string, tool: string) => shortcut[tool] && !name.endsWith(`(${shortcut[tool]})`) ? `${name} (${shortcut[tool]})` : name;

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
  const productionLabel = useProductionToolsText();
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
  const words = useDrawingCommandText();
  const nativeActions = useActions();
  const [quick, setQuick] = useState<null | 'search' | 'shortcuts'>(null);
  const commandRef = useRef<(id: DrawingCommandId, fromKeyboard?: boolean) => boolean>(() => false);
  const [lastCommand, setLastCommand] = useState<DrawingCommandId | null>(null);
  const previousTool = useRef<DrawingToolId | null>(null);
  const spaceRef = useRef<{ at: number; moved: boolean } | null>(null);
  const toolRef = useRef<(tool: DrawingToolId, fromKeyboard?: boolean) => void>(() => undefined);
  const [hud, setHud] = useState<{ text: string; keys?: string; serial: number } | null>(null);
  useEffect(() => {
    if (!hud) return;
    const timer = setTimeout(() => setHud(current => current?.serial === hud.serial ? null : current), 1300);
    return () => clearTimeout(timer);
  }, [hud]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // Desktop click rhythm: a second single click on the selected object shows the
  // rotate/skew handles; a double-click edits its text. The canvas engine would
  // start label editing on that second click, so hand it back to Pick here.
  useEffect(() => {
    let press: { selected: string[]; at: number } | null = null;
    let lastUp = 0;
    const listener = (info: { type: string; name: string }) => {
      if (info.type !== 'pointer') return;
      if (info.name === 'pointer_down') { press = { selected: [...editor.getSelectedShapeIds()], at: performance.now() }; return; }
      if (info.name !== 'pointer_up' || !press) return;
      const now = performance.now(), doubleClick = now - lastUp < editor.options.doubleClickDurationMs;
      const before = press; lastUp = now; press = null;
      if (doubleClick || before.selected.length !== 1) return;
      const upAt = now;
      // Wait out the double-click window: a second click edits text as usual,
      // and typing straight away keeps the editor open.
      const textAt = (id: string) => JSON.stringify((editor.getShape(id as TLShapeId)?.props as { text?: unknown; richText?: unknown } | undefined)?.text ?? null);
      const startText = textAt(before.selected[0]);
      setTimeout(() => {
        if (lastUp !== upAt) return;
        const editing = editor.getEditingShapeId();
        if (!editing || editing !== before.selected[0] || textAt(editing) !== startText) return;
        const shape = editor.getShape(editing);
        if (!shape || (shape.type !== 'geo' && shape.type !== 'text')) return;
        editor.setEditingShape(null);
        editor.setCurrentTool('select');
        editor.select(editing);
        editor.getContainer().focus();
        if (!readSkewSelection(editor).error) setDrawingSkewMode(editor, !isDrawingSkewMode(editor));
      }, editor.options.doubleClickDurationMs + 20);
    };
    editor.on('event', listener as any);
    return () => { editor.off('event', listener as any); };
  }, [editor]);
  // Motion: docker content slides in when you switch dockers; the property bar
  // cross-fades when its context changes; pressed tools give a small spring.
  const motionPanel = context?.panel ?? null;
  useEffect(() => {
    if (motionPanel) drawingMotion(context?.hosts.docker?.querySelector('.drawing-docker-content'), drawingMoves.dockerSwap, { duration: 200 });
  }, [motionPanel]);
  const motionTool = useValue('motion tool', () => editor.getCurrentToolId(), [editor]);
  const motionSelection = useValue('motion selection kind', () => {
    const shapes = editor.getSelectedShapes();
    return shapes.length ? `${shapes.length > 1 ? 'n' : '1'}:${shapes.every(shape => shape.type === 'text') ? 'text' : 'shape'}` : 'none';
  }, [editor]);
  useEffect(() => {
    const host = context?.hosts.properties;
    if (host) for (const child of Array.from(host.children).slice(1)) drawingMotion(child, drawingMoves.contextSwap, { duration: 160 });
  }, [motionTool, motionSelection]);
  useEffect(() => {
    const pressed = context?.hosts.tools?.querySelector('.drawing-tool-group .drawing-button[aria-pressed="true"]');
    drawingMotion(pressed, drawingMoves.press, { duration: 220 });
  }, [motionTool]);
  useEffect(() => {
    // The status bar shows the pointer in page (or CAD) coordinates, throttled to one frame.
    const container = editor.getContainer();
    let frame = 0;
    const move = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; const point = editor.inputs.currentPagePoint; setCursor({ x: point.x, y: point.y }); });
    };
    const leave = () => { if (frame) cancelAnimationFrame(frame); frame = 0; setCursor(null); };
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerleave', leave);
    return () => { container.removeEventListener('pointermove', move); container.removeEventListener('pointerleave', leave); if (frame) cancelAnimationFrame(frame); };
  }, [editor]);
  const activeSnap = useValue('CAD snap target', () => editor.snaps.getIndicators().some(value => value.id === 'oms-cad-snap') ? cadSnapIndicator(editor).get() : null, [editor]);
  const construction = useValue('CAD construction status', () => cadConstruction(editor).get(), [editor]);
  const nodeEditing = useValue('CAD node editing mode', () => isCadNodeEditing(editor), [editor]);
  const nodeCount = useValue('Selected CAD node count', () =>
    nodeEditing && editor.getOnlySelectedShape()?.type === 'cad-bezier' ? getSelectedCadNodes(editor).length : null,
    [editor, nodeEditing]);
  const constructionHint = construction ? workbenchLabel(construction.points.length === 0 ? 'pickFirst' : construction.points.length === 1 ? 'pickThrough' : construction.kind === 'arc' ? 'pickArcEnd' : 'pickThird') : '';
  const [toolGroup, setToolGroup] = useState<string | null>(null);
  const [groupTools, setGroupTools] = useState<Partial<Record<string, DrawingToolId>>>({});
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
  const [layerFocusRequest, setLayerFocusRequest] = useState(0);
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

  const toolLabel = (tool: string) => (isDrawingToolId(tool) ? words.tools[tool] : undefined) ??
    (tool === 'paint' ? vectorLabel('paint') : tool === 'clipart' ? productionLabel('clipart') : tool === 'cad-measure-tools' ? productionLabel('construction') :
    tool === 'cad-freehand' ? penLabel('freehand') : tool === 'draw' ? penLabel('sketch') : tool === 'cad-arc-three' ? workbenchLabel('arcThree') :
    tool === 'cad-circle-three' ? workbenchLabel('circleThree') : tool === 'cad-circle' ? workbenchLabel('circle') : tool === 'cad-dimension' ? workbenchLabel('dimension') :
    tool === 'nodes' ? workbenchLabel('nodes') : tool === 'cad-polyline' ? cadLabel('drawPolyline') : tool === 'cad-bezier' ? advancedLabel('bezierTool') :
    tr(toolKeys[tool] ?? `toolkit.toolbar.${tool}`));
  function toolEnabled(tool: DrawingToolId): boolean {
    const route = drawingToolTargets[tool];
    return route.kind === 'command' ? commandState(route.command).enabled : !controls.readOnly || drawingReadOnlyTools.has(tool);
  }
  function chooseTool(tool: string) {
    if (!isDrawingToolId(tool) || !toolEnabled(tool) ||
        (editor.getInstanceState().isReadonly && !drawingReadOnlyTools.has(tool))) return false;
    const route = drawingToolTargets[tool];
    setToolGroup(null);
    closeMenus();
    const group = toolGroups.find(group => group.tools.includes(tool));
    if (group) setGroupTools(previous => ({ ...previous, [group.id]: tool }));
    if (route.kind === 'command') return commandRef.current(route.command);
    setDrawingSkewMode(editor, false);
    setCadNodeEditing(editor, false);
    if ('panel' in route && route.panel) context?.setPanel(route.panel);
    editor.complete();
    if (readCadSettings(editor) && (route.kind === 'geometry' || tool === 'line')) {
      editor.setStyleForNextShapes(DefaultDashStyle, 'solid'); editor.setStyleForNextShapes(DefaultFillStyle, 'none');
      if (tool === 'line') editor.setStyleForNextShapes(LineShapeSplineStyle, 'line');
    }
    if (route.kind === 'geometry') {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, route.shape);
      editor.setCurrentTool('geo');
    } else editor.setCurrentTool(route.tool);
    editor.focus();
    return true;
  }
  function toggleToolGroup(group: typeof toolGroups[number], trigger: HTMLButtonElement, focusFirst = false) {
    const focus = () => context?.root.current?.querySelector<HTMLButtonElement>('.drawing-tool-flyout button:not(:disabled)')?.focus();
    if (toolGroup === group.id) { if (focusFirst) focus(); else setToolGroup(null); return; }
    const rootBounds = context?.root.current?.getBoundingClientRect();
    const toolboxBounds = context?.hosts.tools?.getBoundingClientRect();
    if (!rootBounds || !toolboxBounds) return;
    const maxHeight = Math.max(0, toolboxBounds.height - 8);
    const flyoutHeight = Math.min(maxHeight, group.tools.length * 40 + 34);
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
  function command(action: DrawingCommandId): boolean {
    let applied = false;
    if (isAlignmentCommand(action)) {
      try {
        const roots = arrangementRoots(editor);
        if (roots.length > 1) applied = applyArrangePlan(editor,
          prepareArrangePlan(editor, { kind: 'align', ...alignments[action], reference: roots[roots.length - 1] }));
      } catch { /* The alignment plan rejected the selection. */ }
      if (applied) editor.focus();
    } else applied = applyDrawingCommand(editor, action);
    setNotice(applied ? '' : label('changedFailed'));
    return applied;
  }
  function focusCad(section: CadFocusRequest['section'], file?: File, dropPoint?: CadFocusRequest['dropPoint']) {
    if (section === 'nodes' || section === 'nodeArrange' || section === 'nodeReduce' ||
        (section === 'convert' && editor.getOnlySelectedShape()?.type !== 'text')) {
      setDrawingSkewMode(editor, false);
      editor.complete(); editor.setCurrentTool('select'); setCadNodeEditing(editor, true);
    } else if (section === 'convert') {
      setCadNodeEditing(editor, false);
    }
    context?.setPanel('cad'); closeMenus();
    setCadFocus(previous => ({ section, file, dropPoint, sequence: (previous?.sequence ?? 0) + 1 }));
  }
  function compound(operation: CadCompoundOperation) {
    const settings = readCadSettings(editor);
    let code: string | undefined;
    const applied = !!settings && applyCadCompound(editor, settings, operation, issue => { code = issue; });
    setNotice(advancedLabel(applied && !code ? 'applied' : settings ? cadCompoundFeedback(code) : 'settingsRequired'));
    closeMenus();
    return applied && !code;
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
  function openProductionLayers() {
    context?.setPanel('objects');
    setLayerFocusRequest(value => value + 1);
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
      if (request.kind === 'command') commandRef.current(request.action);
      else if (request.kind === 'cad') focusCad(request.action, request.file, request.dropPoint);
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
      if (!(event.target instanceof Element) || isTypingTarget(editor, event.target) || event.isComposing ||
          event.target.closest('[role="dialog"],dialog[open]')) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const shortcutKeys = drawingEventKeys(event);
      const inDrawing = !!event.target.closest('.drawing-viewport');
      if (inDrawing && !modifier && !event.altKey &&
          (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) openDrawingContextMenu(editor);
        return;
      }
      if (openMenu || toolGroup !== null) {
        (event as KeyboardEvent & { isKilled?: boolean }).isKilled = true;
        return;
      }
      const canvasFocus = inDrawing && !event.target.closest('button,a[href],[role="button"],[role="textbox"]');
      const pickIdle = canvasFocus && editor.isIn('select.idle') && !isCadNodeEditing(editor);
      const alignment = alignmentKeys.get(shortcutKeys);
      if (pickIdle && alignment && arrangementRoots(editor).length > 1) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) commandRef.current(alignment, true);
        return;
      }
      if (inDrawing && captureToolkitControls(editor).selectionLocked &&
          (['Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) ||
            modifier && ['x', 'd', 'g', 'u', '[', ']'].includes(key))) {
        // Native shortcuts cannot move or delete a group with protected descendants.
        event.preventDefault(); event.stopPropagation();
        return;
      }
      const cad = readCadSettings(editor);
      if (cad && canvasFocus && editor.isIn('select.idle') && editor.getSelectedShapeIds().length &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !event.altKey) {
        const amount = cad.nudge * (event.shiftKey ? 10 : modifier ? 0.1 : 1);
        const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
        const dy = event.key === 'ArrowDown' ? -amount : event.key === 'ArrowUp' ? amount : 0;
        event.preventDefault(); event.stopPropagation();
        if (!nudgeCadSelection(editor, dx, dy, cad)) setNotice(cadLabel('failed'));
        return;
      }
      const ownCommand = drawingOwnCommandForKeys(shortcutKeys);
      if (ownCommand && (!selectionShortcuts.has(ownCommand) || pickIdle)) {
        const cycle = ownCommand === 'selectNext' || ownCommand === 'selectPrevious';
        // Preserve ordinary focus navigation when there are no objects to cycle.
        if (cycle && !commandRef.current(ownCommand, true)) return;
        event.preventDefault(); event.stopPropagation();
        if (!cycle && !event.repeat) commandRef.current(ownCommand, true);
        return;
      }
      const ownTool = drawingToolForKeys(shortcutKeys);
      if (ownTool && (canvasFocus || !inDrawing && /^F[5-8]$/.test(shortcutKeys))) {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat) toolRef.current(ownTool, true);
      }
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && !event.target.closest('.drawing-menu')) closeMenus(); };
    // Kept in a ref: this effect re-subscribes on renders between key-down and key-up.
    const spaceState = spaceRef;
    const spaceDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element) || !event.target.closest('.drawing-viewport') ||
          event.target.closest('button,a[href],[role="button"],[role="dialog"]') || isTypingTarget(editor, event.target)) return;
      if (editor.getEditingShapeId()) return;
      spaceState.current = { at: performance.now(), moved: false };
    };
    const clearSpace = () => { spaceState.current = null; };
    const spaceMove = (event: PointerEvent) => { if (spaceState.current && (event.movementX || event.movementY)) spaceState.current.moved = true; };
    const spaceUp = (event: KeyboardEvent) => {
      const space = spaceState.current;
      if (event.key !== ' ' || !space) return;
      const tap = !space.moved && performance.now() - space.at < 280;
      spaceState.current = null;
      // Let the canvas finish its own space-pan release first, then switch.
      if (tap) requestAnimationFrame(() => commandRef.current('togglePick'));
    };
    root.addEventListener('keydown', spaceDown, true);
    // Key-up can land outside the workspace once the canvas arms panning; the
    // document sees it either way, and `space` is only set by a canvas key-down.
    root.ownerDocument.addEventListener('keyup', spaceUp, true);
    root.addEventListener('pointermove', spaceMove, true);
    root.addEventListener('keydown', keys, true);
    root.addEventListener('keyup', guardControlKeys, true);
    window.addEventListener('blur', clearSpace);
    document.addEventListener('pointerdown', outside);
    return () => { root.removeEventListener('keydown', spaceDown, true); root.ownerDocument.removeEventListener('keyup', spaceUp, true); root.removeEventListener('pointermove', spaceMove, true); root.removeEventListener('keydown', keys, true); root.removeEventListener('keyup', guardControlKeys, true); window.removeEventListener('blur', clearSpace); document.removeEventListener('pointerdown', outside); };
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
    if (isAlignmentCommand(action)) return controls.canAlign && arrangementRoots(editor).length > 1;
    if (action.startsWith('distribute-')) return controls.canDistribute;
    return controls.canEditSelection;
  };
  const menuActions = (actions: readonly DrawingCommandId[]) => actions.map(action => {
    const key = (drawingCommands[action] as DrawingCommandSpec).keys;
    const name = actionLabel(action);
    const state = commandState(action);
    return <button type="button" key={action} disabled={!state.enabled}
      aria-keyshortcuts={key ? ariaDrawingKeys(key) : undefined} title={key ? `${name} (${formatDrawingKeys(key)})` : undefined}
      onClick={state.run} data-testid={`drawing-action-${action}`}>
      {name}
    </button>;
  });
  const fieldNames = { x: 'positionX', y: 'positionY', w: 'width', h: 'height', rotation: 'rotation' } as const;
  const transformField = (field: DrawingTransformField) => settings ? <CadNumberField key={`cad-${state.selected.join(',')}-${field}`} field={field} label={label(fieldNames[field])}
    value={cadSelection?.[field]} settings={settings} anchor={cadAnchor} proportional={proportional}
    disabled={protectedForm || (field === 'w' || field === 'h' ? !canResize : field === 'rotation' ? !canRotate : !controls.canEditSelection)} /> : <NumberField key={field} field={field} label={label(fieldNames[field])}
    value={field === 'x' ? position?.x : field === 'y' ? position?.y : field === 'w' ? bounds?.w : field === 'h' ? bounds?.h : state.single ? editor.getShapePageTransform(state.single).rotation() * 180 / Math.PI : undefined}
    disabled={field === 'w' || field === 'h' ? !canResize : field === 'rotation' ? !canRotate : !controls.canEditSelection} />;
  const panelModes = ['properties', 'text', 'pen', 'arrange', 'measure', 'guides', 'snap', 'objects', 'cad', 'clipart'] as const;
  const panelLabel = (mode: Exclude<Panel, null>) => mode === 'clipart' ? productionLabel('clipart') : mode === 'pen' ? penLabel('title') : mode === 'guides' ? guideLabel('title') : mode === 'snap' ? snapLabel('title') : mode === 'cad' ? cadLabel('cad') : mode === 'properties' || mode === 'objects' ? label(mode) : workbenchLabel(mode);
  const groupLabel = (group: typeof toolGroups[number]) => {
    if (words.groups[group.id]) return words.groups[group.id];
    if (group.id === 'nodes') return productionLabel('editShapeTools');
    if (group.id === 'ellipse') return productionLabel('circles');
    if (group.id === 'dimension') return workbenchLabel('measure');
    return group.id === 'curves' || group.id === 'shapes' || group.id === 'annotations' ? workbenchLabel(group.id) : toolLabel(group.tools[0]);
  };
  const toolActive = (tool: DrawingToolId) => {
    if (tool === 'nodes') return nodeEditing;
    if (tool === 'free-transform') return skewMode;
    if (['knife', 'fx-contour', 'fx-repeat', 'fx-radial', 'fx-shaping', 'eyedropper', 'outline'].includes(tool)) return false;
    if (tool === 'select') return controls.tool === 'select' && !nodeEditing && !skewMode;
    if (tool === 'clipart') return panel === 'clipart';
    if (tool === 'cad-measure-tools') return panel === 'measure';
    return controls.tool === tool;
  };
  const fullscreenLabel = productionLabel(context.fullscreen ? 'exitFullscreen' : 'fullscreen');
  function toggleFullscreen() {
    closeMenus(true);
    setToolGroup(null);
    void context?.toggleFullscreen().catch(() => setNotice(productionLabel('fullscreenFailed')));
  }
  const activeToolGroup = toolGroups.find(group => group.id === toolGroup);
  /** Every menu, Quick access and shortcut resolves through here, so they never disagree. */
  function commandState(id: DrawingCommandId): DrawingCommandState {
    const spec: DrawingCommandSpec = drawingCommands[id];
    const blocked = controls.readOnly && !spec.readOnly;
    const make = (enabled: boolean, action: () => boolean | void, checked?: boolean, keepMenu = false): DrawingCommandState => ({
      enabled: enabled && !blocked, checked,
      run: () => {
        if (!enabled || blocked || (!spec.readOnly && editor.getInstanceState().isReadonly)) return false;
        if (!keepMenu) closeMenus();
        if (action() === false) return false;
        if (drawingRepeatable.has(id)) setLastCommand(id);
        return true;
      },
    });
    const cad = (section: CadFocusRequest['section'], enabled = true) => make(enabled, () => focusCad(section));
    if (isEditorCommand(id)) return make(actionEnabled(id), () => command(id));
    switch (id) {
      case 'dock-properties': case 'dock-objects': case 'dock-text': case 'dock-arrange': case 'dock-measure':
      case 'dock-guides': case 'dock-snap': case 'dock-pen': case 'dock-cad': case 'dock-clipart': {
        const mode = id.slice(5) as DrawingDocker;
        return make(true, () => { setToolGroup(null); setPanel(panel === mode ? null : mode); }, panel === mode);
      }
      case 'import': return make(!busy && !!onImport, () => input.current?.click());
      case 'importDxf': return cad('importDxf');
      case 'importVector': return cad('importVector');
      case 'export': return make(true, () => {
        setOpenMenu('file');
        requestAnimationFrame(() => context?.root.current?.querySelector<HTMLElement>('[data-drawing-menu="file"] .drawing-export-options select')?.focus());
      }, undefined, true);
      case 'publishPdf': return cad('publishPdf');
      case 'exportDxf': return cad('exportDxf');
      case 'files': return cad('files');
      case 'preflight': return cad('preflight');
      case 'cut': return make(!!nativeActions.cut && controls.canEditSelection, () => { nativeActions.cut?.onSelect('menu'); });
      case 'copy': return make(!!nativeActions.copy && controls.selected > 0, () => { nativeActions.copy?.onSelect('menu'); });
      case 'paste': return make(!!nativeActions.paste, () => { nativeActions.paste?.onSelect('menu'); });
      case 'repeat': return make(true, openRepeat);
      case 'selectSame': return make(true, openSelectSame);
      case 'findReplace': return make(true, openFindReplace);
      case 'copyProperties': return make(true, openAppearance);
      case 'zoom-in': return make(true, () => command('zoom-in'));
      case 'zoom-out': return make(true, () => command('zoom-out'));
      case 'fitPage': return make(!!pageBounds, () => { if (!fitDrawingPage(editor)) setNotice(label('changedFailed')); });
      case 'fullscreen': return make(true, toggleFullscreen, context!.fullscreen);
      case 'rulers': return make(true, () => context!.setRulers(!context!.rulers), context!.rulers);
      case 'grid': return make(true, () => command('grid'), state.grid);
      case 'snap': return make(true, () => command('snap'), state.snap);
      case 'guidesVisible': return make(guides.valid && !drawingGuidesBusy(editor), toggleGuides, guides.visible);
      case 'snapOptions': return make(true, () => setPanel('snap'));
      case 'surface': return make(true, () => setCanvasSurface(canvasSurface === 'blueprint' ? 'paper' : 'blueprint'), canvasSurface === 'blueprint');
      case 'penSettings': return make(true, () => setPanel('pen'));
      case 'pageSetup': return cad('pageSetup');
      case 'document': return cad('document');
      case 'guidesSetup': return make(true, openGuides);
      case 'measure': return make(true, () => setPanel('measure'));
      case 'nest': return make(true, () => openArrange('nest'));
      case 'clipart': return make(true, () => setPanel('clipart'));
      case 'combine': return make(controls.canEditSelection && !!settings, () => compound('combine'));
      case 'breakApart': return make(controls.canEditSelection && !!settings, () => compound('breakApart'));
      case 'reverseOrder': return make((captureDrawingObjectStack(editor)?.selected.length ?? 0) >= 2, reverseObjectOrder);
      case 'relativeOrder': return make(true, openObjectOrder);
      case 'productionLayers': return make(true, openProductionLayers);
      case 'transform': return make(true, openTransform);
      case 'skew': return { ...make(skewMode || !skewSelection.error, togglePickSkew, skewMode), title: skewSelection.error ? skewErrorText(skewSelection.error) : pickSkewLabel('help') };
      case 'arrange': return make(true, () => openArrange('align'));
      case 'shaping': return cad('shaping');
      case 'join': return cad('join');
      case 'knife': return cad('knife');
      case 'convert': return cad('convert');
      case 'outlineObject': return cad('outlineObject');
      case 'nodes': return cad('nodes');
      case 'nodeArrange': return cad('nodeArrange');
      case 'nodeReduce': return cad('nodeReduce');
      case 'rectangleCorners': return cad('rectangle');
      case 'polygonShape': return cad('polygon');
      case 'ellipseSegments': return cad('ellipse');
      case 'paint': return cad('paint');
      case 'outline': return cad('outline');
      case 'contour': return cad('offset');
      case 'midline': return cad('midline');
      case 'radial': return make(true, () => openArrange('radial'));
      case 'lettering': return cad('lettering');
      case 'trace': return cad('trace');
      case 'textDocker': return make(true, () => setPanel('text'));
      case 'fonts': return make(true, focusFonts);
      case 'closeDocker': return make(!!panel, () => setPanel(null));
      case 'repeatLast': {
        if (!lastCommand || lastCommand === 'repeatLast') return { ...make(false, () => false), title: words.ui.nothingToRepeat };
        const target = commandState(lastCommand);
        return { ...make(target.enabled, () => {
          if (!target.run()) return false;
          flash(`${words.ui.repeated}: ${words.commands[lastCommand]}`, 'Ctrl+R');
          return true;
        }), title: `${words.commands.repeatLast}: ${words.commands[lastCommand]}` };
      }
      case 'duplicateInPlace': return make(controls.canEditSelection, duplicateInPlace);
      case 'selectNext': return make(controls.hasShapes, () => cycleSelection(1));
      case 'selectPrevious': return make(controls.hasShapes, () => cycleSelection(-1));
      case 'centerToPage': return make(controls.canEditSelection && !!pageBounds, centerToPage);
      case 'togglePick': return make(controls.tool !== 'select' || nodeEditing || skewMode || !!previousTool.current, togglePick);
      case 'options': return cad('document');
      case 'quickAccess': return make(true, () => setQuick('search'));
      case 'shortcuts': return make(true, () => setQuick('shortcuts'));
      default: {
        const unhandled: never = id;
        throw new Error(`Unhandled drawing command: ${unhandled}`);
      }
    }
  }
  commandRef.current = (id, fromKeyboard = false) => {
    const item = commandState(id);
    if (!item.run()) return false;
    const spec: DrawingCommandSpec = drawingCommands[id];
    if (fromKeyboard && id !== 'repeatLast' && id !== 'quickAccess' && id !== 'shortcuts') flash(words.commands[id].replace(/…$/, ''), spec.keys);
    return true;
  };
  toolRef.current = (tool, fromKeyboard = false) => {
    if (chooseTool(tool) && fromKeyboard) flash(toolLabel(tool), drawingToolKeys[tool]);
  };
  function flash(text: string, keys?: string) { setHud(previous => ({ text, keys, serial: (previous?.serial ?? 0) + 1 })); }
  /** Desktop "+": a copy exactly on top, selected, ready to move. */
  function duplicateInPlace() {
    const ids = [...editor.getSelectedShapeIds()];
    if (!ids.length || !captureToolkitControls(editor).canEditSelection) return false;
    editor.complete(); editor.setCurrentTool('select');
    const applied = drawingTransaction(editor, () => { editor.duplicateShapes(ids, { x: 0, y: 0 }); });
    setNotice(applied ? '' : label('changedFailed'));
    return applied;
  }
  /** Tab / Shift+Tab walk through top-level objects in stacking order. */
  function cycleSelection(direction: 1 | -1) {
    const page = editor.getCurrentPageId();
    const candidates = editor.getCurrentPageShapesSorted().filter(shape => shape.parentId === page && !editor.isShapeOrAncestorLocked(shape));
    if (!candidates.length) return false;
    const selected = editor.getSelectedShapeIds();
    const index = selected.length ? candidates.findIndex(shape => shape.id === selected[selected.length - 1]) : -1;
    const next = candidates[drawingCycleIndex(candidates.length, index, direction)];
    editor.complete(); editor.setCurrentTool('select'); editor.select(next.id);
    editor.focus();
    return true;
  }
  /** P: move the selection so its centre sits on the page centre. */
  function centerToPage() {
    const page = drawingPageBounds(editor), bounds = editor.getSelectionPageBounds();
    if (!page || !bounds || !captureToolkitControls(editor).canEditSelection) return false;
    const dx = page.center.x - bounds.center.x, dy = page.center.y - bounds.center.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
    editor.complete(); editor.setCurrentTool('select');
    const applied = drawingTransaction(editor, () => { editor.nudgeShapes([...editor.getSelectedShapeIds()], { x: dx, y: dy }); });
    setNotice(applied ? '' : label('changedFailed'));
    return applied;
  }
  /** Space tap: jump to Pick, tap again to return to the tool you were using. */
  function togglePick() {
    const current = isCadNodeEditing(editor) ? 'nodes' : isDrawingSkewMode(editor) ? 'free-transform' :
      editor.getCurrentToolId() === 'geo' ? String(editor.getStyleForNextShape(GeoShapeGeoStyle)) : editor.getCurrentToolId();
    if (current !== 'select') {
      previousTool.current = isDrawingToolId(current) ? current : null;
      if (chooseTool('select')) { flash(toolLabel('select'), 'Space'); return true; }
    } else if (previousTool.current) {
      const back = previousTool.current; previousTool.current = null;
      if (chooseTool(back)) { flash(toolLabel(back), 'Space'); return true; }
    }
    return false;
  }
  /** Double-click on a toolbox tool, as on the desktop: the tool's "big" action or its options. */
  function toolDoubleClick(tool: string) {
    const actions: Record<string, () => void> = {
      select: () => { command('select-all'); flash(words.commands['select-all'], 'Ctrl+A'); },
      nodes: () => focusCad('nodes'), zoom: () => command('fit'), hand: () => { if (!pageBounds || !fitDrawingPage(editor)) command('fit'); },
      rectangle: () => pageFrame(), ellipse: () => focusCad('ellipse'), pentagon: () => focusCad('polygon'), star: () => focusCad('polygon'),
      text: () => setPanel('text'), 'cad-freehand': () => setPanel('pen'), draw: () => setPanel('pen'), 'cad-dimension': () => setPanel('measure'),
      paint: () => focusCad('paint'), outline: () => focusCad('outline'), eyedropper: () => openAppearance(), clipart: () => setPanel('clipart'),
    };
    (actions[tool] ?? (() => setPanel('properties')))();
  }
  /** Double-click Rectangle: an outline exactly the size of the page. */
  function pageFrame() {
    if (controls.readOnly) return;
    const page = drawingPageBounds(editor);
    if (!page) { focusCad('pageSetup'); return; }
    const id = createShapeId();
    editor.complete(); editor.setCurrentTool('select');
    const created = drawingTransaction(editor, () => {
      editor.createShape({ id, type: 'geo', x: page.x, y: page.y, props: { geo: 'rectangle', w: page.w, h: page.h, fill: 'none', dash: 'solid' } } as any);
      editor.select(id);
    });
    if (created) flash(words.ui.pageFrame); else setNotice(label('changedFailed'));
  }
  const quickItems = quick ? buildQuickAccessItems(commandState, toolGroups.flatMap(group => group.tools).map(tool => ({
    id: tool, label: toolLabel(tool), icon: tool, active: toolActive(tool),
    enabled: toolEnabled(tool), run: () => chooseTool(tool),
  })), words) : [];
  const selectionSummary = summarizeDrawingSelection(state.selectedShapes, getDefaultColorTheme({ isDarkMode: false }) as any);
  const cursorText = cursor ? (() => {
    const point = settings ? canvasPointToCad(cursor, settings) : cursor;
    const digits = settings ? Math.min(3, settings.precision) : 0;
    return `${point.x.toFixed(digits)}, ${point.y.toFixed(digits)}${settings ? ` ${settings.unit}` : ''}`;
  })() : '';
  const shapeName = (type: string | null) => type ? words.shapes[type] ?? words.shapes.curve : words.shapes.curve;
  const selectionText = !selectionSummary.count ? words.ui.noSelection
    : selectionSummary.count === 1 ? `${shapeName(selectionSummary.type)}${cadSelection && settings ? ` · ${Number(cadSelection.w?.toFixed(settings.precision) ?? 0)} × ${Number(cadSelection.h?.toFixed(settings.precision) ?? 0)} ${settings.unit}` : ''}`
    : `${selectionSummary.count} ${words.ui.objectsSelected}${selectionSummary.type ? ` · ${shapeName(selectionSummary.type)}` : ''}`;
  const paintSwatch = (paint: DrawingStatusPaint | null, kind: 'fill' | 'outline') => {
    const name = kind === 'fill' ? words.ui.fill : words.ui.outline;
    const value = !paint ? '—' : paint.kind === 'none' ? (kind === 'fill' ? words.ui.noFill : words.ui.noOutline) : paint.kind === 'mixed' ? words.ui.mixed : paint.hex.toUpperCase();
    const width = kind === 'outline' && paint?.kind === 'colour' && selectionSummary.outlineWidth !== null ? ` · ${Number(selectionSummary.outlineWidth.toFixed(2))}` : '';
    return <button type="button" className={`drawing-status-paint drawing-status-paint--${kind}`} title={`${name}: ${value}${width}`} aria-label={`${name}: ${value}${width}`}
      disabled={!paint} onClick={() => focusCad(kind === 'fill' ? 'paint' : 'outline')} data-testid={`drawing-status-${kind}`}>
      <span className={`drawing-status-chip${paint?.kind === 'none' ? ' is-none' : paint?.kind === 'mixed' ? ' is-mixed' : ''}`}
        style={paint?.kind === 'colour' ? { [kind === 'fill' ? 'background' : 'borderColor']: paint.hex } as React.CSSProperties : undefined} />
      <span className="drawing-status-paint-text">{value}{width}</span>
    </button>;
  };
  const statusText = freehandHint ? freehandHint : rotationPreview ? rotationPreview.error ? rotationLabel(rotationPreview.error) : rotationPreview.kind === 'pivot' ? rotationLabel('help') : `${pickSkewLabel('mode')}: ${Number(rotationPreview.angle.toFixed(2))}°` : skewGesture ? skewGesture.error ? skewErrorText(skewGesture.error) : `${pickSkewLabel('mode')}: ${Number(skewGesture.angle.toFixed(2))}°${skewGesture.limited ? ` · ${pickSkewLabel('limit')}` : ''}` : pickGuideSnap ? snapLabel('guidelines') : notice || (activeSnap ? snapLabel(activeSnap.kind) : controls.readOnly ? label('readOnly') : controls.tool === 'cad-freehand' ? penLabel('drawHelp') : controls.selectionLocked ? label('locked') : skewMode ? pickSkewLabel('help') : constructionHint ? `${constructionHint} · ${workbenchLabel('constructionKeys')}` : controls.tool === 'cad-polyline' ? cadLabel('polylineKeys') : controls.tool === 'cad-bezier' ? advancedLabel('bezierKeys') : `${controls.selected} ${label('selected')} · ${state.shapes.length} ${label('items')}`);

  return <>
    {portal('commands', <>
      <strong className="drawing-title">OMS<span> DRAW</span></strong>
      <DrawingMenuBar label={words.ui.menuBar} resolve={commandState} openMenu={openMenu} onKeyDown={navigateMenus}
        summary={(id: DrawingMenuId, text: string) => menuSummary(id, text)}
        embeds={{
          exportSettings: <div className="drawing-export-block"><fieldset className="drawing-export-options" disabled={busy}>
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
          <div className="drawing-export-actions"><button type="button" disabled={busy || !exportPlans?.svg.ok} onClick={() => void exportDrawing('svg')}>{label('exportSvg')}</button>
          <button type="button" disabled={busy || !exportPlans?.png.ok} onClick={() => void exportDrawing('png')}>{label('exportPng')}</button></div>
          {exportError && <p role="alert">{exportError}</p>}
          {exportPlans && <p className="drawing-help" role="status">{exportPlans.svg.ok === false ? label(exportPlans.svg.error) : exportPlans.png.ok === false ? label(exportPlans.png.error) : `${label('exportOmitted')}: ${exportPlans.svg.value.omitted}`}</p>}
          <p>{label('exportHint')}</p>
          <p>{label('exportScaleHint')}</p></div>,
          saveToOrder: order ? <div className="drawing-export-save">{order&&<><label className="drawing-export-format">{workbenchLabel('exportFormat')}<select value={saveFormat} onChange={e=>setSaveFormat(e.target.value as 'svg'|'png')}><option value="png">PNG</option><option value="svg">SVG</option></select></label><ProductionSaveButton extension={saveFormat} disabled={busy||!!exportPlans&&!exportPlans[saveFormat].ok} errorMessage={exportFailure} onStatus={setNotice} createFile={async(signal)=>{
            const output=await exportDrawingArtwork(editor,saveFormat,exportOptions,signal);
            if(output.reduced)throw new Error('exportReduced');
            return output.blob;
          }}/></>}</div> : null,
          toolDirectory: <div className="drawing-tool-directory">{toolCategories.map(category => <section key={category.id} aria-label={words.sections[category.id]}>
            <h3>{words.sections[category.id]}</h3>
            {category.groups.flatMap(group => group.tools).map(tool =>
              <button type="button" key={tool} aria-pressed={toolActive(tool)} disabled={!toolEnabled(tool)} onClick={() => chooseTool(tool)} data-drawing-tool={tool}>
                <Icon name={tool} /><span>{toolLabel(tool)}</span>{shortcut[tool] && <kbd>{shortcut[tool]}</kbd>}
              </button>
            )}
          </section>)}</div>,
        }} />
      <div className="drawing-fullscreen-action">
        <ToolButton icon={context.fullscreen ? 'exit-fullscreen' : 'fullscreen'} testId="drawing-fullscreen"
          label={fullscreenLabel} active={context.fullscreen} onClick={toggleFullscreen}>
          <span>{fullscreenLabel}</span>
        </ToolButton>
      </div>
    </>)}
    {portal('standard', <>
      <ToolButton icon="import" testId="drawing-import" label={`${label('import')} (${formatDrawingKeys('Ctrl+I')})`} disabled={!commandState('import').enabled} onClick={() => commandRef.current('import')} />
      <ToolButton icon="export" testId="drawing-export" label={`${words.ui.standardExport} (${formatDrawingKeys('Ctrl+E')})`} onClick={() => commandRef.current('export')} />
      <span className="drawing-divider" />
      <ToolButton icon="undo" testId="drawing-undo" label={`${actionLabel('undo')} (Ctrl+Z)`} disabled={!commandState('undo').enabled} onClick={() => commandRef.current('undo')} />
      <ToolButton icon="redo" testId="drawing-redo" label={`${actionLabel('redo')} (Ctrl+Shift+Z)`} disabled={!commandState('redo').enabled} onClick={() => commandRef.current('redo')} />
      <span className="drawing-divider" />
      {(['cut', 'copy', 'paste'] as const).map(id => { const item = commandState(id); return <ToolButton key={id} icon={id} testId={`drawing-${id}`}
        label={`${words.commands[id]} (${formatDrawingKeys(drawingCommands[id].keys)})`} disabled={!item.enabled} onClick={item.run} />; })}
      <ToolButton icon="duplicate" testId="drawing-duplicate" label={`${actionLabel('duplicate')} (${formatDrawingKeys('Ctrl+D')})`} disabled={!commandState('duplicate').enabled} onClick={() => commandRef.current('duplicate')} />
      <span className="drawing-divider" />
      <ToolButton icon="fit" testId="drawing-fit" label={`${actionLabel('fit')} (F4)`} disabled={!actionEnabled('fit')} onClick={() => command('fit')} />
      <ToolButton icon="fit-selection" testId="drawing-fit-selection" label={`${actionLabel('fit-selection')} (Shift+F2)`} disabled={!actionEnabled('fit-selection')} onClick={() => command('fit-selection')} />
      <span className="drawing-divider" />
      <ToolButton icon="snap" testId="drawing-standard-snap" label={`${words.commands.snap} (${formatDrawingKeys('Alt+Y')})`} active={state.snap} onClick={() => command('snap')} />
      <ToolButton icon="rulers" testId="drawing-standard-rulers" label={words.commands.rulers} active={context.rulers} onClick={() => context.setRulers(!context.rulers)} />
      <span className="drawing-divider" />
      <ToolButton icon="files" testId="drawing-files" label={vectorLabel('files')} onClick={() => focusCad('files')} />
      <ToolButton icon="preflight" testId="drawing-standard-preflight" label={words.commands.preflight} onClick={() => focusCad('preflight')} />
      <button type="button" className="drawing-quick-trigger" onClick={() => setQuick('search')} aria-keyshortcuts={ariaDrawingKeys('Ctrl+/')} data-testid="drawing-quick-trigger"
        title={`${words.ui.quickAccessTitle} (${formatDrawingKeys('Ctrl+/')})`}>
        <Icon name="command-search" /><span>{words.ui.quickAccessPlaceholder}</span><kbd>{formatDrawingKeys('Ctrl+/')}</kbd>
      </button>
      <input ref={input} type="file" hidden multiple accept={[
        DRAWING_REVIEW_FILE_TYPES,
        order ? '.pdf,.png,.jpg,.jpeg,.webp,.gif' :
          'image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.pdf,.mp3,.wav,.ogg,.m4a',
      ].join(',')}
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
      {toolCategories.map(category => <div className="drawing-tool-section" key={category.id} role="group" aria-label={words.sections[category.id]}>
      {category.groups.map(group => {
        const active = group.tools.find(tool => tool === controls.tool && toolActive(tool)) ?? group.tools.find(toolActive);
        const current = active ?? groupTools[group.id] ?? group.tools[0];
        return <div className="drawing-tool-group" key={group.id}>
          <ToolButton icon={current} label={withKey(toolLabel(current), current)} active={toolActive(current)} disabled={!toolEnabled(current)} onClick={() => chooseTool(current)} onDoubleClick={() => toolDoubleClick(current)} testId={current === 'paint' ? 'drawing-paint' : `drawing-tool-${current}`} />
          {group.tools.length > 1 && <button type="button" className="drawing-tool-expand" title={`${workbenchLabel('more')}: ${groupLabel(group)}`} aria-label={`${workbenchLabel('more')}: ${groupLabel(group)}`} aria-expanded={toolGroup === group.id} onClick={event => toggleToolGroup(group, event.currentTarget, event.detail === 0)}
            onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); toggleToolGroup(group, event.currentTarget, true); } }} data-testid={`drawing-tools-${group.id}`}>▸</button>}
        </div>;
      })}
      </div>)}
    </div>)}
    {activeToolGroup && hosts.tools && context.root.current && createPortal(<div className="drawing-tool-flyout" role="group" aria-label={groupLabel(activeToolGroup)} style={flyoutPosition}>
      <h3>{groupLabel(activeToolGroup)}</h3>
      {activeToolGroup.tools.map(tool => <button type="button" key={tool} disabled={!toolEnabled(tool)} aria-pressed={toolActive(tool)} title={withKey(toolLabel(tool), tool)} onClick={() => chooseTool(tool)} data-testid={`drawing-flyout-${tool}`}><Icon name={tool} /><span>{toolLabel(tool)}</span>{shortcut[tool] && <kbd>{shortcut[tool]}</kbd>}</button>)}
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
        : mode === 'snap' ? <CadSnapPanel settings={settings}/> : mode === 'text' ? <><DrawingFindReplacePanel focusRequest={findFocusRequest}/><TextPanel onOutlines={()=>focusCad('convert')} onLettering={()=>focusCad('lettering')} fontFocusRequest={fontFocusRequest}/></> : mode === 'measure' ? <>
          <MeasurePanel settings={settings} onTool={chooseTool} onDocument={() => focusCad('document')} />
          <CadStraightEdgeTools settings={settings} />
        </> : mode === 'clipart' ? <CadProductionClipart settings={settings} onSetup={() => focusCad('document')} /> : mode === 'arrange' ? <>
          <label className="drawing-cad-task"><span>{arrangeTaskLabel('task')}</span><select value={arrangeTask} data-testid="drawing-arrange-task" onChange={event => setArrangeTask(event.target.value as ArrangeTask)}>
            {(['transform','align','repeat','radial','nest'] as const).map(task => <option key={task} value={task}>{arrangeTaskLabel(task)}</option>)}
          </select></label>
          <div hidden={arrangeTask !== 'transform'}><DrawingTransformPanel settings={settings} focusRequest={arrangeTask === 'transform' ? transformFocusRequest : 0}/></div>
          <div hidden={arrangeTask !== 'align'}><ArrangePanel settings={settings}><details><summary>{label('object')}</summary><div className="drawing-align-grid">{menuActions(['front','back','forward','backward','rotate-left','rotate-right','flip-horizontal','flip-vertical','group','ungroup'])}</div></details></ArrangePanel></div>
          <div hidden={arrangeTask !== 'repeat'}><RepeatGrid selected={state.selected} disabled={!controls.canEditSelection} settings={settings}
            active={panel === 'arrange' && arrangeTask === 'repeat'} focusRequest={arrangeTask === 'repeat' ? repeatFocusRequest : 0}
            onSetup={() => focusCad('pageSetup')} expanded/></div>
          <div hidden={arrangeTask !== 'radial'}><RadialArrange settings={settings} expanded/></div>
          <div hidden={arrangeTask !== 'nest'}>{arrangeTask === 'nest' && <NestPanel settings={settings} disabled={!controls.canEditSelection} onSetup={() => focusCad('document')}/>}</div>
        </> : mode === 'cad' ? <CadPanel settings={settings} focusRequest={cadFocus} multiplePages={multiplePages} /> : mode === 'objects' ? <>
          <DrawingSelectSamePanel focusRequest={selectSameFocusRequest}/>
          <DrawingObjectsPanel focusRequest={objectOrderFocusRequest} layerFocusRequest={layerFocusRequest}/>
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
    {portal('palette', <div className="drawing-swatches" role="toolbar" aria-label={label('palette')} title={words.ui.paletteHint}>
      <button type="button" className="drawing-swatch-none" title={`${words.ui.noColour} — ${words.ui.noColourHint}`} aria-label={`${words.ui.noColour}. ${words.ui.noColourHint}`}
        disabled={!controls.canStyle || controls.tool !== 'select' || !state.selected.length} data-testid="drawing-colour-none"
        onClick={() => styleChange(DefaultFillStyle, 'none')}
        onContextMenu={event => {
          event.preventDefault(); if (!captureToolkitControls(editor).canStyle || !editor.isIn('select')) return;
          drawingTransaction(editor, () => {
            for (const id of editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])) {
              const shape = editor.getShape(id);
              const patch = shape && cadPalettePatch(shape, 'none', 'stroke');
              if (patch) editor.updateShape(patch);
            }
          });
        }}><Icon name="no-color" /></button>
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
      <span className="drawing-status-cursor" title={words.ui.cursor} aria-label={words.ui.cursor} data-testid="drawing-status-cursor">{cursorText || '—'}</span>
      <span className="drawing-status-text" role="status" title={statusText}>{statusText}</span>
      <span key={selectionText} className="drawing-status-object" data-testid="drawing-status-object" title={selectionText}>{selectionText}</span>
      {paintSwatch(selectionSummary.fill, 'fill')}{paintSwatch(selectionSummary.outline, 'outline')}
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
    {hud && context.root.current && createPortal(<div key={hud.serial} className="drawing-key-hud" role="status" aria-live="polite" data-testid="drawing-key-hud">
      <span>{hud.text}</span>{hud.keys && <kbd>{formatDrawingKeys(hud.keys)}</kbd>}
    </div>, context.root.current, 'key-hud')}
    {quick && context.root.current && createPortal(<DrawingQuickAccess mode={quick} items={quickItems} onMode={setQuick} onClose={() => setQuick(null)} />, context.root.current, 'quick-access')}
  </>;
}
