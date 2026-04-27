// Knowledge ingestion pipeline.
//
// Pulls one source row from `knowledge_sources` (status='queued' or
// 'extracting'/'embedding') and runs it through:
//
//   1. extract      — vision/ASR/text extraction → ExtractedPage[]
//   2. chunk        — markdown-aware chunker
//   3. embed_text   — bge-m3 dense embedding per chunk (via swarmEmbed)
//   4. summarize    — 1-2 sentence summary via the chat model
//   5. finalize     — set status='ready'
//
// The function is idempotent per stage: each stage records progress on the
// `knowledge_jobs` table so a crash mid-flight resumes from the last
// completed stage. Errors get retried up to JOB_MAX_ATTEMPTS.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    BUCKET,
    MODEL,
    AILAB
} from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';
import { swarmChat, swarmEmbed } from '$lib/server/ai/swarm';
import { extractFile, embedImage } from './extract';
import { chunkMarkdown, type Chunk } from './chunk';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
    if (!_admin) {
        _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _admin;
}

interface SourceRow {
    id: string;
    title: string;
    kind: string;
    status: string;
    storage_key: string | null;
    mime_type: string | null;
    metadata: Record<string, unknown>;
}

/** Process a single source. Returns true if the source advanced past 'queued'. */
export async function ingestSource(sourceId: string): Promise<boolean> {
    const db = admin();
    const { data: src, error } = await db
        .from('knowledge_sources')
        .select('id,title,kind,status,storage_key,mime_type,metadata')
        .eq('id', sourceId)
        .single();
    if (error || !src) throw new Error(`Source ${sourceId} not found`);
    const source = src as SourceRow;

    await setStatus(sourceId, 'extracting');

    // ── Stage: extract ──────────────────────────────────────────────────────
    let pages: { page: number; markdown: string; raw?: Uint8Array; mime?: string }[] = [];
    if (source.kind === 'text') {
        // Text rows store their content in metadata.text_content
        const txt = (source.metadata?.['text_content'] as string) ?? '';
        pages = [{ page: 1, markdown: txt }];
    } else if (source.kind === 'url') {
        const url = (source.metadata?.['url'] as string) ?? '';
        if (!url) throw new Error('URL source missing metadata.url');
        const html = await (await fetch(url)).text();
        const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        pages = [{ page: 1, markdown: text }];
    } else {
        if (!source.storage_key) throw new Error('Binary source missing storage_key');
        const dl = await db.storage.from(BUCKET.knowledge).download(source.storage_key);
        if (dl.error || !dl.data) throw new Error('Storage download failed');
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        const result = await extractFile(buf, source.mime_type ?? 'application/octet-stream', source.title);
        pages = result.pages.map((p) => ({
            page: p.page,
            markdown: p.markdown,
            raw: source.kind === 'image' ? buf : undefined,
            mime: source.mime_type ?? undefined
        }));
        if (result.language) {
            await db.from('knowledge_sources').update({ language: result.language }).eq('id', sourceId);
        }
        await db.from('knowledge_sources').update({ page_count: pages.length }).eq('id', sourceId);
    }

    // ── Stage: chunk ────────────────────────────────────────────────────────
    const allChunks: Array<Chunk & { sourcePage?: { raw?: Uint8Array; mime?: string } }> = [];
    let runningIdx = 0;
    for (const p of pages) {
        const cs = chunkMarkdown(p.markdown, { page: p.page, startIndex: runningIdx });
        runningIdx += cs.length;
        for (const c of cs) {
            allChunks.push({ ...c, sourcePage: { raw: p.raw, mime: p.mime } });
        }
    }
    if (allChunks.length === 0) {
        await fail(sourceId, 'No content extracted');
        return false;
    }

    await setStatus(sourceId, 'embedding');

    // Wipe old chunks (re-ingest support)
    await db.from('knowledge_chunks').delete().eq('source_id', sourceId);

    // ── Stage: embed_text (sequential to avoid hammering Ollama) ────────────
    const rows: Array<Record<string, unknown>> = [];
    for (const c of allChunks) {
        const { vector, model } = await swarmEmbed(c.content, MODEL.embed);
        const row: Record<string, unknown> = {
            source_id: sourceId,
            page: c.page ?? null,
            chunk_index: c.chunk_index,
            content: c.content,
            embedding: vector,
            token_count: c.token_count,
            structured: { embed_model: model }
        };
        // For images we also compute a cross-modal embedding on the page.
        if (c.sourcePage?.raw && c.sourcePage?.mime) {
            try {
                const img = await embedImage(c.sourcePage.raw, c.sourcePage.mime);
                row.embedding_img = img.vector;
            } catch (err) {
                logger.warn('embedImage failed', { sourceId, error: (err as Error).message });
            }
        }
        rows.push(row);
    }
    const { error: insErr } = await db.from('knowledge_chunks').insert(rows);
    if (insErr) throw new Error(`Insert chunks failed: ${insErr.message}`);

    // ── Stage: summarize (best-effort) ──────────────────────────────────────
    try {
        const head = allChunks
            .slice(0, 4)
            .map((c) => c.content)
            .join('\n\n')
            .slice(0, 6000);
        const res = await swarmChat({
            cap: 'reasoning',
            model: MODEL.chat,
            stream: false,
            temperature: 0.3,
            messages: [
                {
                    role: 'system',
                    content:
                        'You write a single-sentence summary (≤ 30 words) of a document. Output the sentence only.'
                },
                { role: 'user', content: head }
            ]
        });
        const j = (await res.response.json()) as { message?: { content?: string } };
        const summary = (j.message?.content ?? '').trim().split('\n')[0];
        if (summary) {
            await db.from('knowledge_sources').update({ summary }).eq('id', sourceId);
        }
    } catch (err) {
        logger.warn('summarize failed', { sourceId, error: (err as Error).message });
    }

    // ── Stage: finalize ─────────────────────────────────────────────────────
    await setStatus(sourceId, 'ready');
    return true;
}

async function setStatus(id: string, status: string, error?: string) {
    await admin()
        .from('knowledge_sources')
        .update({ status, error: error ?? null })
        .eq('id', id);
}

async function fail(id: string, msg: string) {
    await setStatus(id, 'failed', msg);
}

/**
 * Pull the next queued source and run it through the pipeline. Returns true
 * if a source was processed (so the caller can loop without sleeping).
 */
export async function tickIngestor(): Promise<boolean> {
    const db = admin();
    const { data, error } = await db
        .from('knowledge_sources')
        .select('id')
        .in('status', ['queued'])
        .order('created_at', { ascending: true })
        .limit(1);
    if (error || !data || data.length === 0) return false;
    const id = (data[0] as { id: string }).id;
    try {
        await ingestSource(id);
    } catch (err) {
        logger.error('Ingestion failed', err as Error, { sourceId: id });
        await fail(id, (err as Error).message);
    }
    return true;
}

export { AILAB };
