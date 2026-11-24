/**
 * DrawingGrid — Reclame Fabriek OMS · Round 3
 * Drafting-paper grid: hairline minor lines, stronger major lines, no dots.
 * Uses tldraw's zoom steps and fade. Visibility is independent of snapping.
 */
import { useId } from 'react';
import { useEditor, useValue, type TLGridProps } from '@tldraw/tldraw';

import { drawingGridVisible } from './drawing-grid-state';

export function DrawingGridBackground() {
  const editor = useEditor();
  const visible = useValue('Drawing grid visibility', () => drawingGridVisible(editor).get(), [editor]);
  const camera = useValue('Drawing grid camera', () => editor.getCamera(), [editor]);
  const size = useValue('Drawing grid spacing', () => editor.getDocumentSettings().gridSize, [editor]);
  return <div className="tl-background">{visible && <DrawingGrid {...camera} size={size} />}</div>;
}

const fade = (z: number, min: number, mid: number) =>
  z >= mid ? 1 : z <= min ? 0 : (z - min) / (mid - min);

export function DrawingGrid({ x, y, z, size }: TLGridProps) {
  const id = `rf_grid_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const editor = useEditor();
  const steps = editor.options.gridSteps;
  const last = steps.length - 1;
  // At CAD overview zooms, subpixel SVG tiles are both illegible and expensive.
  const visible = steps.map(({ min, mid, step }, i) => ({ step, spacing: step * size * z, opacity: fade(z, min, mid), major: i === last }))
    .filter(({ spacing, opacity }) => Number.isFinite(spacing) && spacing >= 4 && opacity > 0);
  if (!visible.length) return null;
  return (
    <svg className="tl-grid rf-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {visible.map(({ step, spacing: s, opacity, major }) => {
          const xo = 0.5 + x * z;
          const yo = 0.5 + y * z;
          const gx = xo > 0 ? xo % s : s + (xo % s);
          const gy = yo > 0 ? yo % s : s + (yo % s);
          return (
            <pattern key={step} id={`${id}_${step}`} width={s} height={s} patternUnits="userSpaceOnUse">
              <path d={`M ${gx} 0 V ${s} M 0 ${gy} H ${s}`} className={major ? 'rf-grid-major' : 'rf-grid-minor'}
                opacity={opacity} shapeRendering="crispEdges" />
            </pattern>
          );
        })}
      </defs>
      {visible.map(({ step }) => <rect key={step} width="100%" height="100%" fill={`url(#${id}_${step})`} />)}
    </svg>
  );
}
