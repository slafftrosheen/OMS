import { cadPaintHasFill, cadPaintHasStroke, cadShapePaint } from './cad-shape-appearance';
import {
  multiplyMatrix,
  transformAppearance,
  type VectorMatrix,
} from "./cad-appearance";
import type { VectorPaint } from "./cad-paint";
import type { Editor } from "@tldraw/tldraw";
import { shapeCadContours } from "./cad-editing";
import {
  contourSegments,
  nodeAt,
  curveBounds,
  mapContours,
  validContours,
} from "./cad-curves";
import {
  scalePaint,
  validVectorPaint,
  type VectorPath,
} from "./cad-vector";
import {
  cadMmPerPixel,
  validateCadSettings,
  type CadSettings,
} from "./cad-settings";
import { cadRevision } from "./cad-plans";
import { drawingObjectName } from "./drawing-operations";
import { drawingPageBounds, readDrawingPageSize, type DrawingPageSize } from "./drawing-pages";
import { rasterTileMatrices } from "./cad-raster-tiles";

export const MAX_PDF_BLEED_MM = 50;
export type VectorExportScope = "selected" | "all" | { pageBleedMm: number };
type PdfSheet = DrawingPageSize & { bleedMm: number };
const POINTS_PER_MM = 72 / 25.4;
const MAX_PRINT_POINTS = 14400;

function pdfSheetFrame({ widthMm, heightMm, bleedMm }: PdfSheet) {
  if (!Number.isFinite(bleedMm) || bleedMm < 0 || bleedMm > MAX_PDF_BLEED_MM)
    throw new Error("bleed-range");
  const bleed = bleedMm * POINTS_PER_MM;
  const w = (widthMm + 2 * bleedMm) * POINTS_PER_MM;
  const h = (heightMm + 2 * bleedMm) * POINTS_PER_MM;
  if (![widthMm, heightMm].every(value => Number.isFinite(value) && value > 0) ||
      w > MAX_PRINT_POINTS || h > MAX_PRINT_POINTS) throw new Error("page-limit");
  return { x: -bleed, y: -bleed, w, h };
}

