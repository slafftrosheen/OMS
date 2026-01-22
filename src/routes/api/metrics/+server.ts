// src/routes/api/metrics/+server.ts
import { text, type RequestHandler } from '@sveltejs/kit';
import { query } from '$lib/server/db/connection';

// Simple in-memory metrics store
class MetricsStore {
	private metrics: Map<string, number> = new Map();
	private histograms: Map<string, number[]> = new Map();

	increment(name: string, value: number = 1) {
		this.metrics.set(name, (this.metrics.get(name) || 0) + value);
	}

	gauge(name: string, value: number) {
		this.metrics.set(name, value);
	}

	observe(name: string, value: number) {
		if (!this.histograms.has(name)) {
			this.histograms.set(name, []);
		}
		this.histograms.get(name)!.push(value);
	}

	export(): string {
		const lines: string[] = [];

		// Export counters and gauges
		for (const [name, value] of this.metrics.entries()) {
			lines.push(`# TYPE ${name} gauge`);
			lines.push(`${name} ${value}`);
		}

		// Export histograms (simplified)
		for (const [name, values] of this.histograms.entries()) {
			const sorted = values.sort((a, b) => a - b);
			const p50 = sorted[Math.floor(sorted.length * 0.5)];
			const p95 = sorted[Math.floor(sorted.length * 0.95)];
			const p99 = sorted[Math.floor(sorted.length * 0.99)];

			lines.push(`# TYPE ${name} summary`);
			lines.push(`${name}{quantile="0.5"} ${p50}`);
			lines.push(`${name}{quantile="0.95"} ${p95}`);
			lines.push(`${name}{quantile="0.99"} ${p99}`);
		}

		return lines.join('\n');
	}
}

const metrics = new MetricsStore();

export const GET: RequestHandler = async () => {
	// Collect current metrics
	metrics.gauge('oms_uptime_seconds', process.uptime());
	metrics.gauge('oms_memory_usage_bytes', process.memoryUsage().heapUsed);

	// Database metrics
	try {
		const result = await query(`
			SELECT 
				(SELECT COUNT(*) FROM draft_orders) as total_orders,
				(SELECT COUNT(*) FROM draft_orders WHERE status = 'in_production') as active_orders,
				(SELECT COUNT(*) FROM profiles WHERE is_active = true) as active_users
		`);

		const { total_orders, active_orders, active_users } = result.rows[0];
		metrics.gauge('oms_total_orders', parseInt(total_orders));
		metrics.gauge('oms_active_orders', parseInt(active_orders));
		metrics.gauge('oms_active_users', parseInt(active_users));
	} catch (error) {
		console.error('Failed to collect database metrics:', error);
	}

	return text(metrics.export(), {
		headers: {
			'Content-Type': 'text/plain; version=0.0.4'
		}
	});
};
