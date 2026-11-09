/** Original PDF page numbers, inclusive. Shared by request validation and workers. */
export interface PdfPageRange { start: number; end: number }
export interface PdfPageScope extends PdfPageRange { total: number }
export const MAX_PDF_PAGE_NUMBER = 10_000;

export function parsePdfPageRange(value: unknown, maxPages = 40): PdfPageRange | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a valid PDF page range.');
  const range = value as Record<string, unknown>;
  if (Object.keys(range).length !== 2 || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) ||
      Number(range.start) < 1 || Number(range.end) < Number(range.start) || Number(range.end) > MAX_PDF_PAGE_NUMBER) {
    throw new Error('PDF page numbers must be whole numbers from 1 to 10,000, with the last page at or after the first.');
  }
  if (Number(range.end) - Number(range.start) + 1 > maxPages) {
    throw new Error(`Choose at most ${maxPages} PDF pages for this analysis mode.`);
  }
  return { start: Number(range.start), end: Number(range.end) };
}
