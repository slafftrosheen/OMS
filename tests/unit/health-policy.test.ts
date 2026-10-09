import { describe, expect, it } from 'vitest';
import { evaluateHealth, type HealthChecks } from '../../src/lib/server/health-policy';

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
