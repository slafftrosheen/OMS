import React from "react";
import { useValue, type Editor } from '@tldraw/tldraw';
import { curvePathData, type CadContour } from "./cad-curves";
import { vectorDisplayStrokeWidth, type VectorPaint } from "./cad-paint";
/** Shared by the actual canvas, SVG export and the import preview. IDs include
 * a caller prefix so previews and live objects never share gradient/clip IDs. */
export function VectorArtwork({ id, contours, fillRule, paint, editor }: {
  id: string; contours: CadContour[]; fillRule: "evenodd" | "nonzero"; paint: VectorPaint; editor?: Editor;
}) {
  return <VectorPathArtwork id={id} data={curvePathData(contours)} fillRule={fillRule} paint={paint} editor={editor} />;
}

/** Exact SVG path variant shared with analytic CAD primitives. */
export function VectorPathArtwork({ id, data, fillRule, paint: p, editor }: {
  id: string; data: string; fillRule: "evenodd" | "nonzero"; paint: VectorPaint; editor?: Editor;
}) {
  // Only live artwork follows camera zoom. SVG/raster export and import
  // previews use the positive physical fallback carried by the paint.
  const strokeWidth = useValue('CAD visible hairline', () => vectorDisplayStrokeWidth(p, editor?.getZoomLevel()), [p, editor]);
  const prefix = id.replace(/[^a-zA-Z0-9_-]/g, "_"),
    g = p.gradient,
    r = p.raster;
  let fill: React.ReactNode = r?.repeat ? (
    <path d={data} fill={`url(#${prefix}-texture)`} fillRule={fillRule} fillOpacity={p.fillOpacity} stroke="none" />
  ) : r ? (
    <g clipPath={`url(#${prefix}-boundary)`}>
      <image
        href={r.png}
        width={1}
        height={1}
        preserveAspectRatio="none"
        transform={`matrix(${r.matrix.join(" ")})`}
        opacity={p.fillOpacity}
      />
    </g>
  ) : (
    <path
      d={data}
      fill={g ? `url(#${prefix}-gradient)` : p.fill}
      fillRule={fillRule}
      fillOpacity={p.fillOpacity}
      stroke="none"
    />
  );
  if (g?.bounds) fill = <g clipPath={`url(#${prefix}-gradient-box)`}>{fill}</g>;
  let content: React.ReactNode = (
    <>
      {fill}
      <path
        d={data}
        fill="none"
        stroke={p.stroke}
        strokeWidth={strokeWidth}
        data-oms-hairline={p.hairline ? 'true' : undefined}
        strokeOpacity={p.strokeOpacity}
        strokeLinecap={p.lineCap}
        strokeLinejoin={p.lineJoin}
        strokeMiterlimit={p.miterLimit}
        strokeDasharray={p.dash.length ? p.dash.join(" ") : undefined}
        strokeDashoffset={p.dashOffset}
      />
    </>
  );
  p.clips?.forEach((_, i) => {
    content = <g clipPath={`url(#${prefix}-clip-${i})`}>{content}</g>;
  });
  return (
    <>
      <defs>
        {r?.repeat && (
          <pattern id={`${prefix}-texture`} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse"
            width={1} height={1} patternTransform={`matrix(${r.matrix.join(' ')})`}>
            <image href={r.png} width={1} height={1} preserveAspectRatio="none" />
          </pattern>
        )}
        {g?.bounds && (
          <clipPath
            id={`${prefix}-gradient-box`}
            clipPathUnits="userSpaceOnUse"
          >
            <rect
              x={g.bounds[0]}
              y={g.bounds[1]}
              width={g.bounds[2] - g.bounds[0]}
              height={g.bounds[3] - g.bounds[1]}
              transform={`matrix(${g.matrix.join(" ")})`}
            />
          </clipPath>
        )}
        {p.clips?.map((c, i) => (
          <clipPath
            key={i}
            id={`${prefix}-clip-${i}`}
            clipPathUnits="userSpaceOnUse"
          >
            <path d={curvePathData(c.contours)} clipRule={c.fillRule} />
          </clipPath>
        ))}
        {r && (
          <clipPath id={`${prefix}-boundary`} clipPathUnits="userSpaceOnUse">
            <path d={data} clipRule={fillRule} />
          </clipPath>
        )}
        {g &&
          (g.type === "linear" ? (
            <linearGradient
              id={`${prefix}-gradient`}
              gradientUnits="userSpaceOnUse"
              x1={g.start[0]}
              y1={g.start[1]}
              x2={g.end[0]}
              y2={g.end[1]}
              gradientTransform={`matrix(${g.matrix.join(" ")})`}
            >
              {g.stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          ) : (
            <radialGradient
              id={`${prefix}-gradient`}
              gradientUnits="userSpaceOnUse"
              fx={g.start[0]}
              fy={g.start[1]}
              fr={g.r0}
              cx={g.end[0]}
              cy={g.end[1]}
              r={g.r1}
              gradientTransform={`matrix(${g.matrix.join(" ")})`}
            >
              {g.stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </radialGradient>
          ))}
      </defs>
      {content}
    </>
  );
}
