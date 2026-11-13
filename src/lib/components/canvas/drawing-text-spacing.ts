import type { Editor, TLTextShape } from '@tldraw/tldraw';

export interface DrawingTextSpacing {
  /** Additional space as a percentage of the font size (em). */
  letterSpacing: number;
  /** Baseline interval as a multiple of the font size. */
  lineHeight: number;
}
export const DEFAULT_DRAWING_TEXT_SPACING: DrawingTextSpacing = { letterSpacing: 0, lineHeight: 1.35 };

export function validDrawingTextSpacing(patch: Partial<DrawingTextSpacing>): boolean {
  return (!('letterSpacing' in patch) || (Number.isFinite(patch.letterSpacing) && patch.letterSpacing! >= -50 && patch.letterSpacing! <= 200))
    && (!('lineHeight' in patch) || (Number.isFinite(patch.lineHeight) && patch.lineHeight! >= 0.5 && patch.lineHeight! <= 5));
}

/** Old drawings retain their original spacing. Invalid imported metadata never
 * reaches CSS or geometry calculations. Native text props stay schema-compatible. */
export function getDrawingTextSpacing(shape: Pick<TLTextShape, 'meta'>): DrawingTextSpacing {
  const value = shape.meta.omsTextSpacing;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_DRAWING_TEXT_SPACING };
  const { letterSpacing, lineHeight } = value;
  return {
    letterSpacing: typeof letterSpacing === 'number' && validDrawingTextSpacing({ letterSpacing }) ? letterSpacing : 0,
    lineHeight: typeof lineHeight === 'number' && validDrawingTextSpacing({ lineHeight }) ? lineHeight : 1.35,
  };
}

export function hasDrawingTextSpacing(shape: Pick<TLTextShape, 'meta'>): boolean {
  const value = getDrawingTextSpacing(shape);
  return value.letterSpacing !== 0 || value.lineHeight !== 1.35;
}

export function drawingTextSpacingMeta(shape: Pick<TLTextShape, 'meta'>, patch: Partial<DrawingTextSpacing>): TLTextShape['meta'] {
  if (!validDrawingTextSpacing(patch)) throw new Error('text-spacing-invalid');
  return { ...shape.meta, omsTextSpacing: { ...getDrawingTextSpacing(shape), ...patch } };
}

/** TextLabel rounds its line box down to whole CSS pixels. Measurement, outlines
 * and export must use the same interval, including at fractional font sizes. */
export const drawingTextLineHeight = (fontSize: number, spacing: DrawingTextSpacing): number => Math.floor(fontSize * spacing.lineHeight) / fontSize;

/** tldraw 2.4 clones this editor-local template for synchronous DOM measurement,
 * but has no letter-spacing option. Scope the template style and restore it even
 * on failure, so notes/other labels never inherit the selected text's tracking. */
export function withDrawingTextSpacing<T>(editor: Editor, spacing: DrawingTextSpacing, fontSize: number, measure: () => T): T {
  const style = editor.textMeasure.baseElm?.style;
  if (!style) return measure();
  const properties = ['letter-spacing', 'font-variant-ligatures'] as const;
  const previous = properties.map(name => ({ name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }));
  try {
    style.setProperty('letter-spacing', `${fontSize * spacing.letterSpacing / 100}px`);
    style.setProperty('font-variant-ligatures', spacing.letterSpacing ? 'no-common-ligatures' : 'normal');
    return measure();
  } finally {
    for (const { name, value, priority } of previous) {
      if (value) style.setProperty(name, value, priority);
      else style.removeProperty(name);
    }
  }
}

/** Browser span y positions include the font's leading. Anchor the first line's
 * baseline once; otherwise larger line spacing adds that leading twice. */
export function drawingTextBaseline(font: { ascent: number; descent: number; unitsPerEm: number }, fontSize: number, spacing: DrawingTextSpacing, firstSpanY: number): number {
  const ascent = font.ascent / font.unitsPerEm * fontSize, descent = -font.descent / font.unitsPerEm * fontSize;
  return (Math.floor(fontSize * spacing.lineHeight) - ascent - descent) / 2 + ascent - firstSpanY;
}
