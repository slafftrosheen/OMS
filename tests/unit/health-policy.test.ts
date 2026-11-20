import { describe, expect, it } from 'vitest';
import { evaluateHealth, type HealthChecks } from '../../src/lib/server/health-policy';
import { POST as probeProvider } from '../../src/routes/api/ai/health/+server';

const base: HealthChecks = {
  database: { status: 'ok', latency: 1 },
  auth: { status: 'ok', latency: 1 },
  openrouter: { status: 'ok', latency: 1 }
};

describe('OMS readiness policy', () => {
  it('returns 200 healthy when all services pass', () => {
    expect(evaluateHealth(base)).toEqual({ status: 'healthy', httpStatus: 200 });
  });
  it('treats optional AI failure as degraded without failing OMS', () => {
    expect(evaluateHealth({ ...base, openrouter: { status: 'error', latency: 1 } }))
      .toEqual({ status: 'degraded', httpStatus: 200 });
  });
  it('returns 503 if the database fails', () => {
    expect(evaluateHealth({ ...base, database: { status: 'error', latency: 1 } }))
      .toEqual({ status: 'unhealthy', httpStatus: 503 });
  });
  it('returns 503 if Auth fails', () => {
    expect(evaluateHealth({ ...base, auth: { status: 'error', latency: 1 } }))
      .toEqual({ status: 'unhealthy', httpStatus: 503 });
  });
});

describe('Explicit provider connection test', () => {
  it('rejects anonymous, non-R&D and cross-origin probes before contacting the provider', async () => {
    const url = new URL('https://oms.example/api/ai/health');
    const probe = (user: { role: string } | null, origin: string) => probeProvider({
      locals: { user }, request: new Request(url, { method: 'POST', headers: { origin } }), url
    } as Parameters<typeof probeProvider>[0]);
    expect((await probe(null, url.origin)).status).toBe(401);
    expect((await probe({ role: 'PRODUCTION' }, url.origin)).status).toBe(403);
    const response = await probe({ role: 'RD' }, 'https://other.example');
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Cross-origin provider probe denied' });
  });
});
