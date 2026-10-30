import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import { normalizeCanvasMediaUrl, type CanvasLinkMetadata } from '$lib/components/canvas/toolkit-media-url';
import { isBlockedCrawlAddress } from '$lib/server/ai/tools-registry/web-search';

const MAX_BYTES = 768 * 1024;
const TIMEOUT_MS = 8_000;
export type PreviewLookup = (host: string) => Promise<Array<{ address: string; family: number }>>;

async function withinDeadline<T>(operation: () => Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Link preview timed out');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Link preview timed out')), remaining);
      timer.unref?.();
    })]);
  } finally { clearTimeout(timer!); }
}

export async function resolvePreviewTarget(input: string, lookup: PreviewLookup = host => dnsLookup(host, { all: true })) {
  const value = normalizeCanvasMediaUrl(input);
  if (!value) throw new Error('Only public HTTP or HTTPS links are supported');
  const url = new URL(value);
  const addresses = await lookup(url.hostname);
  if (!addresses.length || addresses.some(item => !isIP(item.address) || isBlockedCrawlAddress(item.address))) {
    throw new Error('Link must resolve to a public website');
  }
  return { url, address: addresses[0] };
}

export function parseCanvasLinkMetadata(html: string, finalUrl: string): CanvasLinkMetadata {
  const $ = cheerio.load(html);
  const meta = (name: string) => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content')?.trim() || '';
  const clean = (value: string, length: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
  const image = meta('og:image') || meta('twitter:image');
  let imageUrl: string | null = null;
  try { if (image) imageUrl = normalizeCanvasMediaUrl(new URL(image, finalUrl).href); } catch { /* invalid metadata ignored */ }
  return {
    title: clean(meta('og:title') || meta('twitter:title') || $('title').first().text(), 180),
    description: clean(meta('og:description') || meta('twitter:description') || meta('description'), 500),
    siteName: clean(meta('og:site_name') || new URL(finalUrl).hostname, 100),
    ...(imageUrl ? { image: imageUrl } : {})
  };
}

/** Pin the validated DNS answer into the actual socket lookup, and revalidate
 * every redirect. No cookies, authorization headers or arbitrary HTML reach UI. */
export async function fetchCanvasLinkPreview(input: string): Promise<CanvasLinkMetadata> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = input;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const { url, address } = await withinDeadline(() => resolvePreviewTarget(current), deadline);
    const result = await new Promise<{ redirect?: string; html?: string }>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: 'GET', agent: false,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'OMS-LinkPreview/1.0' },
        lookup: ((_host: unknown, options: { all?: boolean }, callback: (...values: any[]) => void) =>
          options?.all ? callback(null, [address]) : callback(null, address.address, address.family)) as any
      }, response => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          // Parse redirect URLs in the awaited loop, outside this EventEmitter
          // callback: a malformed Location must reject, never crash the process.
          const location = response.headers.location;
          response.destroy(); resolve({ redirect: location }); return;
        }
        if (status < 200 || status >= 300) { response.destroy(); reject(new Error('Website preview unavailable')); return; }
        if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers['content-type'] || '')) {
          response.destroy(); resolve({}); return;
        }
        if (Number(response.headers['content-length'] || 0) > MAX_BYTES) { response.destroy(); reject(new Error('Website is too large to preview')); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) { response.destroy(new Error('Website is too large to preview')); return; }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', reject);
      });
      const timer = setTimeout(() => request.destroy(new Error('Link preview timed out')), Math.max(1, deadline - Date.now()));
      request.once('close', () => clearTimeout(timer));
      request.on('error', reject); request.end();
    });
    if (result.redirect) { current = new URL(result.redirect, url).href; continue; }
    const metadata = result.html ? parseCanvasLinkMetadata(result.html, url.href) : {};
    // Images render in the browser, but still reject private DNS destinations.
    if (metadata.image) {
      try { await withinDeadline(() => resolvePreviewTarget(metadata.image!), deadline); } catch { delete metadata.image; }
    }
    return metadata;
  }
  throw new Error('Website redirects too many times');
}
