/**
 * DrawingGrid — Reclame Fabriek OMS · Round 3
 * Drafting-paper grid: hairline minor lines, stronger major lines, no dots.
 * Same zoom steps and fade as tldraw's default grid, so snapping is unchanged;
 * only the drawing of the grid differs. Colours come from --rf-grid-minor / --rf-grid-major,
 * which fabriek-canvas.css sets per surface (paper / night blueprint).
 */
import { useId } from 'react';
import { useEditor, type TLGridProps } from '@tldraw/tldraw';

const fade = (z: number, min: number, mid: number) =>
  z >= mid ? 1 : z <= min ? 0 : (z - min) / (mid - min);

export function DrawingGrid({ x, y, z, size }: TLGridProps) {
  const id = `rf_grid_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const editor = useEditor();
  const steps = editor.options.gridSteps;
  const last = steps.length - 1;
  return (
    <svg className="tl-grid rf-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {steps.map(({ min, mid, step }, i) => {
          const s = step * size * z;
          const xo = 0.5 + x * z;
          const yo = 0.5 + y * z;
          const gx = xo > 0 ? xo % s : s + (xo % s);
          const gy = yo > 0 ? yo % s : s + (yo % s);
          return (
            <pattern key={i} id={`${id}_${step}`} width={s} height={s} patternUnits="userSpaceOnUse">
              <path d={`M ${gx} 0 V ${s} M 0 ${gy} H ${s}`} className={i === last ? 'rf-grid-major' : 'rf-grid-minor'}
                opacity={fade(z, min, mid)} shapeRendering="crispEdges" />
            </pattern>
          );
        })}
      </defs>
      {steps.map(({ step }, i) => <rect key={i} width="100%" height="100%" fill={`url(#${id}_${step})`} />)}
    </svg>
  );
}
