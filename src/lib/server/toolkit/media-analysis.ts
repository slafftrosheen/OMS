/** Typed multimodal payloads for private Toolkit assets. Never hand a private
 * storage URL or arbitrary browser-provided data URL to a model.
 */
export type ToolkitMediaKind = 'image' | 'pdf';
export type ToolkitPdfEngine = 'cloudflare-ai' | 'mistral-ocr';

export const MAX_ANALYSIS_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ANALYSIS_PDF_BYTES = 12 * 1024 * 1024;

export function toolkitMediaKind(mime: unknown): ToolkitMediaKind | null {
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}
export function toolkitMediaLimit(kind: ToolkitMediaKind) {
  return kind === 'image' ? MAX_ANALYSIS_IMAGE_BYTES : MAX_ANALYSIS_PDF_BYTES;
}
export function toolkitPdfEngine(requestedOcr: unknown, allowedOcr: boolean): ToolkitPdfEngine | null {
  if (requestedOcr === true) return allowedOcr ? 'mistral-ocr' : null;
  return 'cloudflare-ai'; // explicitly pins the no-OCR engine; never default to paid OCR.
}
export function toolkitMediaContent(filename: string, mime: string, bytes: Uint8Array) {
  const kind = toolkitMediaKind(mime);
  if (!kind) throw new Error('Unsupported file type for multimodal analysis');
  if (!bytes.byteLength || bytes.byteLength > toolkitMediaLimit(kind)) {
    throw new Error('File is larger than the multimodal analysis limit');
  }
  const data = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
  if (kind === 'image') return { type: 'image_url', image_url: { url: data } };
  return { type: 'file', file: { filename: filename.slice(0, 180), file_data: data } };
}

/** Optional provider annotations are evidence, not model conclusions.
 * Never forward embedded base64 PDF page images to the browser or into Canvas.
 */
export function extractedPdfEvidence(annotations: unknown, limit = 6000): string {
  if (!Array.isArray(annotations)) return '';
  const chunks: string[] = [];
  for (const item of annotations.slice(0, 10)) {
    if (!item || item.type !== 'file' || !Array.isArray(item.file?.content)) continue;
    for (const part of item.file.content.slice(0, 64)) {
      if (part?.type === 'text' && typeof part.text === 'string') {
        chunks.push(part.text);
      }
      if (chunks.join('\n').length >= limit) break;
    }
    if (chunks.join('\n').length >= limit) break;
  }
  return chunks.join('\n').slice(0, limit).trim();
}
