/** Bounded, JSON-only Canvas scene shared by the assistant and its edit validator.
 * Records, credentials, chat history and storage URLs are never copied wholesale.
 */
export const MAX_SCENE_SHAPES = 200;
export const MAX_SCENE_TEXT = 2400;
export const PROTECTED_CANVAS_TYPES = new Set(['order-details', 'order-address', 'profile-7st', 'chat', 'swarm']);
export const EDITABLE_CANVAS_TYPES = new Set([
  'idea-card', 'document', 'geo', 'text', 'note', 'arrow', 'line', 'draw', 'highlight',
  'frame', 'group', 'image', 'video', 'bookmark', 'embed', 'material-swatch',
  'web-search', 'crawl', 'maker', 'lumigrid', 'led-strip', 'led-matrix', 'boxletter'
]);
export interface SceneBounds { x: number; y: number; w: number; h: number }
export interface ToolkitSceneShape {
  id: string; type: string; parentId: string; index: string;
  x: number; y: number; rotation: number; opacity: number;
  locked: boolean; editable: boolean; version: string;
  props: Record<string, string | number | boolean>;
  bounds: SceneBounds | null;
  asset?: { id: string; type: string; name: string; mime: string; width: number; height: number };
}
export interface ToolkitScene {
  version: 1; pageId: string; revision: string; totalShapes: number; truncated: boolean;
  shapes: ToolkitSceneShape[]; selectedIds: string[];
  links: Array<{ id: string; from: string; to: string }>;
  viewport: SceneBounds | null;
}

const textKeys = new Set(['text', 'name', 'title', 'body', 'content', 'kind', 'state', 'color',
  'fill', 'dash', 'size', 'font', 'align', 'verticalAlign', 'geo', 'url', 'mime', 'fileId',
  'fit', 'assetId', 'description', 'siteName', 'previewImage', 'embedUrl', 'accent', 'toolInputs', 'toolOutput']);
const numberKeys = new Set(['w', 'h', 'scale', 'pdfPage', 'opacity', 'bend', 'growY', 'strokeCount', 'pointCount']);
const booleanKeys = new Set(['autoSize', 'isClosed', 'isComplete', 'isPen', 'flipX', 'flipY']);
const safeId = (value: unknown) => typeof value === 'string' && /^shape:[a-zA-Z0-9_:-]{1,100}$/.test(value) ? value : '';
export const validSceneShapeId = (value: unknown): value is string => !!safeId(value);
const finite = (value: unknown, fallback = 0, limit = 1_000_000) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : fallback;
const text = (value: unknown, max = MAX_SCENE_TEXT) => typeof value === 'string' ? value.slice(0, max) : '';

/** This fingerprint is a stale-edit guard, not an authentication primitive. */
export function canvasShapeVersion(shape: any): string {
  const canonical = (value: any): any => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])
    );
    return value;
  };
  const serialized = JSON.stringify(canonical({ id: shape?.id, type: shape?.type,
    parentId: shape?.parentId, index: shape?.index, x: shape?.x, y: shape?.y,
    rotation: shape?.rotation, opacity: shape?.opacity, isLocked: shape?.isLocked,
    props: shape?.props ?? {} }));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizedBounds(input: any): SceneBounds | null {
  if (!input || !['x', 'y', 'w', 'h'].every(key => typeof input[key] === 'number' &&
      Number.isFinite(input[key]) && Math.abs(input[key]) <= 1_000_000)) return null;
  if (input.w < 0 || input.h < 0) return null;
  return { x: input.x, y: input.y, w: input.w, h: input.h };
}
function readableProps(input: any, type: string): ToolkitSceneShape['props'] {
  const out: ToolkitSceneShape['props'] = {};
  if (!input || typeof input !== 'object') return out;
  // Legacy node threads and order form data belong to their own authorized UI.
  if (PROTECTED_CANVAS_TYPES.has(type)) return { title: text(input.title, 120) || type };
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (textKeys.has(key) && typeof value === 'string') {
      // Signed URLs and object/data URLs are not needed to reason about an asset.
      if (['url', 'previewImage', 'embedUrl'].includes(key)) {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
              /(?:token|signature|x-amz-|key=)/i.test(url.search)) continue;
          out[key] = url.href.slice(0, 1500);
        } catch { /* Relative private asset routes are represented by fileId. */ }
      } else out[key] = value.slice(0, ['text','body','content','description','toolInputs','toolOutput'].includes(key) ? MAX_SCENE_TEXT : 200);
    } else if (numberKeys.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key] = finite(value);
    } else if (booleanKeys.has(key) && typeof value === 'boolean') out[key] = value;
  }
  for (const key of ['input', 'output']) {
    if (input[key] && typeof input[key] === 'object') {
      try { out[key === 'input' ? 'toolInputs' : 'toolOutput'] = JSON.stringify(input[key]).slice(0, MAX_SCENE_TEXT); }
      catch { /* Nonserializable calculator state is not evidence. */ }
    }
  }
  if (Array.isArray(input.segments)) {
    out.strokeCount = Math.min(input.segments.length, 5000);
    out.pointCount = input.segments.reduce((n: number, segment: any) => n + (segment?.points?.length || 0), 0);
  }
  return out;
}

