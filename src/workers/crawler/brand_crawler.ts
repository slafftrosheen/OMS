// src/workers/crawler/brand_crawler.ts
// ─────────────────────────────────────────────────────────────────────────────
// Réclame Fabriek — Corporate Brand Crawler
//
// Specialized crawler for reclamefabriek.eu that:
//   1. Recursively discovers pages via links + optional sitemap.xml
//   2. Extracts clean text (strips nav, footer, cookie banners)
//   3. Categorizes chunks by URL structure (portfolio, service, profile, etc.)
//   4. Embeds via Ollama (nomic-embed-text)
//   5. Upserts into the company_knowledge vector table (segregated from framework_docs)
//
// Usage:
//   npx tsx src/workers/crawler/brand_crawler.ts [--max-pages 50] [--delay 200]
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import * as cheerio from 'cheerio';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Network endpoints (Tailscale) ───────────────────────────────────────────
const OLLAMA_URL = 'http://100.93.147.108:11434/api/embeddings';
const SUPABASE_URL = 'http://100.98.202.69:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BASE_URL = 'https://reclamefabriek.eu';

if (!SUPABASE_KEY) {
	console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set. Exiting.');
	process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Types ───────────────────────────────────────────────────────────────────

interface Chunk {
	category: string;
	content: string;
}

interface CrawlOptions {
	maxPages: number;
	maxChunkChars: number;
	delayMs: number;
}

const DEFAULT_OPTIONS: CrawlOptions = {
	maxPages: 50,
	maxChunkChars: 2500,
	delayMs: 200,
};

// ─── URL → Category Mapping ─────────────────────────────────────────────────

/**
 * Infer a content category from the URL path or page content.
 * This keeps chunks semantically tagged for filtered retrieval.
 */
function categorizeUrl(url: string, pageTitle: string): string {
	const path = new URL(url).pathname.toLowerCase();

	if (path.includes('portfolio') || path.includes('project') || path.includes('case') || path.includes('werk')) {
		return 'portfolio';
	}
	if (path.includes('service') || path.includes('dienst')) {
		return 'service';
	}
	if (path.includes('team') || path.includes('profile') || path.includes('over') || path.includes('about')) {
		return 'profile';
	}
	if (path.includes('contact')) {
		return 'contact';
	}
	if (path.includes('blog') || path.includes('news') || path.includes('nieuws')) {
		return 'news';
	}
	if (path === '/' || path === '') {
		return 'homepage';
	}

	// Fallback: try the page title
	const titleLower = pageTitle.toLowerCase();
	if (titleLower.includes('portfolio') || titleLower.includes('project')) return 'portfolio';
	if (titleLower.includes('service') || titleLower.includes('dienst')) return 'service';
	if (titleLower.includes('team') || titleLower.includes('over ons')) return 'profile';

	return 'general';
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[]> {
	const res = await fetch(OLLAMA_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Embedding failed (${res.status}): ${body}`);
	}

	const data = await res.json();
	return data.embedding;
}

// ─── HTML Extraction ─────────────────────────────────────────────────────────

/**
 * Extract clean text from an HTML page.
 * Aggressively strips navigation, footers, cookie banners, and boilerplate.
 */
function extractContent(html: string): { title: string; text: string; links: string[] } {
	const $ = cheerio.load(html);

	// Capture title before stripping
	const title = $('title').text().trim() || '';

	// Collect same-origin links
	const links: string[] = [];
	$('a[href]').each((_, el) => {
		const href = $(el).attr('href');
		if (href) links.push(href);
	});

	// Aggressively remove non-content elements
	const removeSelectors = [
		'script', 'style', 'noscript', 'iframe',
		'nav', 'footer', 'header',
		'[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
		'[aria-hidden="true"]',
		// Cookie banners / consent / GDPR patterns
		'[class*="cookie"]', '[class*="Cookie"]',
		'[class*="consent"]', '[class*="Consent"]',
		'[class*="gdpr"]', '[class*="GDPR"]',
		'[id*="cookie"]', '[id*="consent"]',
		// Social media widgets
		'[class*="social"]', '[class*="share"]',
		// Sidebar navigation
		'aside', '[class*="sidebar"]',
		// Form elements (contact forms, search)
		'form',
	];

	$(removeSelectors.join(', ')).remove();

	// Prefer <main> or <article>, fall back to <body>
	const container = $('main').length ? $('main')
		: $('article').length ? $('article')
		: $('body');

	// Convert headers to markdown for chunking
	container.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
		const tag = (el as cheerio.Element).tagName;
		const level = parseInt(tag.charAt(1), 10);
		const prefix = '#'.repeat(level);
		$(el).replaceWith(`\n${prefix} ${$(el).text().trim()}\n`);
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
 * Chunk text intelligently:
 * 1. Split on markdown headers to keep sections (e.g., portfolio case studies) together.
 * 2. Sub-chunk on paragraph boundaries if sections are too long.
 * 3. Final word-boundary fallback.
 */
function chunkText(text: string, category: string, maxChars: number): Chunk[] {
	const chunks: Chunk[] = [];

	// Split on header boundaries
	const sections = text.split(/(?=^#{1,6}\s)/m).filter((s) => s.trim().length > 30);

	if (sections.length === 0) {
		// No headers — treat entire text as one section
		sections.push(text.trim());
	}

	for (const section of sections) {
		if (section.length <= maxChars) {
			chunks.push({ category, content: section.trim() });
			continue;
		}

		// Sub-chunk on paragraph boundaries
		const paragraphs = section.split(/\n{2,}/);
		let buffer = '';

		for (const para of paragraphs) {
			if (buffer.length + para.length + 2 > maxChars && buffer.trim().length > 30) {
				chunks.push({ category, content: buffer.trim() });
				buffer = '';
			}
			buffer += para + '\n\n';
		}

		if (buffer.trim().length > 30) {
			chunks.push({ category, content: buffer.trim() });
		}
	}

	// Final pass: break oversized chunks on word boundaries
	const finalChunks: Chunk[] = [];
	for (const chunk of chunks) {
		if (chunk.content.length <= maxChars) {
			finalChunks.push(chunk);
			continue;
		}

		const words = chunk.content.split(/\s+/);
		let buffer = '';
		for (const word of words) {
			if (buffer.length + word.length + 1 > maxChars && buffer.trim().length > 0) {
				finalChunks.push({ category: chunk.category, content: buffer.trim() });
				buffer = '';
			}
			buffer += word + ' ';
		}
		if (buffer.trim().length > 0) {
			finalChunks.push({ category: chunk.category, content: buffer.trim() });
		}
	}

	return finalChunks;
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

async function upsertChunk(
	url: string,
	category: string,
	content: string,
	embedding: number[]
): Promise<void> {
	const { error } = await supabase
		.from('company_knowledge')
		.upsert(
			{ url, category, content, embedding, crawled_at: new Date().toISOString() },
			{ onConflict: 'url,category' }
		);

	if (error) {
		console.error(`  ❌ DB upsert error [${category}]:`, error.message);
	}
}

// ─── Sitemap Parser ─────────────────────────────────────────────────────────

/**
 * Attempt to discover pages from sitemap.xml.
 * Falls back gracefully if no sitemap exists.
 */
async function parseSitemap(baseUrl: string): Promise<string[]> {
	const urls: string[] = [];
	const sitemapUrls = [
		`${baseUrl}/sitemap.xml`,
		`${baseUrl}/sitemap_index.xml`,
	];

	for (const sitemapUrl of sitemapUrls) {
		try {
			const res = await fetch(sitemapUrl, {
				headers: { 'User-Agent': 'ReclameFabriek-BrandCrawler/1.0' },
			});
			if (!res.ok) continue;

			const xml = await res.text();
			const $ = cheerio.load(xml, { xmlMode: true });

			$('url > loc').each((_, el) => {
				const loc = $(el).text().trim();
				if (loc) urls.push(loc);
			});

			// Handle sitemap index (nested sitemaps)
			$('sitemap > loc').each((_, el) => {
				const loc = $(el).text().trim();
				if (loc) urls.push(loc);
			});

			if (urls.length > 0) {
				console.log(`  📋 Found ${urls.length} URLs in sitemap: ${sitemapUrl}`);
				break;
			}
		} catch {
			// Silently skip — sitemap is optional
		}
	}

	return urls;
}

// ─── Page Crawler ────────────────────────────────────────────────────────────

async function crawlPage(
	url: string,
	options: CrawlOptions
): Promise<string[]> {
	console.log(`\n🕷️  Crawling: ${url}`);

	let html: string;
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': 'ReclameFabriek-BrandCrawler/1.0 (corporate-indexer)',
				Accept: 'text/html',
			},
			redirect: 'follow',
		});
		if (!res.ok) {
			console.error(`  ❌ HTTP ${res.status} for ${url}`);
			return [];
		}
		// Only process HTML responses
		const contentType = res.headers.get('content-type') || '';
		if (!contentType.includes('text/html')) {
			console.log(`  ⚠️  Skipping non-HTML content (${contentType})`);
			return [];
		}
		html = await res.text();
	} catch (err) {
		console.error(`  ❌ Fetch error:`, (err as Error).message);
		return [];
	}

	const { title, text, links } = extractContent(html);

	if (text.length < 50) {
		console.log(`  ⚠️  Skipping — content too short (${text.length} chars)`);
		return links;
	}

	const category = categorizeUrl(url, title);
	const chunks = chunkText(text, category, options.maxChunkChars);
	console.log(`  📄 "${title}" → ${chunks.length} chunk(s) [${category}]`);

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const chunkCategory = chunks.length > 1
			? `${chunk.category}:part-${i + 1}`
			: chunk.category;

		process.stdout.write(`  🧠 Embedding chunk ${i + 1}/${chunks.length} [${chunkCategory}]...`);

		try {
			const embedding = await getEmbedding(chunk.content);
			await upsertChunk(url, chunkCategory, chunk.content, embedding);
			console.log(' ✓');
		} catch (err) {
			console.log(` ✗ ${(err as Error).message}`);
		}

		if (options.delayMs > 0 && i < chunks.length - 1) {
			await sleep(options.delayMs);
		}
	}

	return links;
}

// ─── Link Resolution ─────────────────────────────────────────────────────────

function resolveLinks(base: string, rawLinks: string[]): string[] {
	const baseUrl = new URL(base);
	const resolved = new Set<string>();

	for (const raw of rawLinks) {
		try {
			const full = new URL(raw, baseUrl);
			// Same origin only
			if (full.origin !== new URL(BASE_URL).origin) continue;
			// Strip hash fragments and query params for cleaner dedup
			full.hash = '';
			full.search = '';
			const normalized = full.href.replace(/\/$/, '');

			// Skip common non-content paths
			if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|zip|xml|json)$/i.test(normalized)) {
				continue;
			}

			resolved.add(normalized);
		} catch {
			// Ignore malformed URLs
		}
	}

	return Array.from(resolved);
}

// ─── Main Crawl ──────────────────────────────────────────────────────────────

async function crawlSite(options: CrawlOptions): Promise<void> {
	const visited = new Set<string>();
	const queue: string[] = [];

	// Seed from sitemap first
	const sitemapUrls = await parseSitemap(BASE_URL);
	if (sitemapUrls.length > 0) {
		queue.push(...sitemapUrls);
	}

	// Always include the homepage
	queue.push(BASE_URL.replace(/\/$/, ''));

	while (queue.length > 0 && visited.size < options.maxPages) {
		const url = queue.shift()!;
		const normalized = url.replace(/\/$/, '');

		if (visited.has(normalized)) continue;
		visited.add(normalized);

		const rawLinks = await crawlPage(normalized, options);
		const newLinks = resolveLinks(normalized, rawLinks).filter((l) => !visited.has(l));
		queue.push(...newLinks);

		// Rate limit between pages
		if (options.delayMs > 0) {
			await sleep(options.delayMs);
		}
	}

	console.log(`\n✅ Brand crawl complete. Visited ${visited.size} page(s).`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage(): void {
	console.log(`
Réclame Fabriek — Corporate Brand Crawler

Crawls reclamefabriek.eu and ingests content into the company_knowledge vector table.

Usage:
  npx tsx src/workers/crawler/brand_crawler.ts [options]

Options:
  --max-pages <n>  Maximum pages to visit (default: 50)
  --chunk-size <n> Max characters per chunk (default: 2500)
  --delay <ms>     Delay between requests (default: 200)

Examples:
  npx tsx src/workers/crawler/brand_crawler.ts
  npx tsx src/workers/crawler/brand_crawler.ts --max-pages 100 --delay 300
  npm run crawler:brand
`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		printUsage();
		process.exit(0);
	}

	const options: CrawlOptions = { ...DEFAULT_OPTIONS };

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
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

	console.log('🏭 Réclame Fabriek — Corporate Brand Crawler');
	console.log(`   Target:     ${BASE_URL}`);
	console.log(`   Max pages:  ${options.maxPages}`);
	console.log(`   Chunk size: ${options.maxChunkChars} chars`);
	console.log(`   Delay:      ${options.delayMs}ms`);
	console.log(`   Table:      company_knowledge (segregated from framework_docs)`);

	await crawlSite(options);
}

main().catch((err) => {
	console.error('💀 Fatal error:', err);
	process.exit(1);
});

export { crawlPage, crawlSite, chunkText, categorizeUrl, type CrawlOptions, type Chunk };
