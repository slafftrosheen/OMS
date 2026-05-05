/**
 * Central server-side configuration.
 *
 * Single source of truth: every Tailscale IP, model name, timeout, bucket
 * and feature flag the entire stack needs is loaded from `.env` here. No
 * other module reads `process.env` for production values directly.
 *
 * Resolution order:
 *   1. process.env (set by Docker / K3s / pm2 / launchd)
 *   2. SvelteKit's $env/dynamic/private (mirrors process.env at runtime)
 *   3. The defaults below (today's Tailnet topology — see CLAUDE.md & README)
 *
 * Override anything via `.env` (see `.env.example` for the full inventory).
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

// ─── Tailnet topology ────────────────────────────────────────────────────────
// Documented in CLAUDE.md / README. Pi5 OMS server hosts BOTH Supabase and the
// SvelteKit frontend. Two Win11 AI nodes run the swarm. Pi5 NAS for backups.

export const OMS_HOST             = readString('OMS_HOST',              '100.98.202.69');
export const NAS_HOST             = readString('NAS_HOST',              '100.98.202.70');
export const FRONTEND_HOST        = readString('FRONTEND_HOST',         OMS_HOST);

// Legacy single-Ollama-host vars — kept so old consumers (orchestrator.ts,
// tools.ts, ollama-client.ts) still resolve. New code should use the swarm
// router (`src/lib/server/ai/swarm.ts`) which iterates AI_NODES below.
export const OLLAMA_HOST          = readString('OLLAMA_HOST',           readString('NODE1_HOST', '100.93.147.108'));
export const OLLAMA_PORT          = readNumber('OLLAMA_PORT',           readNumber('NODE1_PORT', 11434));
export const OLLAMA_URL           = trimSlash(readString('OLLAMA_URL',  `http://${OLLAMA_HOST}:${OLLAMA_PORT}`));
export const OLLAMA_WEBUI_URL     = trimSlash(readString('PUBLIC_OLLAMA_WEBUI_URL', `http://${OLLAMA_HOST}:3000`));

export const SUPABASE_HOST        = readString('SUPABASE_HOST',         OMS_HOST);
export const SUPABASE_PORT        = readNumber('SUPABASE_PORT',         8000);
export const SUPABASE_URL         = trimSlash(readString('SUPABASE_URL', `http://${SUPABASE_HOST}:${SUPABASE_PORT}`));

// Direct postgres connection used by the AI orchestrator's "dumb tool" path.
export const DATABASE_URL         = readEnv('DATABASE_URL');

// Supabase keys (server-only — never imported into client code).
export const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const SUPABASE_ANON_KEY         = readEnv('PUBLIC_SUPABASE_ANON_KEY')  ?? '';

// ─── AI swarm — node fleet ───────────────────────────────────────────────────
// Auto-discovered from NODE1..NODE9 env vars. Each node carries capability
// tags (reasoning, vision, image-gen, ...) used by the swarm router to
// dispatch jobs. Sidecars are FastAPI servers that expose generative + media
// endpoints Ollama doesn't handle (Flux, TRELLIS, ColQwen2, Whisper, Kokoro).

export type Capability =
    | 'reasoning'
    | 'vision'
    | 'coder'
    | 'embed'
    | 'rerank'
    | 'image-gen'
    | 'mesh-gen'
    | 'asr'
    | 'tts'
    | 'colpali';

export interface AiNode {
    /** Index 1..9 from env (NODE1, NODE2, ...) */
    idx: number;
    /** Human label (e.g. "ai1") */
    label: string;
    /** Tailscale host */
    host: string;
    /** Ollama port (default 11434) */
    port: number;
    /** Full Ollama base URL */
    ollamaUrl: string;
    /** Sidecar base URL (FastAPI on :8800 by default) */
    sidecarUrl: string;
    /** Capability tags */
    caps: Capability[];
    /** Soft scheduling weight (1.0 = normal). Set 0 to drain a node. */
    weight: number;
    /** VRAM budget in GB (informational, used by UI) */
    vramGb: number;
}

