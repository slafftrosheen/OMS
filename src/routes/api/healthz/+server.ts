// src/routes/api/healthz/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/server/db/connection';
import { dev } from '$app/environment';

interface HealthCheck {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	uptime: number;
	checks: {
		database: CheckResult;
		memory: CheckResult;
		storage: CheckResult;
	};
	version?: string;
}

interface CheckResult {
	status: 'pass' | 'warn' | 'fail';
	message: string;
	responseTime?: number;
	details?: Record<string, any>;
}

// Cache health check results to avoid overwhelming database
let cachedHealth: HealthCheck | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 10000; // 10 seconds

async function checkDatabase(): Promise<CheckResult> {
	const start = Date.now();
	
	try {
		// Test query
		const result = await query('SELECT NOW() as now');
		const responseTime = Date.now() - start;

		// Check connection pool
		const poolStats = await query(`
			SELECT 
				count(*) FILTER (WHERE state = 'active') as active_connections,
				count(*) FILTER (WHERE state = 'idle') as idle_connections,
				max_conn.setting::int as max_connections
			FROM pg_stat_activity
			CROSS JOIN pg_settings max_conn
			WHERE max_conn.name = 'max_connections'
		`);

		const { active_connections, idle_connections, max_connections } = poolStats.rows[0];
		const connectionUsage = (active_connections / max_connections) * 100;

		return {
			status: connectionUsage > 80 ? 'warn' : 'pass',
			message: 'Database connected',
			responseTime,
			details: {
				activeConnections: active_connections,
				idleConnections: idle_connections,
				maxConnections: max_connections,
				usagePercent: connectionUsage.toFixed(2)
			}
		};
	} catch (error) {
		return {
			status: 'fail',
			message: `Database error: ${(error as Error).message}`,
			responseTime: Date.now() - start
		};
	}
}

async function checkMemory(): Promise<CheckResult> {
	const usage = process.memoryUsage();
	const heapUsedMB = usage.heapUsed / 1024 / 1024;
	const heapTotalMB = usage.heapTotal / 1024 / 1024;
	const usagePercent = (heapUsedMB / heapTotalMB) * 100;

	return {
		status: usagePercent > 90 ? 'warn' : 'pass',
		message: 'Memory usage normal',
		details: {
			heapUsed: `${heapUsedMB.toFixed(2)} MB`,
			heapTotal: `${heapTotalMB.toFixed(2)} MB`,
			usagePercent: usagePercent.toFixed(2),
			rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`
		}
	};
}

async function checkStorage(): Promise<CheckResult> {
	try {
		// Check if uploads directory is accessible
		const { stat, mkdir } = await import('fs/promises');
		const uploadsDir = './uploads';
		
		try {
			const stats = await stat(uploadsDir);
			return {
				status: 'pass',
				message: 'Storage accessible',
				details: {
					path: uploadsDir,
					exists: true
				}
			};
		} catch {
			// Directory doesn't exist, try to create
			await mkdir(uploadsDir, { recursive: true });
			return {
				status: 'warn',
				message: 'Storage directory created',
				details: {
					path: uploadsDir,
					created: true
				}
			};
		}
	} catch (error) {
		return {
			status: 'fail',
			message: `Storage error: ${(error as Error).message}`
		};
	}
}

export const GET: RequestHandler = async ({ url }) => {
	// Check cache
	const now = Date.now();
	if (cachedHealth && cacheExpiry > now) {
		return json(cachedHealth, {
			headers: {
				'Cache-Control': `private, max-age=${Math.ceil((cacheExpiry - now) / 1000)}`
			}
		});
	}

	// Run health checks in parallel
	const [database, memory, storage] = await Promise.all([
		checkDatabase(),
		checkMemory(),
		checkStorage()
	]);

	// Determine overall status
	const checks = { database, memory, storage };
	const hasFailure = Object.values(checks).some((c) => c.status === 'fail');
	const hasWarning = Object.values(checks).some((c) => c.status === 'warn');

	const health: HealthCheck = {
		status: hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		checks,
		version: dev ? 'dev' : process.env.npm_package_version
	};

	// Cache the result
	cachedHealth = health;
	cacheExpiry = now + CACHE_TTL;

	// Return appropriate HTTP status
	const httpStatus = health.status === 'unhealthy' ? 503 : 200;

	return json(health, {
		status: httpStatus,
		headers: {
			'Cache-Control': 'private, max-age=10'
		}
	});
};