// Multi-modal content extraction for the ingestion pipeline.
//
// Strategy:
//   * Plain text / markdown / CSV → return verbatim, no LLM hop.
//   * PDF / image / office docs → POST the file to the AI node sidecar's
//     `/extract` endpoint, which runs Qwen2.5-VL-7B (or fallback) page-by-page
//     to produce layout-aware markdown + table JSON + figure captions.
//   * Audio / video → POST to the sidecar's `/asr` endpoint (faster-whisper
//     large-v3-turbo). Return the transcript as a single page.
//   * URL → fetch + cheerio strip (already handled by the existing crawler;
//     ingestor reuses chunkMarkdown on the resulting plain text).
//
// The sidecar contract is small enough to swap implementations:
//   POST /extract   multipart/form-data { file, mime, dpi, model? }
//                   → { pages: [{page, markdown, tables, figures}], language }
//   POST /asr       multipart/form-data { file, language? }
//                   → { language, segments: [{start,end,text}], text }

import { swarmSidecarUpload, swarmSidecar } from '$lib/server/ai/swarm';
import { AILAB, MODEL } from '$lib/server/config';

export interface ExtractedPage {
    page: number;          // 1-indexed
    markdown: string;
    tables?: unknown[];
    figures?: Array<{ caption?: string; bbox?: unknown }>;
}

export interface ExtractionResult {
    language?: string;
    pages: ExtractedPage[];
    /** Full transcript text for audio/video */
    transcript?: string;
}

/** Extract text + structure from a binary file via the AI node sidecar. */
export async function extractFile(
    fileBuf: Uint8Array,
    mime: string,
    filename: string
): Promise<ExtractionResult> {
    if (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'text/markdown' ||
        mime === 'text/csv'
    ) {
        const txt = new TextDecoder('utf-8', { fatal: false }).decode(fileBuf);
        return { pages: [{ page: 1, markdown: txt }] };
    }

    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
        const form = new FormData();
        form.append('file', new Blob([fileBuf as BlobPart], { type: mime }), filename);
        form.append('model', MODEL.asr.primary);
        const { response } = await swarmSidecarUpload('asr', '/asr', form, {
            timeoutMs: 600_000
        });
        const j = (await response.json()) as {
            text?: string;
            language?: string;
            segments?: Array<{ start: number; end: number; text: string }>;
        };
        return {
            language: j.language,
            transcript: j.text ?? '',
            pages: [{ page: 1, markdown: j.text ?? '' }]
        };
    }

    // PDF / image / office / cad → vision-language extractor.
    const form = new FormData();
    form.append('file', new Blob([fileBuf as BlobPart], { type: mime }), filename);
    form.append('mime', mime);
    form.append('dpi', String(AILAB.knowledge_pdfDpi));
    form.append('model', MODEL.vision.primary);
    form.append('fallback_model', MODEL.vision.fallback);
    const { response } = await swarmSidecarUpload('vision', '/extract', form, {
        timeoutMs: 600_000
    });
    return (await response.json()) as ExtractionResult;
}

export interface ImageEmbedding {
    vector: number[];
    model: string;
}

/** Embed an image (or page-rendered image) cross-modally via the sidecar. */
export async function embedImage(imageBuf: Uint8Array, mime: string): Promise<ImageEmbedding> {
    const form = new FormData();
    form.append('file', new Blob([imageBuf as BlobPart], { type: mime }), 'image');
    form.append('model', MODEL.embedImage.primary);
    const { response } = await swarmSidecarUpload('embed', '/embed-image', form);
    const j = (await response.json()) as { embedding: number[]; model?: string };
    return { vector: j.embedding, model: j.model ?? MODEL.embedImage.primary };
}

/** Cross-encoder rerank (sidecar) — returns scores aligned to inputs. */
export async function rerank(
    query: string,
    candidates: string[]
): Promise<number[]> {
    if (candidates.length === 0) return [];
    const { data } = await swarmSidecar<{ scores: number[] }>('rerank', '/rerank', {
        query,
        candidates,
        model: MODEL.rerank.primary,
        fallback_model: MODEL.rerank.fallback
    });
    return data.scores;
}

/** ColQwen2 page embedding — image-as-document late interaction. */
export async function colpaliEmbed(
    imageBuf: Uint8Array,
    mime: string
): Promise<{ vectors: number[][] }> {
    const form = new FormData();
    form.append('file', new Blob([imageBuf as BlobPart], { type: mime }), 'image');
    form.append('model', MODEL.colpali.primary);
    const { response } = await swarmSidecarUpload('colpali', '/colpali/embed', form);
    return (await response.json()) as { vectors: number[][] };
}
