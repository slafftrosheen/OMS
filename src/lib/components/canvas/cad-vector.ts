import { transformAppearance } from "./cad-appearance";
import type { Editor } from "@tldraw/tldraw";
import { getDefaultColorTheme } from "@tldraw/tldraw";
import { curveBounds, mapContours, validContours, type CadContour } from "./cad-curves";
import {
  makeCadPlan,
  assertCadEditable,
  CadOperationError,
  type CadPlan,
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
  options: { center?: boolean; group?: boolean } = {},
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
  const scale = widthMm / document.width / cadMmPerPixel(settings);
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
  if (
    paths.some((p) => !validContours(p.contours) || !validVectorPaint(p.paint))
  )
    throw new CadOperationError("limit");
  const plan = makeCadPlan(
    editor,
    settings,
    paths.flatMap((p) => p.contours),
    {
      name,
      sourceIds,
      removeIds,
      warnings: document.warnings,
      groupResult: options.group,
      shapes: paths.map((p, i) => ({
        type: "cad-bezier",
        x: 0,
        y: 0,
        opacity: 1,
        props: { contours: p.contours, fillRule: p.fillRule },
        meta: { omsObjectName: `${name} · ${i + 1}`, omsVectorPaint: p.paint },
      })),
    },
  );
  if (
    editor.store &&
    JSON.stringify(editor.store.getStoreSnapshot()).length +
      JSON.stringify(plan.shapes).length >
      1_900_000
  )
    throw new CadOperationError("save-limit");
  return plan;
}

/** JSON-normalized metadata removes absent optional fields before persistence. */
export function paintMetadata(
  paint: VectorPaint,
): import("@tldraw/tldraw").JsonObject {
  if (!validVectorPaint(paint)) throw new CadOperationError("geometry");
  return JSON.parse(JSON.stringify(paint));
}
