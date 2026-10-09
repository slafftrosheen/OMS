import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isIdeaKind, normalizeCards, normalizeProposals, extractBoardCards,
  extractBoardLinks, normalizeLinks
} from '../../src/lib/components/canvas/toolkit-context';
import { ideaDefaults } from '../../src/lib/components/canvas/idea-model';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Toolkit idea board', () => {
  it('supports five purposeful card types', () => {
    for (const kind of ['idea','research','decision','task','note'] as const) {
      expect(isIdeaKind(kind)).toBe(true);
      expect(ideaDefaults(kind).kind).toBe(kind);
      expect(ideaDefaults(kind).w).toBeGreaterThan(0);
    }
    expect(isIdeaKind('swarm')).toBe(false);
    expect(isIdeaKind('unknown')).toBe(false);
  });

  it('bounds board context, handles missing values and ignores non-cards', () => {
    const shapes = [
      { id: 'a', type: 'idea-card', props: { kind: 'idea', title: 'Problem', body: 'How to build this?' } },
      { id: 'b', type: 'rectangle', props: { text: 'decoration' } },
      { id: 'c', type: 'idea-card', props: { kind: 'task', title: 'Prototype', body: 'Test it.' } }
    ];
    const cards = extractBoardCards(shapes);
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe('Problem');
    expect(cards[1].kind).toBe('task');
    expect(normalizeCards(Array.from({length: 80}, (_, i) => ({ id: String(i), kind: 'note', title: 'a'.repeat(300), body: 'b'.repeat(5000) })))).toHaveLength(50);
    expect(normalizeCards([{ kind: 'evil', title: 'ignore' }])).toEqual([]);
  });

  it('filters untrusted proposed cards to known kinds, lengths and count', () => {
    const proposals = normalizeProposals([
      { kind: 'idea', title: 'Make a modular sample', body: 'Build one section first.' },
      { kind: 'script', title: 'Run commands', body: 'ignored' },
      { kind: 'decision', title: 'Choose supplier', body: 'Compare lead times.' },
      ...Array.from({length: 20}, (_, i) => ({ kind: 'task', title: 'Step ' + i }))
    ]);
    expect(proposals).toHaveLength(8);
    expect(proposals.some(p => p.kind === ('script' as any))).toBe(false);
    expect(proposals.every(p => p.title.length <= 100)).toBe(true);
  });

  it('extracts connected native tldraw arrows without leaking unrelated shapes', () => {
    const shapes: any[] = [
      { id: 'idea-1', type: 'idea-card', props: { kind: 'idea' } },
      { id: 'idea-2', type: 'idea-card', props: { kind: 'task' } },
      { id: 'arrow-1', type: 'arrow', props: {} },
      { id: 'arrow-2', type: 'arrow', props: {} }
    ];
    const arrows = (id: string) => id === 'arrow-1'
      ? [{ toId: 'idea-1', props: { terminal: 'start' } },
         { toId: 'idea-2', props: { terminal: 'end' } }] : [];
    expect(extractBoardLinks(shapes, arrows)).toEqual([{ from: 'idea-1', to: 'idea-2' }]);
    expect(normalizeLinks([{ from: 'idea-1', to: 'idea-2' }, { from: 'idea-1', to: 'stranger' }],
      new Set(['idea-1','idea-2']))).toEqual([{ from: 'idea-1', to: 'idea-2' }]);
  });
});

describe('Toolkit route contracts', () => {
  it('preserves bookmarks while making Toolkit canonical', () => {
    const route = read('src/routes/ai-lab/+layout.server.ts');
    expect(route).toContain("'/toolkit'");
    expect(route).toContain('redirect(308');
    const topNav = read('src/lib/brand/TopNav.svelte');
    expect(topNav).toContain("label: 'Toolkit'");
    expect(topNav).not.toContain("label: 'AI Lab'");
  });

  it('keeps React shapes off the server-rendered Svelte route', () => {
    const page = read('src/routes/toolkit/canvas/+page.svelte');
    expect(page).toContain("from '$lib/components/canvas/idea-model'");
    expect(page).not.toContain("from '$lib/components/canvas/shapes/IdeaShape'");
    expect(read('src/lib/components/canvas/CanvasApp.tsx')).toContain('IdeaShapeUtil');
  });

  it('loads, creates and persists a board, including suggestions', () => {
    const canvas = read('src/routes/toolkit/canvas/+page.svelte');
    expect(canvas).toContain("fetch('/api/ai/canvas'");
    expect(canvas).toContain("method: 'PATCH'");
    expect(canvas).toContain('snapshot: lastSnapshot');
    expect(canvas).toContain('conversation: messages.slice(-24)');
    expect(canvas).toContain('proposals: suggestions.slice(0, 8)');
    expect(canvas).toContain('documentRevision !== revisionAtStart');
    expect(canvas).toContain('{#key boardId}');
    expect(canvas).toContain('Save your changes before switching projects');
  });

  it('never modifies the board before a user approves a proposed card', () => {
    const canvas = read('src/routes/toolkit/canvas/+page.svelte');
    const assistant = canvas.split('async function brainstorm')[1]?.split('function applySuggestion')[0];
    expect(assistant).not.toContain('addCard(');
    expect(canvas).toContain('function applySuggestion');
    expect(canvas).toContain('function applyAll');
    expect(canvas).toContain('Nothing is added without your approval');
  });

  it('passes a bounded board context, not raw internal editor records, to the provider', () => {
    const api = read('src/routes/api/toolkit/brainstorm/+server.ts');
    expect(api).toContain('normalizeCards(body.cards)');
    expect(api).toContain('normalizeLinks(body.links');
    expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(api).toContain('normalizeProposals(parsed.cards)');
    expect(api).toContain("if (!locals.user) throw error(401");
    expect(api).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps the existing order form shapes and engineering tools available', () => {
    const canvasApp = read('src/lib/components/canvas/CanvasApp.tsx');
    expect(canvasApp).toContain('OrderDetailsShapeUtil');
    expect(canvasApp).toContain('Profile7stShapeUtil');
    expect(canvasApp).toContain('LumiGridShapeUtil');
    const canvas = read('src/routes/toolkit/canvas/+page.svelte');
    expect(canvas).toContain('Technical tools');
    expect(canvas).toContain("editor?.setCurrentTool('arrow')");
  });
});
