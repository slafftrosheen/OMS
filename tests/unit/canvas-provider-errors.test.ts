import { restoreRoutingFixtureEnvironment } from '../helpers/ai-routing-fixture';
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { POST } from '../../src/routes/api/toolkit/brainstorm/+server';

restoreRoutingFixtureEnvironment();

async function providerFailure(status: number) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin === 'https://supabase.example.test' && url.pathname === '/rest/v1/openrouter_system_policy') {
      assert.equal(request.method, 'GET');
      return Response.json({ enabled: true, active_provider: 'openrouter',
        text_model: 'test/text', vision_model: 'test/vision', openai_text_model: 'gpt-test', openai_vision_model: 'gpt-test' });
    }
    if (url.origin === 'https://supabase.example.test' && url.pathname === '/rest/v1/rpc/get_openrouter_api_key') {
      assert.equal(request.method, 'POST');
      return Response.json('unit-test-provider-key');
    }
    assert.equal(url.href, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.method, 'POST');
    return Response.json({ error: { message: 'private provider response body' } },
      { status, headers: { 'Retry-After': '30' } });
  };
  try {
    const query = { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: { locale: 'en' }, error: null }; } };
    return await POST({
      request: new Request('https://oms.example.test/api/toolkit/brainstorm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Create a test rectangle.', cards: [], links: [], skill: 'explore', language: 'en' }) }),
      locals: { user: { id: `qa-provider-${status}`, role: 'RD' }, supabase: { from: () => query } },
      getClientAddress: () => `qa-provider-${status}`
    } as never);
  } finally { globalThis.fetch = previous; }
}

describe('Canvas live-provider failure boundary', () => {
  it('preserves upstream rate limits and retry metadata without exposing provider bodies', async () => {
    const response = await providerFailure(429);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '30');
    const body = await response.json();
    assert.equal(body.code, 'PROVIDER_RATE_LIMIT');
    assert.equal(body.source, 'openrouter');
    assert.equal(body.retryAfter, 30);
    assert.match(body.error, /rate limit/i);
    assert.doesNotMatch(JSON.stringify(body), /private provider response body|unit-test-provider-key/);
  });

  it('keeps other upstream failures bounded and leaves the board unchanged', async () => {
    const response = await providerFailure(500);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /board has not changed/i);
    assert.doesNotMatch(JSON.stringify(body), /private provider response body|unit-test-provider-key/);
  });
});
