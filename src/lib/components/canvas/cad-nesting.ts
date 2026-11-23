/**
 * Rectangular sheet nesting (MaxRects, best-short-side-fit).
 *
 * Parts are packed by their bounding boxes, optionally turned 90°, onto as
 * many sheets as needed. This is a production planning aid: it never claims
 * true-shape nesting, and the utilisation it reports is the share of the
 * usable sheet covered by part bounding boxes.
 */
export interface NestPart { id: string; w: number; h: number }
export interface NestOptions {
  sheetW: number; sheetH: number;
  /** Clear border kept free on every sheet edge. */
  margin: number;
  /** Minimum distance between neighbouring parts (spacing + kerf). */
  gap: number;
  allowRotate: boolean;
  maxSheets?: number;
}
export interface NestPlacement { id: string; sheet: number; x: number; y: number; w: number; h: number; rotated: boolean }
export interface NestResult {
  placements: NestPlacement[];
  /** Parts that cannot fit even on an empty sheet. */
  oversized: string[];
  /** Parts left over because maxSheets was reached. */
  unplaced: string[];
  sheets: number;
  /** Bounding-box coverage of the usable area, 0..1, per sheet. */
  utilisation: number[];
  partArea: number;
}
export type NestError = 'nestSheetSize' | 'nestSpacing' | 'nestNoParts';

interface Rect { x: number; y: number; w: number; h: number }
const EPS = 1e-6;
export const MAX_NEST_PARTS = 500;
export const MAX_NEST_SHEETS = 50;

export function validateNestOptions(options: NestOptions): NestError | null {
  const { sheetW, sheetH, margin, gap } = options;
  if (![sheetW, sheetH].every(v => Number.isFinite(v) && v > 0)) return 'nestSheetSize';
  if (![margin, gap].every(v => Number.isFinite(v) && v >= 0)) return 'nestSpacing';
  if (sheetW - 2 * margin <= EPS || sheetH - 2 * margin <= EPS) return 'nestSpacing';
  return null;
}

const contains = (a: Rect, b: Rect) =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;

class Bin {
  free: Rect[];
  used: Rect[] = [];
  constructor(readonly w: number, readonly h: number) { this.free = [{ x: 0, y: 0, w, h }]; }

  find(w: number, h: number, rotate: boolean) {
    let best: { rect: Rect; rotated: boolean; short: number; long: number } | null = null;
    const consider = (fw: number, fh: number, rotated: boolean) => {
      for (const r of this.free) {
        if (fw > r.w + EPS || fh > r.h + EPS) continue;
        const short = Math.min(r.w - fw, r.h - fh), long = Math.max(r.w - fw, r.h - fh);
        if (!best || short < best.short - EPS || (Math.abs(short - best.short) <= EPS && long < best.long - EPS) ||
          (Math.abs(short - best.short) <= EPS && Math.abs(long - best.long) <= EPS && (r.y < best.rect.y - EPS || (Math.abs(r.y - best.rect.y) <= EPS && r.x < best.rect.x))))
          best = { rect: { x: r.x, y: r.y, w: fw, h: fh }, rotated, short, long };
      }
    };
    consider(w, h, false);
    if (rotate && Math.abs(w - h) > EPS) consider(h, w, true);
    return best;
  }

  place(rect: Rect) {
    const next: Rect[] = [];
    for (const r of this.free) {
      if (rect.x >= r.x + r.w - EPS || rect.x + rect.w <= r.x + EPS || rect.y >= r.y + r.h - EPS || rect.y + rect.h <= r.y + EPS) { next.push(r); continue; }
      if (rect.x > r.x + EPS) next.push({ x: r.x, y: r.y, w: rect.x - r.x, h: r.h });
      if (rect.x + rect.w < r.x + r.w - EPS) next.push({ x: rect.x + rect.w, y: r.y, w: r.x + r.w - rect.x - rect.w, h: r.h });
      if (rect.y > r.y + EPS) next.push({ x: r.x, y: r.y, w: r.w, h: rect.y - r.y });
      if (rect.y + rect.h < r.y + r.h - EPS) next.push({ x: r.x, y: rect.y + rect.h, w: r.w, h: r.y + r.h - rect.y - rect.h });
    }
    this.free = next.filter((a, i) => !next.some((b, j) => j !== i && contains(b, a) && (!contains(a, b) || j < i)));
    this.used.push(rect);
  }
}