function discoverNodes(): AiNode[] {
    const out: AiNode[] = [];
    for (let i = 1; i <= 9; i++) {
        const host = readEnv(`NODE${i}_HOST`);
        if (!host) continue;
        const port = readNumber(`NODE${i}_PORT`, 11434);
        const label = readString(`NODE${i}_LABEL`, `ai${i}`);
        const caps = readList(`NODE${i}_CAPS`, ['reasoning']) as Capability[];
        const weight = Number(readString(`NODE${i}_WEIGHT`, '1.0')) || 1.0;
        const vramGb = readNumber(`NODE${i}_VRAM_GB`, 16);
        const sidecarUrl = trimSlash(
            readString(`NODE${i}_SIDECAR_URL`, `http://${host}:8800`)
        );
        out.push({
            idx: i,
            label,
            host,
            port,
            ollamaUrl: trimSlash(`http://${host}:${port}`),
            sidecarUrl,
            caps,
            weight,
            vramGb
        });
    }
    // Backwards-compat: if no NODE* defined, synthesise one from the legacy
    // OLLAMA_HOST so old single-node deployments still work.
    if (out.length === 0) {
        out.push({
            idx: 1,
            label: 'ai1',
            host: OLLAMA_HOST,
            port: OLLAMA_PORT,
            ollamaUrl: OLLAMA_URL,
            sidecarUrl: trimSlash(`http://${OLLAMA_HOST}:8800`),
            caps: ['reasoning', 'vision', 'coder', 'embed', 'image-gen', 'mesh-gen', 'asr', 'tts', 'rerank', 'colpali'],
            weight: 1.0,
            vramGb: 16
        });
    }
    return out;
}

export const AI_NODES: AiNode[] = discoverNodes();

// ─── AI swarm — model catalog ────────────────────────────────────────────────
// Each task has a primary + fallback. Defaults are uncensored ("abliterated")
// community-approved tunes from huihui-ai / mradermacher / unsloth, sized for
// 16 GB VRAM (RTX 5080) at the listed quant.

export interface ModelTag {
    primary: string;
    fallback: string;
}
const tag = (key: string, primary: string, fallback?: string): ModelTag => ({
    primary: readString(key, primary),
    fallback: readString(`${key}_FALLBACK`, fallback ?? primary)
});

// All chat/reasoning defaults below are Qwen3-era and are tool-calling-capable.
// DeepSeek-R1 distills were dropped because the distilled variants do NOT
// reliably support native function/tool calling — Qwen3 thinking mode covers
// the same chain-of-thought use case and keeps tools working.
export const MODEL = {
    // Router (~3 GB): tiny, fast, tool-calling-capable. Used to classify intent.
    router:    tag('ROUTER_MODEL',     'huihui_ai/qwen3-abliterated:4b',
                                       'huihui_ai/qwen3-abliterated:8b'),

    // Reasoning (Qwen3 thinking mode): 14B Q4_K_M ≈ 9 GB.
    // Fallback: 30B-A3B MoE Q3_K_M ≈ 13 GB — fits 16 GB.
    reasoning: tag('REASONING_MODEL',  'huihui_ai/qwen3-abliterated:14b',
                                       'huihui_ai/qwen3-abliterated:30b-a3b-instruct-2507-q3_K_M'),

    // Chat: same 14B primary; fallback to 8B for snappy replies under load.
    chat:      tag('CHAT_MODEL',       'huihui_ai/qwen3-abliterated:14b',
                                       'huihui_ai/qwen3-abliterated:8b'),

    // Coder: Qwen3-Coder MoE Q3_K_M ≈ 14.7 GB. Q4 is 18.7 GB and OOMs on 16 GB.
    // Fallback: 14B general (always safe at 9 GB).
    engineer:  tag('ENGINEER_MODEL',   'huihui_ai/qwen3-coder-abliterated:30b-a3b-instruct-q3_K_M',
                                       'huihui_ai/qwen3-abliterated:14b'),

    // Vision: abliterated Qwen3-VL 8B ≈ 5 GB.
    vision:    tag('VISION_MODEL',     'huihui_ai/qwen3-vl-abliterated:8b-instruct',
                                       'huihui_ai/qwen3-vl-abliterated:8b-thinking'),

    math:      tag('MATH_MODEL',       'huihui_ai/qwen3-abliterated:14b',
                                       'huihui_ai/qwen3-abliterated:30b-a3b-instruct-2507-q3_K_M'),

    default:   tag('OLLAMA_DEFAULT_MODEL',
                                       'huihui_ai/qwen3-abliterated:14b',
                                       'huihui_ai/qwen3-abliterated:8b'),

    embed:     tag('EMBED_MODEL',      'bge-m3', 'nomic-embed-text'),
    // nomic-embed-vision is loaded via HuggingFace transformers in the sidecar (not Ollama).
    embedImage:tag('EMBED_IMAGE_MODEL','nomic-ai/nomic-embed-vision-v1.5', 'nomic-ai/nomic-embed-vision-v1.5'),
    rerank:    tag('RERANK_MODEL',     'BAAI/bge-reranker-v2-m3',
                                       'jinaai/jina-reranker-v2-base-multilingual'),
    colpali:   tag('COLPALI_MODEL',    'vidore/colqwen2-v1.0', 'vidore/colqwen2-v1.0'),
    asr:       tag('ASR_MODEL',        'large-v3-turbo', 'large-v3'),
    tts:       tag('TTS_MODEL',        'hexgrad/Kokoro-82M', 'rhasspy/piper-voices'),
    image:     tag('IMAGE_MODEL',      'black-forest-labs/FLUX.1-dev',
                                       'black-forest-labs/FLUX.1-schnell'),
    mesh:      tag('MESH_MODEL',       'microsoft/TRELLIS-image-large',
                                       'tencent/Hunyuan3D-2.1'),
    matting:   tag('MATTING_MODEL',    'briaai/RMBG-2.0', 'ZhengPeng7/BiRefNet'),
    music:     tag('MUSIC_MODEL',      'facebook/musicgen-small', 'facebook/musicgen-small')
} as const satisfies Record<string, ModelTag>;

