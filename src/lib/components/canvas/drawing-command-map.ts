/**
 * OMS Draw command map — the single source of truth for the menu bar, the
 * toolbox, Quick access and the keyboard sheet. Pure data so it can be tested
 * without a browser: every menu entry is a command id, every command has an
 * icon and (optionally) keys, and no two commands claim the same keys.
 *
 * Desktop vector-suite order: File · Edit · View · Layout · Object · Effects ·
 * Bitmaps · Text · Tools · Window · Help.
 */

export const drawingMenuIds = ['file', 'edit', 'view', 'layout', 'object', 'effects', 'bitmaps', 'text', 'tools', 'window', 'help'] as const;
export type DrawingMenuId = typeof drawingMenuIds[number];

export const drawingDockers = ['properties', 'objects', 'text', 'arrange', 'measure', 'guides', 'snap', 'pen', 'cad', 'clipart'] as const;
export type DrawingDocker = typeof drawingDockers[number];

export interface DrawingCommandSpec {
  icon: string;
  /** Display keys, `Ctrl` means Ctrl on Windows/Linux and ⌘ on macOS. */
  keys?: string;
  /** Keys handled natively by the canvas engine (listed, never re-bound). */
  native?: boolean;
  /** Toggle commands show a check mark. */
  check?: boolean;
  /** Stable test id for existing tests. */
  testId?: string;
  /** Allowed while the drawing is read-only. */
  readOnly?: boolean;
}

