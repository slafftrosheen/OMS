/** Upload manager-shared images/PDFs and place durable DocumentShapes on the current canvas. */
export interface ToolkitImportResult { imported: number; errors: string[]; }
export interface ToolkitPosition { x: number; y: number; }
export function isSupportedToolkitAsset(file: File): boolean {
  return /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/i.test(file.type) ||
    /\.(png|jpe?g|webp|gif|pdf)$/i.test(file.name);
}
function resolvedMime(file: File): string {
  if (/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/i.test(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf'
  };
  return map[ext ?? ''] ?? file.type;
}
export async function importToolkitFiles(
  editor: any, boardId: string, files: File[], point?: ToolkitPosition,
  onProgress?: (message: string) => void
): Promise<ToolkitImportResult> {
  const errors: string[] = [];
  let imported = 0;
  const center = editor.getViewportPageBounds?.().center ?? { x: 0, y: 0 };
  const origin = point ?? { x: center.x - 200, y: center.y - 150 };
  for (const [index, original] of files.entries()) {
    const file = new File([original], original.name, { type: resolvedMime(original) });
    if (!isSupportedToolkitAsset(file)) {
      errors.push(`${file.name}: unsupported file. Use PNG, JPEG, WebP, GIF or PDF.`);
      continue;
    }
    if (file.size > 25 * 1024 * 1024) {
      errors.push(`${file.name}: the 25 MB limit was exceeded.`);
      continue;
    }
    try {
      onProgress?.(`Importing ${file.name} (${index + 1}/${files.length})…`);
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/toolkit/assets/${encodeURIComponent(boardId)}`, {
        method: 'POST', body
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) throw new Error(result.message || result.error || 'Upload failed');
      const pdf = result.mime === 'application/pdf';
      editor.createShape({
        type: 'document', x: origin.x + imported * 40, y: origin.y + imported * 36,
        props: {
          w: pdf ? 490 : 430, h: pdf ? 580 : 320,
          title: result.fileName, content: '', status: 'ready',
          kind: pdf ? 'pdf' : 'image', url: result.url, mime: result.mime,
          fileId: result.id, fit: 'contain', opacity: 100, pdfPage: 1
        }
      });
      imported++;
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Could not upload'}`);
    }
  }
  onProgress?.('');
  return { imported, errors };
}
