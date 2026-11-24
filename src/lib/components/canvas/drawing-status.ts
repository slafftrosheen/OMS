import type { TLShape } from '@tldraw/tldraw';
import { CAD_APPEARANCE_TYPES } from './cad-shape-appearance';
import { vectorPaint } from './cad-vector';

/** A colour as the status bar shows it: a hex, none (crossed swatch) or mixed. */
export type DrawingStatusPaint = { kind: 'colour'; hex: string } | { kind: 'none' } | { kind: 'mixed' };
export interface DrawingSelectionSummary {
  /** Shape-type key for the copy dictionary (`rectangle`, `cad-bezier`, `group`, …) or null when mixed. */
  type: string | null;
  count: number;
  fill: DrawingStatusPaint | null;
  outline: DrawingStatusPaint | null;
  outlineWidth: number | null;
  /** A device hairline has no fixed physical width to display. */
  outlineHairline?: boolean;
}

type Theme = Record<string, { solid: string; semi?: string; pattern?: string } | unknown>;
const solid = (theme: Theme, color: unknown) => {
  const entry = typeof color === 'string' ? theme[color] as { solid?: string } | undefined : undefined;
  return entry?.solid ?? null;
};

function shapePaint(shape: TLShape, theme: Theme): { fill: DrawingStatusPaint; outline: DrawingStatusPaint; width: number | 'hairline' | null } | null {
  const props = shape.props as Record<string, unknown>;
  if (CAD_APPEARANCE_TYPES.has(shape.type)) {
    const paint = vectorPaint(shape.meta as Record<string, any>, typeof props.color === 'string' ? props.color : undefined);
    const fill: DrawingStatusPaint = paint.gradient ? { kind: 'mixed' } : !paint.fill || paint.fill === 'none' ? { kind: 'none' } : { kind: 'colour', hex: paint.fill };
    const outline: DrawingStatusPaint = !paint.stroke || paint.stroke === 'none' || paint.strokeWidth <= 0 ? { kind: 'none' } : { kind: 'colour', hex: paint.stroke };
    return { fill, outline, width: paint.hairline ? 'hairline' : Number.isFinite(paint.strokeWidth) ? paint.strokeWidth : null };
  }
  if (typeof props.color !== 'string') return null;
  const hex = solid(theme, props.color);
  if (!hex) return null;
  if (shape.type === 'text') return { fill: { kind: 'colour', hex }, outline: { kind: 'none' }, width: null };
  const fillStyle = typeof props.fill === 'string' ? props.fill : 'none';
  return { fill: fillStyle === 'none' ? { kind: 'none' } : { kind: 'colour', hex }, outline: { kind: 'colour', hex }, width: null };
}

const same = (a: DrawingStatusPaint, b: DrawingStatusPaint) =>
  a.kind === b.kind && (a.kind !== 'colour' || b.kind === 'colour' && a.hex.toLowerCase() === b.hex.toLowerCase());

/** One line of status: what is selected and its fill and outline, like a desktop vector suite. */
export function summarizeDrawingSelection(shapes: readonly TLShape[], theme: Theme): DrawingSelectionSummary {
  const typeOf = (shape: TLShape) => shape.type === 'geo' ? String((shape.props as { geo?: string }).geo ?? 'geo') : shape.type;
  const types = new Set(shapes.map(typeOf));
  const paints = shapes.map(shape => shapePaint(shape, theme)).filter((paint): paint is NonNullable<typeof paint> => !!paint);
  const merge = (pick: (paint: typeof paints[number]) => DrawingStatusPaint): DrawingStatusPaint | null => {
    if (!paints.length) return null;
    const first = pick(paints[0]);
    return paints.every(paint => same(pick(paint), first)) ? first : { kind: 'mixed' };
  };
  const widths = new Set(paints.map(paint => paint.width).filter((width): width is number | 'hairline' => width !== null));
  const width = widths.size === 1 ? [...widths][0] : null;
  return {
    type: types.size === 1 ? [...types][0] : null,
    count: shapes.length,
    fill: merge(paint => paint.fill),
    outline: merge(paint => paint.outline),
    outlineWidth: typeof width === 'number' ? width : null,
    ...(width === 'hairline' ? { outlineHairline: true } : {}),
  };
}