export const drawingCommands = {
  // File
  import: { icon: 'import', keys: 'Ctrl+I', testId: 'drawing-menu-import' },
  importDxf: { icon: 'dxf' },
  importVector: { icon: 'vector-import' },
  export: { icon: 'export', keys: 'Ctrl+E', readOnly: true },
  exportDxf: { icon: 'dxf', readOnly: true },
  publishPdf: { icon: 'pdf', readOnly: true },
  files: { icon: 'files', readOnly: true },
  preflight: { icon: 'preflight', readOnly: true },
  // Edit
  repeatLast: { icon: 'repeat-last', keys: 'Ctrl+R' },
  undo: { icon: 'undo', keys: 'Ctrl+Z', native: true, testId: 'drawing-action-undo' },
  redo: { icon: 'redo', keys: 'Ctrl+Shift+Z', native: true, testId: 'drawing-action-redo' },
  cut: { icon: 'cut', keys: 'Ctrl+X', native: true },
  copy: { icon: 'copy', keys: 'Ctrl+C', native: true, readOnly: true },
  paste: { icon: 'paste', keys: 'Ctrl+V', native: true },
  duplicate: { icon: 'duplicate', keys: 'Ctrl+D', testId: 'drawing-action-duplicate' },
  duplicateInPlace: { icon: 'duplicate-in-place', keys: '+' },
  repeat: { icon: 'fx-repeat', keys: 'Ctrl+Shift+D' },
  delete: { icon: 'delete', keys: 'Delete', native: true, testId: 'drawing-action-delete' },
  'select-all': { icon: 'select-all', keys: 'Ctrl+A', native: true, readOnly: true, testId: 'drawing-action-select-all' },
  selectSame: { icon: 'select-same', readOnly: true },
  selectNext: { icon: 'select-next', keys: 'Tab', readOnly: true },
  selectPrevious: { icon: 'select-previous', keys: 'Shift+Tab', readOnly: true },
  findReplace: { icon: 'find', keys: 'Ctrl+F' },
  copyProperties: { icon: 'eyedropper' },
  // View
  'zoom-in': { icon: 'zoom-in', keys: 'Ctrl+=', native: true, readOnly: true },
  'zoom-out': { icon: 'zoom-out', keys: 'F3', readOnly: true },
  fit: { icon: 'fit', keys: 'F4', readOnly: true, testId: 'drawing-action-fit' },
  'fit-selection': { icon: 'fit-selection', keys: 'Shift+F2', readOnly: true, testId: 'drawing-action-fit-selection' },
  fitPage: { icon: 'fit-page', keys: 'Shift+F4', readOnly: true },
  'zoom-reset': { icon: 'zoom-reset', keys: 'Shift+0', native: true, readOnly: true, testId: 'drawing-action-zoom-reset' },
  fullscreen: { icon: 'fullscreen', keys: 'F9', check: true, readOnly: true },
  rulers: { icon: 'rulers', keys: 'Alt+Shift+R', check: true, readOnly: true, testId: 'drawing-menu-rulers' },
  grid: { icon: 'grid', keys: "Ctrl+'", native: true, check: true, readOnly: true },
  guidesVisible: { icon: 'guides', check: true, testId: 'drawing-menu-guides-visible' },
  snap: { icon: 'snap', keys: 'Alt+Y', check: true, readOnly: true },
  snapOptions: { icon: 'snap', readOnly: true, testId: 'drawing-menu-snap-options' },
  surface: { icon: 'surface', check: true, readOnly: true, testId: 'drawing-menu-surface' },
  penSettings: { icon: 'pen', readOnly: true, testId: 'drawing-menu-pen' },
  // Layout
  pageSetup: { icon: 'page-setup', readOnly: true },
  document: { icon: 'document', readOnly: true },
  guidesSetup: { icon: 'guides', readOnly: true, testId: 'drawing-menu-guides' },
  measure: { icon: 'measure', readOnly: true },
  nest: { icon: 'nest' },
  clipart: { icon: 'clipart', readOnly: true },
  // Object
  group: { icon: 'group', keys: 'Ctrl+G', testId: 'drawing-action-group' },
  ungroup: { icon: 'ungroup', keys: 'Ctrl+U', testId: 'drawing-action-ungroup' },
  combine: { icon: 'combine', keys: 'Ctrl+L' },
  breakApart: { icon: 'break-apart', keys: 'Ctrl+K' },
  lock: { icon: 'lock', testId: 'drawing-action-lock' },
  productionLayers: { icon: 'objects', readOnly: true },
  front: { icon: 'front', keys: 'Ctrl+Home', testId: 'drawing-action-front' },
  back: { icon: 'back', keys: 'Ctrl+End', testId: 'drawing-action-back' },
  forward: { icon: 'forward', keys: 'Ctrl+PageUp', testId: 'drawing-action-forward' },
  backward: { icon: 'backward', keys: 'Ctrl+PageDown', testId: 'drawing-action-backward' },
  reverseOrder: { icon: 'reverse-order', testId: 'drawing-menu-reverse-order' },
  relativeOrder: { icon: 'objects', readOnly: true },
  transform: { icon: 'transform', keys: 'Alt+F7' },
  'rotate-left': { icon: 'rotate-left', testId: 'drawing-action-rotate-left' },
  'rotate-right': { icon: 'rotate-right', testId: 'drawing-action-rotate-right' },
  'flip-horizontal': { icon: 'flip-horizontal', testId: 'drawing-action-flip-horizontal' },
  'flip-vertical': { icon: 'flip-vertical', testId: 'drawing-action-flip-vertical' },
  skew: { icon: 'skew', check: true, testId: 'drawing-menu-skew-mode' },
  'align-left': { icon: 'align-left', keys: 'L', testId: 'drawing-action-align-left' },
  'align-right': { icon: 'align-right', keys: 'R', testId: 'drawing-action-align-right' },
  'align-top': { icon: 'align-top', keys: 'T', testId: 'drawing-action-align-top' },
  'align-bottom': { icon: 'align-bottom', keys: 'B', testId: 'drawing-action-align-bottom' },
  'align-center': { icon: 'align-center', keys: 'C', testId: 'drawing-action-align-center' },
  'align-middle': { icon: 'align-middle', keys: 'E', testId: 'drawing-action-align-middle' },
  'distribute-horizontal': { icon: 'distribute-horizontal', testId: 'drawing-action-distribute-horizontal' },
  'distribute-vertical': { icon: 'distribute-vertical', testId: 'drawing-action-distribute-vertical' },
  centerToPage: { icon: 'center-page', keys: 'P' },
  arrange: { icon: 'arrange', keys: 'Ctrl+Shift+A' },
  shaping: { icon: 'fx-shaping' },
  join: { icon: 'join' },
  knife: { icon: 'knife' },
  convert: { icon: 'text-curves', keys: 'Ctrl+Q' },
  outlineObject: { icon: 'outline-object', keys: 'Ctrl+Shift+Q' },
  nodes: { icon: 'nodes', keys: 'F10', readOnly: true },
  nodeArrange: { icon: 'node-arrange' },
  nodeReduce: { icon: 'node-reduce' },
  rectangleCorners: { icon: 'corners' },
  polygonShape: { icon: 'polygon' },
  ellipseSegments: { icon: 'ellipse-segments' },
  paint: { icon: 'paint', keys: 'Shift+F11', readOnly: true },
  outline: { icon: 'outline', keys: 'F12' },
  // Effects
  contour: { icon: 'fx-contour', keys: 'Ctrl+F9' },
  midline: { icon: 'fx-midline' },
  radial: { icon: 'fx-radial' },
  lettering: { icon: 'lettering' },
  // Bitmaps
  trace: { icon: 'trace' },
  // Text
  textDocker: { icon: 'text', keys: 'Ctrl+T', readOnly: true },
  fonts: { icon: 'text', readOnly: true },
  togglePick: { icon: 'select', keys: 'Space', native: true, readOnly: true },
  options: { icon: 'options', keys: 'Ctrl+J', readOnly: true },
  // Window
  'dock-properties': { icon: 'properties', keys: 'Alt+Enter', check: true, readOnly: true },
  'dock-objects': { icon: 'objects', keys: 'Ctrl+F2', check: true, readOnly: true },
  'dock-text': { icon: 'text', check: true, readOnly: true },
  'dock-arrange': { icon: 'arrange', check: true, readOnly: true },
  'dock-measure': { icon: 'measure', check: true, readOnly: true },
  'dock-guides': { icon: 'guides', check: true, readOnly: true },
  'dock-snap': { icon: 'snap', check: true, readOnly: true },
  'dock-pen': { icon: 'pen', check: true, readOnly: true },
  'dock-cad': { icon: 'cad', check: true, readOnly: true },
  'dock-clipart': { icon: 'clipart', check: true, readOnly: true },
  closeDocker: { icon: 'close', readOnly: true },
  // Help
  quickAccess: { icon: 'command-search', keys: 'Ctrl+/', readOnly: true },
  shortcuts: { icon: 'shortcuts', keys: 'F1', readOnly: true },
} as const satisfies Record<string, DrawingCommandSpec>;

