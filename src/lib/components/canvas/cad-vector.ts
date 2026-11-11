import type { Editor } from "@tldraw/tldraw";
import { getDefaultColorTheme } from "@tldraw/tldraw";
import { mapContours, validContours, type CadContour } from "./cad-curves";
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
): CadPlan {
  assertCadEditable(editor, sourceIds);
  if (
    ![widthMm, document.width, document.height].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    widthMm > 1e6 ||
    !document.paths.length
  )
    throw new CadOperationError("geometry");
  const scale = widthMm / document.width / cadMmPerPixel(settings);
  const paths = document.paths.map((p) => ({
    ...p,
    contours: mapContours(p.contours, (q) => ({
      x: point.x + q.x * scale,
      y: point.y + q.y * scale,
    })),
    paint: scalePaint(p.paint, scale),
  }));
  if (
    paths.some((p) => !validContours(p.contours) || !validVectorPaint(p.paint))
  )
    throw new CadOperationError("limit");
  return makeCadPlan(
    editor,
    settings,
    paths.flatMap((p) => p.contours),
    {
      name,
      sourceIds,
      removeIds,
      warnings: document.warnings,
      shapes: paths.map((p, i) => ({
        type: "cad-bezier",
        x: 0,
        y: 0,
        props: { contours: p.contours, fillRule: p.fillRule },
        meta: { omsObjectName: `${name} · ${i + 1}`, omsVectorPaint: p.paint },
      })),
    },
  );
}
