// RAG knowledge search — bge-m3 dense text retrieval + bge-reranker cross-encoder
// + ColQwen2 vision retrieval for image-heavy PDFs.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MODEL, AILAB } from '$lib/server/config';
import { swarmEmbed, swarmSidecar } from '$lib/server/ai/swarm';
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

// ─── ColQwen2 vision retrieval ────────────────────────────────────────────────

/**
 * Query the knowledge base using ColQwen2 late-interaction image embeddings.
 * This is complementary to text search — chunks whose embedding_img was produced
 * from rendered PDF pages / images are surfaced here even when their OCR text
 * is sparse or missing.
 *
 * The sidecar at /colpali/embed_query converts the text query to a ColQwen2
 * query embedding (768-dim) compatible with match_knowledge_image().
 */
export async function searchKnowledgeImage(
    query: string,
    top_k = 4
): Promise<KnowledgeHit[]> {
    const query_ = (query ?? '').trim();
    if (!query_) return [];

    let embedding: number[];
    try {
        const { data } = await swarmSidecar<{ embedding: number[] }>(
            'colpali',
            '/colpali/embed_query',
            { query: query_, model: MODEL.colpali.primary },
            { timeoutMs: 30_000 }
        );
        embedding = data.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) return [];
    } catch (err) {
        logger.warn('ColQwen2 embed_query failed', { error: (err as Error).message });
        return [];
    }

    const db = admin();
    const { data, error } = await db.rpc('match_knowledge_image', {
        query_embedding: embedding,
        match_threshold: 0.25,
        match_count: top_k * 2
    });
    if (error) {
        logger.error('match_knowledge_image failed', new Error(error.message));
        return [];
    }

    const rows = (data ?? []) as Array<{
        id: string;
        source_id: string;
        title: string;
        page: number | null;
        content: string;
        similarity: number;
    }>;

    return rows.slice(0, top_k).map((r) => ({
        chunk_id: r.id,
        source_id: r.source_id,
        title: r.title,
        page: r.page,
        content: r.content,
        score: r.similarity
    }));
}
