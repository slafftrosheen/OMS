/** Toolkit's bounded, explicit skill system. No autonomous writes. */
import type { BoardCard, BoardLink } from './toolkit-context';

export const TOOLKIT_SKILLS = [
  { id: 'explore', label: 'Expand ideas', purpose: 'Develop alternatives and unconventional options', mode: 'creative' },
  { id: 'critique', label: 'Challenge', purpose: 'Test assumptions, feasibility, risks and missing evidence', mode: 'critical' },
  { id: 'plan', label: 'Plan project', purpose: 'Sequence tasks, dependencies, milestones and first prototype', mode: 'planning' },
  { id: 'compare', label: 'Compare', purpose: 'Compare options with transparent decision criteria', mode: 'decision' },
  { id: 'connect', label: 'Find relationships', purpose: 'Spot missing connections and propose arrows between cards', mode: 'mapping' },
  { id: 'organize', label: 'Organize board', purpose: 'Improve grouping and visual structure of the current project', mode: 'visual' },
  { id: 'research', label: 'Research web', purpose: 'Retrieve current references via configured SearXNG', mode: 'research' },
  { id: 'summarize', label: 'Summarize', purpose: 'Write a concise brief and next-step overview from the canvas', mode: 'summary' }
] as const;
export type ToolkitSkill = typeof TOOLKIT_SKILLS[number]['id'];
export function normalizeToolkitSkill(value: unknown): ToolkitSkill {
  return TOOLKIT_SKILLS.some(skill => skill.id === value) ? value as ToolkitSkill : 'explore';
}
export type CanvasAction =
  | { kind: 'connect'; from: string; to: string; reason: string }
  | { kind: 'revise'; target: string; title: string; body: string; state?: 'open' | 'in-progress' | 'done'; reason: string }
  | { kind: 'layout'; layout: 'grid' | 'columns'; reason: string };

export function normalizeCanvasActions(input: unknown, cardIds?: Set<string>): CanvasAction[] {
  if (!Array.isArray(input)) return [];
  const out: CanvasAction[] = [];
  for (const item of input.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const reason = typeof item.reason === 'string' ? item.reason.slice(0, 280) : '';
    if (item.kind === 'connect' && typeof item.from === 'string' &&
        typeof item.to === 'string' && item.from !== item.to &&
        (!cardIds || (cardIds.has(item.from) && cardIds.has(item.to)))) {
      out.push({ kind: 'connect', from: item.from.slice(0, 100),
        to: item.to.slice(0, 100), reason });
    } else if (item.kind === 'revise' && typeof item.target === 'string' &&
        (!cardIds || cardIds.has(item.target)) &&
        (typeof item.title === 'string' || typeof item.body === 'string')) {
      const state = ['open','in-progress','done'].includes(item.state) ? item.state : undefined;
      out.push({ kind: 'revise', target: item.target.slice(0, 100),
        title: String(item.title ?? '').slice(0, 120),
        body: String(item.body ?? '').slice(0, 1800),
        ...(state ? { state } : {}), reason });
    } else if (item.kind === 'layout' && ['grid','columns'].includes(item.layout)) {
      out.push({ kind: 'layout', layout: item.layout, reason });
    }
    if (out.length === 4) break;
  }
  return out;
}
export function boardInsights(cards: BoardCard[], links: BoardLink[]) {
  const graph = new Map(cards.map(card => [card.id, 0]));
  for (const edge of links) {
    graph.set(edge.from, (graph.get(edge.from) ?? 0) + 1);
    graph.set(edge.to, (graph.get(edge.to) ?? 0) + 1);
  }
  const counts: Record<string, number> = {};
  for (const card of cards) counts[card.kind] = (counts[card.kind] ?? 0) + 1;
  const disconnected = cards.filter(c => !graph.get(c.id)).map(c => ({ id: c.id, title: c.title })).slice(0, 12);
  const unfinished = cards.filter(c => c.kind === 'task' && c.state !== 'done').length;
  const empty = cards.filter(c => !c.body.trim()).map(c => c.title).slice(0, 12);
  return { totalCards: cards.length, byKind: counts, connections: links.length,
    disconnected, unfinishedTasks: unfinished, cardsMissingDetails: empty,
    hasDecision: (counts.decision ?? 0) > 0 };
}
