/** Serializable context and proposal bounds shared by browser and server. */
export type IdeaKind = 'idea' | 'research' | 'decision' | 'task' | 'note';
export interface BoardCard {
  id: string; kind: IdeaKind; title: string; body: string; state?: string;
}
export interface ProposedCard {
  kind: IdeaKind; title: string; body: string;
}
const KINDS = new Set(['idea', 'research', 'decision', 'task', 'note']);
export function isIdeaKind(value: unknown): value is IdeaKind {
  return typeof value === 'string' && KINDS.has(value);
}
export function normalizeCards(input: unknown, cap = 50): BoardCard[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, cap).filter(value => value && typeof value === 'object'
      && isIdeaKind(value.kind)).map(value => ({
    id: String(value.id ?? '').slice(0, 100),
    kind: value.kind as IdeaKind,
    title: String(value.title ?? '').slice(0, 120),
    body: String(value.body ?? '').slice(0, 1800),
    state: String(value.state ?? 'open').slice(0, 20)
  }));
}
export function normalizeProposals(input: unknown): ProposedCard[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).filter(value => value && typeof value === 'object'
      && isIdeaKind(value.kind) && typeof value.title === 'string')
    .map(value => ({
      kind: value.kind as IdeaKind,
      title: value.title.trim().slice(0, 100),
      body: typeof value.body === 'string' ? value.body.trim().slice(0, 1200) : ''
    })).filter(v => v.title);
}
export function extractBoardCards(shapes: Array<{ id: string; type: string; props: any }>, cap = 50): BoardCard[] {
  return normalizeCards(shapes.filter(s => s.type === 'idea-card').slice(0, cap).map(s => ({
    id: s.id, kind: s.props?.kind, title: s.props?.title,
    body: s.props?.body, state: s.props?.state
  })), cap);
}

export type BoardLink = { from: string; to: string };
/** Resolve native tldraw arrow-to-shape bindings without exposing raw records. */
export function extractBoardLinks(
  shapes: Array<{ id: string; type: string; props: any }>,
  getBindings: (arrowId: string) => Array<{ toId: string; props?: { terminal?: string } }>
): BoardLink[] {
  const ideaIds = new Set(shapes.filter(s => s.type === 'idea-card').map(s => s.id));
  const links: BoardLink[] = [];
  for (const arrow of shapes.filter(s => s.type === 'arrow').slice(0, 80)) {
    let start = '', end = '';
    try {
      const bindings = getBindings(arrow.id) || [];
      start = bindings.find(b => b.props?.terminal === 'start')?.toId || '';
      end = bindings.find(b => b.props?.terminal === 'end')?.toId || '';
    } catch { /* unsupported bindings API; older arrows may store endpoints */ }
    start ||= String(arrow.props?.start?.boundShapeId ?? '');
    end ||= String(arrow.props?.end?.boundShapeId ?? '');
    if (start !== end && ideaIds.has(start) && ideaIds.has(end)) {
      if (!links.some(link => link.from === start && link.to === end)) {
        links.push({ from: start, to: end });
      }
    }
    if (links.length >= 40) break;
  }
  return links;
}
export function normalizeLinks(input: unknown, ids: Set<string>): BoardLink[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 60).filter(v => v && typeof v.from === 'string' &&
    typeof v.to === 'string' && v.from !== v.to && ids.has(v.from) && ids.has(v.to))
    .slice(0, 40).map(v => ({ from: v.from, to: v.to }));
}
