// src/workers/crawler/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Réclame Fabriek — Documentation Crawler & Embedding Worker
//
// Standalone Node.js process that:
//   1. Fetches a page (or follows internal links for multi-page crawls).
//   2. Extracts meaningful text using cheerio (no heavy browser).
//   3. Chunks the text by markdown-style headers or ~500-word blocks.
//   4. Embeds each chunk via Ollama (nomic-embed-text).
//   5. Upserts the chunk + vector into the Supabase `framework_docs` table.
//
// Usage:
//   npx tsx src/workers/crawler/index.ts <url> [--follow] [--max-pages 20]
//
// Environment:
//   SUPABASE_SERVICE_ROLE_KEY  — required, your Supabase service role key.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import * as cheerio from 'cheerio';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Network endpoints (env-driven, defaults to the Tailnet topology) ───────
const OLLAMA_BASE  = (process.env.OLLAMA_URL  || `http://${process.env.OLLAMA_HOST  || '100.93.147.108'}:${process.env.OLLAMA_PORT  || '11434'}`).replace(/\/+$/, '');
const OLLAMA_URL   = `${OLLAMA_BASE}/api/embeddings`;
const SUPABASE_URL = (process.env.SUPABASE_URL || `http://${process.env.SUPABASE_HOST || '100.98.202.69'}:${process.env.SUPABASE_PORT || '54321'}`).replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EMBED_MODEL  = process.env.EMBED_MODEL || 'nomic-embed-text';

if (!SUPABASE_KEY) {
	console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set. Exiting.');
	process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Chunk {
	title: string;
	content: string;
}

interface CrawlOptions {
	/** Follow same-origin links and crawl sub-pages. */
	follow: boolean;
	/** Maximum number of pages to visit when following links. */
	maxPages: number;
	/** Maximum chunk length in characters (~500 words ≈ 2 500 chars). */
	maxChunkChars: number;
	/** Delay between embedding requests in ms (rate limiting). */
	delayMs: number;
}

const DEFAULT_OPTIONS: CrawlOptions = {
	follow: false,
	maxPages: 20,
	maxChunkChars: 2500,
	delayMs: 150,
};

// ─── Embedding ───────────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
	const res = await fetch(OLLAMA_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Embedding request failed (${res.status}): ${body}`);
	}

	const data = await res.json();
	return data.embedding;
}

// ─── HTML → Text ─────────────────────────────────────────────────────────────

/**
 * Extracts the primary textual content from an HTML page.
 * Removes scripts, styles, navigation, footers, etc.
 */
function extractText(html: string): { title: string; text: string; links: string[] } {
	const $ = cheerio.load(html);

	// Capture title before we strip elements
	const title = $('title').text().trim() || '';

	// Collect same-origin links for --follow mode
	const links: string[] = [];
	$('a[href]').each((_, el) => {
		const href = $(el).attr('href');
		if (href) links.push(href);
	});

	// Strip non-content elements
	$('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
	$('[aria-hidden="true"]').remove();

	// Prefer <main> or <article>, fall back to <body>
	const container = $('main').length ? $('main') : $('article').length ? $('article') : $('body');

	// Convert headers to markdown-style markers for chunking
	container.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
		const tag = (el as { tagName: string }).tagName;
		const level = parseInt(tag.charAt(1), 10);
		const prefix = '#'.repeat(level);
		$(el).replaceWith(`\n${prefix} ${$(el).text().trim()}\n`);
	});

	// Convert <pre>/<code> blocks to fenced markdown
	container.find('pre').each((_, el) => {
		const code = $(el).text().trim();
		$(el).replaceWith(`\n\`\`\`\n${code}\n\`\`\`\n`);
	});

	// Convert list items
	container.find('li').each((_, el) => {
		$(el).replaceWith(`\n- ${$(el).text().trim()}`);
	});

	const text = container
		.text()
		.replace(/\r\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/[ \t]+/g, ' ')
		.trim();

	return { title, text, links };
}

// ─── Chunking ────────────────────────────────────────────────────────────────

/**
 * Split text into meaningful chunks:
 * 1. First, try splitting on markdown-style headers (## Section).
 * 2. If a section is still too long, split on paragraph boundaries.
 * 3. As a last resort, split on word boundaries at maxChunkChars.
 */
