/** Declarative model output. Nothing in this contract can execute code, call an
 * OMS endpoint, unlock a shape, alter asset ownership, or mutate an order form. */
import { normalizeToolkitScene, validSceneShapeId, type ToolkitScene } from './toolkit-scene';
import { canvasLinkDescriptor, normalizeCanvasMediaUrl } from './toolkit-media-url';

export const MAX_CANVAS_ACTIONS = 12;
export const MAX_ACTION_TARGETS = 40;
export const CREATABLE_CANVAS_TYPES = ['idea-card', 'geo', 'text', 'note', 'frame', 'document'] as const;
export type CreatableCanvasType = typeof CREATABLE_CANVAS_TYPES[number];
type Envelope = { reason: string; expected?: Record<string, string>; pageId?: string };
export type CanvasAction = Envelope & (
  | { kind: 'connect'; from: string; to: string; label?: string }
  | { kind: 'revise'; target: string; title: string; body: string; state?: 'open' | 'in-progress' | 'done' }
  | { kind: 'layout'; layout: 'grid' | 'columns'; targets?: string[] }
  | { kind: 'create'; ref?: string; shape: { type: CreatableCanvasType; x: number; y: number; props: Record<string, unknown> } }
  | { kind: 'update'; target: string; patch: { x?: number; y?: number; rotation?: number; opacity?: number; props?: Record<string, unknown> } }
  | { kind: 'move'; targets: string[]; dx: number; dy: number }
  | { kind: 'resize'; target: string; width: number; height: number }
  | { kind: 'delete'; targets: string[] }
  | { kind: 'duplicate'; targets: string[]; dx: number; dy: number }
  | { kind: 'group'; targets: string[] }
  | { kind: 'ungroup'; targets: string[] }
  | { kind: 'reorder'; targets: string[]; position: 'front' | 'back' | 'forward' | 'backward' }
  | { kind: 'align'; targets: string[]; alignment: 'left' | 'right' | 'top' | 'bottom' | 'center-horizontal' | 'center-vertical' }
  | { kind: 'distribute'; targets: string[]; axis: 'horizontal' | 'vertical' }
);

const COLORS = ['black', 'grey', 'light-violet', 'violet', 'blue', 'light-blue', 'yellow', 'orange', 'green', 'light-green', 'light-red', 'red', 'white'];
const GEO = ['rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'rhombus', 'rhombus-2', 'oval', 'trapezoid', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'x-box', 'check-box'];
const styleRules: Record<string, readonly string[]> = {
  color: COLORS, labelColor: COLORS, fill: ['none', 'semi', 'solid', 'pattern'],
  dash: ['draw', 'solid', 'dashed', 'dotted'], size: ['s', 'm', 'l', 'xl'],
  font: ['draw', 'sans', 'serif', 'mono'], align: ['start', 'middle', 'end'],
  verticalAlign: ['start', 'middle', 'end'], geo: GEO,
  arrowheadStart: ['none', 'arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted'],
  arrowheadEnd: ['none', 'arrow', 'triangle', 'square', 'dot', 'pipe', 'diamond', 'inverted']
};
const nativeProps: Record<string, string[]> = {
  geo: ['w','h','text','color','labelColor','fill','dash','size','font','align','verticalAlign','geo'],
  text: ['w','text','color','size','font','align','autoSize'],
  note: ['text','color','labelColor','size','font','align','verticalAlign'],
  arrow: ['text','color','labelColor','fill','dash','size','font','arrowheadStart','arrowheadEnd','bend'],
  line: ['color','dash','size'], draw: ['color','fill','dash','size'], highlight: ['color','size'],
  frame: ['w','h','name'], image: ['w','h','flipX','flipY'], video: ['w','h'],
  bookmark: ['w','h'], embed: ['w','h'], group: []
};
const ordinaryTexts = ['title','body','content','text','name','description'];
const ACTION_KINDS = new Set(['connect','revise','layout','create','update','move','resize','delete',
  'duplicate','group','ungroup','reorder','align','distribute']);
const CARD_DRAFT_KINDS = new Set(['idea','research','decision','task','note']);
const REFERENCE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
/** Proposal-local references cannot collide with persistent tldraw shape IDs. */
export function isCanvasActionReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('@') && REFERENCE_NAME.test(value.slice(1));
}
const scalar = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function stringValue(value: unknown, max: number) { return typeof value === 'string' ? value.slice(0, max) : undefined; }

