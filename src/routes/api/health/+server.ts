// src/routes/api/health/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ locals }) => {
    const startTime = Date.now();
    const checks: Record<string, { status: 'ok' | 'error'; latency?: number; error?: string }> = {};

    // Database connectivity check
    try {
        const dbStart = Date.now();
        const { data, error } = await locals.supabase
            .from('profiles')
            .select('id')
            .limit(1)
            .single();
        
        checks.database = {
            status: error ? 'error' : 'ok',
            latency: Date.now() - dbStart,
            error: error?.message
        };
    } catch (err) {
        checks.database = {
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
        };
    }

    // Authentication service check
    try {
        const authStart = Date.now();
        const { data, error } = await locals.supabase.auth.getSession();
        
        checks.auth = {
            status: error ? 'error' : 'ok',
            latency: Date.now() - authStart,
            error: error?.message
        };
    } catch (err) {
        checks.auth = {
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
        };
    }

    // Overall status
    const allOk = Object.values(checks).every(check => check.status === 'ok');
    const totalLatency = Date.now() - startTime;

    const response = {
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
        latency: totalLatency,
        version: dev ? 'dev' : process.env.npm_package_version || 'unknown'
    };

    return json(response, {
        status: allOk ? 200 : 503,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
};