// Embedding dimensionality (used by migrations + RPCs). Default = bge-m3.
export const EMBED_DIM       = readNumber('EMBED_DIM', 1024);
export const EMBED_DIM_FALLBACK = readNumber('EMBED_DIM_FALLBACK', 768);
export const EMBED_IMAGE_DIM = readNumber('EMBED_IMAGE_DIM', 768);

// ─── Back-compat exports (existing orchestrator/tools imports) ───────────────
// Keep the old constants around so we don't have to rewrite every consumer.
export const ROUTER_MODEL    = MODEL.router.primary;
export const REASONING_MODEL = MODEL.reasoning.primary;
export const ENGINEER_MODEL  = MODEL.engineer.primary;
export const VISION_MODEL    = MODEL.vision.primary;
export const OLLAMA_DEFAULT_MODEL = MODEL.default.primary;
export const EMBED_MODEL = MODEL.embed.primary;
export const SUPABASE_LEGACY_HOST = readString('PUBLIC_SUPABASE_LEGACY_HOST', '192.168.8.150');
export const SUPABASE_LEGACY_URL  = trimSlash(readString('SUPABASE_LEGACY_URL',
    `http://${SUPABASE_LEGACY_HOST}:${SUPABASE_PORT}`));

// ─── Ollama tuning ───────────────────────────────────────────────────────────

export const OLLAMA_TIMEOUT_MS    = readNumber('OLLAMA_TIMEOUT_MS',    120_000);
export const OLLAMA_PROBE_TIMEOUT = readNumber('OLLAMA_PROBE_TIMEOUT_MS', 3_000);
export const OLLAMA_KEEP_ALIVE    = readString('OLLAMA_KEEP_ALIVE',   '10m');
export const OLLAMA_NUM_CTX       = readNumber('OLLAMA_NUM_CTX',      32_768);
export const OLLAMA_NUM_PREDICT   = readNumber('OLLAMA_NUM_PREDICT',  4_096);

// ─── Storage buckets ─────────────────────────────────────────────────────────

export const BUCKET = {
    files:     readString('STORAGE_BUCKET_FILES',     'files'),
    station:   readString('STORAGE_BUCKET_STATION',   'station-attachments'),
    knowledge: readString('STORAGE_BUCKET_KNOWLEDGE', 'knowledge'),
    forge:     readString('STORAGE_BUCKET_FORGE',     'forge')
} as const;

// ─── Reclame AI Lab — feature flags + tuning ─────────────────────────────────

export const AILAB = {
    enabled:        readBool('PUBLIC_AILAB_ENABLED',          true),
    chat:           readBool('PUBLIC_AILAB_CHAT_ENABLED',     true),
    knowledge:      readBool('PUBLIC_AILAB_KNOWLEDGE_ENABLED',true),
    forge:          readBool('PUBLIC_AILAB_FORGE_ENABLED',    true),
    canvas:         readBool('PUBLIC_AILAB_CANVAS_ENABLED',   true),
    stationTools:   readBool('PUBLIC_AILAB_STATION_TOOLS_ENABLED', true),
    runs:           readBool('PUBLIC_AILAB_RUNS_ENABLED',     true),

    knowledge_maxFileMb: readNumber('KNOWLEDGE_MAX_FILE_MB', 200),
    knowledge_chunkSize: readNumber('KNOWLEDGE_CHUNK_SIZE',  2_500),
    knowledge_overlap:   readNumber('KNOWLEDGE_CHUNK_OVERLAP', 250),
    knowledge_pdfDpi:    readNumber('KNOWLEDGE_PDF_RENDER_DPI', 200),
    knowledge_topk:      readNumber('KNOWLEDGE_TOPK',        8),
    knowledge_rerankTopN:readNumber('KNOWLEDGE_RERANK_TOPN', 4),

    forge_imgSteps:    readNumber('FORGE_IMAGE_STEPS',    28),
    forge_imgGuidance: Number(readString('FORGE_IMAGE_GUIDANCE', '3.5')) || 3.5,
    forge_imgMaxW:     readNumber('FORGE_IMAGE_MAX_WIDTH',  1536),
    forge_imgMaxH:     readNumber('FORGE_IMAGE_MAX_HEIGHT', 1536),
    forge_meshSteps:   readNumber('FORGE_MESH_STEPS',     50),

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
