// Tool: web search + single-page crawl. The deployment is air-gapped to a
// Tailnet, so by default we hit a self-hosted SearxNG (configurable). If the
// backend isn't reachable we still return a structured payload telling the
// LLM why — never leak engine errors as raw HTML.

import * as cheerio from 'cheerio';
import {
    SEARCH_BACKEND,
    SEARCH_BACKEND_URL,
    SEARCH_DEFAULT_LANG,
    CRAWL_USER_AGENT,
    CRAWL_MAX_BYTES,
    CRAWL_TIMEOUT_MS
} from '$lib/server/config';
import { logger } from '$lib/server/logging/logger';

export interface SearchHit {
    title: string;
    url: string;
    snippet: string;
    engine: string | null;
    score: number | null;
}

export interface SearchResult {
    backend: string;
    query: string;
    hits: SearchHit[];
    /** Suggested follow-up queries, when the backend supports them. */
    suggestions: string[];
    note?: string;
}

export interface SearchArgs {
    query: string;
    /** Max results to return (default 8). */
    top_k?: number;
    /** ISO language code (en, nl, …). Default from config. */
    language?: string;
    /** SearxNG categories ("general", "images", …). */
    categories?: string[];
    /** Restrict to one or more domains. */
    site?: string[];
}

export async function webSearch(args: SearchArgs): Promise<SearchResult> {
    const query = (args.query ?? '').trim();
    if (!query) {
        return { backend: SEARCH_BACKEND, query, hits: [], suggestions: [], note: 'empty query' };
    }

    const top = Math.min(Math.max(args.top_k ?? 8, 1), 25);
    const lang = args.language ?? SEARCH_DEFAULT_LANG;

    // SearxNG is the only supported backend out-of-the-box. Adding another
    // engine = add another branch here. We keep the LLM contract stable.
    if (SEARCH_BACKEND !== 'searxng') {
        return {
            backend: SEARCH_BACKEND,
            query,
            hits: [],
            suggestions: [],
            note: `Backend "${SEARCH_BACKEND}" is not implemented. Set SEARCH_BACKEND=searxng.`
        };
    }

    let q = query;
    if (args.site && args.site.length > 0) {
        q += ' ' + args.site.map((s) => `site:${s}`).join(' OR ');
    }

    const url = new URL(`${SEARCH_BACKEND_URL}/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', lang);
    if (args.categories && args.categories.length > 0) {
        url.searchParams.set('categories', args.categories.join(','));
    }

    {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CRAWL_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': CRAWL_USER_AGENT
                },
                signal: ctrl.signal
            });
            if (!res.ok) {
                return {
                    backend: SEARCH_BACKEND,
                    query,
                    hits: [],
                    suggestions: [],
                    note: `SearxNG returned ${res.status}. Verify ${SEARCH_BACKEND_URL}.`
                };
            }
            const j = (await res.json()) as {
                results?: Array<{
                    title?: string;
                    url?: string;
                    content?: string;
                    engine?: string;
                    score?: number;
                }>;
                suggestions?: string[];
            };
            const hits: SearchHit[] = (j.results ?? []).slice(0, top).map((r) => ({
                title: r.title ?? '',
                url: r.url ?? '',
                snippet: (r.content ?? '').slice(0, 600),
                engine: r.engine ?? null,
                score: typeof r.score === 'number' ? r.score : null
            }));
            return {
                backend: SEARCH_BACKEND,
                query,
                hits,
                suggestions: (j.suggestions ?? []).slice(0, 5)
            };
        } catch (err) {
            logger.warn('webSearch failed', { error: (err as Error).message });
            return {
                backend: SEARCH_BACKEND,
                query,
                hits: [],
                suggestions: [],
                note: `Search backend unreachable: ${(err as Error).message}`
            };
        } finally {
            clearTimeout(timer);
        }
    }
}

// ─── Crawl ──────────────────────────────────────────────────────────────────

export interface CrawlArgs {
    url: string;
    /** Optional CSS selector to scope the extract. */
    selector?: string;
    /** When true, return links discovered on the page. */
    include_links?: boolean;
    /** Max characters of text to return. */
    max_chars?: number;
}

export interface CrawlResult {
    url: string;
    final_url: string;
    title: string;
    text: string;
    links: string[];
    bytes: number;
    mime: string;
    note?: string;
}

export async function crawlUrl(args: CrawlArgs): Promise<CrawlResult> {
    const target = (args.url ?? '').trim();
    if (!/^https?:\/\//i.test(target)) {
        throw new Error('crawlUrl: url must start with http:// or https://');
    }

    {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), CRAWL_TIMEOUT_MS);
        try {
            const res = await fetch(target, {
                headers: {
                    'User-Agent': CRAWL_USER_AGENT,
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                redirect: 'follow',
                signal: ctrl.signal
            });
            const mime = (res.headers.get('content-type') ?? 'text/html').split(';')[0].trim();
            const finalUrl = res.url || target;
            if (!res.ok) {
                return {
                    url: target,
                    final_url: finalUrl,
                    title: '',
                    text: '',
                    links: [],
                    bytes: 0,
                    mime,
                    note: `HTTP ${res.status}`
                };
            }

            // Hard cap on the bytes we read so a giant PDF doesn't OOM us.
            const buf = await readBoundedBytes(res, CRAWL_MAX_BYTES);
            const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);

            if (!mime.includes('html') && !mime.includes('xml')) {
                return {
                    url: target,
                    final_url: finalUrl,
                    title: '',
                    text: '',
                    links: [],
                    bytes: buf.byteLength,
                    mime,
                    note: 'Non-HTML response — only HTML/XML pages are cleaned here.'
                };
            }

            const $ = cheerio.load(html);
            const title = $('title').first().text().trim();

            // Strip boilerplate (mirrors brand_crawler's extractor).
            $([
                'script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header',
                '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
                '[aria-hidden="true"]',
                '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
                'aside', '[class*="sidebar"]', 'form'
            ].join(', ')).remove();

            const root = args.selector
                ? $(args.selector)
                : $('main').length ? $('main')
                : $('article').length ? $('article')
                : $('body');

            // Headers → markdown so the LLM can keep section structure.
            root.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
                const tag = (el as { tagName: string }).tagName;
                const level = parseInt(tag.charAt(1), 10) || 1;
                $(el).replaceWith(`\n${'#'.repeat(level)} ${$(el).text().trim()}\n`);
            });

            const text = root
                .text()
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]+/g, ' ')
                .trim();

            const cap = Math.min(args.max_chars ?? 12_000, 64_000);
            const truncated = text.length > cap ? text.slice(0, cap) + '\n…[truncated]' : text;

            let links: string[] = [];
            if (args.include_links) {
                const seen = new Set<string>();
                const baseUrl = new URL(finalUrl);
                $('a[href]').each((_, el) => {
                    const href = $(el).attr('href');
                    if (!href) return;
                    try {
                        const u = new URL(href, baseUrl);
                        u.hash = '';
                        const s = u.toString();
                        if (!seen.has(s)) {
                            seen.add(s);
                            links.push(s);
                        }
                    } catch { /* ignore malformed */ }
                });
                links = links.slice(0, 50);
            }

            return {
                url: target,
                final_url: finalUrl,
                title,
                text: truncated,
                links,
                bytes: buf.byteLength,
                mime
            };
        } finally {
            clearTimeout(timer);
        }
    }
}

async function readBoundedBytes(res: Response, max: number): Promise<Uint8Array> {
    if (!res.body) return new Uint8Array(0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < max) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
        if (total >= max) {
            try { await reader.cancel(); } catch { /* swallow */ }
            break;
        }
    }
    const out = new Uint8Array(Math.min(total, max));
    let off = 0;
    for (const c of chunks) {
        const slice = total > max && off + c.byteLength > max
            ? c.subarray(0, max - off)
            : c;
        out.set(slice, off);
        off += slice.byteLength;
        if (off >= max) break;
    }
    return out;
}
