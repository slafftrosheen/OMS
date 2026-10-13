/** Deterministic export: no AI, no network and no project mutations. */
import type { BoardCard, BoardLink } from './toolkit-context';

const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '').trim();
export function markdownProjectBrief(
  title: string, cards: BoardCard[], links: BoardLink[],
  sources: Array<{ title: string; url: string }> = []
): string {
  const sorted = [...cards].slice(0, 100);
  const safeTitle = clean(title).slice(0, 120) || 'Project';
  const lines = [`# ${safeTitle}`, '', `Cards: ${sorted.length} | Connections: ${links.length}`, ''];
  for (const kind of ['idea', 'research', 'decision', 'task', 'note']) {
    const subset = sorted.filter(card => card.kind === kind);
    if (!subset.length) continue;
    lines.push(`## ${kind[0].toUpperCase() + kind.slice(1)}`, '');
    for (const card of subset) {
      lines.push(`### ${clean(card.title).slice(0, 120) || 'Untitled'}`, '');
      if (kind === 'task') lines.push(`Status: ${clean(card.state ?? 'open')}`, '');
      lines.push(card.body.slice(0, 1800).trim() || '—', '');
    }
  }
  const byId = new Map(sorted.map(card => [card.id, clean(card.title)]));
  const connections = links.filter(link => byId.has(link.from) && byId.has(link.to));
  if (connections.length) {
    lines.push('## Connections', '');
    for (const link of connections) lines.push(`- ${byId.get(link.from)} → ${byId.get(link.to)}`);
    lines.push('');
  }
  const references = sources.filter(s => /^https?:\/\//i.test(s.url)).slice(0, 8);
  if (references.length) {
    lines.push('## Research links (not independently verified)', '');
    for (const source of references) lines.push(`- ${clean(source.title).slice(0, 120)}: ${source.url}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function briefFileName(title: string): string {
  return (title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 52) || 'canvas') + '-brief.md';
}