export type DrawingCommandId = keyof typeof drawingCommands;
export const drawingSubmenuIds = ['exportFormats', 'order', 'transformations', 'alignDistribute', 'shapingTools', 'nodeTools', 'shapeProperties', 'options', 'dockers'] as const;
export type DrawingSubmenuId = typeof drawingSubmenuIds[number];
/** Embedded blocks keep live forms inside a menu (export settings, tool directory). */
export type DrawingMenuEmbed = 'exportSettings' | 'saveToOrder' | 'toolDirectory';
export type DrawingMenuEntry = DrawingCommandId | '-' | { sub: DrawingSubmenuId; items: readonly DrawingMenuEntry[] } | { embed: DrawingMenuEmbed };

export const drawingMenuBar: ReadonlyArray<{ id: DrawingMenuId; items: readonly DrawingMenuEntry[] }> = [
  { id: 'file', items: ['import', 'importDxf', 'importVector', '-', 'export', { embed: 'exportSettings' }, 'exportDxf', 'publishPdf', { embed: 'saveToOrder' }, '-', 'files', 'preflight'] },
  { id: 'edit', items: ['undo', 'redo', 'repeatLast', '-', 'cut', 'copy', 'paste', 'duplicate', 'duplicateInPlace', 'repeat', 'delete', '-', 'select-all', 'selectNext', 'selectPrevious', 'selectSame', 'findReplace', '-', 'copyProperties'] },
  { id: 'view', items: ['zoom-in', 'zoom-out', 'fit', 'fit-selection', 'fitPage', 'zoom-reset', '-', 'fullscreen', 'rulers', 'grid', 'guidesVisible', 'surface', '-', 'snap', 'snapOptions', 'penSettings'] },
  { id: 'layout', items: ['pageSetup', 'document', '-', 'guidesSetup', 'measure', '-', 'nest', 'clipart'] },
  { id: 'object', items: [
    'group', 'ungroup', 'combine', 'breakApart', 'lock', 'productionLayers', '-',
    { sub: 'order', items: ['front', 'back', 'forward', 'backward', '-', 'reverseOrder', 'relativeOrder'] },
    { sub: 'transformations', items: ['transform', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', '-', 'skew'] },
    { sub: 'alignDistribute', items: ['align-left', 'align-center', 'align-right', 'align-top', 'align-middle', 'align-bottom', '-', 'distribute-horizontal', 'distribute-vertical', '-', 'centerToPage', 'arrange'] },
    { sub: 'shapingTools', items: ['shaping', 'join', 'knife'] },
    '-', 'convert', 'outlineObject', '-',
    { sub: 'nodeTools', items: ['nodes', 'nodeArrange', 'nodeReduce'] },
    { sub: 'shapeProperties', items: ['rectangleCorners', 'polygonShape', 'ellipseSegments'] },
    '-', 'paint', 'outline',
  ] },
  { id: 'effects', items: ['contour', 'midline', '-', 'repeat', 'radial', '-', 'lettering'] },
  { id: 'bitmaps', items: ['trace'] },
  { id: 'text', items: ['textDocker', 'fonts', 'findReplace', '-', 'convert', 'lettering'] },
  { id: 'tools', items: [
    'options',
    { sub: 'options', items: ['pageSetup', 'document', 'snapOptions', 'penSettings'] },
    'togglePick', 'pageSetup', 'preflight', 'nest', '-', { embed: 'toolDirectory' },
  ] },
  { id: 'window', items: [
    { sub: 'dockers', items: ['dock-properties', 'dock-objects', 'dock-text', 'dock-arrange', 'dock-measure', 'dock-guides', 'dock-snap', 'dock-pen', 'dock-cad', 'dock-clipart'] },
    'closeDocker', '-', 'rulers', 'fullscreen',
  ] },
  { id: 'help', items: ['quickAccess', 'shortcuts'] },
];

/** Toolbox in desktop vector-suite order. Group ids are stable test hooks. */
export const drawingToolIds = [
  'select', 'free-transform', 'nodes', 'knife', 'eraser', 'hand', 'zoom',
  'cad-freehand', 'line', 'cad-bezier', 'cad-polyline', 'draw', 'highlight',
  'rectangle', 'ellipse', 'cad-circle', 'cad-circle-three', 'cad-arc-three',
  'pentagon', 'star', 'triangle', 'diamond',
  'text', 'cad-dimension', 'cad-measure-tools', 'arrow', 'frame',
  'fx-contour', 'fx-repeat', 'fx-radial', 'fx-shaping',
  'eyedropper', 'paint', 'outline', 'clipart',
] as const;
export type DrawingToolId = typeof drawingToolIds[number];

type DrawingToolTarget =
  | { kind: 'editor'; tool: string; panel?: DrawingDocker }
  | { kind: 'geometry'; shape: 'rectangle' | 'ellipse' | 'pentagon' | 'star' | 'triangle' | 'diamond' }
  | { kind: 'command'; command: DrawingCommandId };

export const drawingToolTargets = {
  select: { kind: 'editor', tool: 'select' },
  'free-transform': { kind: 'command', command: 'skew' },
  nodes: { kind: 'command', command: 'nodes' },
  knife: { kind: 'command', command: 'knife' },
  eraser: { kind: 'editor', tool: 'eraser' },
  hand: { kind: 'editor', tool: 'hand' },
  zoom: { kind: 'editor', tool: 'zoom' },
  'cad-freehand': { kind: 'editor', tool: 'cad-freehand' },
  line: { kind: 'editor', tool: 'line' },
  'cad-bezier': { kind: 'editor', tool: 'cad-bezier' },
  'cad-polyline': { kind: 'editor', tool: 'cad-polyline' },
  draw: { kind: 'editor', tool: 'draw' },
  highlight: { kind: 'editor', tool: 'highlight' },
  rectangle: { kind: 'geometry', shape: 'rectangle' },
  ellipse: { kind: 'geometry', shape: 'ellipse' },
  'cad-circle': { kind: 'editor', tool: 'cad-circle', panel: 'measure' },
  'cad-circle-three': { kind: 'editor', tool: 'cad-circle-three', panel: 'measure' },
  'cad-arc-three': { kind: 'editor', tool: 'cad-arc-three', panel: 'measure' },
  pentagon: { kind: 'geometry', shape: 'pentagon' },
  star: { kind: 'geometry', shape: 'star' },
  triangle: { kind: 'geometry', shape: 'triangle' },
  diamond: { kind: 'geometry', shape: 'diamond' },
  text: { kind: 'editor', tool: 'text', panel: 'text' },
  'cad-dimension': { kind: 'editor', tool: 'cad-dimension', panel: 'measure' },
  'cad-measure-tools': { kind: 'command', command: 'measure' },
  arrow: { kind: 'editor', tool: 'arrow' },
  frame: { kind: 'editor', tool: 'frame' },
  'fx-contour': { kind: 'command', command: 'contour' },
  'fx-repeat': { kind: 'command', command: 'repeat' },
  'fx-radial': { kind: 'command', command: 'radial' },
  'fx-shaping': { kind: 'command', command: 'shaping' },
  eyedropper: { kind: 'command', command: 'copyProperties' },
  paint: { kind: 'command', command: 'paint' },
  outline: { kind: 'command', command: 'outline' },
  clipart: { kind: 'command', command: 'clipart' },
} as const satisfies Record<DrawingToolId, DrawingToolTarget>;

export function isDrawingToolId(value: string): value is DrawingToolId {
  return Object.hasOwn(drawingToolTargets, value);
}

export type DrawingToolSection = 'selectTools' | 'drawTools' | 'annotateTools' | 'effectTools' | 'productionTools';
export const drawingToolbox: ReadonlyArray<{ id: DrawingToolSection; groups: ReadonlyArray<{ id: string; tools: readonly DrawingToolId[] }> }> = [
  { id: 'selectTools', groups: [
    { id: 'select', tools: ['select', 'free-transform'] },
    { id: 'nodes', tools: ['nodes', 'knife', 'eraser'] },
    { id: 'hand', tools: ['hand', 'zoom'] },
  ] },
  { id: 'drawTools', groups: [
    { id: 'curves', tools: ['cad-freehand', 'line', 'cad-bezier', 'cad-polyline'] },
    { id: 'artistic', tools: ['draw', 'highlight'] },
    { id: 'rectangle', tools: ['rectangle'] },
    { id: 'ellipse', tools: ['ellipse', 'cad-circle', 'cad-circle-three', 'cad-arc-three'] },
    { id: 'shapes', tools: ['pentagon', 'star', 'triangle', 'diamond'] },
  ] },
  { id: 'annotateTools', groups: [
    { id: 'text', tools: ['text'] },
    { id: 'dimension', tools: ['cad-dimension', 'cad-measure-tools'] },
    { id: 'annotations', tools: ['arrow', 'frame'] },
  ] },
  { id: 'effectTools', groups: [
    { id: 'effects', tools: ['fx-contour', 'fx-repeat', 'fx-radial', 'fx-shaping'] },
  ] },
  { id: 'productionTools', groups: [
    { id: 'eyedropper', tools: ['eyedropper'] },
    { id: 'paint', tools: ['paint', 'outline'] },
    { id: 'clipart', tools: ['clipart'] },
  ] },
];

/** Tool keys after contextual drawing commands have had priority. */
export const drawingToolKeys: Partial<Record<DrawingToolId, string>> = {
  select: 'V', nodes: 'F10', eraser: 'E', hand: 'H', zoom: 'Z',
  'cad-freehand': 'F5', line: 'L', draw: 'D', rectangle: 'F6', ellipse: 'F7', pentagon: 'Y',
  text: 'F8', arrow: 'A', eyedropper: 'I', paint: 'Shift+F11', outline: 'F12', 'fx-contour': 'Ctrl+F9',
};
/** Tools that only open a docker or a task instead of drawing on the canvas. */
export const drawingTaskTools: ReadonlySet<DrawingToolId> = new Set(drawingToolIds.filter(id => drawingToolTargets[id].kind === 'command'));
export const drawingReadOnlyTools: ReadonlySet<DrawingToolId> = new Set(drawingToolIds.filter(id => {
  const route = drawingToolTargets[id];
  return route.kind === 'command' ? (drawingCommands[route.command] as DrawingCommandSpec).readOnly === true :
    id === 'select' || id === 'hand' || id === 'zoom';
}));
export const drawingToolIcon = (tool: DrawingToolId) => tool === 'outline' ? 'outline' : tool;

export function drawingMenuCommands(entries: readonly DrawingMenuEntry[] = drawingMenuBar.flatMap(menu => menu.items)): DrawingCommandId[] {
  return entries.flatMap(entry => typeof entry === 'string' ? entry === '-' ? [] : [entry] : 'sub' in entry ? drawingMenuCommands(entry.items) : []);
}

/** The first menu path of a command, for Quick access breadcrumbs. */
export function drawingCommandPath(command: DrawingCommandId): Array<DrawingMenuId | DrawingSubmenuId> | null {
  const walk = (entries: readonly DrawingMenuEntry[], path: Array<DrawingMenuId | DrawingSubmenuId>): typeof path | null => {
    for (const entry of entries) {
      if (entry === command) return path;
      if (typeof entry === 'object' && 'sub' in entry) { const found = walk(entry.items, [...path, entry.sub]); if (found) return found; }
    }
    return null;
  };
  for (const menu of drawingMenuBar) { const found = walk(menu.items, [menu.id]); if (found) return found; }
  return null;
}

/** Single-letter align keys act only with two or more objects selected. */
export const drawingAlignKeys: ReadonlySet<string> = new Set(['L', 'R', 'T', 'B', 'C', 'E']);
/** Commands that Ctrl+R can repeat (desktop "Repeat last"). */
export const drawingRepeatable: ReadonlySet<string> = new Set(['duplicate', 'duplicateInPlace', 'rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical',
  'front', 'back', 'forward', 'backward', 'group', 'ungroup', 'combine', 'breakApart', 'centerToPage',
  'align-left', 'align-right', 'align-top', 'align-bottom', 'align-center', 'align-middle', 'distribute-horizontal', 'distribute-vertical']);

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** "Ctrl+Shift+D" → "Ctrl+Shift+D" or "⌘⇧D" on macOS. */
export function formatDrawingKeys(keys: string, mac = isMac()): string {
  if (keys === '+') return '+';
  if (!mac) return keys.replace('PageUp', 'PgUp').replace('PageDown', 'PgDn');
  const symbols: Record<string, string> = { Ctrl: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↩', Delete: '⌫', PageUp: '⇞', PageDown: '⇟', Home: '↖', End: '↘' };
  return keys.split('+').map(part => symbols[part] ?? part).join('');
}
/** "Ctrl+Shift+D" → "Control+Shift+D Meta+Shift+D" for aria-keyshortcuts. */
export function ariaDrawingKeys(keys: string): string {
  if (keys === '+') return 'Shift+Equal Add';
  const parts = keys.split('+').map(part => part === "'" ? 'Quote' : part === '/' ? 'Slash' : part === '=' ? 'Equal' : part);
  if (!parts.includes('Ctrl')) return parts.join('+');
  return [parts.map(part => part === 'Ctrl' ? 'Control' : part).join('+'), parts.map(part => part === 'Ctrl' ? 'Meta' : part).join('+')].join(' ');
}

export interface DrawingKeyEvent { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
/** Normalises a keyboard event to the command-map key notation. */
export function drawingEventKeys(event: DrawingKeyEvent): string {
  const named: Record<string, string> = { ' ': 'Space', Del: 'Delete' };
  let key = named[event.key] ?? event.key;
  // "+" from the number pad or Shift+= is the same key to people: duplicate in place.
  if (key === '+' || event.code === 'NumpadAdd') {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return '+';
    key = 'Add';
  }
  // Alt (Option on macOS) changes the produced character; the physical key is what users press.
  if (event.altKey && event.code && /^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (key.length === 1) key = key.toUpperCase();
  if (event.shiftKey && /^[)!@#$%^&*(]$/.test(event.key)) key = ')!@#$%^&*('.indexOf(event.key).toString();
  return [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key]
    .filter(Boolean).join('+');
}
const canonical = (keys: string) => {
  if (keys === '+') return '+';
  const parts = keys.split('+'); const key = parts.pop()!;
  return [parts.includes('Ctrl') ? 'Ctrl' : '', parts.includes('Alt') ? 'Alt' : '', parts.includes('Shift') ? 'Shift' : '', key.length === 1 ? key.toUpperCase() : key].filter(Boolean).join('+');
};
/** Commands our workspace binds itself (not native, not a single-letter alignment key). */
export function drawingOwnCommandForKeys(keys: string): DrawingCommandId | undefined {
  const wanted = canonical(keys);
  for (const [id, spec] of Object.entries(drawingCommands) as Array<[DrawingCommandId, DrawingCommandSpec]>) {
    if (!spec.keys || spec.native || drawingAlignKeys.has(spec.keys)) continue;
    if (canonical(spec.keys) === wanted) return id;
  }
  return undefined;
}

export function drawingToolForKeys(keys: string): DrawingToolId | undefined {
  return drawingToolIds.find(tool => drawingToolKeys[tool] === keys);
}

export function drawingCycleIndex(length: number, current: number, direction: 1 | -1): number {
  if (!length) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return (current + direction + length) % length;
}

/** Every key binding in the workspace, for conflict tests and the keyboard sheet. */
export function drawingKeyBindings(): Array<{ keys: string; kind: 'command' | 'tool'; id: string }> {
  return [
    ...(Object.entries(drawingCommands) as Array<[DrawingCommandId, DrawingCommandSpec]>).filter(([, spec]) => spec.keys).map(([id, spec]) => ({ keys: canonical(spec.keys!), kind: 'command' as const, id })),
    ...(Object.entries(drawingToolKeys) as Array<[DrawingToolId, string]>).map(([id, keys]) => ({ keys: canonical(keys), kind: 'tool' as const, id })),
  ];
}