export function normalizeToolkitScene(input: unknown): ToolkitScene | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, any>;
  if (raw.version !== 1 || !Array.isArray(raw.shapes) || raw.shapes.length > MAX_SCENE_SHAPES) return null;
  const seen = new Set<string>();
  const shapes: ToolkitSceneShape[] = [];
  for (const value of raw.shapes) {
    if (!value || !safeId(value.id) || seen.has(value.id) || typeof value.type !== 'string') continue;
    seen.add(value.id);
    const type = value.type.slice(0, 50);
    const shape: ToolkitSceneShape = { id: value.id, type, parentId: text(value.parentId, 120), index: text(value.index, 100),
      x: finite(value.x), y: finite(value.y), rotation: finite(value.rotation, 0, Math.PI * 100),
      opacity: typeof value.opacity === 'number' ? Math.max(0, Math.min(1, value.opacity)) : 1,
      locked: value.locked === true,
      editable: value.editable === true && !value.locked && EDITABLE_CANVAS_TYPES.has(type) && !PROTECTED_CANVAS_TYPES.has(type),
      version: typeof value.version === 'string' && /^v1:[a-f0-9]{8}$/.test(value.version) ? value.version : '',
      props: readableProps(value.props, type), bounds: normalizedBounds(value.bounds) };
    if (value.asset && typeof value.asset === 'object') shape.asset = {
      id: text(value.asset.id, 120), type: text(value.asset.type, 40), name: text(value.asset.name, 180),
      mime: text(value.asset.mime, 100), width: finite(value.asset.width), height: finite(value.asset.height)
    };
    shapes.push(shape);
  }
  const ids = new Set(shapes.map(shape => shape.id));
  return { version: 1, pageId: text(raw.pageId, 120), revision: text(raw.revision, 100),
    totalShapes: Math.max(shapes.length, Math.min(100_000, Math.floor(finite(raw.totalShapes)))),
    truncated: raw.truncated === true || Number(raw.totalShapes) > shapes.length,
    shapes,
    selectedIds: Array.isArray(raw.selectedIds) ? [...new Set(raw.selectedIds.filter((id: unknown) => typeof id === 'string' && ids.has(id)))].slice(0, MAX_SCENE_SHAPES) as string[] : [],
    links: Array.isArray(raw.links) ? raw.links.slice(0, 200).filter((link: any) =>
      link && ids.has(link.id) && ids.has(link.from) && ids.has(link.to) && link.from !== link.to
    ).map((link: any) => ({ id: link.id, from: link.from, to: link.to })) : [],
    viewport: normalizedBounds(raw.viewport)
  };
}

/** All shape types are represented. Selection is prioritized if a large board is bounded. */
export function captureToolkitScene(editor: any): ToolkitScene {
  const all: any[] = editor?.getCurrentPageShapes?.() ?? [];
  const selected = new Set<string>(editor?.getSelectedShapeIds?.() ?? []);
  const byId = new Map(all.map(shape => [shape.id, shape]));
  const children = new Map<string, any[]>();
  for (const shape of all) children.set(shape.parentId, [...(children.get(shape.parentId) ?? []), shape]);
  const ownBlocked = (shape: any) => !EDITABLE_CANVAS_TYPES.has(shape.type) ||
    PROTECTED_CANVAS_TYPES.has(shape.type) || shape.isLocked === true;
  const blocked = (shape: any) => {
    let ancestor = shape;
    const ancestors = new Set<string>();
    while (ancestor && !ancestors.has(ancestor.id)) {
      if (ownBlocked(ancestor)) return true;
      ancestors.add(ancestor.id); ancestor = byId.get(ancestor.parentId);
    }
    const queue = [...(children.get(shape.id) ?? [])];
    const visited = new Set<string>();
    while (queue.length) {
      const child = queue.pop()!;
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (ownBlocked(child)) return true;
      queue.push(...(children.get(child.id) ?? []));
    }
    return false;
  };
  const shapes = [...all].sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)))
    .slice(0, MAX_SCENE_SHAPES).map(shape => {
      const asset = shape.props?.assetId ? editor?.getAsset?.(shape.props.assetId) : null;
      return { id: shape.id, type: shape.type, parentId: shape.parentId ?? '', index: shape.index ?? '',
        x: shape.x, y: shape.y, rotation: shape.rotation ?? 0, opacity: shape.opacity ?? 1,
        locked: shape.isLocked === true, editable: !blocked(shape), version: canvasShapeVersion(shape),
        props: readableProps(shape.props, shape.type), bounds: normalizedBounds(editor?.getShapePageBounds?.(shape.id)),
        ...(asset ? { asset: { id: asset.id, type: asset.type, name: asset.props?.name,
          mime: asset.props?.mimeType, width: asset.props?.w, height: asset.props?.h } } : {}) };
    });
  const links: ToolkitScene['links'] = [];
  for (const arrow of shapes.filter(shape => shape.type === 'arrow')) {
    const bindings: any[] = editor?.getBindingsFromShape?.(arrow.id, 'arrow') ?? [];
    const from = bindings.find(binding => binding.props?.terminal === 'start')?.toId;
    const to = bindings.find(binding => binding.props?.terminal === 'end')?.toId;
    if (from && to) links.push({ id: arrow.id, from, to });
  }
  const pageId = String(editor?.getCurrentPageId?.() ?? '');
  return normalizeToolkitScene({ version: 1, pageId,
    revision: canvasShapeVersion({ id: pageId, props: { shapes: shapes.map(shape => `${shape.id}:${shape.version}`), links } }),
    totalShapes: all.length, truncated: all.length > MAX_SCENE_SHAPES,
    shapes, links, selectedIds: [...selected], viewport: editor?.getViewportPageBounds?.() ?? null })!;
}
