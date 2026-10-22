export type PdfNote = { id: string; x: number; y: number; text: string };
export type PdfRectangle = { id: string; x: number; y: number; w: number; h: number };

// Keep the original first-page keys so existing local annotations survive.
export function annotationKey(po: string, revision: string, page = 1) {
  const currentPage = Number.isSafeInteger(page) && page > 1 ? page : 1;
  return `rf_pdf_notes_${po}_${revision}${currentPage > 1 ? `_page_${currentPage}` : ''}`;
}
const coordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
function storedArray(raw: string | null): any[] {
  // Loading is lossless for valid legacy content. Creation/input limits belong
  // to the editor; applying them here would overwrite stored notes on viewing.
  try { const data = JSON.parse(raw || '[]'); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
export function readPdfNotes(raw: string | null): PdfNote[] {
  const seen = new Set<string>();
  return storedArray(raw).filter(value => {
    if (!value || typeof value.id !== 'string' || seen.has(value.id) ||
      !coordinate(value.x) || !coordinate(value.y) || typeof value.text !== 'string') return false;
    seen.add(value.id); return true;
  }).map(({ id, x, y, text }) => ({ id, x, y, text }));
}
export function readPdfRectangles(raw: string | null): PdfRectangle[] {
  const seen = new Set<string>();
  return storedArray(raw).filter(value => {
    if (!value || typeof value.id !== 'string' || seen.has(value.id) ||
      !coordinate(value.x) || !coordinate(value.y) || !coordinate(value.w) || !coordinate(value.h)) return false;
    seen.add(value.id); return true;
  }).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
}
