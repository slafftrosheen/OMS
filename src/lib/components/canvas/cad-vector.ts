import { transformAppearance } from "./cad-appearance";
import type { Editor } from "@tldraw/tldraw";
import { getDefaultColorTheme } from "@tldraw/tldraw";
import { curveBounds, mapContours, validContours, type CadContour } from "./cad-curves";
import {
  makeCadPlan,
  assertCadEditable,
  CadOperationError,
  type CadPlan, type CadPlannedShape,
} from "./cad-plans";
import { cadMmPerPixel, type CadSettings } from "./cad-settings";

import {
  VECTOR_DEFAULT_PAINT,
  validVectorPaint,
  scalePaint,
  type VectorPaint,
  type VectorDocument,
} from "./cad-paint";
export * from "./cad-paint";
export function vectorPaint(
  meta: Record<string, any>,
  color = "black",
): VectorPaint {
  if (validVectorPaint(meta?.omsVectorPaint))
    return structuredClone(meta.omsVectorPaint);
  const theme = getDefaultColorTheme({ isDarkMode: false });
  return {
    ...VECTOR_DEFAULT_PAINT,
    stroke: theme[color]?.solid ?? "#000000",
    dash: [],
  };
}
/** Input coordinates are Y-down; widthMm is the full bitmap/page width, not ink bounds. */
export function prepareVectorImport(
  editor: Editor,
  settings: CadSettings,
  document: VectorDocument,
  widthMm: number,
  point: { x: number; y: number },
  name: string,
  sourceIds: string[] = [],
  removeIds: string[] = [],
  options: { center?: boolean; group?: boolean; compactForSave?: boolean } = {},
): CadPlan {
  assertCadEditable(editor, sourceIds);
  if (
    ![widthMm, document.width, document.height].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    widthMm > 1e6 ||
    !document.paths.length || ![point.x, point.y].every(Number.isFinite)
  )
    throw new CadOperationError("geometry");
  const mmPerPixel = cadMmPerPixel(settings);
  const scale = widthMm / document.width / mmPerPixel;
  let { x, y } = point;
  if (options.center) {
    const bounds = curveBounds(document.paths.flatMap(path => path.contours));
    x -= (bounds.x + bounds.w / 2) * scale;
    y -= (bounds.y + bounds.h / 2) * scale;
  }
  const paths = document.paths.map((p) => ({
    ...p,
    contours: mapContours(p.contours, (q) => ({
      x: x + q.x * scale,
      y: y + q.y * scale,
    })),
    paint: transformAppearance(scalePaint(p.paint, scale), [
      1,
      0,
      0,
      1,
      x,
      y,
    ]),
  }));
  const shapes: CadPlannedShape[] = paths.map((p, i) => ({
    type: "cad-bezier",
    x: 0,
    y: 0,
    opacity: 1,
    props: { contours: p.contours, fillRule: p.fillRule },
    meta: { omsObjectName: `${name} · ${i + 1}`, omsVectorPaint: p.paint },
  }));
  const warnings = [...document.warnings];
  if (editor.store) {
    const space = 1_900_000 - JSON.stringify(editor.store.getStoreSnapshot()).length;
    if (JSON.stringify(shapes).length > space) {
      if (!options.compactForSave || space <= 0) throw new CadOperationError("save-limit");
      // Keep the nodes and Bézier topology. Round anchors and handle deltas to
      // a physical grid no larger than 1 nm, only to fit the save budget.
      const digits = Math.max(0, Math.ceil(Math.log10(mmPerPixel / 0.000001)));
      for (const path of paths) {
        const contours = [...path.contours, ...(path.paint.clips ?? []).flatMap(clip => clip.contours)];
        for (const contour of contours) for (const node of contour.nodes)
          for (const field of ['x', 'y', 'inX', 'inY', 'outX', 'outY'] as const)
            node[field] = Number(node[field].toFixed(digits));
      }
      if (JSON.stringify(shapes).length > space) throw new CadOperationError("save-limit");
      warnings.push("vector-compact");
    }
  }
  if (
    paths.some((p) => !validContours(p.contours) || !validVectorPaint(p.paint))
  )
    throw new CadOperationError("limit");
  // Optional PDF paint fields may be undefined. tldraw rejects them in a
  // record even though JSON.stringify would silently drop them on save.
  for (const [i, path] of paths.entries()) shapes[i].meta!.omsVectorPaint = paintMetadata(path.paint);
  return makeCadPlan(
    editor,
    settings,
    paths.flatMap((p) => p.contours),
    {
      name,
      sourceIds,
      removeIds,
      warnings,
      groupResult: options.group,
      shapes,
    },
  );
}

/** JSON-normalized metadata removes absent optional fields before persistence. */
export function paintMetadata(
  paint: VectorPaint,
): import("@tldraw/tldraw").JsonObject {
  if (!validVectorPaint(paint)) throw new CadOperationError("geometry");
  return JSON.parse(JSON.stringify(paint));
}
