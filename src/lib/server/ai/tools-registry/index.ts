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
import { generateImage, generateMesh, removeBackground, textToSpeech, transcribeAudio } from './forge-tools';
import { webSearch, crawlUrl } from './web-search';
import { planLumiGrid, planLedStrip, planLedMatrix, planBoxLetter } from './signage';

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
    'maker.save_sketch':    (args) => saveSketch((args as any).id, (args as any).title, (args as any).code, (args as any).description),
    'forge.image':          (args: any) => generateImage(args),
    'forge.mesh':           (args: any) => generateMesh(args),
    'forge.matting':        (args: any) => removeBackground(args),
    'forge.tts':            (args: any) => textToSpeech(args),
    'forge.asr':            (args: any) => transcribeAudio(args),
    'web.search':           (args: any) => webSearch(args),
    'web.crawl':            (args: any) => crawlUrl(args),
    'signage.lumigrid':     (args: any) => Promise.resolve(planLumiGrid(args)),
    'signage.led_strip':    (args: any) => Promise.resolve(planLedStrip(args)),
    'signage.led_matrix':   (args: any) => Promise.resolve(planLedMatrix(args)),
    'signage.boxletter':    (args: any) => Promise.resolve(planBoxLetter(args))
};

/**
 * Built-in tool definitions injected into the LLM tool list when the database
 * row hasn't been seeded yet. Keeps the new web-search / signage tools usable
 * out-of-the-box on a fresh deploy without a migration.
 */
