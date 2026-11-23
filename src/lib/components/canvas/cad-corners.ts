import type { Editor } from "@tldraw/tldraw";
import { cadSelectedShapes, shapeCadContours } from "./cad-editing";
import { nodeAt, validContours, type CadContour } from "./cad-curves";
import { makeCadPlan, CadOperationError } from "./cad-plans";
import { cadMmPerPixel, type CadSettings } from "./cad-settings";
import { circularFilletNodes, NODE_FILLET_TOLERANCE_MM } from './cad-node-corners';

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
  outgoing = amount,
  tolerance = NODE_FILLET_TOLERANCE_MM,
): CadContour {
  const nodes = contour.nodes;
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(tolerance) || tolerance <= 0 ||
    (kind === 'chamfer' && (!Number.isFinite(outgoing) || outgoing <= 0)) ||
    !contour.closed ||
    nodes.length < 3 ||
    nodes.length > 256 ||
    nodes.some((n) => n.inX || n.inY || n.outX || n.outY)
  )
    throw new CadOperationError("corners");
  let direction = 0, totalTurn = 0;
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
    totalTurn += Math.PI - angle;
    const cut = kind === "chamfer" ? amount : amount / Math.tan(angle / 2);
    const nextCut = kind === 'chamfer' ? outgoing : cut;
    if (!Number.isFinite(cut) || cut < 1e-8 || cut >= before - 1e-8 || nextCut >= after - 1e-8) throw new CadOperationError('corner-size');
    const replacement = kind === 'fillet' ? circularFilletNodes(p, u, v, amount, cut, tolerance)
      : [nodeAt({ x: p.x + u.x * cut, y: p.y + u.y * cut }), nodeAt({ x: p.x + v.x * nextCut, y: p.y + v.y * nextCut })];
    return { replacement, cut, nextCut, after };
  });
  // A consistently turning star can still cross itself. A convex boundary makes one full turn.
  if (Math.abs(totalTurn - 2 * Math.PI) > 1e-6) throw new CadOperationError('corners');
  if (
    corners.some(
      (c, i) => c.nextCut + corners[(i + 1) % corners.length].cut >= c.after - 1e-8,
    )
  )
    throw new CadOperationError("corner-size");
  const result = { closed: true, nodes: corners.flatMap(c => c.replacement) };
  if (!validContours([result])) throw new CadOperationError('limit');
  return result;
}
export function prepareCorners(
  editor: Editor,
  settings: CadSettings,
  amountMm: number,
  kind: "fillet" | "chamfer",
  outgoingMm = amountMm,
) {
  const shapes = cadSelectedShapes(editor);
  if (shapes.length !== 1) throw new CadOperationError("selection");
  const shape = shapes[0],
    source = shapeCadContours(editor, shape);
  if (source.length !== 1) throw new CadOperationError("corners");
  const factor = cadMmPerPixel(settings);
  const contours = [cornerContour(source[0], amountMm / factor, kind, outgoingMm / factor, NODE_FILLET_TOLERANCE_MM / factor)];
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
