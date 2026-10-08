// Application-owned tool registry. OpenRouter supplies only the model; all
// tools execute inside this server with the user's configured permissions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';
import { suggestFeedsSpeeds } from './cnc-feeds';
import { matchPaint } from './paint-match';
import { getPendingOrders, getLowStock } from './data-tools';
import { listSketches, readSketch, saveSketch } from './maker-tools';
import { webSearch, crawlUrl } from './web-search';
import { planLumiGrid, planLedStrip, planLedMatrix, planBoxLetter } from './signage';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
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

export const TOOL_EXECUTORS: Record<string, (args: Record<string, unknown>, ctx: { userId?: string; role?: string }) => Promise<unknown>> = {
  'cnc.feeds_speeds': (args) => suggestFeedsSpeeds(args as unknown as Parameters<typeof suggestFeedsSpeeds>[0]),
  'paint.match': (args) => matchPaint(args as unknown as Parameters<typeof matchPaint>[0]),
  'data.pending_orders': () => getPendingOrders(),
  'data.low_stock': () => getLowStock(),
  'maker.list_sketches': () => listSketches(),
  'maker.read_sketch': (args) => readSketch((args as { id: string }).id),
  'maker.save_sketch': (args) => saveSketch((args as any).id, (args as any).title, (args as any).code, (args as any).description),
  'web.search': (args) => webSearch(args as any),
  'web.crawl': (args) => crawlUrl(args as any),
  'signage.lumigrid': (args) => Promise.resolve(planLumiGrid(args as any)),
  'signage.led_strip': (args) => Promise.resolve(planLedStrip(args as any)),
  'signage.led_matrix': (args) => Promise.resolve(planLedMatrix(args as any)),
  'signage.boxletter': (args) => Promise.resolve(planBoxLetter(args as any))
};

