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
  vectorPaint,
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

const num = (n: number) => {
  if (!Number.isFinite(n) || Math.abs(n) > 1e8) throw new Error("geometry");
  return String(Number(n.toFixed(7)));
};
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");
export function serializeVectorDocument(
  paths: VectorPath[],
  format: "pdf" | "eps",
) {
  if (
    !paths.length ||
    paths.length > 2000 ||
    paths.some((p) => !validContours(p.contours) || !validVectorPaint(p.paint))
  )
    throw new Error("geometry");
  if(paths.some(p=>p.paint.raster?.external))throw new Error("asset-fetch");
  const bounds = curveBounds(paths.flatMap((p) => p.contours));
  const padding = Math.max(
    0.01,
    ...paths.map((p) =>
      p.paint.stroke === "none"
        ? 0
        : (p.paint.strokeWidth *
            (p.paint.lineJoin === "miter" ? p.paint.miterLimit : 2)) /
          2,
    ),
  );
  const width = bounds.w + 2 * padding,
    height = bounds.h + 2 * padding;
  if (width > 14400 || height > 14400) throw new Error("page-limit");
  const pdf = format === "pdf",
    body: string[] = [],
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
  for (const [i, path] of paths.entries()) {
    const p = path.paint,
      fill = !!p.gradient || !!p.raster || p.fill !== "none",
      stroke = p.stroke !== "none";
    if (
      !pdf &&
      ((fill && p.fillOpacity !== 1) ||
        (stroke && p.strokeOpacity !== 1) ||
        (p.raster?.alpha || p.raster?.hasAlpha))
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
    if (p.gradient || p.raster) {
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
        const r = p.raster,
          matrix = multiplyMatrix(
            multiplyMatrix(pageMatrix, r.matrix),
            [1, 0, 0, -1, 0, 1],
          )
            .map(num)
            .join(" ");
        if (pdf) {
          const mask = r.alpha ? imageObject(r, true) : undefined,
            ref = imageObject(r, false, mask);
          images.push(`/Im${i} ${ref} 0 R`);
          body.push(`${matrix} cm`, `/Im${i} Do`);
        } else
          body.push(
            `[${matrix}] concat`,
            "/DeviceRGB setcolorspace",
            `<< /ImageType 1 /Width ${r.width} /Height ${r.height} /BitsPerComponent 8 /ImageMatrix [${r.width} 0 0 -${r.height} 0 ${r.height}] /Decode [0 1 0 1 0 1] /DataSource currentfile /ASCIIHexDecode filter /FlateDecode filter >> image`,
            hex(r.rgb!),
          );
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
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Resources << /ExtGState << ${states} >> /Shading << ${shadings.join(" ")} >> /XObject << ${images.join(" ")} >> >> /Contents 4 0 R >>`,
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
export function prepareVectorExport(
  editor: Editor,
  settings: CadSettings,
  scope: "selected" | "all",
  format: "pdf" | "eps",
  deferRaster = false,
) {
  if (!validateCadSettings(settings)) throw new Error("settings");
  const selected = editor.getShapeAndDescendantIds([
    ...editor.getSelectedShapeIds(),
  ]);
  const shapes = editor
    .getCurrentPageShapesSorted()
    .filter((s) => scope === "all" || selected.has(s.id));
  const factor = (cadMmPerPixel(settings) * 72) / 25.4,
    paths: VectorPath[] = [],
    omitted: string[] = [];
  let total = 0;
  for (const shape of shapes) {
    if (["group", "frame"].includes(shape.type)) continue;
    try {
      if (editor.getShapeMask(shape.id)) throw new Error("clipped");
      const contours = mapContours(
        shapeCadContours(editor, shape, 0.005 / cadMmPerPixel(settings)),
        (p) => ({ x: p.x * factor, y: p.y * factor }),
      );
      const transform = editor.getShapePageTransform(shape),
        origin = transform.applyToPoint({ x: 0, y: 0 }),
        x = transform.applyToPoint({ x: 1, y: 0 }),
        y = transform.applyToPoint({ x: 0, y: 1 });
      const paint = transformAppearance(
        scalePaint(vectorPaint(shape.meta, (shape.props as any).color), factor),
        [
          x.x - origin.x,
          x.y - origin.y,
          y.x - origin.x,
          y.y - origin.y,
          origin.x * factor,
          origin.y * factor,
        ],
      );
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
        (((paint.fill !== "none" || paint.gradient || paint.raster) &&
          paint.fillOpacity !== 1) ||
          (paint.stroke !== "none" && paint.strokeOpacity !== 1) ||
          (paint.raster?.alpha || paint.raster?.hasAlpha))
      )
        throw new Error("opacity");
      if (shape.type === "geo" && (shape.props as any).fill !== "none")
        throw new Error("style");
      total += contours.reduce((n, c) => n + c.nodes.length, 0);
      if (total > 20000) throw new Error("limit");
      paths.push({
        contours,
        paint,
        fillRule: (shape.props as any).fillRule ?? "evenodd",
      });
    } catch (error) {
      if ((error as Error).message === "limit") throw error;
      omitted.push(drawingObjectName(shape));
    }
  }
  return {
    text: paths.length && !deferRaster ? serializeVectorDocument(paths, format) : "",
    paths,
    omitted,
    revision: cadRevision(editor),
  };
}
