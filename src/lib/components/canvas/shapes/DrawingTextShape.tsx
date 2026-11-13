import React from 'react';
import { TextShapeUtil, Vec, getDefaultColorTheme, type TLTextShape, type Editor, type SvgExportContext } from '@tldraw/tldraw';
import { drawingFontFamily, getLoadedDrawingFont, getShapeDrawingFontId, fontSupportsText } from '../drawing-fonts';
import { glyphRunContours } from '../cad-text';
import { curvePathData } from '../cad-curves';
import {useDrawingFontText} from '../font-copy';
import { TEXT_PIXELS } from '../workbench-operations';

/** Native text records and tools remain compatible. Uploaded faces override only
 * text measurement/rendering; no mutation of tldraw's global four-font registry. */
function FontNotice({missing}:{missing:boolean}) { const t=useDrawingFontText(); return <span className="drawing-font-unavailable" role="status" data-testid="drawing-font-unavailable">{t(missing?'missing':'glyphMissing')}</span>; }
export class DrawingTextShapeUtil extends TextShapeUtil {
  override getMinDimensions(shape: TLTextShape) {
    const id = getShapeDrawingFontId(shape), found = id && getLoadedDrawingFont(this.editor, id);
    if (!found) return super.getMinDimensions(shape);
    const p = shape.props, size = TEXT_PIXELS[p.size], minWidth = p.autoSize ? 16 : Math.max(16, p.w);
    const result = this.editor.textMeasure.measureText(p.text, {
      fontFamily: drawingFontFamily(found.record), fontSize: size, lineHeight: 1.35,
      fontWeight: 'normal', fontStyle: 'normal', padding: '0px',
      maxWidth: p.autoSize ? null : Math.floor(minWidth),
    });
    return { width: Math.max(minWidth, result.w + (p.autoSize ? 1 : 0)), height: Math.max(size, result.h) };
  }
  override component(shape: TLTextShape) {
    const element = super.component(shape), id = getShapeDrawingFontId(shape);
    if (!id) return element;
    const found = getLoadedDrawingFont(this.editor, id);
    const missing = !found || !fontSupportsText(found.font, shape.props.text);
    return <>
      {React.cloneElement(element, { style: { ...element.props.style,
        ...(found ? { [`--tl-font-${shape.props.font}`]: drawingFontFamily(found.record) } : {}),
      } })}
      {missing && <FontNotice missing={!found}/>}
    </>;
  }
  override toSvg(shape: TLTextShape, ctx: SvgExportContext) {
    const id = getShapeDrawingFontId(shape);
    if (!id) return super.toSvg(shape, ctx);
    const found = getLoadedDrawingFont(this.editor, id);
    if (!found) throw new Error('font-missing');
    const p = shape.props, fontSize = TEXT_PIXELS[p.size], bounds = this.getMinDimensions(shape);
    const spans = this.editor.textMeasure.measureTextSpans(p.text.normalize('NFC'), {
      fontFamily: drawingFontFamily(found.record), fontSize, lineHeight: 1.35, fontStyle: 'normal', fontWeight: 'normal',
      textAlign: p.textAlign, width: Math.ceil(bounds.width), height: Math.ceil(bounds.height), padding: 0, overflow: 'wrap',
    });
    const font = found.font, ascent = font.ascent / font.unitsPerEm * fontSize, descent = -font.descent / font.unitsPerEm * fontSize;
    const baseline = (Math.floor(fontSize * 1.35) - ascent - descent) / 2 + ascent;
    const contours = spans.flatMap(span => glyphRunContours(font, span.text, span.box.x, span.box.y + baseline, fontSize));
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
    if (!getShapeDrawingFontId(prev) && !getShapeDrawingFontId(next)) return this.nativeBeforeUpdate(prev, next) ?? (next !== incoming ? next : undefined);
    if (!next.props.autoSize) return { ...next, props: { ...next.props } };
    const p = prev.props, n = next.props;
    const textChanged = p.text !== n.text;
    if (!textChanged && p.size === n.size && p.font === n.font && p.scale === n.scale && p.textAlign === n.textAlign && p.autoSize === n.autoSize && getShapeDrawingFontId(prev) === getShapeDrawingFontId(next)) return next;
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
