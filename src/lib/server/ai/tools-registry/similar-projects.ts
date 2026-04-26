// "We've done something like this before" — semantic search over portfolio
// + project knowledge sources, plus draft_orders metadata for matched titles.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODEL } from '$lib/server/config';
import { swarmEmbed } from '$lib/server/ai/swarm';
import { logger } from '$lib/server/logging/logger';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

export interface SimilarProjectHit {
    chunk_id: string;
    source_id: string;
    title: string;
    page: number | null;
    snippet: string;
    similarity: number;
}

export interface SimilarProjectsResult {
    knowledge_hits: SimilarProjectHit[];
    matched_orders: Array<{
        id: string;
        po_number: string;
        title: string;
        status: string;
        client: string | null;
    }>;
    embed_model: string;
}

export async function findSimilarProjects(args: { query: string }): Promise<SimilarProjectsResult> {
    const query = args.query.trim();
    if (!query) {
        return { knowledge_hits: [], matched_orders: [], embed_model: '' };
    }

    const { vector, model } = await swarmEmbed(query, MODEL.embed);
    const db = admin();

    const { data, error } = await db.rpc('match_similar_projects', {
        query_embedding: vector,
        match_threshold: 0.35,
        match_count: 6
    });
    if (error) {
        logger.error('match_similar_projects failed', new Error(error.message));
    }
    const hits = ((data ?? []) as Array<{
        chunk_id: string;
        source_id: string;
        title: string;
        page: number | null;
        snippet: string;
        similarity: number;
    }>);

    // Cross-reference with draft_orders by title fuzzy match.
    const orderMatches: SimilarProjectsResult['matched_orders'] = [];
    if (hits.length > 0) {
        const titles = [...new Set(hits.map((h) => h.title).filter(Boolean))];
        for (const t of titles.slice(0, 5)) {
            const { data: orders } = await db
                .from('draft_orders')
                .select('id, po_number, title, status, client')
                .ilike('title', `%${t}%`)
                .limit(3);
            for (const o of (orders ?? []) as Array<{
                id: string; po_number: string; title: string; status: string; client: string | null;
            }>) {
                if (!orderMatches.some((m) => m.id === o.id)) orderMatches.push(o);
            }
        }
    }

    return { knowledge_hits: hits, matched_orders: orderMatches, embed_model: model };
}
