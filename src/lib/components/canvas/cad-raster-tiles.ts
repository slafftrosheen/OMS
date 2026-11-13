import { curveBounds, mapContours, type CadContour } from './cad-curves';
import { multiplyMatrix, type VectorMatrix, type VectorRaster } from './cad-appearance';

export const MAX_MATERIAL_TILES = 4096;
/** Bound the original Bézier curves in tile space, then enumerate only cells
 * intersecting those bounds. The actual fill rule still clips holes and edges. */
export function rasterTileMatrices(raster: VectorRaster, contours: CadContour[], limit = MAX_MATERIAL_TILES): VectorMatrix[] {
  if (!raster.repeat) return [raster.matrix];
  const [a,b,c,d,e,f] = raster.matrix, det = a*d-b*c;
  if (!Number.isFinite(det) || Math.abs(det) <= 1e-15) throw new Error('geometry');
  const bounds = curveBounds(mapContours(contours, p => ({
    x: (d*(p.x-e)-c*(p.y-f))/det,
    y: (-b*(p.x-e)+a*(p.y-f))/det,
  })));
  const minX = Math.floor(bounds.x + 1e-10), maxX = Math.ceil(bounds.x+bounds.w-1e-10)-1;
  const minY = Math.floor(bounds.y + 1e-10), maxY = Math.ceil(bounds.y+bounds.h-1e-10)-1;
  const count = (maxX-minX+1)*(maxY-minY+1);
  if (![minX,maxX,minY,maxY,count].every(Number.isSafeInteger) || count < 1 || count > limit) throw new Error('material-tiles');
  const result: VectorMatrix[] = [];
  for (let y=minY;y<=maxY;y++) for (let x=minX;x<=maxX;x++)
    result.push(multiplyMatrix(raster.matrix,[1,0,0,1,x,y]));
  return result;
}
