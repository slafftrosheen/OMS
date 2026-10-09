/** Core OMS readiness does not depend on optional AI inference. */
export type ProbeStatus = { status: 'ok' | 'error'; latency: number };
export type HealthChecks = { database: ProbeStatus; auth: ProbeStatus; openrouter: ProbeStatus };
export function evaluateHealth(checks: HealthChecks): { status: 'healthy' | 'degraded' | 'unhealthy'; httpStatus: 200 | 503 } {
  const coreHealthy = checks.database.status === 'ok' && checks.auth.status === 'ok';
  if (!coreHealthy) return { status: 'unhealthy', httpStatus: 503 };
  return checks.openrouter.status === 'ok'
    ? { status: 'healthy', httpStatus: 200 }
    : { status: 'degraded', httpStatus: 200 };
}
