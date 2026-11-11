import type { Editor } from "@tldraw/tldraw";
import { cadSelectedShapes, shapeCadContours } from "./cad-editing";
import { nodeAt, type CadContour } from "./cad-curves";
import { makeCadPlan, CadOperationError } from "./cad-plans";
import { cadMmPerPixel, type CadSettings } from "./cad-settings";

export function regularPolygon(
  sides: number,
  diameter: number,
  rotation: number,
  innerRatio = 1,
): CadContour {
  if (
    !Number.isInteger(sides) ||
    sides < 3 ||
    sides > 64 ||
    !Number.isFinite(diameter) ||
    diameter <= 0 ||
    diameter > 1e6 ||
    !Number.isFinite(rotation) ||
    Math.abs(rotation) > 36000 ||
    !Number.isFinite(innerRatio) ||
    innerRatio < 0.1 ||
    innerRatio > 1
  )
    throw new CadOperationError("geometry");
  const star = innerRatio < 1,
    count = sides * (star ? 2 : 1);
  return {
    closed: true,
    nodes: Array.from({ length: count }, (_, i) => {
      const angle =
        ((rotation - 90) * Math.PI) / 180 + (i * Math.PI * 2) / count;
      const radius = (diameter / 2) * (star && i % 2 ? innerRatio : 1);
      return nodeAt({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }),
  };
}

/** All corners on a simple closed straight contour. Never silently clamps the requested size. */
export function cornerContour(
  contour: CadContour,
  amount: number,
  kind: "fillet" | "chamfer",
): CadContour {
  const nodes = contour.nodes;
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !contour.closed ||
    nodes.length < 3 ||
    nodes.length > 256 ||
    nodes.some((n) => n.inX || n.inY || n.outX || n.outY)
  )
    throw new CadOperationError("corners");
  let direction = 0;
  const corners = nodes.map((p, i) => {
    const prev = nodes[(i + nodes.length - 1) % nodes.length],
      next = nodes[(i + 1) % nodes.length];
    const before = Math.hypot(prev.x - p.x, prev.y - p.y),
      after = Math.hypot(next.x - p.x, next.y - p.y);
    if (before < 1e-8 || after < 1e-8) throw new CadOperationError("corners");
    const u = { x: (prev.x - p.x) / before, y: (prev.y - p.y) / before },
      v = { x: (next.x - p.x) / after, y: (next.y - p.y) / after };
    const cross = -u.x * v.y + u.y * v.x,
      sign = Math.sign(cross);
    // Convex only: keeps the operation predictable and avoids self-intersection at concave vertices.
    if (!sign || (direction && direction !== sign))
      throw new CadOperationError("corners");
    direction = sign;
    const angle = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
    const cut = kind === "chamfer" ? amount : amount / Math.tan(angle / 2);
    const a = nodeAt({ x: p.x + u.x * cut, y: p.y + u.y * cut }),
      b = nodeAt({ x: p.x + v.x * cut, y: p.y + v.y * cut });
    if (kind === "fillet") {
      const handle = (4 / 3) * Math.tan((Math.PI - angle) / 4) * amount;
      a.outX = -u.x * handle;
      a.outY = -u.y * handle;
      b.inX = -v.x * handle;
      b.inY = -v.y * handle;
    }
    return { a, b, cut, after };
  });
  if (
    corners.some(
      (c, i) => c.cut + corners[(i + 1) % corners.length].cut >= c.after - 1e-8,
    )
  )
    throw new CadOperationError("corner-size");
  return { closed: true, nodes: corners.flatMap((c) => [c.a, c.b]) };
}
export function prepareCorners(
  editor: Editor,
  settings: CadSettings,
  amountMm: number,
  kind: "fillet" | "chamfer",
) {
  const shapes = cadSelectedShapes(editor);
  if (shapes.length !== 1) throw new CadOperationError("selection");
  const shape = shapes[0],
    source = shapeCadContours(editor, shape);
  if (source.length !== 1) throw new CadOperationError("corners");
  const contours = [
    cornerContour(source[0], amountMm / cadMmPerPixel(settings), kind),
  ];
  return makeCadPlan(editor, settings, contours, {
    name: kind,
    sourceIds: [shape.id],
    removeIds: [shape.id],
    warnings: kind === "fillet" ? ["corner-approximation"] : [],
    shapes: [
      {
        type: "cad-bezier",
        x: 0,
        y: 0,
        props: {
          contours,
          color: (shape.props as any).color ?? "black",
          fillRule: (shape.props as any).fillRule ?? "evenodd",
        },
        meta: { ...shape.meta },
      },
    ],
  });
}
