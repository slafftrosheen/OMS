import React from 'react';
import { DefaultFontFamilies, TextShapeUtil, Vec, getDefaultColorTheme, type TLTextShape, type Editor, type SvgExportContext } from '@tldraw/tldraw';
import { drawingFontFamily, getLoadedDrawingFont, getShapeDrawingFontId, fontSupportsText } from '../drawing-fonts';
import { getCadFont, glyphRunContours } from '../cad-text';
import { curvePathData } from '../cad-curves';
import {useDrawingFontText} from '../font-copy';
import { TEXT_PIXELS } from '../workbench-operations';
import { drawingTextBaseline, drawingTextLineHeight, getDrawingTextSpacing, hasDrawingTextSpacing, withDrawingTextSpacing } from '../drawing-text-spacing';

/** Native text records and tools remain compatible. Uploaded faces override only
 * text measurement/rendering; no mutation of tldraw's global four-font registry. */
function FontNotice({missing}:{missing:boolean}) { const t=useDrawingFontText(); return <span className="drawing-font-unavailable" role="status" data-testid="drawing-font-unavailable">{t(missing?'missing':'glyphMissing')}</span>; }
export class DrawingTextShapeUtil extends TextShapeUtil {
  override getMinDimensions(shape: TLTextShape) {
    const id = getShapeDrawingFontId(shape), found = id && getLoadedDrawingFont(this.editor, id);
    if (!found && !hasDrawingTextSpacing(shape)) return super.getMinDimensions(shape);
    const p = shape.props, size = TEXT_PIXELS[p.size], minWidth = p.autoSize ? 16 : Math.max(16, p.w);
    const spacing = getDrawingTextSpacing(shape);
    const result = withDrawingTextSpacing(this.editor, spacing, size, () => this.editor.textMeasure.measureText(p.text, {
      fontFamily: found ? drawingFontFamily(found.record) : DefaultFontFamilies[p.font], fontSize: size, lineHeight: drawingTextLineHeight(size, spacing),
      fontWeight: 'normal', fontStyle: 'normal', padding: '0px',
      maxWidth: p.autoSize ? null : Math.floor(minWidth),
    }));
    return { width: Math.max(minWidth, result.w + (p.autoSize ? 1 : 0)), height: Math.max(size, result.h) };
  }
  override component(shape: TLTextShape) {
    const element = super.component(shape), id = getShapeDrawingFontId(shape);
    if (!id && !hasDrawingTextSpacing(shape)) return element;
    const found = id ? getLoadedDrawingFont(this.editor, id) : undefined;
    const missing = id && (!found || !fontSupportsText(found.font, shape.props.text));
    const spacing = getDrawingTextSpacing(shape);
    return <>
      {React.cloneElement(element, { lineHeight: spacing.lineHeight, style: { ...element.props.style,
        letterSpacing: TEXT_PIXELS[shape.props.size] * spacing.letterSpacing / 100,
        fontVariantLigatures: spacing.letterSpacing ? 'no-common-ligatures' : 'normal',
        ...(found ? { [`--tl-font-${shape.props.font}`]: drawingFontFamily(found.record) } : {}),
      } })}
      {missing && <FontNotice missing={!found}/>}
    </>;
  }
  // ShapeUtil/exportToSvg supports async results; TextShapeUtil's inferred return
  // type is narrower because its own implementation never needs to load a face.
  override toSvg(shape: TLTextShape, ctx: SvgExportContext): any {
    const id = getShapeDrawingFontId(shape);
    if (!id && !hasDrawingTextSpacing(shape)) return super.toSvg(shape, ctx);
    const found = id ? getLoadedDrawingFont(this.editor, id) : undefined;
    if (id && !found) throw new Error('font-missing');
    // Spaced built-ins also use real glyph paths: SVG/PNG viewers cannot silently
    // discard the text spacing or substitute a different font at production time.
    if (!found) return getCadFont(shape.props.font).then(font => this.outlineSvg(shape, ctx, font, DefaultFontFamilies[shape.props.font]));
    return this.outlineSvg(shape, ctx, found.font, drawingFontFamily(found.record));
  }
  private outlineSvg(shape: TLTextShape, ctx: SvgExportContext, font: any, fontFamily: string) {
    const p = shape.props, fontSize = TEXT_PIXELS[p.size], bounds = this.getMinDimensions(shape);
    const spacing = getDrawingTextSpacing(shape);
    const spans = withDrawingTextSpacing(this.editor, spacing, fontSize, () => this.editor.textMeasure.measureTextSpans(p.text.normalize('NFC'), {
      fontFamily, fontSize, lineHeight: drawingTextLineHeight(fontSize, spacing), fontStyle: 'normal', fontWeight: 'normal',
      textAlign: p.textAlign, width: Math.ceil(bounds.width), height: Math.ceil(bounds.height), padding: 0, overflow: 'wrap',
    }));
    const baseline = drawingTextBaseline(font, fontSize, spacing, spans[0]?.box.y ?? 0);
    const contours = spans.flatMap(span => glyphRunContours(font, span.text, span.box.x, span.box.y + baseline, fontSize, spacing.letterSpacing));
    return <path d={curvePathData(contours)} fill={getDefaultColorTheme(ctx)[p.color].solid} fillRule="nonzero" />;
  }
  // TextShapeUtil defines this as an instance field. Preserve its original
  // behavior for built-ins; custom faces use their measured metrics throughout.
  private nativeBeforeUpdate = (this as TextShapeUtil).onBeforeUpdate;
  override onBeforeUpdate = (prev: TLTextShape, incoming: TLTextShape) => {
    let next = incoming;
    if (prev.props.font !== next.props.font && getShapeDrawingFontId(prev) === getShapeDrawingFontId(next)) {
      next = { ...next, meta: { ...next.meta, omsFontId: null } };
    }
    if (!getShapeDrawingFontId(prev) && !getShapeDrawingFontId(next) && !hasDrawingTextSpacing(prev) && !hasDrawingTextSpacing(next)) return this.nativeBeforeUpdate(prev, next) ?? (next !== incoming ? next : undefined);
    if (!next.props.autoSize) return { ...next, props: { ...next.props } };
    const p = prev.props, n = next.props;
    const beforeSpacing = getDrawingTextSpacing(prev), afterSpacing = getDrawingTextSpacing(next);
    const textChanged = p.text !== n.text;
    if (!textChanged && p.size === n.size && p.font === n.font && p.scale === n.scale && p.textAlign === n.textAlign && p.autoSize === n.autoSize && getShapeDrawingFontId(prev) === getShapeDrawingFontId(next) && beforeSpacing.letterSpacing === afterSpacing.letterSpacing && beforeSpacing.lineHeight === afterSpacing.lineHeight) return next;
    const a = this.getMinDimensions(prev), b = this.getMinDimensions(next);
    const dw = b.width * n.scale - a.width * p.scale, dh = b.height * n.scale - a.height * p.scale;
    const delta = new Vec(n.textAlign === 'end' ? dw : n.textAlign === 'middle' ? dw / 2 : 0, textChanged ? 0 : dh / 2).rot(next.rotation);
    return { ...next, x: next.x - delta.x, y: next.y - delta.y, props: { ...n, w: b.width } };
  };
}

/** tldraw 2.4 appends default utils, so install on the editor-local registry.
 * Its geometry cache keys on props identity and ignores metadata. A transient
 * metadata value makes validation accept fresh props; exact record restoration
 * happens in the same history-ignored transaction, before application listeners.
 * No serialized field, position or undo entry is changed by this refresh. */
export function installDrawingTextUtil(editor: Editor): void {
  Object.assign(editor.shapeUtils, { text: new DrawingTextShapeUtil(editor) });
  const texts = editor.store.allRecords().filter((r): r is TLTextShape => r.typeName === 'shape' && r.type === 'text');
  editor.run(() => {
    editor.store.put(texts.map(shape => ({ ...shape, props: { ...shape.props }, meta: { ...shape.meta, omsFontRefresh: !(shape.meta.omsFontRefresh ?? false) } })));
    editor.store.put(texts.map(shape => ({ ...shape, props: { ...shape.props } })));
  }, { history: 'ignore' });
}
