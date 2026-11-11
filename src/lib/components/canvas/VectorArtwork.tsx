import React from "react";
import { curvePathData, type CadContour } from "./cad-curves";
import type { VectorPaint } from "./cad-paint";
/** Shared by the actual canvas, SVG export and the import preview. IDs include
 * a caller prefix so previews and live objects never share gradient/clip IDs. */
export function VectorArtwork({
  id,
  contours,
  fillRule,
  paint: p,
}: {
  id: string;
  contours: CadContour[];
  fillRule: "evenodd" | "nonzero";
  paint: VectorPaint;
}) {
  const prefix = id.replace(/[^a-zA-Z0-9_-]/g, "_"),
    g = p.gradient,
    r = p.raster;
  const data = curvePathData(contours);
  let fill: React.ReactNode = r ? (
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
        strokeWidth={p.strokeWidth}
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
            <path d={curvePathData(contours)} clipRule={fillRule} />
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