/** A per-shape property allowlist is used again at apply time. Unknown fields
 * make the whole proposal invalid; they are never passed to tldraw. */
export function normalizeEditableProps(type: string, input: unknown, create = false): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const allowed = type === 'idea-card'
    ? ['w','h','title','body','kind','state','accent']
    : type === 'document'
      ? ['w','h','title','content','fit','opacity','pdfPage', ...(create ? ['kind','url'] : [])]
      : nativeProps[type] ?? ['w','h','title'];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) return null;
    if (key === 'w' || key === 'h') {
      if (!scalar(value, 16, 10_000)) return null;
      out[key] = value;
    } else if (ordinaryTexts.includes(key)) {
      if (typeof value !== 'string') return null;
      out[key] = value.slice(0, ['title','name'].includes(key) ? 120 : 5000);
    } else if (key === 'kind') {
      const kinds = type === 'idea-card' ? ['idea','research','decision','task','note'] : ['note','link','embed','image','pdf','video','audio'];
      if (typeof value !== 'string' || !kinds.includes(value)) return null;
      out[key] = value;
    } else if (key === 'state') {
      if (typeof value !== 'string' || !['open','in-progress','done'].includes(value)) return null;
      out[key] = value;
    } else if (key === 'accent') {
      if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) return null;
      out[key] = value;
    } else if (key === 'fit') {
      if (typeof value !== 'string' || !['contain','cover'].includes(value)) return null;
      out[key] = value;
    } else if (key === 'opacity') {
      if (!scalar(value, 0, 100)) return null;
      out[key] = value;
    } else if (key === 'pdfPage') {
      if (!Number.isInteger(value) || !scalar(value, 1, 10_000)) return null;
      out[key] = value;
    } else if (key === 'bend') {
      if (!scalar(value, -10_000, 10_000)) return null;
      out[key] = value;
    } else if (key === 'autoSize' || key === 'flipX' || key === 'flipY') {
      if (typeof value !== 'boolean') return null;
      out[key] = value;
    } else if (key === 'url') {
      const url = normalizeCanvasMediaUrl(value);
      if (!url) return null;
      out[key] = url;
    } else if (styleRules[key]) {
      if (typeof value !== 'string' || !styleRules[key].includes(value)) return null;
      out[key] = value;
    } else return null;
  }
  if (create && type === 'document') {
    if (out.url) {
      const descriptor = canvasLinkDescriptor(out.url);
      if (!descriptor || (out.kind && out.kind !== descriptor.kind)) return null;
      out.kind = descriptor.kind;
    } else if (out.kind && out.kind !== 'note') return null;
    else out.kind = 'note';
  }
  return out;
}

export function canvasActionTargets(action: CanvasAction): string[] {
  if (action.kind === 'connect') return [action.from, action.to];
  if ('target' in action) return [action.target];
  if ('targets' in action) return action.targets ?? [];
  return [];
}

/** Linked proposals must stay together in review, persistence and application. */
export function canvasActionsRequireBatch(actions: readonly CanvasAction[]): boolean {
  return actions.some(action => canvasActionTargets(action).some(isCanvasActionReference));
}

function rawTargets(item: Record<string, any>): unknown[] {
  if (item.kind === 'connect') return [item.from, item.to];
  if ('target' in item) return [item.target];
  return Array.isArray(item.targets) ? item.targets : [];
}

