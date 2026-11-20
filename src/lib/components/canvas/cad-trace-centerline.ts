import { validContours } from './cad-curves';
import { VECTOR_DEFAULT_PAINT, type VectorDocument } from './cad-paint';
import { validTraceRasterInput, type TraceRasterInput } from './cad-trace-background';
import { fitCenterlineChains } from './cad-trace-centerline-fit';
import { MAX_TRACE_BOUNDARY_POINTS, validTraceOptions, type TraceOptions } from './cad-trace-options';
import { readCenterlineSkeleton } from './cad-trace-skeleton';

/** Monochrome centerlines are native stroked curves. Their one-working-pixel
 * paint is a preview placeholder; the import flow applies the user's chosen
 * physical stroke width. Original stroke thickness/pressure is not recovered. */
export function traceCenterlineRaster(input: TraceRasterInput, options: TraceOptions): VectorDocument {
  if (!validTraceRasterInput(input)) throw new Error('limit');
  if (!validTraceOptions(options) || options.mode !== 'mono') throw new Error('geometry');
  const skeleton = readCenterlineSkeleton(input, options.threshold);
  // Noise suppresses an entire isolated component by its total skeleton length.
  // A short arm belonging to a larger connected drawing always survives.
  const retained = skeleton.components.filter(component => component.length >= options.noise);
  const noiseRemoved = retained.length !== skeleton.components.length;
  const chains = retained.flatMap(component => component.chains);
  if (!chains.length) throw new Error('trace-centerline-empty');
  if (chains.length > 512 || chains.reduce((sum, chain) => sum + chain.points.length, 0) > MAX_TRACE_BOUNDARY_POINTS) throw new Error('limit');
  const fitted = fitCenterlineChains(chains, options.smoothing, options.preserveCorners);
  if (!validContours(fitted.contours)) throw new Error('limit');
  let offset = 0;
  const paths = retained.map(component => {
    const contours = fitted.contours.slice(offset, offset + component.chains.length);
    offset += component.chains.length;
    return { contours, fillRule: 'nonzero' as const, paint: { ...VECTOR_DEFAULT_PAINT,
      fill: 'none', stroke: '#000000', strokeWidth: 1, lineCap: 'round' as const, lineJoin: 'round' as const, dash: [] } };
  });
  return { paths, width: input.width, height: input.height, warnings: ['trace-centerline-approximation',
    ...(noiseRemoved ? ['trace-noise'] : []), ...(skeleton.isolatedDots ? ['trace-centerline-dots'] : []),
    ...(fitted.conservative ? ['trace-topology'] : [])] };
}
