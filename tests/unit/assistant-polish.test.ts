import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { screenWorkflows, SUGGEST_WORKFLOW_TOOL } from '../../src/lib/assistant/workflows';
import { summarizeScreenContext } from '../../src/lib/assistant/context-summary';
import { runScreenAssistant, screenAssistantRequest, AssistantToolsUnsupported } from '../../src/lib/server/ai/screen-assistant';
import { mergeCatalogMetadata } from '../../src/lib/materials/catalog-metadata';

const input = (workflows: unknown[] = [{ id: 'intake', label: 'Drawing intake' }]) => screenAssistantRequest.parse({
  question: 'Help me review the drawing', consent: true, language: 'en',
  screen: { path: '/orders/one/edit', title: 'Order one', data: {}, workflows }
});
const call = (workflow: string, extra = {}) => ({ id: 'offer-one', type: 'function' as const,
  function: { name: SUGGEST_WORKFLOW_TOOL, arguments: JSON.stringify({ workflow, ...extra }) } });

describe('assistant workflow suggestions', () => {
  it('offers only real panels on the current route and removes duplicate or missing labels', () => {
    const offered = [{ id: 'intake', label: 'Drawing intake' }, { id: 'intake', label: 'Duplicate' },
      { id: 'prepare', label: 'Prepare draft' }, { id: 'canvas', label: 'Canvas tools' }, { id: 'readiness', label: ' ' }];
    assert.deepEqual(screenWorkflows('/orders/one/edit', offered).map(item => item.id), ['intake', 'canvas']);
    assert.deepEqual(screenWorkflows('/orders/new', offered).map(item => item.id), ['prepare']);
    assert.deepEqual(screenWorkflows('/inventory', offered), []);
    assert.deepEqual(screenWorkflows('/toolkit/canvas/', offered).map(item => item.id), ['canvas']);
  });

  it('rejects arbitrary actions, links and overlong labels at the request boundary', () => {
    for (const workflows of [
      [{ id: 'save-order', label: 'Save' }], [{ id: 'intake', label: 'x'.repeat(101) }],
      [{ id: 'intake', label: 'Review', url: 'https://external.invalid/' }]
    ]) assert.throws(() => input(workflows));
  });

  it('returns an explicit user-click offer without invoking any business executor', async () => {
    let executions = 0, rounds = 0;
    let evidence: any;
    const result = await runScreenAssistant(input(), { tools: [], locale: 'en',
      execute: async () => { executions++; return {}; },
      chat: async (messages, definitions) => {
        assert.equal((definitions[0] as any).function.name, SUGGEST_WORKFLOW_TOOL);
        if (++rounds === 1) return { tool_calls: [call('intake')] };
        evidence = JSON.parse(messages.find(message => message.role === 'tool')!.content as string);
        return { content: 'Open drawing intake to choose the file and review it.' };
      }
    });
    assert.equal(executions, 0);
    assert.deepEqual(result.suggestedWorkflows, ['intake']);
    assert.deepEqual(result.toolsUsed, []);
    assert.deepEqual(evidence, { offered: 'intake', requiresUserClick: true, workflowExecuted: false });
  });

  it('does not offer a hidden panel or accept execution fields in a suggestion', async () => {
    for (const requested of [call('readiness'), call('intake', { approved: true })]) {
      let rounds = 0, executions = 0;
      const result = await runScreenAssistant(input(), { tools: [], locale: 'en',
        execute: async () => { executions++; return {}; },
        chat: async messages => {
          if (++rounds === 1) return { tool_calls: [requested] };
          assert.ok(JSON.parse(messages.find(message => message.role === 'tool')!.content as string).error);
          return { content: 'Use the tools currently available on this screen.' };
        }
      });
      assert.equal(executions, 0);
      assert.deepEqual(result.suggestedWorkflows, []);
    }
  });

  it('falls back to guidance without offering a workflow that was never called', async () => {
    let rounds = 0;
    const result = await runScreenAssistant(input(), { tools: [], locale: 'en',
      execute: async () => { throw new Error('Unexpected execution'); },
      chat: async () => { if (++rounds === 1) throw new AssistantToolsUnsupported(); return { content: 'Choose drawing intake when ready.' }; }
    });
    assert.equal(result.toolsUnavailable, true);
    assert.deepEqual(result.suggestedWorkflows, []);
  });
});

describe('human screen context summary', () => {
  it('summarizes current material edits and sampled counts without dumping metadata or credentials', () => {
    const result = summarizeScreenContext({
      editor: { unsavedChanges: true, fields: { nameEn: 'Mean Well HDR-60-24' },
        selectedMaterial: { name: 'Older saved name', metadata: { token: 'secret' } } },
      visibleMaterials: { rows: [{}, {}, {}], totalVisible: 42, truncated: true },
      filters: { search: 'Mean Well' }, credentials: 'secret', notes: 'private note',
      unavailable: { trend: false, catalog: true }
    });
    assert.equal(result.unsaved, true);
    assert.equal(result.unavailable, true);
    assert.deepEqual(result.rows, [
      { key: 'selection', value: 'Mean Well HDR-60-24' }, { key: 'search', value: 'Mean Well' },
      { key: 'materials', value: '3 / 42' }
    ]);
    assert.doesNotMatch(JSON.stringify(result), /secret|private|Older saved/);
  });

  it('preserves zero counts and identifies the current staged profile without marking untouched state dirty', () => {
    const result = summarizeScreenContext({ visibleOrders: [], fileCount: 0,
      nativeProfileDraft: { profileIndex: 1, appliedToOrder: false }, profileEditorUnsaved: false });
    assert.equal(result.unsaved, false);
    assert.deepEqual(result.rows, [{ key: 'orders', value: 0 }, { key: 'editingProfile', value: 2 }, { key: 'files', value: 0 }]);
    assert.equal(summarizeScreenContext({ profileEditorUnsaved: true }).unsaved, true);
  });
});

describe('expanded numeric specification metadata', () => {
  it('clears superseded ranges and dimensions while preserving untouched source metadata', () => {
    const source = { colorTemp: '2700–6000 K', color_temperature_range_k: [2700, 6000],
      width: '10 mm', width_mm: 10, height: '2 mm', height_mm: 2, source_url: 'https://www.lemona.lv/product.html' };
    const next = mergeCatalogMetadata(source, { colorTemp: '4000 K', width: '', height: '2 mm' });
    assert.equal(next.color_temperature_range_k, undefined);
    assert.equal(next.width_mm, undefined);
    assert.equal(next.height_mm, 2);
    assert.equal(next.source_url, source.source_url);
    assert.deepEqual(source.color_temperature_range_k, [2700, 6000]);
  });
});