export const BUILTIN_TOOLS: ToolRow[] = [
  {
    slug: 'web.search', label: 'Web search', description: 'Search the company search index for technical references and vendor datasheets.', icon: 'search', category: 'web',
    schema: { name: 'web_search', description: 'Search for current vendor specifications or technical references.', parameters: { type: 'object', properties: { query: { type: 'string' }, top_k: { type: 'number' }, language: { type: 'string' }, site: { type: 'array', items: { type: 'string' } }, categories: { type: 'array', items: { type: 'string' } } }, required: ['query'] } },
    roles: [], stations: [], endpoint: '/api/ai/web-search', enabled: true
  },
  {
    slug: 'web.crawl', label: 'Crawl URL', description: 'Fetch and clean one URL.', icon: 'globe', category: 'web',
    schema: { name: 'web_crawl', description: 'Fetch a URL and return cleaned page text.', parameters: { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' }, include_links: { type: 'boolean' }, max_chars: { type: 'number' } }, required: ['url'] } },
    roles: [], stations: [], endpoint: '/api/ai/crawl', enabled: true
  },
  {
    slug: 'signage.lumigrid', label: 'LumiGrid PWM plan', description: 'Calculate channel PWM, peak current, and PSU sizing.', icon: 'sliders', category: 'signage',
    schema: { name: 'signage_lumigrid', description: 'Plan a LumiGrid PWM controller channel.', parameters: { type: 'object', properties: { channels: { type: 'number' }, channel_ma: { type: 'number' }, volts: { type: 'number', enum: [12, 24] }, pwm_hz: { type: 'number' }, pwm_bits: { type: 'number' }, gamma: { type: 'number' }, camera_safe: { type: 'boolean' } }, required: ['channels', 'channel_ma'] } },
    roles: [], stations: [], endpoint: '/api/ai/signage/lumigrid', enabled: true
  },
  {
    slug: 'signage.led_strip', label: 'LED strip plan', description: 'Calculate power, voltage drop and injection points.', icon: 'lightbulb', category: 'signage',
    schema: { name: 'signage_led_strip', description: 'Plan an addressable LED strip run.', parameters: { type: 'object', properties: { length_m: { type: 'number' }, volts: { type: 'number', enum: [5, 12, 24] }, leds_per_m: { type: 'number' }, ma_per_led: { type: 'number' }, wire_mm2: { type: 'number' }, fps: { type: 'number' } }, required: ['length_m'] } },
    roles: [], stations: [], endpoint: '/api/ai/signage/led-strip', enabled: true
  },
  {
    slug: 'signage.led_matrix', label: 'LED matrix plan', description: 'Calculate display resolution and power sizing.', icon: 'grid', category: 'signage',
    schema: { name: 'signage_led_matrix', description: 'Plan a pixel-pitch LED matrix display.', parameters: { type: 'object', properties: { pitch_mm: { type: 'number' }, width_mm: { type: 'number' }, height_mm: { type: 'number' }, refresh_hz: { type: 'number' }, scan: { type: 'number' }, ma_per_pixel: { type: 'number' } }, required: ['pitch_mm', 'width_mm', 'height_mm'] } },
    roles: [], stations: [], endpoint: '/api/ai/signage/led-matrix', enabled: true
  },
  {
    slug: 'signage.boxletter', label: 'Box letter plan', description: 'Calculate box-letter module count and power.', icon: 'type', category: 'signage',
    schema: { name: 'signage_boxletter', description: 'Plan a backlit channel letter.', parameters: { type: 'object', properties: { height_mm: { type: 'number' }, stroke_mm: { type: 'number' }, depth_mm: { type: 'number' }, count: { type: 'number' }, nits_target: { type: 'number' }, module: { type: 'string', enum: ['tetra', 'opto', 'mini-strip'] }, volts: { type: 'number', enum: [12, 24] }, module_ma: { type: 'number' }, module_lm: { type: 'number' } }, required: ['height_mm', 'stroke_mm'] } },
    roles: [], stations: [], endpoint: '/api/ai/signage/boxletter', enabled: true
  }
];

const RETIRED_LOCAL_AI_TOOL_SLUGS = new Set(['rag.search_knowledge', 'engineering.brainstorm', 'forge.image', 'forge.mesh', 'forge.matting', 'forge.tts', 'forge.asr']);

export async function listTools(filter?: { role?: string; station?: string; category?: string }): Promise<ToolRow[]> {
  const db = admin();
  let query = db.from('ai_tools').select('*').eq('enabled', true);
  if (filter?.category) query = query.eq('category', filter.category);
  const { data, error } = await query;
  let rows = error ? [] as ToolRow[] : (data ?? []) as ToolRow[];
  if (error) logger.error('listTools failed; using built-ins only', new Error(error.message));
  const slugs = new Set(rows.map((row) => row.slug));
  for (const builtIn of BUILTIN_TOOLS) {
    if (filter?.category && builtIn.category !== filter.category) continue;
    if (!slugs.has(builtIn.slug)) rows.push(builtIn);
  }
  return rows.filter((row) => {
    if (RETIRED_LOCAL_AI_TOOL_SLUGS.has(row.slug)) return false;
    if (filter?.role && row.roles.length && !row.roles.includes(filter.role)) return false;
    if (filter?.station && row.stations.length && !row.stations.includes(filter.station)) return false;
    return true;
  });
}

export async function loadToolDefinitions(filter?: { role?: string; station?: string }): Promise<ToolDef[]> {
  const tools = await listTools(filter);
  return tools.map((tool) => ({ type: 'function', function: { name: tool.schema.name, description: tool.schema.description ?? tool.description ?? tool.label, parameters: tool.schema.parameters } }));
}

export async function findToolBySchemaName(name: string): Promise<ToolRow | null> {
  const tools = await listTools();
  return tools.find((tool) => tool.schema.name === name) ?? null;
}

export async function executeTool(slug: string, args: Record<string, unknown>, ctx: { userId?: string; role?: string } = {}): Promise<unknown> {
  if (RETIRED_LOCAL_AI_TOOL_SLUGS.has(slug)) throw new Error(`Tool '${slug}' is disabled in OpenRouter-only mode.`);
  if (slug === 'data.pending_orders' && !['RD', 'Boss', 'HeadOfProduction'].includes(ctx.role ?? '')) throw new Error('Not authorized to view pending orders');
  if (slug === 'data.low_stock' && !['RD', 'Boss', 'HeadOfProduction'].includes(ctx.role ?? '')) throw new Error('Not authorized to view stock levels');
  const executor = TOOL_EXECUTORS[slug];
  if (!executor) throw new Error(`No executor for tool slug "${slug}"`);
  return executor(args, ctx);
}
