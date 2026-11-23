import { isPageId, type Editor, type TLPage, type TLPageId, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { createUuid } from '$lib/utils/id';
import { drawingTransaction } from './drawing-commands';

export interface ProductionLayer { id: string; name: string; includeInDxf: boolean; visible: boolean; locked: boolean }

export const MAX_PRODUCTION_LAYERS = 32;
export const MAX_PRODUCTION_LAYER_NAME = 40;
const PAGE_KEY = 'omsProductionLayers';
const SHAPE_KEY = 'omsProductionLayer';
const RESTORE_KEY = 'omsProductionLayerRestore';
const defaults: readonly Omit<ProductionLayer, 'visible' | 'locked'>[] = [
  { id: 'cut', name: 'Cut', includeInDxf: true },
  { id: 'engrave', name: 'Engrave', includeInDxf: true },
  { id: 'bend', name: 'Bend', includeInDxf: true },
  { id: 'print', name: 'Print', includeInDxf: false },
  { id: 'reference', name: 'Reference', includeInDxf: false },
  { id: 'annotation', name: 'Annotation', includeInDxf: false },
];

export function readProductionLayers(editor: Editor): ProductionLayer[] {
  return pageProductionLayers(editor.getCurrentPage());
}

function pageProductionLayers(page: TLPage): ProductionLayer[] {
  const stored = page.meta[PAGE_KEY];
  if (!Array.isArray(stored)) return defaults.map(layer => ({ ...layer, visible: true, locked: false }));
  const ids = new Set<string>(), layers: ProductionLayer[] = [];
  for (const item of stored.slice(0, MAX_PRODUCTION_LAYERS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { id, name, includeInDxf, visible, locked } = item;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || ids.has(id) ||
        typeof name !== 'string' || !validLayerName(name) || typeof includeInDxf !== 'boolean') continue;
    ids.add(id);
    layers.push({ id, name, includeInDxf, visible: visible !== false, locked: locked === true });
  }
  return layers;
}

function validLayerName(name: string) {
  return !!name.trim() && name.length <= MAX_PRODUCTION_LAYER_NAME && !/[\r\n\t]/.test(name);
}

export function productionLayerId(shape: TLShape): string | undefined {
  const id = shape.meta?.[SHAPE_KEY];
  return typeof id === 'string' ? id : undefined;
}

interface LayerRestoration { opacity: number; isLocked: boolean; hidden: boolean }

function readLayerRestoration(shape: TLShape): LayerRestoration | null {
  const data = shape.meta?.[RESTORE_KEY];
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.opacity !== 'number' ||
      !Number.isFinite(data.opacity) || data.opacity < 0 || data.opacity > 1 ||
      typeof data.isLocked !== 'boolean' || typeof data.hidden !== 'boolean') return null;
  return { opacity: data.opacity, isLocked: data.isLocked, hidden: data.hidden };
}

export function isProductionLayerHidden(shape: TLShape): boolean { return readLayerRestoration(shape)?.hidden === true; }
export function isProductionLayerProtected(shape: TLShape): boolean { return readLayerRestoration(shape) !== null; }

