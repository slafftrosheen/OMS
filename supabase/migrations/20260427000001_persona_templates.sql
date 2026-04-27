-- =============================================================================
--  Per-user persona templates with curated tool subsets
-- =============================================================================
--  Each template bundles:
--    * A system-prompt add-on (appended to the base SYSTEM_PROMPT)
--    * An allow-list of tool slugs (empty = all tools available)
--    * Optional model override
--    * Optional preferred TTS voice
--  Global templates (is_global = true, user_id = null) are visible to everyone
--  and are seeded below. Users can create their own private templates.
--
--  chat_sessions gains a persona_template_id FK so the orchestrator can load
--  the template once and filter tools / inject prompt without the client
--  re-sending the persona slug on every message.
-- =============================================================================

create table if not exists user_persona_templates (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid,                               -- null = global
    name                text not null,
    description         text,
    icon                text not null default 'user',       -- lucide icon name
    color               text not null default 'var(--brand)',
    system_prompt_addon text,
    -- Empty array = all tools accessible (no filtering).
    tool_slugs          text[] not null default '{}',
    model_override      text,                               -- e.g. ENGINEER_MODEL
    voice               text not null default 'af',         -- Kokoro voice tag
    is_global           boolean not null default false,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists persona_templates_user_idx    on user_persona_templates (user_id);
create index if not exists persona_templates_global_idx  on user_persona_templates (is_global) where is_global = true;

drop trigger if exists trg_persona_templates_updated on user_persona_templates;
create trigger trg_persona_templates_updated
    before update on user_persona_templates
    for each row execute function set_updated_at();

-- Add persona_template_id to chat_sessions so sessions remember their template.
alter table chat_sessions
    add column if not exists persona_template_id uuid
        references user_persona_templates(id) on delete set null;

create index if not exists chat_sessions_persona_tmpl_idx
    on chat_sessions (persona_template_id)
    where persona_template_id is not null;

-- ─── Seed global persona templates ───────────────────────────────────────────

insert into user_persona_templates
    (name, description, icon, color, system_prompt_addon, tool_slugs, model_override, voice, is_global)
values
(
    'Engineer',
    'Deep-dive technical mode. Focuses on CAD, materials, tolerances and past-project references.',
    'wrench',
    '#0a84ff',
    'You are in engineering mode. Prioritise precision, cite material specs and tolerances, '
    'reference similar past projects when relevant. Use metric units. '
    'Avoid sales or logistics framing.',
    array[
        'rag.search_knowledge',
        'engineering.brainstorm',
        'cnc.feeds_speeds',
        'data.pending_orders',
        'data.low_stock'
    ],
    null,
    'af',
    true
),
(
    'CNC Operator',
    'Station-floor mode. Quick feeds & speeds, material look-ups, machine parameters.',
    'drill',
    '#30d158',
    'You are assisting a CNC machine operator on the production floor. '
    'Be extremely concise — one or two sentences per answer. '
    'Always provide specific numbers (RPM, feed mm/min, stepdown mm). '
    'If unsure, call the cnc.feeds_speeds tool rather than guessing.',
    array[
        'cnc.feeds_speeds',
        'rag.search_knowledge',
        'data.low_stock'
    ],
    null,
    'am',
    true
),
(
    'Paint & Finishing',
    'Colour matching, paint mix recipes, bake schedules.',
    'palette',
    '#ff9f0a',
    'You are assisting in the paint and finishing department. '
    'Specialise in colour matching (RAL, Pantone, HEX), paint mix ratios, '
    'primer selection, dry-time and bake schedules per substrate. '
    'Always cite the substrate and finish (matte/satin/gloss).',
    array[
        'paint.match',
        'rag.search_knowledge',
        'data.low_stock'
    ],
    null,
    'bf',
    true
),
(
    'Sales',
    'Customer-facing framing. Order status, pricing context, lead time estimates.',
    'briefcase',
    '#64d2ff',
    'You are in sales-support mode. Speak professionally and avoid technical jargon '
    'unless the customer asks for detail. Focus on delivery dates, order status, '
    'product benefits and availability. Never share internal cost data.',
    array[
        'data.pending_orders',
        'rag.search_knowledge'
    ],
    null,
    'af',
    true
),
(
    'Logistics',
    'Shipping, packing, order tracking and warehouse ops.',
    'truck',
    '#bf5af2',
    'You are in logistics mode. Focus on order readiness, packing lists, '
    'shipping priorities and warehouse stock levels. '
    'Summarise answers as bullet points when multiple items are involved.',
    array[
        'data.pending_orders',
        'data.low_stock',
        'rag.search_knowledge'
    ],
    null,
    'af',
    true
)
on conflict do nothing;
