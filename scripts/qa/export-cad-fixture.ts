/** Generate known production-sized geometry for an independent DXF reader. */
import { writeFileSync } from 'node:fs';
import { serializeCadDxf } from '../../src/lib/components/canvas/cad-dxf';
import { nodeAt } from '../../src/lib/components/canvas/cad-curves';
const path = process.argv[2] ?? '/tmp/oms-cad-regression.dxf';
const result = serializeCadDxf([
  { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 600 }, { x: 0, y: 600 }], closed: true },
  { type: 'circle', center: { x: 100, y: 100 }, radius: 25 },
  { type: 'ellipse', center: { x: 600, y: 300 }, major: { x: 100, y: 100 }, ratio: 0.5 },
  { type: 'arc', center: { x: 1050, y: 150 }, radius: 100, start: 350, end: 80 },
  { type: 'polyline', points: [{ x: -20, y: 0 }, { x: -20, y: 600 }], closed: false },
  { type: 'spline', contour: { closed: true, nodes: [{ ...nodeAt({ x: 200, y: 100 }), outY: 100, inY: -100 }, { ...nodeAt({ x: 400, y: 100 }), inY: 100, outY: -100 }] } },
  { type: 'spline', contour: { closed: false, nodes: [{ ...nodeAt({ x: 300, y: 300 }), outX: 50, outY: 100 }, { ...nodeAt({ x: 500, y: 300 }), inX: -50, inY: 100 }] } },
]);
writeFileSync(path, result.text, 'utf8');
console.log(`Wrote ${path}: ${result.widthMm} × ${result.heightMm} mm, 7 entities`);
