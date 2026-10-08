/**
 * Central server-side configuration.
 *
 * Resolution order: process.env (loaded by the service/runtime), followed by
 * safe defaults. Provider credentials remain optional at build time and are
 * resolved server-side from Vault for each OpenRouter inference request.
 */

const dyn = process.env;

// ─── Resolver ────────────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
    const fromDyn = (dyn as Record<string, string | undefined>)[key];
    if (fromDyn !== undefined && fromDyn !== '') return fromDyn;
    const fromProc = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (fromProc !== undefined && fromProc !== '') return fromProc;
    return undefined;
}

function readString(key: string, fallback: string): string {
    return readEnv(key) ?? fallback;
}

function readNumber(key: string, fallback: number): number {
    const v = readEnv(key);
    if (v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
    const v = readEnv(key);
    if (v === undefined) return fallback;
    return /^(1|true|yes|on)$/i.test(v.trim());
}

function readList(key: string, fallback: string[] = []): string[] {
    const v = readEnv(key);
    if (v === undefined) return fallback;
    return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function trimSlash(s: string) {
    return s.replace(/\/+$/, '');
}

// ─── Application topology ────────────────────────────────────────────────────
// Supabase and the SvelteKit frontend are hosted on the OMS server. Model
// inference is exclusively remote through OpenRouter; no AI nodes are configured.

export const OMS_HOST             = readString('OMS_HOST',              '100.98.202.69');
export const NAS_HOST             = readString('NAS_HOST',              '100.98.202.70');
export const FRONTEND_HOST        = readString('FRONTEND_HOST',         OMS_HOST);

// Local Ollama inference is removed; AI inference is OpenRouter-only.

export const SUPABASE_HOST        = readString('SUPABASE_HOST',         OMS_HOST);
export const SUPABASE_PORT        = readNumber('SUPABASE_PORT',         8000);
export const SUPABASE_URL         = trimSlash(readString('SUPABASE_URL', `http://${SUPABASE_HOST}:${SUPABASE_PORT}`));

// Direct postgres connection used by the AI orchestrator's "dumb tool" path.
export const DATABASE_URL         = readEnv('DATABASE_URL');

// Supabase keys (server-only — never imported into client code).
export const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const SUPABASE_ANON_KEY         = readEnv('PUBLIC_SUPABASE_ANON_KEY')  ?? '';

// AI inference is routed through OpenRouter. The API key is server-only and is
// deliberately optional during build; protected AI endpoints fail clearly until configured.
export const AI_PROVIDER = 'openrouter' as const;
export const OPENROUTER_API_KEY = readEnv('OPENROUTER_API_KEY') ?? '';
export const STORAGE_BUCKET_FILES = readString('STORAGE_BUCKET_FILES', 'files');
export const STORAGE_BUCKET_STATION = readString('STORAGE_BUCKET_STATION', 'station-attachments');
export const OPENROUTER_BASE_URL = trimSlash(readString('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'));
export const OPENROUTER_MODEL = readString('OPENROUTER_MODEL', 'openrouter/free');
export const OPENROUTER_VISION_MODEL = readString('OPENROUTER_VISION_MODEL', 'google/gemma-4-31b-it:free');
export const OPENROUTER_TIMEOUT_MS = readNumber('OPENROUTER_TIMEOUT_MS', 120_000);

// ─── Legacy node metadata (unused for inference) ────────────────────────────
// Retired with local Ollama/sidecar inference; unrelated legacy imports stay
// buildable. Only the type shims below remain.

export type Capability = 'reasoning' | 'vision' | 'coder';

export interface AiNode {
    idx: number;
    label: string;
    host: string;
    port: number;
    caps: Capability[];
    weight: number;
    vramGb: number;
}

// ─── OpenRouter model aliases ────────────────────────────────────────────────
// Legacy task aliases all resolve to the configured hosted OpenRouter models.

export interface ModelTag {
    primary: string;
    fallback: string;
}
const tag = (_key: string, primary: string): ModelTag => ({ primary, fallback: primary });

// Model tag shape is kept for existing internal imports; active model IDs are remote OpenRouter IDs.
export const MODEL = {
    router: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    reasoning: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    chat: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    engineer: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    vision: tag('OPENROUTER_VISION_MODEL', OPENROUTER_VISION_MODEL),
    math: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    default: tag('OPENROUTER_MODEL', OPENROUTER_MODEL),
    embed: tag('DISABLED', 'disabled'),
    embedImage: tag('DISABLED', 'disabled'),
    rerank: tag('DISABLED', 'disabled'),
    colpali: tag('DISABLED', 'disabled'),
    asr: tag('DISABLED', 'disabled'),
    tts: tag('DISABLED', 'disabled'),
    image: tag('DISABLED', 'disabled'),
    mesh: tag('DISABLED', 'disabled'),
    matting: tag('DISABLED', 'disabled'),
    music: tag('DISABLED', 'disabled')
} as const satisfies Record<string, ModelTag>;

// Legacy vector dimensions retained for existing schema/RPC contracts; no embeddings are generated.
export const EMBED_DIM = 1024;
export const EMBED_DIM_FALLBACK = 768;
export const EMBED_IMAGE_DIM = 768;

// ─── Compatibility aliases used by remaining data/RPC consumers ──────────────
export const ROUTER_MODEL = MODEL.router.primary;
export const REASONING_MODEL = MODEL.reasoning.primary;
export const ENGINEER_MODEL = MODEL.engineer.primary;
export const VISION_MODEL = MODEL.vision.primary;
export const EMBED_MODEL = MODEL.embed.primary;
export const SUPABASE_LEGACY_HOST = readString('PUBLIC_SUPABASE_LEGACY_HOST', '192.168.8.150');
export const SUPABASE_LEGACY_URL  = trimSlash(readString('SUPABASE_LEGACY_URL',
    `http://${SUPABASE_LEGACY_HOST}:${SUPABASE_PORT}`));

// ─── Storage buckets ─────────────────────────────────────────────────────────

export const BUCKET = {
    files: STORAGE_BUCKET_FILES,
    station: STORAGE_BUCKET_STATION
} as const;

// ─── Reclame AI Lab — feature flags + tuning ─────────────────────────────────

export const AILAB = {
    enabled:        readBool('PUBLIC_AILAB_ENABLED',          true),
    chat:           readBool('PUBLIC_AILAB_CHAT_ENABLED',     true),
    canvas:         readBool('PUBLIC_AILAB_CANVAS_ENABLED',   true),
    stationTools:   readBool('PUBLIC_AILAB_STATION_TOOLS_ENABLED', true),
    runs:           readBool('PUBLIC_AILAB_RUNS_ENABLED',     true),

    queue_tickMs:      readNumber('JOB_QUEUE_TICK_MS',    2_000),
    queue_maxAttempts: readNumber('JOB_MAX_ATTEMPTS',     3),
    queue_timeoutMs:   readNumber('JOB_TIMEOUT_MS',       900_000),
    rateLimitPerMin:   readNumber('AILAB_RATELIMIT_PER_MIN', 30)
} as const;

// ─── Misc URLs the UI needs ──────────────────────────────────────────────────

export const PUBLIC_BASE_URL = readString('PUBLIC_BASE_URL', `http://${OMS_HOST}`);
export const PUBLIC_APP_URL  = readString('PUBLIC_APP_URL',  PUBLIC_BASE_URL);
export const PUBLIC_APP_NAME = readString('PUBLIC_APP_NAME', 'Réclame Fabriek OMS');

// ─── Web search / crawl ────────────────────────────────────────────────────
// Self-hosted SearxNG on the Tailnet provides JSON results without leaking
// queries to public engines. Set SEARCH_BACKEND_URL to a SearxNG instance.
// The crawl tool reuses the brand-crawler primitives but is single-shot.

export const SEARCH_BACKEND      = readString('SEARCH_BACKEND', 'searxng');
export const SEARCH_BACKEND_URL  = trimSlash(
    readString('SEARCH_BACKEND_URL', `http://${OMS_HOST}:8888`)
);
export const SEARCH_DEFAULT_LANG = readString('SEARCH_DEFAULT_LANG', 'en');
export const CRAWL_USER_AGENT    = readString('CRAWL_USER_AGENT',
    'ReclameFabriek-OMS/1.0 (+air-gapped tailnet)');
export const CRAWL_MAX_BYTES     = readNumber('CRAWL_MAX_BYTES', 2_000_000);
export const CRAWL_TIMEOUT_MS    = readNumber('CRAWL_TIMEOUT_MS', 15_000);

// ─── Signage / LumiGrid defaults ───────────────────────────────────────────
// Réclame Fabriek's house controllers + LED inventories. Calculators in the
// AI Lab default to these so the operator only types deltas.

export const SIGNAGE = {
    /** PWM clock the LumiGrid controllers run at by default. */
    pwmHz:           readNumber('LUMIGRID_PWM_HZ', 24_000),
    /** Default gamma for perceptual dimming on the LumiGrid. */
    gamma:           Number(readString('LUMIGRID_GAMMA', '2.2')) || 2.2,
    /** Bit-depth for the LumiGrid PWM output (16 bit on current rev). */
    pwmBits:         readNumber('LUMIGRID_PWM_BITS', 16),
    /** Default LED strip voltage in volts. */
    stripVolts:      readNumber('LED_STRIP_VOLTS', 24),
    /** Default LEDs per metre on the in-house addressable strip. */
    stripLedsPerM:   readNumber('LED_STRIP_LEDS_PER_M', 60),
    /** Worst-case current per pixel at full white, in mA. */
    stripMaPerLed:   readNumber('LED_STRIP_MA_PER_LED', 60),
    /** Default refresh rate target for matrix displays. */
    matrixHz:        readNumber('LED_MATRIX_HZ', 60),
    /** Maximum drop tolerated end-to-end on a 24 V strip (V). */
    stripMaxDrop:    Number(readString('LED_STRIP_MAX_DROP', '0.6')) || 0.6,
    /** Default copper resistivity for power injection calc (Ω·mm²/m). */
    copperRho:       Number(readString('COPPER_RHO', '0.0175')) || 0.0175
} as const;
