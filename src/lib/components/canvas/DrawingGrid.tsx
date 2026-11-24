/**
 * DrawingGrid — Reclame Fabriek OMS · Round 3
 * Drafting-paper grid: hairline minor lines, stronger major lines, no dots.
 * Adapts its density to the drawing scale. Visibility is independent of snapping.
 */
import { useId } from 'react';
import { useEditor, useValue, type TLGridProps } from '@tldraw/tldraw';

import { drawingGridLevels, drawingGridVisible } from './drawing-grid-state';

export function DrawingGridBackground() {
  const editor = useEditor();
  const visible = useValue('Drawing grid visibility', () => drawingGridVisible(editor).get(), [editor]);
  const camera = useValue('Drawing grid camera', () => editor.getCamera(), [editor]);
  const size = useValue('Drawing grid spacing', () => editor.getDocumentSettings().gridSize, [editor]);
  return <div className="tl-background">{visible && <DrawingGrid {...camera} size={size} />}</div>;
}

export function DrawingGrid({ x, y, z, size }: TLGridProps) {
  const id = `rf_grid_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const visible = drawingGridLevels(size, z);
  if (!visible.length) return null;
  return (
    <svg className="tl-grid rf-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {visible.map(({ step, spacing: s, major }) => {
          const xo = 0.5 + x * z;
          const yo = 0.5 + y * z;
          const gx = xo > 0 ? xo % s : s + (xo % s);
          const gy = yo > 0 ? yo % s : s + (yo % s);
          return (
            <pattern key={step} id={`${id}_${step}`} width={s} height={s} patternUnits="userSpaceOnUse">
              <path d={`M ${gx} 0 V ${s} M 0 ${gy} H ${s}`} className={major ? 'rf-grid-major' : 'rf-grid-minor'}
                shapeRendering="crispEdges" />
            </pattern>
          );
        })}
      </defs>
      {visible.map(({ step }) => <rect key={step} width="100%" height="100%" fill={`url(#${id}_${step})`} />)}
    </svg>
  );
}