export const BUILTIN_TOOLS: ToolRow[] = [
    {
        slug: 'web.search',
        label: 'Web search',
        description: 'Search the corporate Tailnet SearxNG index for technical references, competitor signage, vendor datasheets.',
        icon: 'search',
        category: 'web',
        schema: {
            name: 'web_search',
            description: 'Search a self-hosted SearxNG instance for fresh references. Use this when the user asks about current vendor specs, new LED chips, or external articles.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query in natural language.' },
                    top_k: { type: 'number', description: 'Number of hits to return (1-25, default 8).' },
                    language: { type: 'string', description: 'ISO language code (en, nl, de).' },
                    site: { type: 'array', items: { type: 'string' }, description: 'Restrict to these domains.' },
                    categories: { type: 'array', items: { type: 'string' }, description: 'SearxNG categories.' }
                },
                required: ['query']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/web-search',
        enabled: true
    },
    {
        slug: 'web.crawl',
        label: 'Crawl URL',
        description: 'Fetch one URL, strip boilerplate, return clean text + links. Useful for inspecting a vendor product page after web.search.',
        icon: 'globe',
        category: 'web',
        schema: {
            name: 'web_crawl',
            description: 'Fetch a single URL and return cleaned text plus optional links. Pair with web_search to chase down a candidate result.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
                    selector: { type: 'string', description: 'Optional CSS selector to scope extraction.' },
                    include_links: { type: 'boolean', description: 'Return outbound links if true.' },
                    max_chars: { type: 'number', description: 'Truncate cleaned text to this many characters (default 12000).' }
                },
                required: ['url']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/crawl',
        enabled: true
    },
    {
        slug: 'signage.lumigrid',
        label: 'LumiGrid PWM plan',
        description: 'Compute PWM frequency, gamma LUT, peak current and PSU sizing for a LumiGrid controller install.',
        icon: 'sliders',
        category: 'signage',
        schema: {
            name: 'signage_lumigrid',
            description: 'Plan a LumiGrid PWM controller channel (peak current, PSU sizing, gamma LUT, timer feasibility). Use whenever the user spec mentions LumiGrid, PWM dimming, or per-channel control.',
            parameters: {
                type: 'object',
                properties: {
                    channels: { type: 'number', description: 'Independently dimmed channels (1-32).' },
                    channel_ma: { type: 'number', description: 'Per-channel current draw at full duty, in mA.' },
                    volts: { type: 'number', enum: [12, 24], description: 'Supply voltage.' },
                    pwm_hz: { type: 'number', description: 'PWM frequency in Hz.' },
                    pwm_bits: { type: 'number', description: 'PWM bit depth (8-16).' },
                    gamma: { type: 'number', description: 'Perceptual gamma (1.0-3.0).' },
                    camera_safe: { type: 'boolean', description: 'True for installs that will be filmed.' }
                },
                required: ['channels', 'channel_ma']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/signage/lumigrid',
        enabled: true
    },
    {
        slug: 'signage.led_strip',
        label: 'Addressable LED strip plan',
        description: 'Plan an addressable LED strip run: peak amps, voltage drop, injection points, max FPS.',
        icon: 'lightbulb',
        category: 'signage',
        schema: {
            name: 'signage_led_strip',
            description: 'Plan an addressable LED strip (WS281x/SK6812/APA102). Returns peak amps, voltage drop, injection points and max sustainable FPS.',
            parameters: {
                type: 'object',
                properties: {
                    length_m: { type: 'number', description: 'Run length in metres.' },
                    volts: { type: 'number', enum: [5, 12, 24], description: 'Strip voltage.' },
                    leds_per_m: { type: 'number', description: 'LEDs per metre.' },
                    ma_per_led: { type: 'number', description: 'Per-LED draw at full white, in mA.' },
                    wire_mm2: { type: 'number', description: 'Supply wire cross-section in mm².' },
                    fps: { type: 'number', description: 'Target frame rate.' }
                },
                required: ['length_m']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/signage/led-strip',
        enabled: true
    },
    {
        slug: 'signage.led_matrix',
        label: 'LED matrix display plan',
        description: 'Plan a Hub75/driver-IC LED display: pixel resolution, refresh feasibility, PSU sizing.',
        icon: 'grid',
        category: 'signage',
        schema: {
            name: 'signage_led_matrix',
            description: 'Plan a pixel-pitch LED matrix display. Returns resolution, refresh feasibility, PSU sizing.',
            parameters: {
                type: 'object',
                properties: {
                    pitch_mm: { type: 'number', description: 'Pixel pitch in mm (P2.5-P10).' },
                    width_mm: { type: 'number', description: 'Physical width in mm.' },
                    height_mm: { type: 'number', description: 'Physical height in mm.' },
                    refresh_hz: { type: 'number', description: 'Target refresh rate.' },
                    scan: { type: 'number', description: 'Scan rate (1, 8, 16, 32).' },
                    ma_per_pixel: { type: 'number', description: 'Per-pixel draw at full white in mA.' }
                },
                required: ['pitch_mm', 'width_mm', 'height_mm']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/signage/led-matrix',
        enabled: true
    },
    {
        slug: 'signage.boxletter',
        label: 'Box letter plan',
        description: 'Plan a backlit channel/box letter: module count, peak amps, expected face luminance.',
        icon: 'type',
        category: 'signage',
        schema: {
            name: 'signage_boxletter',
            description: 'Plan a backlit channel/box letter (LED tetra/opto/mini-strip). Returns module count, peak amps, PSU and estimated cd/m².',
            parameters: {
                type: 'object',
                properties: {
                    height_mm: { type: 'number', description: 'Letter cap-height in mm.' },
                    stroke_mm: { type: 'number', description: 'Stroke / face width in mm.' },
                    depth_mm: { type: 'number', description: 'Internal depth in mm.' },
                    count: { type: 'number', description: 'Number of letters.' },
                    nits_target: { type: 'number', description: 'Target face luminance in cd/m² (default 1500).' },
                    module: { type: 'string', enum: ['tetra', 'opto', 'mini-strip'] },
                    volts: { type: 'number', enum: [12, 24] },
                    module_ma: { type: 'number', description: 'Per-module current at full duty, in mA.' },
                    module_lm: { type: 'number', description: 'Per-module luminous flux in lm.' }
                },
                required: ['height_mm', 'stroke_mm']
            }
        },
        roles: [],
        stations: [],
        endpoint: '/api/ai/signage/boxletter',
        enabled: true
    }
];

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
    let rows: ToolRow[];
    if (error) {
        logger.error('listTools failed; using built-ins only', new Error(error.message));
        rows = [];
    } else {
        rows = (data ?? []) as ToolRow[];
    }

    // Merge in built-ins so the new web/signage tools work even before the
    // ai_tools migration has been applied. DB rows win on slug collision so
    // ops can override default schemas at runtime.
    const haveSlugs = new Set(rows.map((r) => r.slug));
    for (const b of BUILTIN_TOOLS) {
        if (filter?.category && b.category !== filter.category) continue;
        if (haveSlugs.has(b.slug)) continue;
        rows.push(b);
    }

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
