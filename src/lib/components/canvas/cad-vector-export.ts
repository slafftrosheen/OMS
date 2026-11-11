import type { Editor } from "@tldraw/tldraw";
import { shapeCadContours } from "./cad-editing";
import {
  contourSegments,
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
  const bounds = curveBounds(paths.flatMap((p) => p.contours));
  // Include possible miter extensions and round/square caps in the media box.
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
  const body: string[] = [];
  for (const [index, path] of paths.entries()) {
    const p = path.paint,
      pdf = format === "pdf";
    if (
      !pdf &&
      ((p.fill !== "none" && p.fillOpacity !== 1) ||
        (p.stroke !== "none" && p.strokeOpacity !== 1))
    )
      throw new Error("eps-opacity");
    body.push(pdf ? "q" : "gsave");
    if (pdf) body.push(`/GS${index} gs`);
    body.push(
      `${num(p.strokeWidth)} ${pdf ? "w" : "setlinewidth"}`,
      `${["butt", "round", "square"].indexOf(p.lineCap)} ${pdf ? "J" : "setlinecap"}`,
      `${["miter", "round", "bevel"].indexOf(p.lineJoin)} ${pdf ? "j" : "setlinejoin"}`,
      `${num(p.miterLimit)} ${pdf ? "M" : "setmiterlimit"}`,
      `[${p.dash.map(num).join(" ")}] ${num(p.dashOffset)} ${pdf ? "d" : "setdash"}`,
    );
    if (!pdf) body.push("newpath");
    const contours = mapContours(path.contours, (q) => ({
      x: q.x - bounds.x + padding,
      y: height - (q.y - bounds.y + padding),
    }));
    for (const c of contours) {
      body.push(
        `${num(c.nodes[0].x)} ${num(c.nodes[0].y)} ${pdf ? "m" : "moveto"}`,
      );
      for (const segment of contourSegments(c))
        body.push(
          `${segment
            .slice(1)
            .map((q) => `${num(q.x)} ${num(q.y)}`)
            .join(" ")} ${pdf ? "c" : "curveto"}`,
        );
      if (c.closed) body.push(pdf ? "h" : "closepath");
    }
    const fill = p.fill !== "none",
      stroke = p.stroke !== "none";
    if (pdf) {
      if (fill) body.push(`${rgb(p.fill)} rg`);
      if (stroke) body.push(`${rgb(p.stroke)} RG`);
      body.push(
        fill
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
      if (fill)
        body.push(
          `gsave ${rgb(p.fill)} setrgbcolor ${path.fillRule === "evenodd" ? "eofill" : "fill"} grestore`,
        );
      if (stroke) body.push(`${rgb(p.stroke)} setrgbcolor stroke`);
    }
    body.push(pdf ? "Q" : "grestore");
  }
  const stream = body.join("\n") + "\n";
  if (stream.length > 16e6) throw new Error("limit");
  if (format === "eps")
    return `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}\n%%HiResBoundingBox: 0 0 ${num(width)} ${num(height)}\n%%LanguageLevel: 2\n%%Pages: 1\n%%EndComments\n${stream}showpage\n%%EOF\n`;
  const states = paths
    .map(
      (p, i) =>
        `/GS${i} << /Type /ExtGState /ca ${num(p.paint.fillOpacity)} /CA ${num(p.paint.strokeOpacity)} >>`,
    )
    .join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Resources << /ExtGState << ${states} >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, "0") + " 00000 n \n")
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
      const paint = scalePaint(
        vectorPaint(shape.meta, (shape.props as any).color),
        factor,
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
        ((paint.fill !== "none" && paint.fillOpacity !== 1) ||
          (paint.stroke !== "none" && paint.strokeOpacity !== 1))
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
    text: paths.length ? serializeVectorDocument(paths, format) : "",
    paths,
    omitted,
    revision: cadRevision(editor),
  };
}
