/** Model-independent normalization of Toolkit proposal replies. The model is untrusted:
 * invalid JSON becomes plain text, never an executable board operation.
 */
import { normalizeProposals } from '$lib/components/canvas/toolkit-context';
import { normalizeCanvasActions } from '$lib/components/canvas/toolkit-skills';
import type { ToolkitScene } from '$lib/components/canvas/toolkit-scene';

function extractObject(text: string): unknown {
  const value = text.trim();
  const fenced = /^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i.exec(value);
  const candidates = [fenced?.[1] ?? value];
  const start = value.indexOf('{'), end = value.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(value.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* malformed/free-form output is intentionally not a proposal */ }
  }
  return null;
}

export function parseToolkitModelResponse(raw: string, cardIds: Set<string> | ToolkitScene, fallback: string) {
  const parsed = extractObject(raw) as Record<string, unknown> | null;
  if (!parsed) return { reply: raw.trim().slice(0, 5000) || fallback, cards: [], actions: [], structured: false };
  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 5000) : fallback,
    cards: normalizeProposals(parsed.cards).slice(0, 5),
    actions: normalizeCanvasActions(parsed.actions, cardIds),
    structured: true
  };
}

export function normalizeToolkitVisualAssets(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 16).filter(v => v && typeof v === 'object' && !Array.isArray(v)).map(v => ({
    id: typeof v.id === 'string' ? v.id.slice(0, 100) : '',
    title: String(v.title ?? '').slice(0, 120),
    kind: String(v.kind ?? '').slice(0, 32),
    // Notes, page extracts, search summaries and computed output are text only.
    context: typeof v.context === 'string' ? v.context.slice(0, 1400) : ''
  }));
}

/** Provider-reported citation metadata, not independent source verification. */
export function normalizeProviderWebSources(annotations: unknown) {
  if (!Array.isArray(annotations)) return [];
  const seen = new Set<string>();
  const sources: Array<{title:string;url:string;snippet:string;provider:'openrouter'}> = [];
  for (const item of annotations.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const citation = item.url_citation && typeof item.url_citation === 'object'
      ? item.url_citation : item;
    const url = typeof citation.url === 'string' ? citation.url : '';
    let address: URL;
    try { address = new URL(url); } catch { continue; }
    if (!['http:', 'https:'].includes(address.protocol) ||
        address.username || address.password || seen.has(address.href)) continue;
    seen.add(address.href);
    sources.push({
      title: typeof citation.title === 'string' ? citation.title.slice(0, 180) : address.hostname,
      url: address.href,
      snippet: typeof citation.content === 'string' ? citation.content.slice(0, 320) : '',
      provider: 'openrouter'
    });
    if (sources.length >= 5) break;
  }
  return sources;
}
