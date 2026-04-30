// Tool registry — the LLM can call these "tools" via Ollama's tool-calling
// protocol. Definitions come from the `ai_tools` table (seeded by the
// 20260426000000_ai_lab.sql migration), executors live in this folder.
//
// The orchestrator queries `loadToolDefinitions()` once per chat, passes the
// resulting array into the Ollama /api/chat `tools` field, and dispatches
// requested tool calls back to `executeTool()`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';
import { searchKnowledge } from './knowledge-search';
import { suggestFeedsSpeeds } from './cnc-feeds';
import { matchPaint } from './paint-match';
import { findSimilarProjects } from './similar-projects';
import { getPendingOrders, getLowStock } from './data-tools';
import { listSketches, readSketch, saveSketch } from './maker-tools';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

export interface ToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: unknown;
    };
}

export interface ToolRow {
    slug: string;
    label: string;
    description: string | null;
    icon: string | null;
    category: string | null;
    schema: { name: string; description?: string; parameters: unknown };
    roles: string[];
    stations: string[];
    endpoint: string;
    enabled: boolean;
}

/** Map slug → executor function. */
export const TOOL_EXECUTORS: Record<
    string,
    (args: Record<string, unknown>, ctx: { userId?: string }) => Promise<unknown>
> = {
    'rag.search_knowledge': (args) => searchKnowledge(args as unknown as { query: string; tags?: string[]; top_k?: number }),
    'cnc.feeds_speeds':     (args) => suggestFeedsSpeeds(args as unknown as Parameters<typeof suggestFeedsSpeeds>[0]),
    'paint.match':          (args) => matchPaint(args as unknown as Parameters<typeof matchPaint>[0]),
    'engineering.brainstorm': (args) => findSimilarProjects(args as unknown as { query: string }),
    'data.pending_orders':  () => getPendingOrders(),
    'data.low_stock':       () => getLowStock(),
    'maker.list_sketches':  () => listSketches(),
    'maker.read_sketch':    (args) => readSketch((args as { id: string }).id),
    'maker.save_sketch':    (args) => saveSketch((args as any).id, (args as any).title, (args as any).code, (args as any).description)
};

/** Pull active tools from the DB. Filter by role / station as needed. */
export async function listTools(filter?: {
    role?: string;
    station?: string;
    category?: string;
}): Promise<ToolRow[]> {
    const db = admin();
    let q = db.from('ai_tools').select('*').eq('enabled', true);
    if (filter?.category) q = q.eq('category', filter.category);
    const { data, error } = await q;
    if (error) {
        logger.error('listTools failed', new Error(error.message));
        return [];
    }
    const rows = (data ?? []) as ToolRow[];
    return rows.filter((r) => {
        if (filter?.role && r.roles.length > 0 && !r.roles.includes(filter.role)) return false;
        if (filter?.station && r.stations.length > 0 && !r.stations.includes(filter.station)) {
            return false;
        }
        return true;
    });
}

/** Build the Ollama tool array from the DB-backed registry. */
export async function loadToolDefinitions(filter?: {
    role?: string;
    station?: string;
}): Promise<ToolDef[]> {
    const tools = await listTools(filter);
    return tools.map((t) => ({
        type: 'function' as const,
        function: {
            name: t.schema.name,
            description: t.schema.description ?? t.description ?? t.label,
            parameters: t.schema.parameters
        }
    }));
}

/** Look up a tool slug by the LLM-callable function name. */
export async function findToolBySchemaName(name: string): Promise<ToolRow | null> {
    const tools = await listTools();
    return tools.find((t) => t.schema.name === name) ?? null;
}

/** Execute a tool by its slug. Used by the orchestrator's tool-call loop. */
export async function executeTool(
    slug: string,
    args: Record<string, unknown>,
    ctx: { userId?: string } = {}
): Promise<unknown> {
    const fn = TOOL_EXECUTORS[slug];
    if (!fn) throw new Error(`No executor for tool slug "${slug}"`);
    return fn(args, ctx);
}