function chunkText(text: string, maxChars: number): Chunk[] {
	const chunks: Chunk[] = [];

	// Split on header boundaries (# through ######)
	const headerPattern = /^(#{1,6})\s+(.+)$/gm;
	const sections: { heading: string; body: string }[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = headerPattern.exec(text)) !== null) {
		// Push preceding text as a section (no heading)
		if (match.index > lastIndex) {
			const preceding = text.slice(lastIndex, match.index).trim();
			if (preceding.length > 0) {
				sections.push({ heading: '', body: preceding });
			}
		}
		// Find the end of this section (next header or end of text)
		const nextMatch = headerPattern.exec(text);
		const endIndex = nextMatch ? nextMatch.index : text.length;

		// Reset regex to the next match position
		if (nextMatch) {
			headerPattern.lastIndex = nextMatch.index;
		}

		const body = text.slice(match.index + match[0].length, endIndex).trim();
		sections.push({ heading: match[2].trim(), body });
		lastIndex = endIndex;
	}

	// If no headers found, treat entire text as one section
	if (sections.length === 0) {
		sections.push({ heading: '', body: text.trim() });
	}

	// Sub-chunk each section if it exceeds maxChars
	for (const section of sections) {
		const fullText = section.heading
			? `${section.heading}\n${section.body}`
			: section.body;

		if (fullText.length <= maxChars) {
			if (fullText.trim().length > 20) {
				chunks.push({ title: section.heading || 'Content', content: fullText.trim() });
			}
			continue;
		}

		// Split on double-newline (paragraph) boundaries first
		const paragraphs = section.body.split(/\n{2,}/);
		let buffer = section.heading ? `${section.heading}\n` : '';

		for (const para of paragraphs) {
			if (buffer.length + para.length + 1 > maxChars && buffer.trim().length > 20) {
				chunks.push({ title: section.heading || 'Content', content: buffer.trim() });
				buffer = '';
			}
			buffer += para + '\n\n';
		}

		// Flush remaining buffer
		if (buffer.trim().length > 20) {
			chunks.push({ title: section.heading || 'Content', content: buffer.trim() });
		}
	}

	// Final pass: break any chunk that's still too large on word boundaries
	const finalChunks: Chunk[] = [];
	for (const chunk of chunks) {
		if (chunk.content.length <= maxChars) {
			finalChunks.push(chunk);
			continue;
		}

		const words = chunk.content.split(/\s+/);
		let buffer = '';
		let partNum = 1;

		for (const word of words) {
			if (buffer.length + word.length + 1 > maxChars) {
				finalChunks.push({
					title: `${chunk.title} (Part ${partNum})`,
					content: buffer.trim(),
				});
				buffer = '';
				partNum++;
			}
			buffer += word + ' ';
		}
		if (buffer.trim().length > 0) {
			finalChunks.push({
				title: partNum > 1 ? `${chunk.title} (Part ${partNum})` : chunk.title,
				content: buffer.trim(),
			});
		}
	}

	return finalChunks;
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

async function upsertChunk(
	url: string,
	title: string,
	content: string,
	embedding: number[]
): Promise<void> {
	const { error } = await supabase
		.from('framework_docs')
		.upsert(
			{ url, title, content, embedding, crawled_at: new Date().toISOString() },
			{ onConflict: 'url,title' }
		);

	if (error) {
		console.error(`  ❌ DB upsert error for "${title}":`, error.message);
	}
}

// ─── Crawl Single Page ──────────────────────────────────────────────────────

async function crawlPage(
	url: string,
	options: CrawlOptions
): Promise<string[]> {
	console.log(`\n🕷️  Crawling: ${url}`);

	let html: string;
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': 'ReclameFabriek-Crawler/1.0 (docs-indexer)',
				Accept: 'text/html',
			},
		});
		if (!res.ok) {
			console.error(`  ❌ HTTP ${res.status} for ${url}`);
			return [];
		}
		html = await res.text();
	} catch (err) {
		console.error(`  ❌ Fetch error:`, (err as Error).message);
		return [];
	}

	const { title, text, links } = extractText(html);

	if (text.length < 50) {
		console.log(`  ⚠️  Skipping — content too short (${text.length} chars)`);
		return links;
	}

	const chunks = chunkText(text, options.maxChunkChars);
	console.log(`  📄 "${title}" → ${chunks.length} chunk(s)`);

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkTitle = `${title} — ${chunk.title}`.slice(0, 255);

		process.stdout.write(`  🧠 Embedding chunk ${i + 1}/${chunks.length}...`);

		try {
			const embedding = await getEmbedding(chunk.content);
			await upsertChunk(url, chunkTitle, chunk.content, embedding);
			console.log(' ✓');
		} catch (err) {
			console.log(` ✗ ${(err as Error).message}`);
		}

		// Rate-limit to avoid flooding Ollama
		if (options.delayMs > 0 && i < chunks.length - 1) {
			await sleep(options.delayMs);
		}
	}

	return links;
}

