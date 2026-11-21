import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { aiRoutingFromRow } from '../../src/lib/server/ai/active-provider';
import { maskSecret, parseAiProviderChange } from '../../src/lib/server/ai/provider-settings';
import { openRouterChat, type OpenRouterClientConfig, type OpenRouterMessage } from '../../src/lib/server/ai/openrouter';
import { _createAiProviderSettingsHandler } from '../../src/routes/api/settings/ai-provider/+server';
import { toolkitModelChoices, allowOpenRouterWebSearch } from '../../src/lib/server/toolkit/ai-models';

const openAI: OpenRouterClientConfig = {
  provider: 'openai', apiKey: 'sk-test-oms', baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-text', visionModel: 'gpt-vision', timeoutMs: 10_000,
};
const tools = [{ type: 'function', function: {
  name: 'inspect_canvas', description: 'Read a selected shape',
  parameters: { type: 'object', properties: { id: { type: 'string' } } },
} }];
const toolCalls = [{ id: 'call_oms', type: 'function' as const,
  function: { name: 'inspect_canvas', arguments: '{"id":"shape:1"}' } }];

describe('OMS provider selection and OpenAI Canvas transport', () => {
  it('validates the persisted provider, credentials and the published canvas model choice', () => {
    const result = parseAiProviderChange({ provider: 'openai', textModel: ' gpt-text ', visionModel: 'gpt-vision', apiKey: ' sk-proj-test ' });
    assert.deepEqual(result, { provider: 'openai', textModel: 'gpt-text', visionModel: 'gpt-vision', apiKey: 'sk-proj-test', removeKey: false });
    assert.equal(parseAiProviderChange({ ...result, removeKey: true }), null);
    assert.equal(parseAiProviderChange({ ...result, provider: 'subscription' }), null);
    assert.equal(parseAiProviderChange({ ...result, visionModel: 'openrouter/unapproved' }), null);
    assert.equal(parseAiProviderChange({ ...result, apiKey: 'session-token' }), null);
    const publicKey = maskSecret(result?.apiKey);
    assert.ok(publicKey.configured && publicKey.masked.endsWith('test'));
    assert.ok(!publicKey.masked.includes('sk-proj'));
    const routing = aiRoutingFromRow({ active_provider: 'openai', openai_text_model: 'gpt-text', openai_vision_model: 'gpt-vision' });
    assert.deepEqual(toolkitModelChoices(routing.openAI.textModel, 'openrouter/free', routing.provider),
      [{ id: 'gpt-text', label: 'gpt-text', isDefault: true }]);
    assert.equal(allowOpenRouterWebSearch(routing.provider), false);
  });

  it('allows only R&D to save routing and keeps credential material out of responses and audit details', async () => {
    let rpc: { name: string; args: Record<string, unknown> } | undefined;
    let audit: unknown;
    const database = () => ({
      rpc: async (name: string, args: Record<string, unknown>) => { rpc = { name, args }; return { error: null }; },
      from: () => ({ insert: async (row: unknown) => { audit = row; return { error: null }; } }),
    });
    const handle = _createAiProviderSettingsHandler(database as never);
    const url = new URL('https://oms.example/api/settings/ai-provider');
    const body = { provider: 'openai', textModel: 'gpt-text', visionModel: 'gpt-vision', apiKey: 'sk-proj-test-secret' };
    const send = (role?: string, origin = url.origin) => handle({
      url, locals: { user: role ? { id: 'staff-1', role } : null },
      request: new Request(url, { method: 'PUT', headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(body) }),
    } as never);
    assert.equal((await send()).status, 401);
    assert.equal((await send('Boss')).status, 403);
    assert.equal((await send('RD', 'https://elsewhere.example')).status, 403);
    assert.equal(rpc, undefined);
    const response = await send('RD');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal((rpc as { name: string } | undefined)?.name, 'set_oms_ai_provider');
    assert.equal((rpc as { args: Record<string, unknown> } | undefined)?.args.p_api_key, body.apiKey);
    assert.ok(!JSON.stringify(audit).includes(body.apiKey));
  });

  it('sends native image and tool inputs, then returns canvas lookup results to OpenAI', async () => {
    const messages: OpenRouterMessage[] = [{ role: 'user', content: [
      { type: 'text', text: 'Inspect this canvas shape' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ] }];
    const requests: any[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sk-test-oms');
      assert.equal(init?.redirect, 'error');
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ status: 'completed', model: 'gpt-vision', output: requests.length === 1
        ? [{ type: 'function_call', call_id: 'call_oms', name: 'inspect_canvas', arguments: '{"id":"shape:1"}' }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The selected shape is a rectangle.' }] }] });
    };
    const first = await openRouterChat({ messages, tools, model: 'openrouter/free' }, openAI, fetcher);
    assert.equal(first.model, 'gpt-vision');
    const answer = (await first.response.json()).choices[0].message;
    assert.deepEqual(answer.tool_calls, toolCalls);
    assert.equal(requests[0].store, false);
    assert.equal(requests[0].input[0].content[1].type, 'input_image');
    assert.equal(requests[0].tools[0].name, 'inspect_canvas');
    const second = await openRouterChat({ messages: [...messages, answer,
      { role: 'tool', tool_call_id: 'call_oms', content: '{"shape":"rectangle"}' }], tools }, openAI, fetcher);
    assert.deepEqual(requests[1].input.slice(-2), [
      { type: 'function_call', call_id: 'call_oms', name: 'inspect_canvas', arguments: '{"id":"shape:1"}' },
      { type: 'function_call_output', call_id: 'call_oms', output: '{"shape":"rectangle"}' },
    ]);
    assert.equal((await second.response.json()).choices[0].message.content, 'The selected shape is a rectangle.');
  });

  it('rejects OpenRouter-only OCR plugins before an OpenAI request leaves OMS', async () => {
    let called = false;
    await assert.rejects(openRouterChat({ messages: [{ role: 'user', content: 'Read this file' }],
      plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }] }, openAI, async () => {
      called = true; return new Response();
    }), /requires OpenRouter/);
    assert.equal(called, false);
  });
});
