// Markdown-aware chunker shared by the ingestion worker and the crawler.
// Splits by heading boundary, then paragraph, then word boundary, with
// configurable overlap. Token count is approximated as chars/4.

import { AILAB } from '$lib/server/config';

export interface Chunk {
    content: string;
    page?: number;
    chunk_index: number;
    token_count: number;
}

export interface ChunkOptions {
    maxChars?: number;
    overlap?: number;
    page?: number;
    startIndex?: number;
}

export function chunkMarkdown(input: string, opts: ChunkOptions = {}): Chunk[] {
    const max = opts.maxChars ?? AILAB.knowledge_chunkSize;
    const overlap = opts.overlap ?? AILAB.knowledge_overlap;
    const page = opts.page;
    const out: Chunk[] = [];
    const text = (input ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return out;

    // First split on markdown headings — preserves doc structure.
    const sections = text.split(/(?=^#{1,6}\s)/m).filter((s) => s.trim());
    let idx = opts.startIndex ?? 0;

    for (const section of sections) {
        if (section.length <= max) {
            out.push({
                content: section.trim(),
                page,
                chunk_index: idx++,
                token_count: Math.ceil(section.length / 4)
            });
            continue;
        }

        // Split a long section by paragraph, then word-pack with overlap.
        const paragraphs = section.split(/\n\s*\n/);
        let buf = '';
        for (const para of paragraphs) {
            if (buf.length + para.length + 2 <= max) {
                buf = buf ? `${buf}\n\n${para}` : para;
            } else {
                if (buf.trim()) {
                    out.push({
                        content: buf.trim(),
                        page,
                        chunk_index: idx++,
                        token_count: Math.ceil(buf.length / 4)
                    });
                }
                if (para.length <= max) {
                    buf = para;
                } else {
                    // Long paragraph → word-pack with overlap.
                    const words = para.split(/\s+/);
                    let win = '';
                    for (const w of words) {
                        if (win.length + w.length + 1 > max) {
                            out.push({
                                content: win.trim(),
                                page,
                                chunk_index: idx++,
                                token_count: Math.ceil(win.length / 4)
                            });
                            // overlap: keep the last `overlap` chars
                            win = win.slice(-overlap);
                        }
                        win = win ? `${win} ${w}` : w;
                    }
                    buf = win;
                }
            }
        }
        if (buf.trim()) {
            out.push({
                content: buf.trim(),
                page,
                chunk_index: idx++,
                token_count: Math.ceil(buf.length / 4)
            });
        }
    }
    return out;
}