// ─── Multi-Page Crawl ───────────────────────────────────────────────────────

function resolveLinks(base: string, rawLinks: string[]): string[] {
	const baseUrl = new URL(base);
	const resolved = new Set<string>();

	for (const raw of rawLinks) {
		try {
			const full = new URL(raw, baseUrl);
			// Same origin only
			if (full.origin !== baseUrl.origin) continue;
			// Strip hash fragments
			full.hash = '';
			// Strip trailing slash for dedup
			const normalized = full.href.replace(/\/$/, '');
			resolved.add(normalized);
		} catch {
			// Ignore malformed URLs
		}
	}

	return Array.from(resolved);
}

async function crawlSite(startUrl: string, options: CrawlOptions): Promise<void> {
	const visited = new Set<string>();
	const queue = [startUrl.replace(/\/$/, '')];

	while (queue.length > 0 && visited.size < options.maxPages) {
		const url = queue.shift()!;
		if (visited.has(url)) continue;
		visited.add(url);

		const rawLinks = await crawlPage(url, options);

		if (options.follow) {
			const newLinks = resolveLinks(url, rawLinks).filter((l) => !visited.has(l));
			queue.push(...newLinks);
		}
	}

	console.log(`\n✅ Crawl complete. Visited ${visited.size} page(s).`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage(): void {
	console.log(`
Réclame Fabriek — Documentation Crawler

Usage:
  npx tsx src/workers/crawler/index.ts <url> [options]

Options:
  --follow         Follow same-origin links (multi-page crawl)
  --max-pages <n>  Maximum pages to visit (default: 20)
  --chunk-size <n> Max characters per chunk (default: 2500)
  --delay <ms>     Delay between embedding requests (default: 150)

Examples:
  npx tsx src/workers/crawler/index.ts https://svelte.dev/docs/svelte/overview
  npx tsx src/workers/crawler/index.ts https://svelte.dev/docs --follow --max-pages 50
  npx tsx src/workers/crawler/index.ts https://kit.svelte.dev/docs --follow
`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		printUsage();
		process.exit(0);
	}

	const url = args[0];
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		console.error('❌ First argument must be a valid URL (http:// or https://).');
		process.exit(1);
	}

	const options: CrawlOptions = { ...DEFAULT_OPTIONS };

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case '--follow':
				options.follow = true;
				break;
			case '--max-pages':
				options.maxPages = parseInt(args[++i], 10) || DEFAULT_OPTIONS.maxPages;
				break;
			case '--chunk-size':
				options.maxChunkChars = parseInt(args[++i], 10) || DEFAULT_OPTIONS.maxChunkChars;
				break;
			case '--delay':
				options.delayMs = parseInt(args[++i], 10) || DEFAULT_OPTIONS.delayMs;
				break;
			default:
				console.warn(`⚠️  Unknown option: ${args[i]}`);
		}
	}

	console.log('🏭 Réclame Fabriek — Documentation Crawler');
	console.log(`   Target:     ${url}`);
	console.log(`   Follow:     ${options.follow}`);
	console.log(`   Max pages:  ${options.maxPages}`);
	console.log(`   Chunk size: ${options.maxChunkChars} chars`);
	console.log(`   Delay:      ${options.delayMs}ms`);

	await crawlSite(url, options);
}

main().catch((err) => {
	console.error('💀 Fatal error:', err);
	process.exit(1);
});

// Export for programmatic use
export { crawlPage, crawlSite, chunkText, getEmbedding, type CrawlOptions, type Chunk };
