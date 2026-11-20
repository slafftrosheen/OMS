import { describe, expect, it } from 'vitest';
import { openRouterChat, openRouterRequestBody, openRouterMessages, extractAssistantMessage, parseToolArguments, openRouterError, type OpenRouterClientConfig } from '../../src/lib/server/ai/openrouter';

const config: OpenRouterClientConfig = {
  apiKey: 'test-key-for-unit-only',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openrouter/free',
  visionModel: 'unused',
  timeoutMs: 5000
};

describe('OpenRouter chat client', () => {
  it('uses saved model selections for default callers while preserving explicit task models', () => {
    const selected = { ...config, defaultModel: 'chosen/text', visionModel: 'chosen/vision',
      modelDefaults: { textModel: 'previous/text', visionModel: 'previous/vision' } };
    expect(openRouterRequestBody({ messages: [{ role: 'user', content: 'Hello' }], model: 'previous/text' }, selected).model).toBe('chosen/text');
    expect(openRouterRequestBody({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }] }], model: 'previous/vision' }, selected).model).toBe('chosen/vision');
    expect(openRouterRequestBody({ messages: [{ role: 'user', content: 'Hello' }], model: 'specialist/explicit' }, selected).model).toBe('specialist/explicit');
  });
  it('posts OpenAI-compatible messages and native function tools to the configured OpenRouter URL', async () => {
    let requestedUrl = '';
    let requested: any;
    let headers: HeadersInit | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requested = JSON.parse(String(init?.body));
      headers = init?.headers;
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 });
    };
    const result = await openRouterChat({
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'data_low_stock', parameters: { type: 'object' } } }]
    }, config, fakeFetch);
    expect(requestedUrl).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(requested.model).toBe('openrouter/free');
    expect(requested.tools[0].function.name).toBe('data_low_stock');
    expect(requested.tool_choice).toBe('auto');
    expect((headers as Record<string, string>).Authorization).toBe('Bearer test-key-for-unit-only');
    expect(result.model).toBe('openrouter/free');
  });

  it('converts legacy base64 image inputs to OpenAI image_url parts', () => {
    expect(openRouterMessages([{ role: 'user', content: 'what is this?', images: ['abc123'] }])).toEqual([{
      role: 'user', content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } }
      ]
    }]);
  });

  it('normalizes OpenRouter assistant tool calls and parses their argument JSON', () => {
    const msg = extractAssistantMessage({ choices: [{ message: {
      role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'data_low_stock', arguments: '{"limit":2}' } }]
    } }] });
    expect(msg.tool_calls?.[0].id).toBe('call-1');
    expect(parseToolArguments(msg.tool_calls?.[0].function.arguments)).toEqual({ limit: 2 });
  });

  it('fails closed without a key and returns bounded provider errors', async () => {
    let missingKeyFailed = false;
    try { await openRouterChat({ messages: [{ role: 'user', content: 'test' }] }, { ...config, apiKey: '' }, fetch); }
    catch (err) { missingKeyFailed = err instanceof Error && err.message.includes('OPENROUTER_API_KEY'); }
    expect(missingKeyFailed).toBe(true);
    expect(openRouterError(new Response(null, { status: 429 }), 'rate limit\ntry later').message).toBe('OpenRouter returned 429: rate limit try later');
  });
});


const direct: OpenRouterClientConfig = {
  ...config, provider: 'openai', defaultModel: 'gpt-6-luna', visionModel: 'gpt-6.1-terra'
};
describe('OpenAI API transport', () => {
  it('routes PDFs, images, structured schemas and paired tool calls to Responses', async () => {
    const fake: typeof fetch = async (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key-for-unit-only');
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gpt-6.1-terra');
      expect(body.store).toBe(false);
      expect(body.input[0].content.map((p: any) => p.type)).toEqual(['input_file', 'input_image']);
      expect(body.input[1]).toEqual({ type: 'function_call', call_id: 'call_1', name: 'preview_order', arguments: '{}' });
      expect(body.input[2]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: 'ready' });
      expect(body.tools[0].name).toBe('preview_order');
      expect(body.text.format.type).toBe('json_schema');
      expect(body.plugins).toBeUndefined();
      return Response.json({ status: 'completed', output: [
        { type: 'function_call', call_id: 'call_2', name: 'preview_order', arguments: '{"width":100}' }
      ] });
    };
    const { response } = await openRouterChat({
      model: 'openrouter/free', messages: [
        { role: 'user', content: [
          { type: 'file', file: { filename: 'drawing.pdf', file_data: 'data:application/pdf;base64,abc' } },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
        ] },
        { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'preview_order', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'ready' }
      ],
      tools: [{ type: 'function', function: { name: 'preview_order', parameters: { type: 'object' } } }],
      plugins: [{ id: 'file-parser' }],
      jsonSchema: { name: 'intake', schema: { type: 'object' } }
    }, direct, fake);
    expect(extractAssistantMessage(await response.json()).tool_calls?.[0].id).toBe('call_2');
  });

  it('normalizes streamed text split across chunks and forwards sanitized rate limits', async () => {
    const encode = new TextEncoder();
    const data = (event: unknown) => 'data: ' + JSON.stringify(event) + '\n\n';
    const input = [
      data({ type: 'response.output_text.delta', delta: 'Hello' }),
      data({ type: 'response.completed', response: { status: 'completed', output: [] } })
    ].join('');
    const streamed: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(encode.encode(input.slice(0, 24))); controller.enqueue(encode.encode(input.slice(24))); controller.close(); }
    }));
    const options = { messages: [{ role: 'user' as const, content: 'Hello' }], stream: true };
    const { response } = await openRouterChat(options, direct, streamed);
    const output = await response.text();
    expect(output).toContain('"content":"Hello"');
    expect(output).toContain('"finish_reason":"stop"');
    const limited = await openRouterChat(options, direct, async () => new Response('private upstream body', {
      status: 429, headers: { 'Retry-After': '12' }
    }));
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get('Retry-After')).toBe('12');
    expect(await limited.response.text()).toBe('');
  });
});