function scopedVersions(scene: ToolkitScene, targets: string[]) {
  const affected = new Set(targets);
  let changed = true;
  while (changed) {
    changed = false;
    for (const shape of scene.shapes) if (affected.has(shape.parentId) && !affected.has(shape.id)) {
      affected.add(shape.id); changed = true;
    }
  }
  // Moving a child is local to its parent coordinate system, so parent changes
  // also invalidate a pending proposal (without granting edits to the parent).
  for (const id of [...affected]) {
    let parent = scene.shapes.find(shape => shape.id === id)?.parentId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const shape = scene.shapes.find(shape => shape.id === parent);
      if (!shape) break;
      affected.add(shape.id); parent = shape.parentId;
    }
  }
  return Object.fromEntries(scene.shapes.filter(shape => affected.has(shape.id)).map(shape => [shape.id, shape.version]));
}
function storedVersions(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const entries = Object.entries(input);
  if (entries.length > 200 || entries.some(([id, version]) => !validSceneShapeId(id) ||
      typeof version !== 'string' || !/^v1:[a-f0-9]{8}$/.test(version))) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function normalizeCanvasActions(input: unknown, context?: Set<string> | ToolkitScene): CanvasAction[] {
  if (!Array.isArray(input)) return [];
  const candidates = input.slice(0, 24).filter(item => item && typeof item === 'object' && !Array.isArray(item));
  const named = candidates.some(item => (item.kind === 'create' && 'ref' in item) ||
    rawTargets(item).some(target => typeof target === 'string' && target.startsWith('@')));
  const actionCount = candidates.filter(item => ACTION_KINDS.has(item.kind)).length;
  // Never silently truncate or partially keep a linked plan. Mixed persisted
  // lists may also contain up to five ordinary card drafts, which are ignored.
  if (named && (input.length > 24 || candidates.length !== input.length || actionCount > MAX_CANVAS_ACTIONS ||
      candidates.some(item => !ACTION_KINDS.has(item.kind) && !CARD_DRAFT_KINDS.has(item.kind)))) return [];
  const declared = new Set<string>();
  for (const item of candidates) if (item.kind === 'create' && 'ref' in item) {
    if (typeof item.ref !== 'string' || !REFERENCE_NAME.test(item.ref) || declared.has(item.ref)) return [];
    declared.add(item.ref);
  }
  const scene = context && !(context instanceof Set) ? normalizeToolkitScene(context) : null;
  const ids = context instanceof Set ? context : scene ? new Set(scene.shapes.filter(shape => shape.editable).map(shape => shape.id)) : null;
  const shapeFor = (id: string) => scene?.shapes.find(shape => shape.id === id);
  const created = new Map<string, CreatableCanvasType>();
  const typeFor = (id: string) => created.get(id) ?? shapeFor(id)?.type;
  const known = (id: unknown): id is string => isCanvasActionReference(id)
    ? created.has(id) : validSceneShapeId(id) && (!ids || ids.has(id));
  const targetList = (value: unknown, minimum = 1) => {
    if (!Array.isArray(value) || value.length < minimum || value.length > MAX_ACTION_TARGETS || !value.every(known)) return null;
    const unique = [...new Set<string>(value)];
    return unique.length >= minimum ? unique : null;
  };
  const out: CanvasAction[] = [];
  for (const item of candidates) {
    // Only earlier, successfully validated creates can define a reference.
    // Forward, dangling or malformed references invalidate the whole batch.
    if (rawTargets(item).some(target => typeof target === 'string' && target.startsWith('@') && !known(target))) return [];
    const reason = stringValue(item.reason, 400) ?? '';
    let action: CanvasAction | null = null;
    if (item.kind === 'connect' && known(item.from) && known(item.to) && item.from !== item.to) {
      action = { kind: 'connect', from: item.from, to: item.to, reason,
        ...(typeof item.label === 'string' ? { label: item.label.slice(0, 200) } : {}) };
    } else if (item.kind === 'revise' && known(item.target) &&
        ((!scene && !created.has(item.target)) || typeFor(item.target) === 'idea-card') &&
        (typeof item.title === 'string' || typeof item.body === 'string')) {
      const state = ['open','in-progress','done'].includes(item.state) ? item.state : undefined;
      action = { kind: 'revise', target: item.target, title: stringValue(item.title, 120) ?? '',
        body: stringValue(item.body, 5000) ?? '', ...(state ? { state } : {}), reason };
    } else if (item.kind === 'layout' && ['grid','columns'].includes(item.layout)) {
      const targets = item.targets !== undefined ? targetList(item.targets)
        : scene?.shapes.filter(shape => shape.type === 'idea-card' && shape.editable).map(shape => shape.id).slice(0, MAX_ACTION_TARGETS);
      if (item.targets !== undefined && !targets) continue;
      if (targets?.some(id => typeFor(id) !== undefined && typeFor(id) !== 'idea-card')) continue;
      action = { kind: 'layout', layout: item.layout, ...(targets ? { targets } : {}), reason };
    } else if (context instanceof Set) {
      // Legacy callers know card IDs only. Advanced edits require a full scene.
      continue;
    } else if (item.kind === 'create' && CREATABLE_CANVAS_TYPES.includes(item.shape?.type) &&
        scalar(item.shape.x, -1_000_000, 1_000_000) && scalar(item.shape.y, -1_000_000, 1_000_000)) {
      const props = normalizeEditableProps(item.shape.type, item.shape.props ?? {}, true);
      if (props) action = { kind: 'create', ...(item.ref ? { ref: item.ref } : {}),
        shape: { type: item.shape.type, x: item.shape.x, y: item.shape.y, props }, reason };
    } else if (item.kind === 'update' && known(item.target) && item.patch && typeof item.patch === 'object' && !Array.isArray(item.patch)) {
      if (Object.keys(item.patch).some(key => !['x','y','rotation','opacity','props'].includes(key))) continue;
      const patch: Extract<CanvasAction, { kind: 'update' }>['patch'] = {};
      let valid = true;
      for (const key of ['x','y','rotation','opacity'] as const) if (key in item.patch) {
        const range = key === 'opacity' ? [0, 1] : key === 'rotation' ? [-Math.PI * 100, Math.PI * 100] : [-1_000_000, 1_000_000];
        if (!scalar(item.patch[key], range[0], range[1])) valid = false;
        else patch[key] = item.patch[key];
      }
      if ('props' in item.patch) {
        const type = typeFor(item.target);
        // Persisted proposals are validated against the real shape at apply time.
        const props = type ? normalizeEditableProps(type, item.patch.props) : item.patch.props;
        if (!props || typeof props !== 'object' || Array.isArray(props) || JSON.stringify(props).length > 20_000) valid = false;
        else patch.props = props;
      }
      if (valid && Object.keys(patch).length) action = { kind: 'update', target: item.target, patch, reason };
    } else if (item.kind === 'resize' && known(item.target) && scalar(item.width, 16, 10_000) && scalar(item.height, 16, 10_000)) {
      action = { kind: 'resize', target: item.target, width: item.width, height: item.height, reason };
    } else if (['move','delete','duplicate','group','ungroup','reorder','align','distribute'].includes(item.kind)) {
      const targets = targetList(item.targets, ['group','align'].includes(item.kind) ? 2 : item.kind === 'distribute' ? 3 : 1);
      if (!targets) continue;
      if (item.kind === 'move' || item.kind === 'duplicate') {
        if (!scalar(item.dx, -100_000, 100_000) || !scalar(item.dy, -100_000, 100_000)) continue;
        action = { kind: item.kind, targets, dx: item.dx, dy: item.dy, reason };
      } else if (item.kind === 'reorder') {
        if (['front','back','forward','backward'].includes(item.position)) action = { kind: 'reorder', targets, position: item.position, reason };
      } else if (item.kind === 'align') {
        if (['left','right','top','bottom','center-horizontal','center-vertical'].includes(item.alignment)) action = { kind: 'align', targets, alignment: item.alignment, reason };
      } else if (item.kind === 'distribute') {
        if (['horizontal','vertical'].includes(item.axis)) action = { kind: 'distribute', targets, axis: item.axis, reason };
      } else if (item.kind === 'ungroup') {
        if (targets.every(id => (!scene && !created.has(id)) || typeFor(id) === 'group')) action = { kind: 'ungroup', targets, reason };
      } else action = { kind: item.kind, targets, reason };
    }
    if (!action) continue;
    if (scene) {
      const targets = canvasActionTargets(action).filter(id => !isCanvasActionReference(id));
      if (targets.some(id => !shapeFor(id)?.editable || !shapeFor(id)?.version)) continue;
      action.expected = scopedVersions(scene, targets);
      action.pageId = scene.pageId;
    } else {
      const expected = storedVersions(item.expected);
      if (expected) action.expected = expected;
      if (typeof item.pageId === 'string' && /^page:[a-zA-Z0-9_:-]{1,100}$/.test(item.pageId)) action.pageId = item.pageId;
    }
    out.push(action);
    if (action.kind === 'create' && action.ref) created.set(`@${action.ref}`, action.shape.type);
    if (out.length >= MAX_CANVAS_ACTIONS) break;
  }
  return named && out.length !== actionCount ? [] : out;
}

/** Compact schema instructions deliberately work with text-only router models
 * too; validation happens independently of provider function/schema support. */
export const CANVAS_ACTION_INSTRUCTIONS = `Canvas edit proposals use these exact JSON shapes (reason is a short explanation):
- {kind:"create",ref?:"new_name",shape:{type:"idea-card|geo|text|note|frame|document",x:number,y:number,props:{...}},reason}
- {kind:"update",target:"shape:id",patch:{x?:number,y?:number,rotation?:radians,opacity?:0..1,props?:{...}},reason}
- {kind:"move",targets:["shape:id"],dx:number,dy:number,reason}
- {kind:"resize",target:"shape:id",width:number,height:number,reason}
- {kind:"delete",targets:["shape:id"],reason}
- {kind:"duplicate",targets:["shape:id"],dx:number,dy:number,reason}
- {kind:"group"|"ungroup",targets:["shape:id"],reason}
- {kind:"reorder",targets:["shape:id"],position:"front|back|forward|backward",reason}
- {kind:"align",targets:["shape:id",...],alignment:"left|right|top|bottom|center-horizontal|center-vertical",reason}
- {kind:"distribute",targets:["shape:id",...],axis:"horizontal|vertical",reason}
- {kind:"connect",from:"shape:id",to:"shape:id",label?:"arrow text",reason}
- {kind:"revise",target:"idea-card-id",title:"...",body:"...",state?:"open|in-progress|done",reason}
- {kind:"layout",layout:"grid|columns",targets?:["shape:id"|"@new_name",...],reason} (arranges idea cards only; omitted targets means existing idea cards).
Use exact existing IDs, or @new_name to target an earlier create with ref:"new_name" in this same proposal. References are unique, 1..40 letters/digits/_/-, start with a letter, and may never point forward or to another proposal. Use them to create a complete diagram, then connect, edit, align or group its new shapes in one reviewed batch. For example: create with ref:"start", create with ref:"finish", then connect from:"@start",to:"@finish". Put connected diagram content in these actions; do not also duplicate it in the separate cards array. Never supply persistent shape IDs for creates. A linked batch is applied together; keep it within 12 actions. No existing target may have editable:false. Coordinates x/y are parent-local; bounds are page coordinates; moves use page deltas. Width/height 16..10000. Rotation is radians. Use update to rotate, change text or change styles.
Allowed editable props: idea-card: w,h,title,body,kind,state,accent (#RRGGBB). document: w,h,title,content,fit(contain|cover),opacity(0..100),pdfPage. Native geo: w,h,text,color,labelColor,fill,dash,size,font,align,verticalAlign,geo. Native text: w,text,color,size,font,align,autoSize. Native note: text,color,labelColor,size,font,align,verticalAlign. frame: w,h,name. arrow: text,color,labelColor,fill,dash,size,font,arrowheadStart,arrowheadEnd,bend. Native draw/line/highlight: color,dash,size (draw also fill). image/video/embed/bookmark: w,h (image also flipX,flipY). Other editable technical nodes: w,h,title only; their calculated inputs/outputs are reference data and must never be fabricated or overwritten.
Native colors: black,grey,light-violet,violet,blue,light-blue,yellow,orange,green,light-green,light-red,red,white. Fill:none|semi|solid|pattern; dash:draw|solid|dashed|dotted; size:s|m|l|xl; font:draw|sans|serif|mono; align:start|middle|end; verticalAlign:start|middle|end. Geo types:rectangle,ellipse,triangle,diamond,pentagon,hexagon,octagon,star,oval,arrow-right,arrow-left,arrow-up,arrow-down.
Create a web/media reference as document with props.url using an exact supplied/public source URL; omit props.kind so the app derives a safe embed/link/video/audio/image/pdf type. Never invent a media URL or asset ID. Create a plain note as document with props.kind:"note", title and content.
No arbitrary code, raw HTML, tools, assetId/fileId, output, authentication fields, locks, parentId or order data may be supplied. Do not add expected/pageId fields; OMS attaches stale-edit guards. For group/align select at least2 targets; distribute at least3. Max40 targets per action and max12 actions. Prefer one cohesive set of changes for the user's actual request, avoid filler.`;
