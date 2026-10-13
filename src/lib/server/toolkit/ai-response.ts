/** Model-independent normalization of Toolkit proposal replies. The model is untrusted:
 * invalid JSON becomes plain text, never an executable board operation.
 */
import { normalizeProposals } from '$lib/components/canvas/toolkit-context';
import { normalizeCanvasActions } from '$lib/components/canvas/toolkit-skills';

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

export function parseToolkitModelResponse(raw: string, cardIds: Set<string>, fallback: string) {
  const parsed = extractObject(raw) as Record<string, unknown> | null;
  if (!parsed) return { reply: raw.trim().slice(0, 5000) || fallback, cards: [], actions: [], structured: false };
  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim().slice(0, 5000) : fallback,
    cards: normalizeProposals(parsed.cards).slice(0, 5),
    actions: normalizeCanvasActions(parsed.actions, cardIds).slice(0, 3),
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