function projectLayerState(editor: Editor, page: TLPage, layers: ProductionLayer[], assignments = new Map<TLShapeId, string | null>()) {
  const shapes = [...editor.getPageShapeIds(page.id)].map(id => editor.getShape(id)).filter((shape): shape is TLShape => !!shape);
  const byId = new Map(shapes.map(shape => [shape.id, shape]));
  const policies = new Map(layers.map(layer => [layer.id, layer]));
  const hidden = new Set<TLShapeId>(), protectedIds = new Set<TLShapeId>();
  for (const shape of shapes) {
    const id = assignments.has(shape.id) ? assignments.get(shape.id) : productionLayerId(shape);
    const layer = id ? policies.get(id) : undefined;
    if (!layer || layer.visible && !layer.locked) continue;
    if (!layer.visible) hidden.add(shape.id);
    // Native selection and transforms operate on whole groups. Hold their ancestors
    // while any member requires protection, even if the other members are visible.
    let current: TLShape | undefined = shape;
    while (current && !protectedIds.has(current.id)) {
      protectedIds.add(current.id);
      current = byId.get(current.parentId as TLShapeId);
    }
  }
  const updates = shapes.flatMap(shape => {
    const restore = readLayerRestoration(shape);
    const protectedByLayer = protectedIds.has(shape.id), isHidden = hidden.has(shape.id);
    const opacity = isHidden ? 0 : restore?.opacity ?? shape.opacity;
    const isLocked = protectedByLayer || (restore?.isLocked ?? shape.isLocked);
    const assignment = assignments.get(shape.id);
    const sameAssignment = !assignments.has(shape.id) || (assignment ?? undefined) === productionLayerId(shape);
    if (sameAssignment && opacity === shape.opacity && isLocked === shape.isLocked &&
        protectedByLayer === !!restore && isHidden === !!restore?.hidden) return [];
    const meta: TLShape['meta'] = { ...shape.meta, [RESTORE_KEY]: protectedByLayer ? {
      opacity: restore?.opacity ?? shape.opacity, isLocked: restore?.isLocked ?? shape.isLocked, hidden: isHidden,
    } : null };
    if (!sameAssignment) meta[SHAPE_KEY] = assignment ?? null;
    return [{ id: shape.id, type: shape.type, opacity, isLocked, meta }];
  });
  if (updates.length) editor.run(() => { editor.updateShapes(updates); }, { ignoreShapeLock: true });
  if (page.id === editor.getCurrentPageId()) {
    const selected = editor.getSelectedShapeIds();
    const remaining = selected.filter(id => !protectedIds.has(id));
    if (selected.length !== remaining.length) editor.setSelectedShapes(remaining);
  }
}

/** Update definitions and project their policies inside the caller's drawing transaction. */
export function applyProductionLayerDefinitions(editor: Editor, layers: ProductionLayer[], assignments?: Map<TLShapeId, string | null>) {
  const page = editor.getCurrentPage();
  if (JSON.stringify(pageProductionLayers(page)) !== JSON.stringify(layers)) {
    editor.updatePage({ id: page.id, meta: { ...page.meta, [PAGE_KEY]: layers.map(layer => ({ ...layer })) } });
    if (JSON.stringify(readProductionLayers(editor)) !== JSON.stringify(layers)) throw new Error('Production layers were not saved');
  }
  projectLayerState(editor, page, layers, assignments);
  if (assignments && [...assignments].some(([id, target]) => {
    const shape = editor.getShape(id);
    return !shape || productionLayerId(shape) !== (target ?? undefined);
  })) throw new Error('Production layer assignments were not saved');
}

function writeProductionLayers(editor: Editor, layers: ProductionLayer[], assignments?: Map<TLShapeId, string | null>): boolean {
  if (editor.getInstanceState().isReadonly) return false;
  return drawingTransaction(editor, () => { applyProductionLayerDefinitions(editor, layers, assignments); });
}

export function installProductionLayers(editor: Editor): () => void {
  const pending = new Set<TLPageId>();
  const schedule = (parentId: TLShape['parentId']) => {
    const pageId = isPageId(parentId) ? parentId : editor.getAncestorPageId(parentId);
    if (pageId) pending.add(pageId);
  };
  // tldraw 2.4 exposes one registration per hook (there is no combined `register`).
  const effects = editor.sideEffects;
  const disposers = [
    effects.registerBeforeChangeHandler('shape', (previous, next, source) => {
      if (source !== 'user' || !isProductionLayerProtected(previous)) return next;
      const restore = readLayerRestoration(next);
      if (!restore) return next;
      return { ...next, isLocked: true, opacity: restore.hidden ? 0 : restore.opacity };
    }),
    effects.registerAfterCreateHandler('shape', (shape, source) => {
      if (source === 'user' && (productionLayerId(shape) || isProductionLayerProtected(shape))) schedule(shape.parentId);
    }),
    effects.registerAfterChangeHandler('shape', (previous, next, source) => {
      if (source !== 'user' || previous.parentId === next.parentId) return;
      // A moved group can bring previously visible layer members to a page with a different policy.
      schedule(previous.parentId); schedule(next.parentId);
    }),
    effects.registerAfterDeleteHandler('shape', (shape, source) => {
      if (source === 'user' && isProductionLayerProtected(shape)) schedule(shape.parentId);
    }),
  ];
  const dispose = () => { for (const stop of disposers) stop(); };
  const stop = editor.sideEffects.registerOperationCompleteHandler(() => {
    const pages = [...pending]; pending.clear();
    if (editor.getInstanceState().isReadonly) return;
    for (const id of pages) {
      const page = editor.getPage(id);
      if (page) projectLayerState(editor, page, pageProductionLayers(page));
    }
  });
  return () => { stop(); dispose(); };
}