const num = (n: number) => {
  if (!Number.isFinite(n) || Math.abs(n) > 1e8) throw new Error("geometry");
  return String(Number(n.toFixed(7)));
};
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");
function paintedPathBounds(path: VectorPath) {
  const { paint, contours } = path;
  const stroke = cadPaintHasStroke(paint);
  if (!stroke && !cadPaintHasFill(paint)) return null;
  const geometry = curveBounds(contours);
  const joins = contours.some(contour => contour.closed || contour.nodes.length > 2);
  const reach = stroke ? Math.max(paint.lineCap === "square" ? Math.SQRT2 : 1,
    joins && paint.lineJoin === "miter" ? paint.miterLimit : 1) * paint.strokeWidth / 2 : 0;
  let left = geometry.x - reach, top = geometry.y - reach;
  let right = geometry.x + geometry.w + reach, bottom = geometry.y + geometry.h + reach;
  // Intersect in output coordinates after adding stroke reach. Ink can enter a
  // clip even when the centerline is completely outside it.
  for (const clip of paint.clips ?? []) {
    const b = curveBounds(clip.contours);
    left = Math.max(left, b.x); top = Math.max(top, b.y);
    right = Math.min(right, b.x + b.w); bottom = Math.min(bottom, b.y + b.h);
    if (right <= left || bottom <= top) return null;
  }
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

export function serializeVectorDocument(
  input: VectorPath[],
  format: "pdf" | "eps",
  sheet?: PdfSheet,
) {
  if (
    !input.length ||
    input.length > 2000 ||
    input.some((p) => !validContours(p.contours) || !validVectorPaint(p.paint))
  )
    throw new Error("geometry");
  if (sheet && format !== "pdf") throw new Error("page-scope");
  const frame = sheet ? pdfSheetFrame(sheet) : undefined;
  const paths: VectorPath[] = [];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const path of input) {
    const b = paintedPathBounds(path);
    if (!b || frame && !intersectsSheet(b, frame)) continue;
    paths.push(path);
    left = Math.min(left, b.left); top = Math.min(top, b.top);
    right = Math.max(right, b.right); bottom = Math.max(bottom, b.bottom);
  }
  if (!paths.length) throw new Error("geometry");
  if (paths.some(p => p.paint.raster?.external)) throw new Error("asset-fetch");
  const bounds = frame ?? { x: left, y: top, w: right - left, h: bottom - top };
  const padding = frame ? 0 : 0.01, width = bounds.w + 2 * padding, height = bounds.h + 2 * padding;
  if (width > MAX_PRINT_POINTS || height > MAX_PRINT_POINTS) throw new Error("page-limit");
  const pdf = format === "pdf",
    body: string[] = frame ? ["q", `0 0 ${num(width)} ${num(height)} re W n`] : [],
    shadings: string[] = [],
    images: string[] = [],
    extraObjects: string[] = [];
  const pageMatrix: VectorMatrix = [
    1,
    0,
    0,
    -1,
    -bounds.x + padding,
    height + bounds.y - padding,
  ];
  const pathData = (cs: VectorPath["contours"]) => {
    const lines: string[] = [];
    if (!pdf) lines.push("newpath");
    for (const c of mapContours(cs, (q) => ({
      x: q.x - bounds.x + padding,
      y: height - (q.y - bounds.y + padding),
    }))) {
      lines.push(
        `${num(c.nodes[0].x)} ${num(c.nodes[0].y)} ${pdf ? "m" : "moveto"}`,
      );
      for (const seg of contourSegments(c))
        lines.push(
          `${seg
            .slice(1)
            .map((q) => `${num(q.x)} ${num(q.y)}`)
            .join(" ")} ${pdf ? "c" : "curveto"}`,
        );
      if (c.closed) lines.push(pdf ? "h" : "closepath");
    }
    return lines.join("\n");
  };
  const clip = (cs: VectorPath["contours"], rule: string) =>
    `${pathData(cs)}\n${pdf ? (rule === "evenodd" ? "W* n" : "W n") : rule === "evenodd" ? "eoclip newpath" : "clip newpath"}`;
  const hex = (data: string) =>
    Array.from(atob(data), (c) =>
      c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("") + ">";
  const imageObject = (
    r: NonNullable<VectorPaint["raster"]>,
    gray: boolean,
    mask?: number,
  ) => {
    const data = hex(gray ? r.alpha! : r.rgb!),
      ref = 5 + extraObjects.length;
    extraObjects.push(
      `<< /Type /XObject /Subtype /Image /Width ${r.width} /Height ${r.height} /ColorSpace /${gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode] ${mask ? `/SMask ${mask} 0 R` : ""} /Length ${data.length} >>\nstream\n${data}\nendstream`,
    );
    return ref;
  };
  let placements = 0;
  for (const [i, path] of paths.entries()) {
    const p = path.paint,
      fill = cadPaintHasFill(p),
      stroke = cadPaintHasStroke(p);
    if (
      !pdf &&
      ((fill && p.fillOpacity !== 1) ||
        (stroke && p.strokeOpacity !== 1) ||
        (fill && (p.raster?.alpha || p.raster?.hasAlpha)))
    )
      throw new Error("eps-opacity");
    body.push(pdf ? "q" : "gsave");
    if (pdf) body.push(`/GS${i} gs`);
    for (const c of p.clips ?? []) body.push(clip(c.contours, c.fillRule));
    body.push(
      `${num(p.strokeWidth)} ${pdf ? "w" : "setlinewidth"}`,
      `${["butt", "round", "square"].indexOf(p.lineCap)} ${pdf ? "J" : "setlinecap"}`,
      `${["miter", "round", "bevel"].indexOf(p.lineJoin)} ${pdf ? "j" : "setlinejoin"}`,
      `${num(p.miterLimit)} ${pdf ? "M" : "setmiterlimit"}`,
      `[${p.dash.map(num).join(" ")}] ${num(p.dashOffset)} ${pdf ? "d" : "setdash"}`,
    );
    if (fill && (p.gradient || p.raster)) {
      body.push(pdf ? "q" : "gsave", clip(path.contours, path.fillRule));
      if (p.gradient) {
        const g = p.gradient,
          funcs = g.stops
            .slice(0, -1)
            .map(
              (s, j) =>
                `<< /FunctionType 2 /Domain [0 1] /C0 [${rgb(s.color)}] /C1 [${rgb(g.stops[j + 1].color)}] /N 1 >>`,
            );
        const fn =
          funcs.length === 1
            ? funcs[0]
            : `<< /FunctionType 3 /Domain [0 1] /Functions [${funcs.join(" ")}] /Bounds [${g.stops
                .slice(1, -1)
                .map((s) => num(s.offset))
                .join(" ")}] /Encode [${funcs.map(() => "0 1").join(" ")}] >>`;
        const coords =
          g.type === "linear"
            ? [...g.start, ...g.end]
            : [...g.start, g.r0, ...g.end, g.r1];
        const shading = `<< /ShadingType ${g.type === "linear" ? 2 : 3} /ColorSpace /DeviceRGB /Coords [${coords.map(num).join(" ")}] /Function ${fn} /Extend [true true] >>`;
        if (g.bounds) {
          const [x, y, r, b] = g.bounds,
            m = g.matrix;
          body.push(
            clip(
              [
                {
                  closed: true,
                  nodes: [
                    [x, y],
                    [r, y],
                    [r, b],
                    [x, b],
                  ].map(([x, y]) =>
                    nodeAt({
                      x: m[0] * x + m[2] * y + m[4],
                      y: m[1] * x + m[3] * y + m[5],
                    }),
                  ),
                },
              ],
              "nonzero",
            ),
          );
        }
        const matrix = multiplyMatrix(pageMatrix, g.matrix).map(num).join(" ");
        if (pdf) {
          shadings.push(`/Sh${i} ${shading}`);
          body.push(`${matrix} cm`, `/Sh${i} sh`);
        } else body.push(`[${matrix}] concat`, `${shading} shfill`);
      } else if (p.raster) {
        const r = p.raster, matrices = rasterTileMatrices(r, path.contours);
        placements += matrices.length;
        if (placements > 10000) throw new Error("material-tiles");
        if (pdf) {
          const mask = r.alpha ? imageObject(r, true) : undefined,
            ref = imageObject(r, false, mask);
          images.push(`/Im${i} ${ref} 0 R`);
        } else if (r.repeat) {
          // LanguageLevel 3 reusable stream decodes the original once. Rewind it
          // for each placement instead of duplicating compressed pixels per tile.
          body.push(`/OMSImage${i} currentfile /ASCIIHexDecode filter /FlateDecode filter << /AsyncRead false >> /ReusableStreamDecode filter`, hex(r.rgb!), "def");
        }
        for (const tile of matrices) {
          const matrix = multiplyMatrix(multiplyMatrix(pageMatrix, tile), [1,0,0,-1,0,1]).map(num).join(" ");
          body.push(pdf ? "q" : "gsave");
          if (pdf) body.push(`${matrix} cm`, `/Im${i} Do`);
          else {
            if (r.repeat) body.push(`OMSImage${i} 0 setfileposition`);
            body.push(`[${matrix}] concat`, "/DeviceRGB setcolorspace",
              `<< /ImageType 1 /Width ${r.width} /Height ${r.height} /BitsPerComponent 8 /ImageMatrix [${r.width} 0 0 -${r.height} 0 ${r.height}] /Decode [0 1 0 1 0 1] /DataSource ${r.repeat ? `OMSImage${i}` : "currentfile /ASCIIHexDecode filter /FlateDecode filter"} >> image`);
            if (!r.repeat) body.push(hex(r.rgb!));
          }
          body.push(pdf ? "Q" : "grestore");
        }
        if (!pdf && r.repeat) body.push(`OMSImage${i} closefile`);
      }
      body.push(pdf ? "Q" : "grestore");
    }
    if (stroke || (fill && !p.gradient && !p.raster)) {
      body.push(pathData(path.contours));
      const plainFill = fill && !p.gradient && !p.raster;
      if (pdf) {
        if (plainFill) body.push(`${rgb(p.fill)} rg`);
        if (stroke) body.push(`${rgb(p.stroke)} RG`);
        body.push(
          plainFill
            ? stroke
              ? path.fillRule === "evenodd"
                ? "B*"
                : "B"
              : path.fillRule === "evenodd"
                ? "f*"
                : "f"
            : stroke
              ? "S"
              : "n",
        );
      } else {
        if (plainFill)
          body.push(
            `gsave ${rgb(p.fill)} setrgbcolor ${path.fillRule === "evenodd" ? "eofill" : "fill"} grestore`,
          );
        if (stroke) body.push(`${rgb(p.stroke)} setrgbcolor stroke`);
      }
    }
    body.push(pdf ? "Q" : "grestore");
  }
  if (frame) body.push("Q");
  const stream = body.join("\n") + "\n";
  if (stream.length + extraObjects.join("").length > 128 * 1024 * 1024)
    throw new Error("limit");
  if (!pdf)
    return `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}\n%%HiResBoundingBox: 0 0 ${num(width)} ${num(height)}\n%%LanguageLevel: 3\n%%Pages: 1\n%%EndComments\n${stream}showpage\n%%EOF\n`;
  const states = paths
    .map(
      (p, i) =>
        `/GS${i} << /Type /ExtGState /ca ${num(p.paint.fillOpacity)} /CA ${num(p.paint.strokeOpacity)} >>`,
    )
    .join(" ");
  const boxes = frame
    ? ` /TrimBox [${num(-frame.x)} ${num(-frame.y)} ${num(width + frame.x)} ${num(height + frame.y)}] /BleedBox [0 0 ${num(width)} ${num(height)}]`
    : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}]${boxes} /Resources << /ExtGState << ${states} >> /Shading << ${shadings.join(" ")} >> /XObject << ${images.join(" ")} >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    ...extraObjects,
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}`;
  return (
    text +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  );
}

function intersectsSheet(bounds: NonNullable<ReturnType<typeof paintedPathBounds>>, frame: ReturnType<typeof pdfSheetFrame>) {
  return bounds.right > frame.x && bounds.bottom > frame.y &&
    bounds.left < frame.x + frame.w && bounds.top < frame.y + frame.h;
}

export function prepareVectorExport(
  editor: Editor,
  settings: CadSettings,
  scope: VectorExportScope,
  format: "pdf" | "eps",
  deferRaster = false,
) {
  if (!validateCadSettings(settings)) throw new Error("settings");
  let sheet: PdfSheet | undefined;
  if (typeof scope === "object") {
    if (format !== "pdf") throw new Error("page-scope");
    const size = readDrawingPageSize(editor);
    if (!size || !drawingPageBounds(editor)) throw new Error("sheet-size");
    sheet = { ...size, bleedMm: scope.pageBleedMm };
  }
  const frame = sheet ? pdfSheetFrame(sheet) : undefined;
  const selected = scope === "selected"
    ? editor.getShapeAndDescendantIds([...editor.getSelectedShapeIds()])
    : null;
  const shapes = editor
    .getCurrentPageShapesSorted()
    .filter((s) => !selected || selected.has(s.id));
  const factor = (cadMmPerPixel(settings) * 72) / 25.4,
    paths: VectorPath[] = [],
    omitted: string[] = [];
  let total = 0;
  for (const shape of shapes) {
    if (["group", "frame"].includes(shape.type)) continue;
    try {
      const mask = editor.getShapeMask(shape.id);
      if (mask && mask.length < 3) throw new Error("clipped");
      const contours = mapContours(
        shapeCadContours(editor, shape, 0.005 / cadMmPerPixel(settings)),
        (p) => ({ x: p.x * factor, y: p.y * factor }),
      );
      const transform = editor.getShapePageTransform(shape),
        origin = transform.applyToPoint({ x: 0, y: 0 }),
        x = transform.applyToPoint({ x: 1, y: 0 }),
        y = transform.applyToPoint({ x: 0, y: 1 });
      const paint = transformAppearance(
        scalePaint(cadShapePaint(shape), factor),
        [
          x.x - origin.x,
          x.y - origin.y,
          y.x - origin.x,
          y.y - origin.y,
          origin.x * factor,
          origin.y * factor,
        ],
      );
      if (mask) {
        paint.clips = [...(paint.clips ?? []), {
          contours: [{ closed: true, nodes: mask.map(point => nodeAt({ x: point.x * factor, y: point.y * factor })) }],
          fillRule: "nonzero",
        }];
      }
      let opacity = shape.opacity ?? 1,
        ancestor = editor.getShape(shape.parentId);
      while (ancestor) {
        opacity *= ancestor.opacity ?? 1;
        ancestor = editor.getShape(ancestor.parentId);
      }
      paint.fillOpacity *= opacity;
      paint.strokeOpacity *= opacity;
      if (
        format === "eps" &&
        ((cadPaintHasFill(paint) && (paint.fillOpacity !== 1 || paint.raster?.alpha || paint.raster?.hasAlpha)) ||
          (cadPaintHasStroke(paint) && paint.strokeOpacity !== 1))
      )
        throw new Error("opacity");
      const path: VectorPath = {
        contours,
        paint,
        fillRule: (shape.props as any).fillRule ?? "evenodd",
      };
      if (!validVectorPaint(paint)) throw new Error("clipped");
      const bounds = paintedPathBounds(path);
      if (!bounds) throw new Error("clipped");
      if (frame && !intersectsSheet(bounds, frame)) continue;
      if (shape.type === "geo" && (shape.props as any).fill !== "none")
        throw new Error("style");
      total += contours.reduce((n, c) => n + c.nodes.length, 0);
      if (total > 20000) throw new Error("limit");
      paths.push(path);
    } catch (error) {
      if ((error as Error).message === "limit") throw error;
      omitted.push(drawingObjectName(shape));
    }
  }
  return {
    text: paths.length && !deferRaster ? serializeVectorDocument(paths, format, sheet) : "",
    paths,
    omitted,
    sheet,
    revision: cadRevision(editor),
  };
}