/**
 * Each part is inflated by `gap` on its right and bottom; the usable area is
 * inflated by the same amount so the last row and column may touch the margin.
 */
export function nestParts(parts: readonly NestPart[], options: NestOptions): NestResult | NestError {
  const invalid = validateNestOptions(options);
  if (invalid) return invalid;
  const candidates = parts.filter(p => Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > EPS && p.h > EPS);
  const valid = candidates.slice(0, MAX_NEST_PARTS);
  if (!valid.length) return 'nestNoParts';
  const { margin, gap, allowRotate } = options;
  const usableW = options.sheetW - 2 * margin + gap, usableH = options.sheetH - 2 * margin + gap;
  const maxSheets = Math.max(1, Math.min(MAX_NEST_SHEETS, Math.floor(options.maxSheets ?? MAX_NEST_SHEETS)));
  const fits = (p: NestPart) => {
    const w = p.w + gap, h = p.h + gap;
    return (w <= usableW + EPS && h <= usableH + EPS) || (allowRotate && h <= usableW + EPS && w <= usableH + EPS);
  };
  const oversized = valid.filter(p => !fits(p)).map(p => p.id);
  // Largest first: by long side, then area. Stable on id for repeatable plans.
  const queue = valid.filter(fits).sort((a, b) =>
    Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bins: Bin[] = [];
  const placements: NestPlacement[] = [];
  const unplaced = candidates.slice(MAX_NEST_PARTS).map(part => part.id);
  for (const part of queue) {
    let done = false;
    for (let s = 0; s <= bins.length && !done; s++) {
      if (s === bins.length) {
        if (bins.length >= maxSheets) break;
        bins.push(new Bin(usableW, usableH));
      }
      const hit = bins[s].find(part.w + gap, part.h + gap, allowRotate);
      if (!hit) continue;
      bins[s].place(hit.rect);
      placements.push({
        id: part.id, sheet: s, x: margin + hit.rect.x, y: margin + hit.rect.y,
        w: hit.rotated ? part.h : part.w, h: hit.rotated ? part.w : part.h, rotated: hit.rotated
      });
      done = true;
    }
    if (!done) unplaced.push(part.id);
  }
  const usableArea = (options.sheetW - 2 * margin) * (options.sheetH - 2 * margin);
  const utilisation = bins.map((_, s) => Math.min(1, placements.filter(p => p.sheet === s).reduce((sum, p) => sum + p.w * p.h, 0) / usableArea));
  return {
    placements, oversized, unplaced, sheets: bins.length, utilisation,
    partArea: placements.reduce((sum, p) => sum + p.w * p.h, 0)
  };
}

/** Round 6 · material bill for a nest: whole sheets, their area and an optional cost. */
export interface NestMaterial { sheets: number; areaM2: number; cost: number | null; perPartCost: number | null }
export function nestMaterial(result: Pick<NestResult, 'sheets' | 'placements'>, sheetWmm: number, sheetHmm: number, pricePerSheet?: number): NestMaterial {
  const sheets = Math.max(0, Math.floor(result.sheets));
  const area = Number.isFinite(sheetWmm) && Number.isFinite(sheetHmm) && sheetWmm > 0 && sheetHmm > 0 ? sheetWmm * sheetHmm / 1e6 : 0;
  const price = typeof pricePerSheet === 'number' && Number.isFinite(pricePerSheet) && pricePerSheet >= 0 ? pricePerSheet : null;
  const cost = price === null ? null : Math.round(price * sheets * 100) / 100;
  const placed = result.placements.length;
  return { sheets, areaM2: area * sheets, cost, perPartCost: cost === null || !placed ? null : Math.round(cost / placed * 100) / 100 };
}
