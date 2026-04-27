// RAG knowledge search tool — bge-m3 retrieval + bge-reranker-v2-m3 rerank.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODEL, AILAB } from '$lib/server/config';
import { swarmEmbed } from '$lib/server/ai/swarm';
import { rerank } from '$lib/server/ai/ingest/extract';
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

export interface KnowledgeHit {
    chunk_id: string;
    source_id: string;
    title: string;
    page: number | null;
    content: string;
    score: number;
}

export interface SearchKnowledgeArgs {
    query: string;
    tags?: string[];
    top_k?: number;
    /** Skip the cross-encoder rerank step. */
    no_rerank?: boolean;
}

export async function searchKnowledge(args: SearchKnowledgeArgs): Promise<{
    hits: KnowledgeHit[];
    embed_model: string;
    rerank_model: string | null;
}> {
    const query = (args.query ?? '').trim();
    if (!query) return { hits: [], embed_model: '', rerank_model: null };

    const topK = args.top_k ?? AILAB.knowledge_topk;
    const { vector, model } = await swarmEmbed(query, MODEL.embed);

    const db = admin();
    const { data, error } = await db.rpc('match_knowledge_text', {
        query_embedding: vector,
        match_threshold: 0.4,
        match_count: Math.max(topK, AILAB.knowledge_rerankTopN * 4),
        filter_tags: args.tags && args.tags.length > 0 ? args.tags : null,
        filter_kind: null
    });
    if (error) {
        logger.error('match_knowledge_text failed', new Error(error.message));
        return { hits: [], embed_model: model, rerank_model: null };
    }

    const rows = (data ?? []) as Array<{
        id: string;
        source_id: string;
        title: string;
        page: number | null;
        content: string;
        similarity: number;
    }>;

    let scored: KnowledgeHit[] = rows.map((r) => ({
        chunk_id: r.id,
        source_id: r.source_id,
        title: r.title,
        page: r.page,
        content: r.content,
        score: r.similarity
    }));

    let rerankModel: string | null = null;
    if (!args.no_rerank && scored.length > 0) {
        try {
            const scores = await rerank(query, scored.map((h) => h.content));
            scored = scored
                .map((h, i) => ({ ...h, score: scores[i] ?? h.score }))
                .sort((a, b) => b.score - a.score);
            rerankModel = MODEL.rerank.primary;
        } catch (err) {
            logger.warn('rerank failed; falling back to vector order', { error: (err as Error).message });
        }
    }

    return {
        hits: scored.slice(0, topK),
        embed_model: model,
        rerank_model: rerankModel
    };
}
