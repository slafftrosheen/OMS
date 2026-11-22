import { type Editor, type TLShape, type TLShapeId } from '@tldraw/tldraw';
import { createUuid } from '$lib/utils/id';
import { drawingTransaction } from './drawing-commands';

export interface ProductionLayer { id: string; name: string; includeInDxf: boolean }

export const MAX_PRODUCTION_LAYERS = 32;
export const MAX_PRODUCTION_LAYER_NAME = 40;
const PAGE_KEY = 'omsProductionLayers';
const SHAPE_KEY = 'omsProductionLayer';
const defaults: readonly ProductionLayer[] = [
  { id: 'cut', name: 'Cut', includeInDxf: true },
  { id: 'engrave', name: 'Engrave', includeInDxf: true },
  { id: 'bend', name: 'Bend', includeInDxf: true },
  { id: 'print', name: 'Print', includeInDxf: false },
  { id: 'reference', name: 'Reference', includeInDxf: false },
  { id: 'annotation', name: 'Annotation', includeInDxf: false },
];

export function readProductionLayers(editor: Editor): ProductionLayer[] {
  const stored = editor.getCurrentPage().meta[PAGE_KEY];
  if (!Array.isArray(stored)) return defaults.map(layer => ({ ...layer }));
  const ids = new Set<string>(), layers: ProductionLayer[] = [];
  for (const item of stored.slice(0, MAX_PRODUCTION_LAYERS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { id, name, includeInDxf } = item;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || ids.has(id) ||
        typeof name !== 'string' || !validLayerName(name) || typeof includeInDxf !== 'boolean') continue;
    ids.add(id);
    layers.push({ id, name, includeInDxf });
  }
  return layers;
}

function validLayerName(name: string) {
  return !!name.trim() && name.length <= MAX_PRODUCTION_LAYER_NAME && !/[\r\n\t]/.test(name);
}

export function productionLayerId(shape: TLShape): string | undefined {
  const id = shape.meta[SHAPE_KEY];
  return typeof id === 'string' ? id : undefined;
}

function writeProductionLayers(editor: Editor, layers: ProductionLayer[]): boolean {
  if (editor.getInstanceState().isReadonly) return false;
  const page = editor.getCurrentPage();
  return drawingTransaction(editor, () => { editor.updatePage({ id: page.id, meta: { ...page.meta, [PAGE_KEY]: layers } }); });
}

export function addProductionLayer(editor: Editor, input: string): boolean {
  const name = input.trim(), layers = readProductionLayers(editor);
  if (!validLayerName(name) || layers.length >= MAX_PRODUCTION_LAYERS ||
      layers.some(layer => layer.name.toLowerCase() === name.toLowerCase())) return false;
  return writeProductionLayers(editor, [...layers, { id: createUuid(), name, includeInDxf: true }]);
}

export function updateProductionLayer(editor: Editor, id: string, changes: { name?: string; includeInDxf?: boolean }): boolean {
  const layers = readProductionLayers(editor), current = layers.find(layer => layer.id === id);
  if (!current) return false;
  const name = changes.name?.trim() ?? current.name, includeInDxf = changes.includeInDxf ?? current.includeInDxf;
  if (!validLayerName(name) || layers.some(layer => layer.id !== id && layer.name.toLowerCase() === name.toLowerCase())) return false;
  if (name === current.name && includeInDxf === current.includeInDxf) return true;
  return writeProductionLayers(editor, layers.map(layer => layer.id === id ? { id, name, includeInDxf } : layer));
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
  return drawingTransaction(editor, () => {
    editor.updateShapes(shapes.map(shape => ({ id: shape.id as TLShapeId, type: shape.type, meta: { ...shape.meta, [SHAPE_KEY]: id } })));
  });
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
