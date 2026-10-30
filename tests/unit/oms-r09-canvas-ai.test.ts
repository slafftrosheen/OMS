import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toolkitModelChoices, resolveToolkitModel } from '../../src/lib/server/toolkit/ai-models';
import { parseToolkitModelResponse, normalizeToolkitVisualAssets, normalizeProviderWebSources } from '../../src/lib/server/toolkit/ai-response';
import { markdownProjectBrief, briefFileName } from '../../src/lib/components/canvas/toolkit-brief';
import { openRouterRequestBody, openRouterTextContent, openRouterCompleteWithMetadata } from '../../src/lib/server/ai/openrouter';

const read = (path: string) => readFileSync(path, 'utf8');

describe('OMS-R09 Toolkit AI workflow', () => {
  const ids = new Set(['shape:1', 'shape:2']);
  it('deduplicates configured models and never accepts an arbitrary browser slug', () => {
    const choices = toolkitModelChoices('openrouter/free',
      'openai/gpt-5.2;anthropic/claude-sonnet-4.5;openai/gpt-5.2;invalid;foo/bar:free');
    expect(choices.map(item => item.id)).toEqual([
      'openrouter/free', 'openai/gpt-5.2', 'anthropic/claude-sonnet-4.5', 'foo/bar:free'
    ]);
    expect(resolveToolkitModel(undefined, choices)).toBe('openrouter/free');
    expect(resolveToolkitModel('foo/bar:free', choices)).toBe('foo/bar:free');
    expect(resolveToolkitModel('unconfigured/surprise', choices)).toBeNull();
    expect(resolveToolkitModel({ id: 'foo/bar:free' }, choices)).toBeNull();
  });

  it('accepts fenced JSON from weaker models and validates proposals with exact IDs', () => {
    const output = parseToolkitModelResponse(`\`\`\`json
{"reply":"A practical approach","cards":[{"kind":"task","title":"Prototype","body":"Test layout"}],
"actions":[{"kind":"connect","from":"shape:1","to":"shape:2","reason":"dependency"},
{"kind":"delete","target":"shape:1"},{"kind":"revise","target":"shape:other","title":"Overwrite"}]}
\`\`\``, ids, 'Fallback');
    expect(output.structured).toBe(true);
    expect(output.reply).toBe('A practical approach');
    expect(output.cards).toEqual([{kind:'task',title:'Prototype',body:'Test layout'}]);
    expect(output.actions).toEqual([{kind:'connect',from:'shape:1',to:'shape:2',reason:'dependency'}]);
  });

  it('treats malformed JSON as narrative only; no unreviewed board operations', () => {
    const output = parseToolkitModelResponse('Useful answer, but not JSON.', ids, 'Fallback');
    expect(output.structured).toBe(false);
    expect(output.reply).toContain('Useful answer');
    expect(output.cards).toEqual([]);
    expect(output.actions).toEqual([]);
  });

  it('bounds document/crawl/calculator evidence before including it in prompts', () => {
    const assets = normalizeToolkitVisualAssets([
      {id:'node:1',title:'Inspection',kind:'document',context:'x'.repeat(20_000)},
      {id:'node:2',title:'Schematic',kind:'image',context:'Pixels not provided'}
    ]);
    expect(assets).toHaveLength(2);
    expect(assets[0].context).toHaveLength(1400);
    expect(assets[1].context).toBe('Pixels not provided');
  });

  it('produces a local board brief with deterministic task status and no API access', () => {
    const cards = [
      {id:'shape:1',kind:'idea' as const,title:'New controller',body:'8 PWM and 8 RMT channels'},
      {id:'shape:2',kind:'task' as const,title:'Bench test',body:'Measure current',state:'in-progress'}
    ];
    const markdown = markdownProjectBrief('LumiGrid prototype', cards,
      [{from:'shape:1',to:'shape:2'}],
      [{title:'Datasheet',url:'https://example.com/datasheet'}]);
    expect(markdown).toContain('# LumiGrid prototype');
    expect(markdown).toContain('Status: in-progress');
    expect(markdown).toContain('New controller → Bench test');
    expect(markdown).toContain('https://example.com/datasheet');
    expect(briefFileName('LumiGrid prototype')).toBe('lumigrid-prototype-brief.md');
  });

  it('uses the current nested OpenRouter beta web-tool schema and caps tool calls', () => {
    const request = openRouterRequestBody({
      model: 'openrouter/free',
      messages: [{ role: 'user', content: 'Find independent specifications' }],
      tools: [{ type: 'openrouter:web_search', parameters: { max_uses: 2, max_total_results: 8 } }],
      maxToolCalls: 2
    });
    expect(request).toHaveProperty('max_tool_calls', 2);
    expect(request.tools?.[0]).toMatchObject({
      type: 'openrouter:web_search',
      parameters: { max_uses: 2, max_total_results: 8 }
    });
  });

  it('retains provider-reported web citations and the actual routed model', async () => {
    expect(openRouterTextContent([{ type: 'text', text: 'Real answer' }])).toBe('Real answer');
    const fetcher = async () => new Response(JSON.stringify({
      model: 'provider/specific-model',
      choices: [{ message: {
        content: [{ type: 'text', text: 'Grounded answer' }],
        annotations: [
          { type: 'url_citation', url_citation: { url: 'https://example.com/spec', title: 'Spec', content: 'Technical details' } },
          { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'Bad' } }
        ]
      } }],
      usage: { server_tool_use: { web_search_requests: 1 } }
    }), { status: 200 });
    const reply = await openRouterCompleteWithMetadata(
      [{ role: 'user', content: 'Find datasheets' }],
      { model: 'openrouter/free' },
      { apiKey: 'test-key', baseUrl: 'https://router.example/api/v1',
        defaultModel: 'openrouter/free', visionModel: 'vision/model', timeoutMs: 10000 },
      fetcher as typeof fetch
    );
    expect(reply.text).toBe('Grounded answer');
    expect(reply.model).toBe('provider/specific-model');
    expect(reply.webSearchRequests).toBe(1);
    expect(normalizeProviderWebSources(reply.annotations)).toEqual([
      { title: 'Spec', url: 'https://example.com/spec', snippet: 'Technical details', provider: 'openrouter' }
    ]);
  });

  it('keeps web-provider pricing and model selection server-controlled', () => {
    const endpoint = read('src/routes/api/toolkit/brainstorm/+server.ts');
    expect(endpoint).toContain('allowOpenRouterWebSearch()');
    expect(endpoint).toContain('resolveToolkitModel(body.model');
    expect(endpoint).toContain("type: 'openrouter:web_search'");
    expect(endpoint).toContain("skill === 'research' && webMode === 'searxng'");
    expect(endpoint).toContain('normalizeToolkitVisualAssets(body.visualAssets)');
    const ui = read('src/routes/toolkit/canvas/+page.svelte');
    expect(ui).toContain('pinResearchSource(source)');
    expect(ui).toContain('captureAnswer()');
    expect(ui).toContain('exportBrief()');
    expect(ui).toContain('skill: requestedSkill, language: $locale');
    expect(ui).toContain('isCurrent() && currentBoard(activeBoardId, token)');
  });
});
