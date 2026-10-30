/** Shared URL boundary for Canvas previews, paste, and model-proposed media.
 * No arbitrary iframe HTML or provider-supplied embed URL is ever executed.
 */
export type CanvasLinkKind = 'link' | 'embed' | 'video' | 'audio' | 'image' | 'pdf';
export interface CanvasLinkMetadata {
  title?: string; description?: string; image?: string; siteName?: string;
}
export interface CanvasLinkDescriptor {
  url: string; kind: CanvasLinkKind; title: string; siteName: string; embedUrl?: string;
}

export function normalizeCanvasMediaUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) return null;
  try {
    const url = new URL(input.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['443', '80'].includes(url.port))) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    // DNS validation/pinning also runs on the server before metadata retrieval.
    // Literal IPs and intranet names have no useful place in shared link cards.
    if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(localhost|local|lan|internal|home|test)$/.test(host) || host.endsWith('.ts.net')) return null;
    return url.href;
  } catch { return null; }
}

export function canvasLinkDescriptor(input: unknown): CanvasLinkDescriptor | null {
  const normalized = normalizeCanvasMediaUrl(input);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const descriptor: CanvasLinkDescriptor = { url: normalized, kind: 'link', title: host, siteName: host };
  const segments = url.pathname.split('/').filter(Boolean);
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? segments[0]
      : segments[0] === 'watch' ? url.searchParams.get('v')
      : ['embed', 'shorts', 'live'].includes(segments[0]) ? segments[1] : null;
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      descriptor.kind = 'embed'; descriptor.siteName = 'YouTube';
      descriptor.embedUrl = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    }
  } else if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = host === 'player.vimeo.com' && segments[0] === 'video' ? segments[1] : segments[0];
    if (id && /^\d{5,12}$/.test(id)) {
      descriptor.kind = 'embed'; descriptor.siteName = 'Vimeo';
      descriptor.embedUrl = `https://player.vimeo.com/video/${id}?dnt=1`;
      const privateHash = url.searchParams.get('h') || segments[1];
      if (privateHash && /^[a-z0-9]{8,16}$/i.test(privateHash)) descriptor.embedUrl += `&h=${privateHash}`;
    }
  }
  if (descriptor.kind === 'link') {
    const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
    if (['mp4', 'webm'].includes(extension)) descriptor.kind = 'video';
    else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) descriptor.kind = 'audio';
    else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) descriptor.kind = 'image';
    else if (extension === 'pdf') descriptor.kind = 'pdf';
    if (descriptor.kind !== 'link') {
      try { descriptor.title = decodeURIComponent(segments.at(-1) || host).slice(0, 180); } catch { /* use hostname */ }
    }
  }
  return descriptor;
}

/** A pure constructor, so approved AI changes and human paste share one policy. */
export function canvasLinkShapeProps(input: unknown, metadata: CanvasLinkMetadata = {}) {
  const link = canvasLinkDescriptor(input);
  if (!link) return null;
  const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  return {
    w: link.kind === 'audio' ? 420 : 480,
    h: link.kind === 'pdf' ? 580 : link.kind === 'audio' ? 180 : link.kind === 'link' ? 300 : 330,
    title: text(metadata.title, 180) || link.title,
    content: '', status: 'ready' as const, kind: link.kind, url: link.url,
    description: text(metadata.description, 500),
    previewImage: normalizeCanvasMediaUrl(metadata.image) ?? '',
    siteName: text(metadata.siteName, 100) || link.siteName,
    embedUrl: link.embedUrl ?? '', fit: 'contain' as const, opacity: 100, pdfPage: 1
  };
}

/** Stored media are only ever referenced through the same-origin asset routes. */
export function safeCanvasDocumentUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  if (/^\/api\/(?:toolkit\/assets|files|orders\/[^/]+\/files)\/[a-zA-Z0-9/_-]+(?:\?[^#]*)?$/.test(input)) return input;
  return normalizeCanvasMediaUrl(input);
}
