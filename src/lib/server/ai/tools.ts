// src/lib/server/ai/tools.ts
// ─────────────────────────────────────────────────────────────────────────────
// Swarm OS — AI Skills (Tool Calling)
//
// Each "skill" is a strongly-typed function that queries the Supabase OMS
// database via the service-role client (bypasses RLS). The functions are
// read-only; no mutations are allowed.
//
// The `TOOL_DEFINITIONS` array is passed directly into the Ollama /api/chat
// `tools` parameter so the LLM can request live data.
// ─────────────────────────────────────────────────────────────────────────────

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '$lib/server/logging/logger';

// ─── Supabase admin client (service role — bypasses RLS) ─────────────────────
const SUPABASE_URL = 'http://100.98.202.69:54321';

let _supabaseAdmin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
	if (!_supabaseAdmin) {
		_supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}
	return _supabaseAdmin;
}

// ─── Return types ────────────────────────────────────────────────────────────

export interface PendingOrderSummary {
	id: string;
	po_number: string;
	title: string;
	client: string;
	status: string;
	priority: number;
	due_date: string | null;
	loading_date: string | null;
	created_at: string;
}

export interface LowStockItem {
	id: string;
	name: string;
	category: string;
	unit: string;
	current_stock: number;
	min_stock: number;
	deficit: number;
}

export interface OrderCountByStatus {
	status: string;
	count: number;
}

// ─── Tool Functions ──────────────────────────────────────────────────────────

/**
 * Fetch all orders that are currently pending / active / on hold.
 * Returns a compact summary suitable for LLM consumption.
 */
export async function getPendingOrders(): Promise<PendingOrderSummary[]> {
	const db = getAdminClient();

	const { data, error } = await db
		.from('draft_orders')
		.select('id, po_number, title, client, status, priority, due_date, loading_date, created_at')
		.in('status', ['active', 'draft', 'on_hold'])
		.order('priority', { ascending: false })
		.order('due_date', { ascending: true })
		.limit(25);

	if (error) {
		logger.error('AI Tool: getPendingOrders failed', new Error(error.message));
		throw new Error(`Database query failed: ${error.message}`);
	}

	return (data ?? []) as PendingOrderSummary[];
}

/**
 * Fetch materials whose current stock is at or below min_stock.
 */
export async function getInventoryStatus(): Promise<LowStockItem[]> {
	const db = getAdminClient();

	// Supabase doesn't support `lte('current_stock', col('min_stock'))` natively,
	// so we fetch all materials with their stock levels and filter client-side.
	const { data, error } = await db
		.from('materials')
		.select('id, name, category, unit, current_stock, min_stock')
		.order('name');

	if (error) {
		logger.error('AI Tool: getInventoryStatus failed', new Error(error.message));
		throw new Error(`Database query failed: ${error.message}`);
	}

	return (data ?? [])
		.filter((m: any) => m.current_stock <= m.min_stock)
		.map((m: any) => ({
			id: m.id,
			name: m.name,
			category: m.category,
			unit: m.unit,
			current_stock: m.current_stock,
			min_stock: m.min_stock,
			deficit: m.min_stock - m.current_stock,
		}));
}

/**
 * Get a summary count of orders grouped by status.
 */
export async function getOrderCountsByStatus(): Promise<OrderCountByStatus[]> {
	const db = getAdminClient();

	const { data, error } = await db
		.from('draft_orders')
		.select('status');

	if (error) {
		logger.error('AI Tool: getOrderCountsByStatus failed', new Error(error.message));
		throw new Error(`Database query failed: ${error.message}`);
	}

	// Aggregate in JS since Supabase REST API doesn't support GROUP BY directly
	const counts = new Map<string, number>();
	for (const row of data ?? []) {
		const status = (row as any).status ?? 'unknown';
		counts.set(status, (counts.get(status) ?? 0) + 1);
	}

	return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}

// ─── Tool Registry ──────────────────────────────────────────────────────────

/** Map of tool name → executor function. */
export const TOOL_EXECUTORS: Record<string, () => Promise<unknown>> = {
	get_pending_orders: getPendingOrders,
	get_inventory_status: getInventoryStatus,
	get_order_counts_by_status: getOrderCountsByStatus,
};

/**
 * Ollama-compatible tool definitions.
 * Passed into the `tools` array of the /api/chat payload.
 */
export const TOOL_DEFINITIONS = [
	{
		type: 'function' as const,
		function: {
			name: 'get_pending_orders',
			description:
				'Retrieve a list of all active, draft, and on-hold orders from the OMS database. Returns order ID, PO number, title, client, status, priority, due date, and loading date.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'get_inventory_status',
			description:
				'Check the current materials inventory for low-stock alerts. Returns materials whose current stock level is at or below the minimum threshold, including the deficit amount.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
	{
		type: 'function' as const,
		function: {
			name: 'get_order_counts_by_status',
			description:
				'Get a summary of how many orders exist in each status category (active, draft, completed, cancelled, on_hold). Useful for dashboard overviews.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
];
