-- =============================================================================
--  Reclame AI Lab — knowledge hub, chat persistence, swarm registry,
--                   station-tool memory, job queue, runs
-- =============================================================================
--  Adds:
--    * knowledge_sources / knowledge_chunks / knowledge_jobs
--      (multi-model RAG ingestion: text, PDF, image, audio, video, URL)
--    * chat_sessions / chat_messages   (persistent AI Lab chat)
--    * ai_nodes / ai_runs              (swarm registry + job/run history)
--    * ai_tools                        (tool registry exposed in the UI)
--    * cnc_feeds_speeds / paint_matches (station-tool memory)
--    * canvas_documents                (AI Lab canvas tldraw payloads)
--    * Storage buckets: knowledge, forge
--    * RPCs: match_knowledge_text / match_knowledge_image / match_similar_projects
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ─── Knowledge hub ───────────────────────────────────────────────────────────

do $$ begin
    create type knowledge_source_kind as enum (
        'text', 'pdf', 'image', 'url', 'audio', 'video', 'office', 'cad'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type knowledge_status as enum (
        'queued', 'extracting', 'embedding', 'ready', 'failed'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type knowledge_visibility as enum ('private', 'team', 'global');
exception when duplicate_object then null; end $$;

create table if not exists knowledge_sources (
    id            uuid primary key default gen_random_uuid(),
    title         text not null,
    kind          knowledge_source_kind not null,
    status        knowledge_status not null default 'queued',
    visibility    knowledge_visibility not null default 'team',
    storage_key   text,                        -- key in `knowledge` bucket
    storage_url   text,                        -- pre-signed/relative URL
    mime_type     text,
    size_bytes    bigint,
    page_count    int,
    duration_s    int,                         -- for audio/video
    language      text,
    tags          text[]    not null default '{}',
    summary       text,                        -- LLM-generated, 1-2 sentences
    metadata      jsonb     not null default '{}'::jsonb,
    error         text,
    uploader_id   uuid,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists knowledge_sources_status_idx     on knowledge_sources (status);
create index if not exists knowledge_sources_kind_idx       on knowledge_sources (kind);
create index if not exists knowledge_sources_uploader_idx   on knowledge_sources (uploader_id);
create index if not exists knowledge_sources_tags_gin       on knowledge_sources using gin (tags);
create index if not exists knowledge_sources_metadata_gin   on knowledge_sources using gin (metadata);

create table if not exists knowledge_chunks (
    id            uuid primary key default gen_random_uuid(),
    source_id     uuid not null references knowledge_sources(id) on delete cascade,
    page          int,                          -- 1-indexed for PDFs/images
    chunk_index   int  not null default 0,
    content       text not null,                -- canonical text representation
    structured    jsonb,                        -- tables / figures / layout JSON
    bbox          jsonb,                        -- {x,y,w,h} for image-derived chunks
    -- Dense text embedding (bge-m3 = 1024).
    embedding     vector(1024),
    -- Optional cross-modal image embedding (nomic-embed-vision-v1.5 = 768).
    embedding_img vector(768),
    token_count   int,
    created_at    timestamptz not null default now()
);
create index if not exists knowledge_chunks_source_idx    on knowledge_chunks (source_id);
create index if not exists knowledge_chunks_emb_hnsw      on knowledge_chunks
    using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists knowledge_chunks_emb_img_hnsw  on knowledge_chunks
    using hnsw (embedding_img vector_cosine_ops) with (m = 16, ef_construction = 64);

-- Ingestion job queue (multi-stage pipeline; resumes after restart).
do $$ begin
    create type knowledge_job_stage as enum (
        'extract', 'chunk', 'embed_text', 'embed_image', 'summarize', 'finalize'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type knowledge_job_status as enum (
        'queued', 'running', 'done', 'failed', 'skipped'
    );
exception when duplicate_object then null; end $$;

create table if not exists knowledge_jobs (
    id            uuid primary key default gen_random_uuid(),
    source_id     uuid not null references knowledge_sources(id) on delete cascade,
    stage         knowledge_job_stage not null,
    status        knowledge_job_status not null default 'queued',
    attempts      int  not null default 0,
    max_attempts  int  not null default 3,
    last_error    text,
    payload       jsonb not null default '{}'::jsonb,
    started_at    timestamptz,
    finished_at   timestamptz,
    created_at    timestamptz not null default now()
);
create index if not exists knowledge_jobs_status_idx  on knowledge_jobs (status, stage);
create index if not exists knowledge_jobs_source_idx  on knowledge_jobs (source_id);

-- ─── Chat persistence ────────────────────────────────────────────────────────

create table if not exists chat_sessions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid,
    title         text not null default 'New conversation',
    persona       text,                                        -- e.g. 'engineer', 'sales', 'cnc-operator'
    model         text,                                        -- override of CHAT_MODEL
    metadata      jsonb not null default '{}'::jsonb,
    pinned        boolean not null default false,
    archived      boolean not null default false,
    last_message_at timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists chat_sessions_user_idx    on chat_sessions (user_id);
create index if not exists chat_sessions_archived_idx on chat_sessions (archived);

create table if not exists chat_messages (
    id            uuid primary key default gen_random_uuid(),
    session_id    uuid not null references chat_sessions(id) on delete cascade,
    role          text not null check (role in ('system','user','assistant','tool')),
    content       text not null,
    tool_calls    jsonb,                                       -- when role='assistant'
    tool_name     text,                                        -- when role='tool'
    citations     jsonb,                                       -- [{source_id,page,score}]
    model         text,
    node_label    text,                                        -- which AI node served it
    latency_ms    int,
    tokens_in     int,
    tokens_out    int,
    -- Per-message embedding so old conversations become searchable knowledge.
    embedding     vector(1024),
    created_at    timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on chat_messages (session_id, created_at);
create index if not exists chat_messages_emb_hnsw    on chat_messages
    using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- ─── AI swarm registry + run history ─────────────────────────────────────────

create table if not exists ai_nodes (
    id            uuid primary key default gen_random_uuid(),
    label         text unique not null,                        -- 'ai1', 'ai2'
    host          text not null,
    port          int  not null default 11434,
    sidecar_url   text,
    capabilities  text[] not null default '{}',
    weight        numeric not null default 1.0,
    vram_gb       int  not null default 16,
    enabled       boolean not null default true,
    last_seen_at  timestamptz,
    last_status   text,                                        -- 'up' | 'down' | 'degraded'
    metadata      jsonb not null default '{}'::jsonb,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

do $$ begin
    create type ai_run_kind as enum (
        'chat', 'embed', 'extract', 'rerank',
        'image-gen', 'image-edit', 'mesh-gen',
        'asr', 'tts', 'matting', 'colpali', 'tool'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type ai_run_status as enum ('queued','running','done','failed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists ai_runs (
    id            uuid primary key default gen_random_uuid(),
    kind          ai_run_kind not null,
    status        ai_run_status not null default 'queued',
    user_id       uuid,
    session_id    uuid references chat_sessions(id) on delete set null,
    node_label    text,
    model         text,
    input         jsonb not null default '{}'::jsonb,          -- prompts, params
    output        jsonb,                                       -- result blobs / refs
    artifacts     jsonb,                                       -- [{kind,bucket,key,url}]
    cost_seconds  numeric,
    tokens_in     int,
    tokens_out    int,
    error         text,
    started_at    timestamptz,
    finished_at   timestamptz,
    created_at    timestamptz not null default now()
);
create index if not exists ai_runs_status_idx  on ai_runs (status, kind);
create index if not exists ai_runs_user_idx    on ai_runs (user_id, created_at desc);
create index if not exists ai_runs_session_idx on ai_runs (session_id);

-- ─── AI tool registry (UI-visible toolbox) ───────────────────────────────────

create table if not exists ai_tools (
    id            uuid primary key default gen_random_uuid(),
    slug          text unique not null,        -- 'cnc.feeds_speeds', 'paint.match', ...
    label         text not null,
    description   text,
    icon          text,                        -- lucide icon name
    category      text,                        -- 'station' | 'engineering' | 'forge' | 'rag' | 'data'
    /* Tool definition passed to the LLM (OpenAI tools schema):
       { name, description, parameters: { type:'object', properties:{...} } }
    */
    schema        jsonb not null,
    /* Required role to call it. Empty array = any authenticated user. */
    roles         text[] not null default '{}',
    /* Stations that can use it (operator drawer). Empty = all. */
    stations      text[] not null default '{}',
    /* Endpoint (relative path) the orchestrator POSTs to. */
    endpoint      text not null,
    enabled       boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists ai_tools_category_idx on ai_tools (category);

-- ─── Station tool memory ─────────────────────────────────────────────────────

create table if not exists cnc_feeds_speeds (
    id              uuid primary key default gen_random_uuid(),
    material        text not null,
    material_thickness_mm numeric,
    tool_diameter_mm numeric not null,
    flutes          int,
    operation       text,                                       -- 'profile','pocket','engrave','drill'
    spindle_rpm     int,
    feed_mm_min     numeric,
    plunge_mm_min   numeric,
    stepdown_mm     numeric,
    stepover_pct    numeric,
    sfm             numeric,
    chipload_mm     numeric,
    coolant         text,
    machine         text,
    notes           text,
    source          text,                                       -- 'vendor','operator','ai-suggested','test-cut'
    confidence      numeric,                                    -- 0..1
    verified        boolean not null default false,
    knowledge_source_id uuid references knowledge_sources(id) on delete set null,
    created_by      uuid,
    created_at      timestamptz not null default now()
);
create index if not exists cnc_feeds_material_idx on cnc_feeds_speeds (material);
create index if not exists cnc_feeds_op_idx       on cnc_feeds_speeds (operation);

create table if not exists paint_matches (
    id              uuid primary key default gen_random_uuid(),
    target_label    text,                                       -- e.g. 'RAL 3020'
    target_hex      text,
    target_lab      jsonb,                                      -- {l,a,b}
    substrate       text,                                       -- 'aluminium','dibond','acrylic','wood','steel'
    recipe          jsonb,                                      -- [{base, ratio_pct}]
    dry_time_min    int,
    bake_schedule   text,
    finish          text,                                       -- 'matte','satin','gloss'
    sample_image_url text,
    knowledge_source_id uuid references knowledge_sources(id) on delete set null,
    notes           text,
    verified        boolean not null default false,
    created_by      uuid,
    created_at      timestamptz not null default now()
);
create index if not exists paint_matches_substrate_idx on paint_matches (substrate);

-- ─── Canvas documents (AI Lab canvas / tldraw) ───────────────────────────────

create table if not exists canvas_documents (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid,
    title         text not null default 'Untitled canvas',
    payload       jsonb not null default '{}'::jsonb,           -- tldraw store snapshot
    thumbnail_url text,
    shared        boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create index if not exists canvas_documents_user_idx on canvas_documents (user_id);

-- ─── Storage buckets ─────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values
    ('knowledge', 'knowledge', false),
    ('forge', 'forge', false)
on conflict (id) do nothing;

-- RLS policies: authenticated users can read/write knowledge & forge.
do $$ begin
    create policy "knowledge: auth read"   on storage.objects for select using
        (bucket_id = 'knowledge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
    create policy "knowledge: auth write"  on storage.objects for insert with check
        (bucket_id = 'knowledge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
    create policy "knowledge: auth delete" on storage.objects for delete using
        (bucket_id = 'knowledge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
    create policy "forge: auth read"   on storage.objects for select using
        (bucket_id = 'forge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
    create policy "forge: auth write"  on storage.objects for insert with check
        (bucket_id = 'forge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
    create policy "forge: auth delete" on storage.objects for delete using
        (bucket_id = 'forge' and auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ─── Vector RPCs ─────────────────────────────────────────────────────────────

create or replace function match_knowledge_text(
    query_embedding vector(1024),
    match_threshold float default 0.4,
    match_count     int   default 8,
    filter_tags     text[] default null,
    filter_kind     knowledge_source_kind default null
)
returns table (
    id           uuid,
    source_id    uuid,
    title        text,
    page         int,
    content      text,
    similarity   float
) language sql stable as $$
    select c.id, c.source_id, s.title, c.page, c.content,
           1 - (c.embedding <=> query_embedding) as similarity
    from   knowledge_chunks c
    join   knowledge_sources s on s.id = c.source_id
    where  c.embedding is not null
      and  s.status = 'ready'
      and  (filter_tags is null or s.tags && filter_tags)
      and  (filter_kind is null or s.kind = filter_kind)
      and  1 - (c.embedding <=> query_embedding) >= match_threshold
    order  by c.embedding <=> query_embedding
    limit  match_count;
$$;

create or replace function match_knowledge_image(
    query_embedding vector(768),
    match_threshold float default 0.3,
    match_count     int   default 8
)
returns table (
    id           uuid,
    source_id    uuid,
    title        text,
    page         int,
    content      text,
    similarity   float
) language sql stable as $$
    select c.id, c.source_id, s.title, c.page, c.content,
           1 - (c.embedding_img <=> query_embedding) as similarity
    from   knowledge_chunks c
    join   knowledge_sources s on s.id = c.source_id
    where  c.embedding_img is not null
      and  s.status = 'ready'
      and  1 - (c.embedding_img <=> query_embedding) >= match_threshold
    order  by c.embedding_img <=> query_embedding
    limit  match_count;
$$;

-- Similar past projects (used by station tools + engineering brainstorm).
create or replace function match_similar_projects(
    query_embedding vector(1024),
    match_threshold float default 0.35,
    match_count     int   default 6
)
returns table (
    chunk_id    uuid,
    source_id   uuid,
    title       text,
    page        int,
    snippet     text,
    similarity  float
) language sql stable as $$
    select c.id, c.source_id, s.title, c.page,
           substr(c.content, 1, 800) as snippet,
           1 - (c.embedding <=> query_embedding) as similarity
    from   knowledge_chunks c
    join   knowledge_sources s on s.id = c.source_id
    where  c.embedding is not null
      and  s.status = 'ready'
      and  ('portfolio' = any(s.tags) or 'project' = any(s.tags) or s.kind in ('image','pdf'))
      and  1 - (c.embedding <=> query_embedding) >= match_threshold
    order  by c.embedding <=> query_embedding
    limit  match_count;
$$;

-- Chat-history search (find prior conversations by semantic similarity).
create or replace function match_chat_history(
    query_embedding vector(1024),
    match_threshold float default 0.4,
    match_count     int   default 5,
    user_filter     uuid  default null
)
returns table (
    message_id  uuid,
    session_id  uuid,
    role        text,
    content     text,
    similarity  float,
    created_at  timestamptz
) language sql stable as $$
    select m.id, m.session_id, m.role, m.content,
           1 - (m.embedding <=> query_embedding) as similarity,
           m.created_at
    from   chat_messages m
    join   chat_sessions s on s.id = m.session_id
    where  m.embedding is not null
      and  (user_filter is null or s.user_id = user_filter)
      and  1 - (m.embedding <=> query_embedding) >= match_threshold
    order  by m.embedding <=> query_embedding
    limit  match_count;
$$;

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_knowledge_sources_updated on knowledge_sources;
create trigger trg_knowledge_sources_updated
    before update on knowledge_sources
    for each row execute function set_updated_at();

drop trigger if exists trg_chat_sessions_updated on chat_sessions;
create trigger trg_chat_sessions_updated
    before update on chat_sessions
    for each row execute function set_updated_at();

drop trigger if exists trg_ai_nodes_updated on ai_nodes;
create trigger trg_ai_nodes_updated
    before update on ai_nodes
    for each row execute function set_updated_at();

drop trigger if exists trg_ai_tools_updated on ai_tools;
create trigger trg_ai_tools_updated
    before update on ai_tools
    for each row execute function set_updated_at();

drop trigger if exists trg_canvas_documents_updated on canvas_documents;
create trigger trg_canvas_documents_updated
    before update on canvas_documents
    for each row execute function set_updated_at();

-- ─── Seed AI tools (UI-discoverable, role-gated) ─────────────────────────────

insert into ai_tools (slug, label, description, icon, category, schema, roles, stations, endpoint) values
    ('rag.search_knowledge',
     'Search knowledge base',
     'Semantic search across uploaded docs, drawings, manuals, and past projects.',
     'library', 'rag',
     jsonb_build_object(
       'name','search_knowledge',
       'description','Search the knowledge base by semantic similarity',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'query', jsonb_build_object('type','string'),
           'tags',  jsonb_build_object('type','array','items',jsonb_build_object('type','string')),
           'top_k', jsonb_build_object('type','integer','default',8)),
         'required', jsonb_build_array('query'))),
     '{}','{}','/api/ai/knowledge/search'),

    ('cnc.feeds_speeds',
     'Suggest CNC feeds & speeds',
     'Recommend spindle RPM, feed rate and stepdown given material + tool, citing vendor data.',
     'drill', 'station',
     jsonb_build_object(
       'name','suggest_feeds_speeds',
       'description','Suggest feeds and speeds for a CNC operation',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'material',         jsonb_build_object('type','string'),
           'thickness_mm',     jsonb_build_object('type','number'),
           'tool_diameter_mm', jsonb_build_object('type','number'),
           'flutes',           jsonb_build_object('type','integer'),
           'operation',        jsonb_build_object('type','string','enum',jsonb_build_array('profile','pocket','engrave','drill'))),
         'required', jsonb_build_array('material','tool_diameter_mm','operation'))),
     '{}', array['CNC','ROUTER','LASER'],
     '/api/ai/station/cnc-feeds'),

    ('paint.match',
     'Match paint colour',
     'Suggest a paint mix recipe and bake schedule for a target colour on a substrate.',
     'palette', 'station',
     jsonb_build_object(
       'name','match_paint',
       'description','Suggest a paint mix recipe for a target colour',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'target',    jsonb_build_object('type','string','description','RAL/Pantone/HEX or descriptive name'),
           'substrate', jsonb_build_object('type','string'),
           'finish',    jsonb_build_object('type','string','enum',jsonb_build_array('matte','satin','gloss'))),
         'required', jsonb_build_array('target','substrate'))),
     '{}', array['PAINT','FINISHING'],
     '/api/ai/station/paint-match'),

    ('engineering.brainstorm',
     'Engineering brainstorm',
     'Surface similar past projects and propose construction approaches.',
     'lightbulb', 'engineering',
     jsonb_build_object(
       'name','similar_projects',
       'description','Find similar past projects with build notes',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'query', jsonb_build_object('type','string')),
         'required', jsonb_build_array('query'))),
     '{}','{}','/api/ai/station/similar'),

    ('forge.image',
     'Generate image',
     'Diffusion image generation (Flux). Use for mockups, signage previews, brand visuals.',
     'image', 'forge',
     jsonb_build_object(
       'name','generate_image',
       'description','Generate an image from a text prompt',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'prompt',   jsonb_build_object('type','string'),
           'negative', jsonb_build_object('type','string'),
           'width',    jsonb_build_object('type','integer','default',1024),
           'height',   jsonb_build_object('type','integer','default',1024),
           'steps',    jsonb_build_object('type','integer','default',28),
           'seed',     jsonb_build_object('type','integer')),
         'required', jsonb_build_array('prompt'))),
     '{}','{}','/api/ai/forge/image'),

    ('forge.mesh',
     'Generate 3D mesh',
     'Image-to-mesh (TRELLIS/Hunyuan3D). Outputs a GLB.',
     'box', 'forge',
     jsonb_build_object(
       'name','generate_mesh',
       'description','Generate a 3D mesh from an input image',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'image_url', jsonb_build_object('type','string'),
           'steps',     jsonb_build_object('type','integer','default',50)),
         'required', jsonb_build_array('image_url'))),
     '{}','{}','/api/ai/forge/mesh'),

    ('forge.matting',
     'Remove background',
     'Foreground extraction (BiRefNet/RMBG-2.0). One-click for product shots.',
     'eraser', 'forge',
     jsonb_build_object(
       'name','remove_background',
       'description','Remove the background from an image',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'image_url', jsonb_build_object('type','string')),
         'required', jsonb_build_array('image_url'))),
     '{}','{}','/api/ai/forge/matting'),

    ('forge.asr',
     'Transcribe audio',
     'Whisper large-v3-turbo. Voice memos from the floor become searchable.',
     'mic', 'forge',
     jsonb_build_object(
       'name','transcribe_audio',
       'description','Transcribe an audio or video file',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'audio_url', jsonb_build_object('type','string'),
           'language',  jsonb_build_object('type','string'))),
         'required', jsonb_build_array('audio_url'))),
     '{}','{}','/api/ai/forge/asr'),

    ('forge.tts',
     'Text to speech',
     'Kokoro / Piper voice generation for video voiceovers.',
     'volume-2', 'forge',
     jsonb_build_object(
       'name','speak',
       'description','Synthesize speech from text',
       'parameters', jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'text',  jsonb_build_object('type','string'),
           'voice', jsonb_build_object('type','string','default','af')),
         'required', jsonb_build_array('text'))),
     '{}','{}','/api/ai/forge/tts'),

    ('data.pending_orders',
     'List pending orders',
     'Top 25 active/draft/on-hold orders sorted by priority and due date.',
     'clipboard-list', 'data',
     jsonb_build_object(
       'name','get_pending_orders',
       'description','Fetch pending orders from the OMS database',
       'parameters', jsonb_build_object('type','object','properties', jsonb_build_object())),
     '{}','{}','/api/ai/tools/pending-orders'),

    ('data.low_stock',
     'List low-stock materials',
     'Materials at or below reorder point.',
     'package-x', 'data',
     jsonb_build_object(
       'name','get_low_stock',
       'description','Fetch materials below reorder point',
       'parameters', jsonb_build_object('type','object','properties', jsonb_build_object())),
     '{}','{}','/api/ai/tools/low-stock')
on conflict (slug) do update set
    label       = excluded.label,
    description = excluded.description,
    icon        = excluded.icon,
    category    = excluded.category,
    schema      = excluded.schema,
    endpoint    = excluded.endpoint,
    updated_at  = now();

-- Seed AI nodes from the env-driven defaults so the UI has rows to render
-- before the swarm router has run its first heartbeat.
insert into ai_nodes (label, host, port, sidecar_url, capabilities, vram_gb)
values
    ('ai1','100.93.147.108',11434,'http://100.93.147.108:8800',
     array['reasoning','vision','coder','embed'], 16),
    ('ai2','100.93.147.109',11434,'http://100.93.147.109:8800',
     array['image-gen','mesh-gen','asr','tts','rerank','colpali'], 16)
on conflict (label) do nothing;
