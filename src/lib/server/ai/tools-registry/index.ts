// Application-owned tool registry. OpenRouter supplies only the model; all
// tools execute inside this server with the user's configured permissions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';
import { suggestFeedsSpeeds } from './cnc-feeds';
import { matchPaint } from './paint-match';
import { getPendingOrders, getLowStock } from './data-tools';
import { listSketches, readSketch } from './maker-tools';
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

export interface ToolContext {
  userId: string;
  role: string;
  stations?: string[];
  supabase: SupabaseClient;
}

export const TOOL_EXECUTORS: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>> = {
  'cnc.feeds_speeds': (args, ctx) => suggestFeedsSpeeds(args as unknown as Parameters<typeof suggestFeedsSpeeds>[0], ctx.supabase),
  'paint.match': (args, ctx) => matchPaint(args as unknown as Parameters<typeof matchPaint>[0], ctx.supabase),
  'data.pending_orders': (_args, ctx) => getPendingOrders(ctx.supabase),
  'data.low_stock': (_args, ctx) => getLowStock(ctx.supabase),
  'maker.list_sketches': (_args, ctx) => listSketches(ctx.supabase),
  'maker.read_sketch': (args, ctx) => readSketch(ctx.supabase, String(args.id ?? '')),
  // Deliberately no maker.save_sketch: model-generated tool calls must be read-only.
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
    slug: 'signage.lumigrid', label: 'LumiGrid hybrid output plan', description: 'Calculate separate loads for 8 PWM outputs and 8 addressable RMT lanes.', icon: 'sliders', category: 'signage',
    schema: { name: 'signage_lumigrid', description: 'Plan an 8 PWM + 8 addressable-lane LumiGrid controller. Treat electrical/current/timing limits as unverified.', parameters: { type: 'object', properties: {
      channels: { type: 'integer', minimum: 0, maximum: 8, description: 'Used PWM outputs' },
      channel_ma: { type: 'number', minimum: 0, description: 'Full-on load per PWM output in mA' },
      volts: { type: 'integer', enum: [12, 24] },
      addressable_lanes: { type: 'integer', minimum: 0, maximum: 8 },
      pixels_per_lane: { type: 'integer', minimum: 0, maximum: 256 },
      pixel_ma: { type: 'number', minimum: 0, description: 'Worst-case pixel current from LED datasheet' },
      pixel_volts: { type: 'integer', enum: [5, 12, 24] },
      pwm_hz: { type: 'number' }, pwm_bits: { type: 'integer' },
      gamma: { type: 'number' }, camera_safe: { type: 'boolean' }
    }, required: ['channels', 'channel_ma'] } },
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


const RESTRICTED_DATA_TOOLS = new Set(['data.pending_orders', 'data.low_stock']);

// Models may choose from registered, implemented and authorized tools only.
// Database descriptors can disable a built-in but cannot publish an executable
// arbitrary URL, bypass role checks or turn on an autonomous write.
export function mayUseTool(tool: ToolRow, filter: { role?: string; station?: string } = {}): boolean {
  if (!tool.enabled || RETIRED_LOCAL_AI_TOOL_SLUGS.has(tool.slug)) return false;
  if (!tool.schema || typeof tool.schema.name !== 'string' || !tool.schema.name.trim()) return false;
  if (!(tool.slug in TOOL_EXECUTORS)) return false;
  if (tool.slug === 'maker.save_sketch') return false;
  if (RESTRICTED_DATA_TOOLS.has(tool.slug) &&
      !['RD', 'Boss', 'HeadOfProduction'].includes(filter.role ?? '')) return false;
  if (tool.roles?.length && (!filter.role || !tool.roles.includes(filter.role))) return false;
  if (tool.stations?.length && (!filter.station || !tool.stations.includes(filter.station))) return false;
  return true;
}

export async function listTools(filter?: { role?: string; station?: string; category?: string }): Promise<ToolRow[]> {
  let rows: ToolRow[] = [];
  // Keep deterministic built-in calculators functional if the optional AI
  // metadata table or service-role client is temporarily unavailable.
  if (SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const db = admin();
      let query = db.from('ai_tools').select('*');
      if (filter?.category) query = query.eq('category', filter.category);
      const { data, error } = await query;
      if (error) throw error;
      rows = (data ?? []) as ToolRow[];
    } catch (err) {
      logger.warn('AI tool metadata unavailable: built-in definitions only', {
        reason: err && typeof err === 'object' ? 'database_unavailable' : 'unknown'
      });
    }
  }
  // Code owns the executable schema, but DB may DISABLE built-ins and narrow
  // their allowed roles/stations. Never widen their static permissions.
  const canonical = new Map(BUILTIN_TOOLS.map(row => [row.slug, row]));
  rows = rows.map(row => {
    const builtin = canonical.get(row.slug);
    if (!builtin) return row;
    const limitedRoles = builtin.roles.length
      ? builtin.roles.filter(role => !row.roles?.length || row.roles.includes(role))
      : (Array.isArray(row.roles) ? row.roles : []);
    const limitedStations = builtin.stations.length
      ? builtin.stations.filter(station => !row.stations?.length || row.stations.includes(station))
      : (Array.isArray(row.stations) ? row.stations : []);
    return {
      ...builtin,
      enabled: builtin.enabled && row.enabled === true &&
        (!builtin.roles.length || !row.roles?.length || limitedRoles.length > 0) &&
        (!builtin.stations.length || !row.stations?.length || limitedStations.length > 0),
      roles: limitedRoles,
      stations: limitedStations
    };
  });
  const slugs = new Set(rows.map(row => row.slug));
  for (const tool of BUILTIN_TOOLS) {
    if (filter?.category && tool.category !== filter.category) continue;
    if (!slugs.has(tool.slug)) rows.push(tool);
  }
  return rows.filter(tool => {
    if (filter?.category && tool.category !== filter.category) return false;
    return mayUseTool(tool, filter);
  });
}

export async function loadToolDefinitions(filter?: { role?: string; station?: string }): Promise<ToolDef[]> {
  const tools = await listTools(filter);
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.schema.name,
      description: tool.schema.description ?? tool.description ?? tool.label,
      parameters: tool.schema.parameters
    }
  }));
}

export async function findToolBySchemaName(name: string, filter: { role?: string; station?: string } = {}): Promise<ToolRow | null> {
  const tools = await listTools(filter);
  return tools.find(tool => tool.schema.name === name) ?? null;
}

export async function executeTool(slug: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  if (!ctx?.userId || !ctx?.role || !ctx?.supabase) throw new Error('Authenticated tool context is required');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
  if (slug === 'maker.save_sketch') throw new Error('Autonomous writes require a separate user approval workflow');
  if (RETIRED_LOCAL_AI_TOOL_SLUGS.has(slug)) throw new Error('Tool disabled in OpenRouter-only mode');
  const available = await listTools({ role: ctx.role });
  if (!available.some(tool => tool.slug === slug)) throw new Error('Tool unavailable or not authorized');
  const executor = TOOL_EXECUTORS[slug];
  if (!executor) throw new Error('Tool executor is not installed');
  return executor(args, ctx);
}
