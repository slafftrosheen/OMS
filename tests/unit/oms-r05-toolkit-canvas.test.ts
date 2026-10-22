import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  isIdeaKind, normalizeCards, normalizeProposals, extractBoardCards,
  extractBoardLinks, normalizeLinks
} from '../../src/lib/components/canvas/toolkit-context';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ideaDefaults } from '../../src/lib/components/canvas/idea-model';
import { load as redirectLegacyToolkit } from '../../src/routes/ai-lab/+layout.server';

const require = createRequire(import.meta.url);
const ts: typeof import('typescript') = require(process.cwd() + '/node_modules/typescript');
const read = (p: string) => readFileSync(p, 'utf8');
const functionBody = (source: string, name: string) => {
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? source;
  const parsed = ts.createSourceFile('canvas.ts', script, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration || !ts.isFunctionDeclaration(declaration) || !declaration.body) throw new Error(`Missing function ${name}`);
  return declaration.body.getText(parsed);
};

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
    // Only the first eight untrusted entries are inspected; invalid entries do not expand that budget.
    expect(proposals).toHaveLength(7);
    expect(proposals.map(card => card.title)).toEqual(['Make a modular sample', 'Choose supplier', 'Step 0', 'Step 1', 'Step 2', 'Step 3', 'Step 4']);
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
  it('redirects each legacy entry point with its deployment prefix and query intact', async () => {
    for (const path of ['/ai-lab', '/ai-lab/canvas?board=example', '/ai-lab/chat?session=example', '/oms/ai-lab/chat?session=example#reply']) {
      let result: any;
      try { await redirectLegacyToolkit({ url: new URL(path, 'https://oms.example') } as any); }
      catch (error) { result = error; }
      expect(result?.status).toBe(308);
      expect(result?.location).toBe(path.replace('/ai-lab', '/toolkit'));
    }
  });

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
    expect(canvas).toContain('messages.slice(-60)');
    expect(canvas).toContain('actionProposals.slice(0, 12)');
    expect(canvas).toContain('documentRevision !== rev');
    expect(canvas).toContain('{#key boardId}');
    expect(canvas).toContain("tr('errors.beforeSwitch')");
  });

  it('never modifies the board before a user approves a proposed card', () => {
    const canvas = read('src/routes/toolkit/canvas/+page.svelte');
    const assistant = functionBody(canvas, 'brainstorm');
    expect(assistant).not.toContain('createShape(');
    expect(assistant).not.toContain('updateShape(');
    expect(functionBody(canvas, 'applySuggestion')).toContain('addCard(');
    expect(assistant).not.toContain('addCard(');
    expect(canvas).toContain('function applySuggestion');
    expect(canvas).toContain('function applyAll');
    expect(canvas).toContain("$t('toolkit.canvas.intro')");
  });

  it('passes a bounded board context, not raw internal editor records, to the provider', () => {
    const api = read('src/routes/api/toolkit/brainstorm/+server.ts');
    expect(api).toContain('normalizeCards(body.cards)');
    expect(api).toContain('normalizeLinks(body.links');
    expect(api).toContain('aiRateLimit(rateLimitIdentifier(event))');
    expect(api).toContain('parseToolkitModelResponse(');
    expect(read('src/lib/server/toolkit/ai-response.ts')).toContain('normalizeProposals(parsed.cards)');
    expect(api).toContain('requireToolkitManager(locals.user)');
    expect(api).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps the existing order form shapes and engineering tools available', () => {
    const canvasApp = read('src/lib/components/canvas/CanvasApp.tsx');
    expect(canvasApp).toContain('OrderDetailsShapeUtil');
    expect(canvasApp).toContain('Profile7stShapeUtil');
    expect(canvasApp).toContain('LumiGridShapeUtil');
    const canvas = read('src/routes/toolkit/canvas/+page.svelte');
    const toolbar = read('src/lib/components/canvas/CanvasToolbar.svelte');
    expect(toolbar).toContain("$t('toolkit.canvas.technical')");
    expect(toolbar).toContain("id:'arrow'");
    expect(canvas).toContain('editor.setCurrentTool(tool)');
  });
});

describe('Canvas self-hosted tldraw assets', () => {
  it('loads every font, icon, embed icon and translation from existing same-origin files', () => {
    const app = read('src/lib/components/canvas/CanvasApp.tsx');
    expect(app).toContain('assetUrls={canvasAssetUrls}');
    expect(existsSync('src/lib/components/canvas/tldraw-asset-urls.json')).toBe(true);
    const assets = JSON.parse(read('src/lib/components/canvas/tldraw-asset-urls.json'));
    // tldraw initializes timers when loaded; isolate that import so the unit runner can exit.
    const defaultUiAssetUrls = JSON.parse(execFileSync(process.execPath, ['-e',
      "const defaults = require('./node_modules/tldraw/dist-cjs/lib/ui/assetUrls.js').defaultUiAssetUrls; process.stdout.write(JSON.stringify(defaults)); process.exit(0)"
    ], { encoding: 'utf8' }));
    expect(require(process.cwd() + '/node_modules/tldraw/package.json').version).toBe('2.4.6');
    for (const category of ['fonts', 'icons', 'embedIcons', 'translations']) {
      // Every installed default must be overridden, otherwise tldraw falls back to its CDN.
      for (const name of Object.keys(defaultUiAssetUrls[category])) {
        expect(typeof assets[category][name]).toBe('string');
      }
      expect(Object.keys(assets[category]).length).toBeGreaterThan(0);
      for (const url of Object.values(assets[category]) as string[]) {
        expect(url.startsWith('/tldraw/2.4.6/')).toBe(true);
        expect(existsSync('static' + url.split('#')[0])).toBe(true);
      }
    }
    expect(JSON.parse(read('static' + assets.translations.en))).toEqual({});
    expect(typeof JSON.parse(read('static' + assets.translations.ru))['action.undo']).toBe('string');
  });
});
