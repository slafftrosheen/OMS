import { glyphRunContours } from "./cad-text";
import { curveBounds, mapContours, type CadContour } from "./cad-curves";
import type { DxfPair } from "./cad-dxf-decode";
import { CadOperationError } from "./cad-plans";
type Record = { type: string; pairs: DxfPair[] };
const get = (r: Record, c: number, f = 0) => {
  const value = r.pairs.find(([n]) => n === c)?.[1];
  const n = value === undefined ? f : Number(value);
  if (!Number.isFinite(n)) throw new CadOperationError("geometry");
  return n;
};
const str = (r: Record, c: number) => r.pairs.find(([n]) => n === c)?.[1] ?? "";
export function dxfPlainText(input: string, mtext = false) {
  let formatting = false;
  let text = input
    .replace(/\\U\+([\da-f]{4})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(
      /%%([dpc%])/gi,
      (_, code) => ({ d: "°", p: "±", c: "Ø", "%": "%" })[code.toLowerCase()]!,
    );
  text = text.replace(/%%[uok]/gi, () => {
    formatting = true;
    return "";
  });
  if (mtext) {
    // Preserve literal escaped braces/backslashes before consuming formatting.
    text = text
      .replace(
        /\\([\\{}])/g,
        (_, c) => ({ "\\": "\ue000", "{": "\ue001", "}": "\ue002" })[c]!,
      )
      .replace(/\\[Pp]/g, "\n")
      .replace(/\\~/g, "\u00a0");
    text = text.replace(/\\S([^;]*);/g, (_, v) => {
      formatting = true;
      return v.replace(/[\^#]/g, "/");
    });
    text = text
      .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, () => {
        formatting = true;
        return "";
      })
      .replace(/\\[LlOoKk]/g, () => {
        formatting = true;
        return "";
      })
      .replace(/[{}]/g, "");
    if (/\\[a-z]/i.test(text)) throw new CadOperationError("unsupported");
    text = text
      .replace(/\ue000/g, "\\")
      .replace(/\ue001/g, "{")
      .replace(/\ue002/g, "}");
  }
  if (text.includes("\0") || [...text].length > 500)
    throw new CadOperationError("limit");
  return { text: text.normalize("NFC"), formatting };
}
const advance = (font: any, text: string, size: number) =>
  (font
    .layout(text)
    .positions.reduce((n: number, p: any) => n + p.xAdvance, 0) *
    size) /
  font.unitsPerEm;
export function dxfTextContours(r: Record, font: any, style?: Record) {
  if (!font) throw new CadOperationError("font");
  const mtext = r.type === "MTEXT",
    raw = mtext
      ? r.pairs
          .filter(([c]) => c === 3 || c === 1)
          .map(([, v]) => v)
          .join("")
      : str(r, 1);
  const { text, formatting } = dxfPlainText(raw, mtext);
  if (!text.trim()) return { contours: [] as CadContour[], text, formatting };
  if ((r.type === "ATTRIB" || r.type === "ATTDEF") && get(r, 70) & 1)
    return { contours: [] as CadContour[], text, formatting };
  const height = get(r, 40, get(style ?? r, 40));
  if (!(height > 0)) throw new CadOperationError("geometry");
  // DXF height is a capital-letter height, not a typographic em square.
  const cap = font.capHeight > 0 ? font.capHeight : font.ascent,
    size = (height * font.unitsPerEm) / cap;
  let cs: CadContour[] = [],
    rotation = (get(r, 50) * Math.PI) / 180,
    x = get(r, 10),
    y = get(r, 20);
  let layoutReview = formatting;
  if (mtext) {
    if (get(r, 75) || ![1, 5].includes(get(r, 72, 1)))
      throw new CadOperationError("unsupported");
    const width = get(r, 41),
      lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/(\s+)/)) {
        if (
          width > 0 &&
          line.trim() &&
          advance(font, line + word, size) > width
        ) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line += word;
      }
      lines.push(line);
    }
    if (lines.length > 50) throw new CadOperationError("limit");
    const attachment = get(r, 71, 1);
    if (attachment < 1 || attachment > 9)
      throw new CadOperationError("geometry");
    const spacing = get(r, 44, 1);
    if (spacing < 0.25 || spacing > 4) throw new CadOperationError("geometry");
    const lineHeight = ((height * 5) / 3) * spacing;
    lines.forEach((line, i) =>
      cs.push(...glyphRunContours(font, line, 0, i * lineHeight, size)),
    );
    const b = curveBounds(cs),
      col = (attachment - 1) % 3,
      row = Math.floor((attachment - 1) / 3),
      blockWidth =
        width > 0
          ? width
          : Math.max(...lines.map((line) => advance(font, line, size)));
    cs = mapContours(cs, (p) => ({
      x: p.x - (col * blockWidth) / 2,
      y: -(p.y - b.y - (row * b.h) / 2),
    }));
    const directionIndex = r.pairs.findLastIndex(([c]) => c === 11),
      angleIndex = r.pairs.findLastIndex(([c]) => c === 50);
    if (directionIndex > angleIndex)
      rotation = Math.atan2(get(r, 21), get(r, 11, 1));
    // Wrapping/inline style differences are visible to the operator, never silent.
    layoutReview ||= !!width || !!get(r, 90);
  } else {
    const widthFactor = get(r, 41, get(style ?? r, 41, 1)),
      oblique = Math.tan((get(r, 51, get(style ?? r, 50)) * Math.PI) / 180),
      flags = get(r, 71, get(style ?? r, 71));
    if (!(widthFactor > 0) || Math.abs(oblique) > 100)
      throw new CadOperationError("geometry");
    cs = mapContours(glyphRunContours(font, text, 0, 0, size), (p) => ({
      x: p.x * widthFactor - p.y * oblique,
      y: -p.y,
    }));
    let b = curveBounds(cs),
      width = advance(font, text, size) * widthFactor;
    const horizontal = get(r, 72),
      vertical = get(r, r.type === "ATTRIB" || r.type === "ATTDEF" ? 74 : 73);
    if (horizontal < 0 || horizontal > 5 || vertical < 0 || vertical > 3)
      throw new CadOperationError("unsupported");
    if ((horizontal === 3 || horizontal === 5) && vertical === 0) {
      const dx = get(r, 11) - x,
        dy = get(r, 21) - y,
        length = Math.hypot(dx, dy);
      if (!(width > 0 && length > 0)) throw new CadOperationError("geometry");
      const scale = length / width;
      cs = mapContours(cs, (p) => ({
        x: p.x * scale,
        y: p.y * (horizontal === 3 ? scale : 1),
      }));
      rotation = Math.atan2(dy, dx);
      width = length;
      b = curveBounds(cs);
    } else {
      if (horizontal || vertical) {
        x = get(r, 11);
        y = get(r, 21);
      }
      const dx =
        horizontal === 1 || horizontal === 4
          ? width / 2
          : horizontal === 2
            ? width
            : 0;
      const dy =
        vertical === 1
          ? b.y
          : vertical === 2 || horizontal === 4
            ? b.y + b.h / 2
            : vertical === 3
              ? b.y + b.h
              : 0;
      cs = mapContours(cs, (p) => ({ x: p.x - dx, y: p.y - dy }));
    }
    cs = mapContours(cs, (p) => ({
      x: p.x * (flags & 2 ? -1 : 1),
      y: p.y * (flags & 4 ? -1 : 1),
    }));
  }
  const c = Math.cos(rotation),
    s = Math.sin(rotation);
  return {
    contours: mapContours(cs, (p) => ({
      x: x + c * p.x - s * p.y,
      y: y + s * p.x + c * p.y,
    })),
    text,
    formatting: layoutReview,
  };
}
