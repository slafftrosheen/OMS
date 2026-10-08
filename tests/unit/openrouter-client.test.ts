import { describe, expect, it } from 'vitest';
import { openRouterChat, openRouterMessages, extractAssistantMessage, parseToolArguments, openRouterError, type OpenRouterClientConfig } from '../../src/lib/server/ai/openrouter';

const config: OpenRouterClientConfig = {
  apiKey: 'test-key-for-unit-only',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openrouter/free',
  visionModel: 'unused',
  timeoutMs: 5000
};

describe('OpenRouter chat client', () => {
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

