import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OpenRouterHttpError, providerBillingFailure } from '../../src/lib/server/ai/openrouter';
import { PdfSourceError } from '../../src/lib/server/ai/pdf-text';
import { isHttpError } from '@sveltejs/kit';

// Exercise the route's error boundary without downloading private assets or
// calling a paid provider. The catch body is JavaScript and runs unchanged.
const source = readFileSync('src/routes/api/toolkit/analyze-asset/+server.ts', 'utf8');
const catchBody = source.slice(source.lastIndexOf('} catch (err) {') + '} catch (err) {'.length,
  source.lastIndexOf('\n  }'));
const handleError = new Function('err', 'request', 'json', 'kind', 'noStore', 'console', 'OpenRouterHttpError', 'PdfSourceError', 'isHttpError', 'providerName', 'routing', 'providerBillingFailure', catchBody);

function responseFor(message: string | Error, aborted = false, provider: 'openrouter' | 'openai' = 'openrouter') {
  return handleError(typeof message === 'string' ? new Error(message) : message, { signal: { aborted } },
    (body: unknown, options: Parameters<typeof Response.json>[1]) => Response.json(body, options),
    'pdf', { 'Cache-Control': 'private, no-store' }, { error() {} }, OpenRouterHttpError, PdfSourceError, isHttpError,
    provider === 'openai' ? 'OpenAI' : 'OpenRouter', { provider }, providerBillingFailure) as Response;
}

describe('Toolkit analysis provider error responses', () => {
  it('identifies exhausted PDF analysis credits and spending limits without a retry delay', async () => {
    for (const [type, code] of [['credit_balance_exhausted', 'PROVIDER_CREDITS_EXHAUSTED'],
      ['project_spend_limit_exceeded', 'PROVIDER_SPEND_LIMIT'], ['insufficient_quota', 'PROVIDER_QUOTA_EXHAUSTED']] as const) {
      const response = responseFor(new OpenRouterHttpError(429, null, type, 'openai'), false, 'openai');
      const body = await response.json();
      assert.equal(response.status, 402);
      assert.equal(body.code, code);
      assert.equal(body.source, 'openai');
      assert.match(body.error, /OpenAI.*billing/i);
      assert.equal(response.headers.get('Retry-After'), null);
    }
  });

  for (const [upstream, status, code] of [
    [400, 422, 'PROVIDER_REJECTED_DOCUMENT'],
    [422, 422, 'PROVIDER_REJECTED_DOCUMENT'],
    [429, 429, 'PROVIDER_RATE_LIMIT'],
    [401, 503, 'PROVIDER_AUTH_FAILURE'],
    [403, 503, 'PROVIDER_AUTH_FAILURE'],
    [500, 503, 'PROVIDER_UPSTREAM_ERROR'],
    [503, 503, 'PROVIDER_UNAVAILABLE']
  ] as const) {
    it(`maps provider HTTP ${upstream} to an actionable safe response`, async () => {
      const response = responseFor(`OpenRouter completion failed (HTTP ${upstream})`);
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.equal(body.code, code);
      assert.equal(body.upstreamStatus, upstream);
      assert.equal(body.source, 'openrouter');
    });
  }
  it('labels OpenAI errors with the active provider and preserves bounded retry metadata', async () => {
    const response = responseFor(new OpenRouterHttpError(429, '5'), false, 'openai');
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.equal(body.source, 'openai');
    assert.match(body.error, /OpenAI/);
    assert.equal(body.upstreamStatus, 429);
  });
  it('does not return raw provider inputs in an unknown failure', async () => {
    const response = responseFor('private-file.pdf secret-key sensitive-prompt');
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'PROVIDER_ANALYSIS_FAILED');
    assert.equal(body.upstreamStatus, null);
    assert.doesNotMatch(JSON.stringify(body), /private-file|secret-key|sensitive-prompt/);
  });
  it('keeps cancellation distinct from provider failure', async () => {
    assert.equal(responseFor('cancelled', true).status, 499);
  });
});
