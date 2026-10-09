// CNC feeds & speeds suggestion.
//
// Strategy:
//   1. Look up matching rows in `cnc_feeds_speeds` (verified entries first).
//   2. If no exact match, surface the 5 closest-fit historical entries.
//   3. Ask the engineering model (OpenRouter) to weigh them and output a
//      recommendation with a brief "why" trace.
//
// The LLM call is OPTIONAL — if the provider is unconfigured we still return
// the raw historical hits so the operator has something to work with.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MODEL } from '$lib/server/config';
import { openRouterComplete } from '$lib/server/ai/openrouter';
import { logger } from '$lib/server/logging/logger';

export interface FeedsSpeedsArgs {
    material: string;
    thickness_mm?: number;
    tool_diameter_mm: number;
    flutes?: number;
    operation: 'profile' | 'pocket' | 'engrave' | 'drill';
    machine?: string;
}

export interface FeedsSpeedsHit {
    spindle_rpm: number | null;
    feed_mm_min: number | null;
    plunge_mm_min: number | null;
    stepdown_mm: number | null;
    stepover_pct: number | null;
    chipload_mm: number | null;
    coolant: string | null;
    notes: string | null;
    source: string | null;
    confidence: number | null;
    verified: boolean;
}

export interface FeedsSpeedsResult {
    historical: FeedsSpeedsHit[];
    recommendation: {
        spindle_rpm: number | null;
        feed_mm_min: number | null;
        plunge_mm_min: number | null;
        stepdown_mm: number | null;
        stepover_pct: number | null;
        notes: string;
        confidence: number;
        rationale: string;
    } | null;
}

export async function suggestFeedsSpeeds(args: FeedsSpeedsArgs, db: SupabaseClient): Promise<FeedsSpeedsResult> {
    if (!args || typeof args.material !== 'string' || args.material.trim().length > 120 ||
        !['profile','pocket','engrave','drill'].includes(args.operation) ||
        !Number.isFinite(args.tool_diameter_mm) || args.tool_diameter_mm <= 0) {
        throw new Error('Invalid CNC material, operation or cutter diameter');
    }
    const { data: hist, error: lookupError } = await db
        .from('cnc_feeds_speeds')
        .select('*')
        .ilike('material', `%${args.material}%`)
        .eq('operation', args.operation)
        .order('verified', { ascending: false })
        .order('confidence', { ascending: false })
        .limit(8);

    if (lookupError) throw new Error('CNC records unavailable or access denied');
    const historical = ((hist ?? []) as Array<Record<string, unknown>>).map((r) => ({
        spindle_rpm:   (r.spindle_rpm   as number | null) ?? null,
        feed_mm_min:   (r.feed_mm_min   as number | null) ?? null,
        plunge_mm_min: (r.plunge_mm_min as number | null) ?? null,
        stepdown_mm:   (r.stepdown_mm   as number | null) ?? null,
        stepover_pct:  (r.stepover_pct  as number | null) ?? null,
        chipload_mm:   (r.chipload_mm   as number | null) ?? null,
        coolant:       (r.coolant       as string | null) ?? null,
        notes:         (r.notes         as string | null) ?? null,
        source:        (r.source        as string | null) ?? null,
        confidence:    (r.confidence    as number | null) ?? null,
        verified:      Boolean(r.verified)
    }));

    let recommendation: FeedsSpeedsResult['recommendation'] = null;
    try {
        const sys = `You are a CNC operations engineer. Given an operation request,
historical feeds/speeds rows, and vendor datasheet excerpts, output a JSON object
with: spindle_rpm, feed_mm_min, plunge_mm_min, stepdown_mm, stepover_pct, notes,
confidence (0..1), rationale. Use SI units. Be conservative on materials you
have no data for. Output ONLY the JSON, no prose.`;
        const usr = JSON.stringify({
            request: args,
            historical: historical.slice(0, 5)
        });
        const txt = await openRouterComplete([
            { role: 'system', content: sys },
            { role: 'user', content: usr }
        ], {
            model: MODEL.engineer.primary,
            temperature: 0.2,
            jsonMode: true,
            maxTokens: 1200
        });
        const start = txt.indexOf('{');
        const end = txt.lastIndexOf('}');
        if (start >= 0 && end > start) {
            recommendation = JSON.parse(txt.slice(start, end + 1));
        }
    } catch (err) {
        logger.warn('feeds/speeds LLM unavailable; returning historical only', { reason: 'provider_unavailable' });
    }

    return { historical, recommendation };
}
