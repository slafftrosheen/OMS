// Paint colour matching tool.
//
// Inputs: target colour (RAL/Pantone/HEX/descriptive) + substrate + finish.
// Output: top historical recipes from `paint_matches`, plus an LLM-synthesised
// recommendation that respects ingested paint datasheets.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODEL } from '$lib/server/config';
import { swarmChat } from '$lib/server/ai/swarm';
import { searchKnowledge } from './knowledge-search';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

export interface PaintMatchArgs {
    target: string;                 // 'RAL 3020' | '#FF0000' | 'Reclame red'
    substrate: string;              // 'aluminium' | 'dibond' | 'acrylic' | ...
    finish?: 'matte' | 'satin' | 'gloss';
}

export interface PaintMatchResult {
    historical: Array<{
        target_label: string | null;
        target_hex: string | null;
        recipe: unknown;
        dry_time_min: number | null;
        bake_schedule: string | null;
        finish: string | null;
        verified: boolean;
        notes: string | null;
    }>;
    knowledge_citations: Array<{ source_id: string; title: string; page: number | null }>;
    recommendation: {
        recipe: Array<{ base: string; ratio_pct: number }>;
        dry_time_min: number;
        bake_schedule: string;
        finish: string;
        confidence: number;
        rationale: string;
    } | null;
}

export async function matchPaint(args: PaintMatchArgs): Promise<PaintMatchResult> {
    const db = admin();
    const isHex = /^#?[0-9a-f]{6}$/i.test(args.target.trim());
    const norm = isHex ? args.target.replace('#', '').toUpperCase() : args.target;

    let q = db
        .from('paint_matches')
        .select('*')
        .ilike('substrate', `%${args.substrate}%`)
        .order('verified', { ascending: false })
        .limit(8);

    if (isHex) q = q.ilike('target_hex', `%${norm}%`);
    else q = q.ilike('target_label', `%${args.target}%`);

    const { data } = await q;

    const historical = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        target_label: (r.target_label as string | null) ?? null,
        target_hex:   (r.target_hex   as string | null) ?? null,
        recipe:        r.recipe ?? null,
        dry_time_min: (r.dry_time_min as number | null) ?? null,
        bake_schedule:(r.bake_schedule as string | null) ?? null,
        finish:       (r.finish       as string | null) ?? null,
        verified:     Boolean(r.verified),
        notes:        (r.notes        as string | null) ?? null
    }));

    const kb = await searchKnowledge({
        query: `paint mix recipe ${args.target} on ${args.substrate} ${args.finish ?? ''}`.trim(),
        tags: ['paint', 'finishing', 'datasheet'],
        top_k: 4
    }).catch(() => ({ hits: [] as Awaited<ReturnType<typeof searchKnowledge>>['hits'] }));

    let recommendation: PaintMatchResult['recommendation'] = null;
    try {
        const sys = `You are a paint shop foreman. Output ONLY a JSON object with:
recipe (array of {base, ratio_pct} summing to 100), dry_time_min (int),
bake_schedule (string, e.g. "30min @ 80°C"), finish, confidence (0..1),
rationale. Use historical entries and datasheets to ground the recipe.`;
        const usr = JSON.stringify({
            request: args,
            historical: historical.slice(0, 5),
            datasheets: kb.hits.map((h) => h.content.slice(0, 1500))
        });
        const res = await swarmChat({
            cap: 'reasoning',
            model: MODEL.chat,
            stream: false,
            temperature: 0.3,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: usr }
            ]
        });
        const j = (await res.response.json()) as { message?: { content?: string } };
        const txt = j.message?.content ?? '';
        const start = txt.indexOf('{');
        const end = txt.lastIndexOf('}');
        if (start >= 0 && end > start) {
            recommendation = JSON.parse(txt.slice(start, end + 1));
        }
    } catch {
        /* swallow — historical hits still useful */
    }

    return {
        historical,
        knowledge_citations: kb.hits.map((h) => ({
            source_id: h.source_id,
            title: h.title,
            page: h.page
        })),
        recommendation
    };
}