export function addProductionLayer(editor: Editor, input: string): boolean {
  const name = input.trim(), layers = readProductionLayers(editor);
  if (!validLayerName(name) || layers.length >= MAX_PRODUCTION_LAYERS ||
      layers.some(layer => layer.name.toLowerCase() === name.toLowerCase())) return false;
  return writeProductionLayers(editor, [...layers, { id: createUuid(), name, includeInDxf: true, visible: true, locked: false }]);
}

export function updateProductionLayer(editor: Editor, id: string, changes: Partial<Omit<ProductionLayer, 'id'>>): boolean {
  const layers = readProductionLayers(editor), current = layers.find(layer => layer.id === id);
  if (!current) return false;
  const name = changes.name?.trim() ?? current.name, includeInDxf = changes.includeInDxf ?? current.includeInDxf;
  if (!validLayerName(name) || layers.some(layer => layer.id !== id && layer.name.toLowerCase() === name.toLowerCase())) return false;
  const visible = changes.visible ?? current.visible, locked = changes.locked ?? current.locked;
  if (name === current.name && includeInDxf === current.includeInDxf && visible === current.visible && locked === current.locked) return true;
  return writeProductionLayers(editor, layers.map(layer => layer.id === id ? { id, name, includeInDxf, visible, locked } : layer));
}

/** Remove a definition and reassign all current members in the same undo step. */
export function removeProductionLayer(editor: Editor, id: string, target: string | null): boolean {
  if (editor.getInstanceState().isReadonly || id === target) return false;
  const layers = readProductionLayers(editor);
  if (!layers.some(layer => layer.id === id) || target !== null && !layers.some(layer => layer.id === target)) return false;
  const assignments = new Map(editor.getCurrentPageShapesSorted()
    .filter(shape => productionLayerId(shape) === id)
    .map(shape => [shape.id, target]));
  return writeProductionLayers(editor, layers.filter(layer => layer.id !== id), assignments);
}

const protectedLayerTypes = new Set(['order-details', 'order-address', 'profile-7st']);
export function assignableProductionObjects(editor: Editor): TLShape[] {
  const selected = [...editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])]
    .map(id => editor.getShape(id)).filter((shape): shape is TLShape => !!shape);
  if (selected.some(shape => protectedLayerTypes.has(shape.type) || editor.isShapeOrAncestorLocked(shape))) return [];
  return selected.filter(shape => shape.type !== 'group' && shape.type !== 'frame');
}

export function assignProductionLayer(editor: Editor, id: string | null): boolean {
  if (editor.getInstanceState().isReadonly || id && !readProductionLayers(editor).some(layer => layer.id === id)) return false;
  const shapes = assignableProductionObjects(editor);
  if (!shapes.length) return false;
  const page = editor.getCurrentPage(), layers = readProductionLayers(editor);
  return drawingTransaction(editor, () => { projectLayerState(editor, page, layers, new Map(shapes.map(shape => [shape.id, id]))); });
}

export function selectableProductionLayerObjects(editor: Editor, id: string): TLShapeId[] {
  const layer = readProductionLayers(editor).find(layer => layer.id === id);
  if (!layer?.visible || layer.locked) return [];
  return editor.getCurrentPageShapesSorted().filter(shape =>
    productionLayerId(shape) === id && !editor.isShapeOrAncestorLocked(shape)).map(shape => shape.id);
}

export function selectProductionLayer(editor: Editor, id: string): boolean {
  if (!selectableProductionLayerObjects(editor, id).length) return false;
  editor.complete();
  const ids = selectableProductionLayerObjects(editor, id);
  if (!ids.length) return false;
  editor.setCurrentTool('select');
  editor.setSelectedShapes(ids);
  return true;
}

export function productionDxfNames(layers: readonly ProductionLayer[]): Map<string, string> {
  const occupied = new Set<string>();
  return new Map(layers.map(layer => {
    const stem = layer.name.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36).replace(/_$/, '') || 'LAYER';
    const base = 'OMS_JOB_' + stem;
    let name = base, suffix = 2;
    while (occupied.has(name)) name = base + '_' + suffix++;
    occupied.add(name);
    return [layer.id, name];
  }));
}
