declare module 'clipper-lib' {
  const ClipperLib: any;
  export default ClipperLib;
}
declare module 'fontkit' {
  export function create(bytes: Uint8Array): any;
}
declare module 'imagetracerjs' {
  const tracer: {
    imagedataToTracedata(image: { width: number; height: number; data: Uint8ClampedArray }, options: Record<string, unknown>): any;
    /** Pinned 1.2.6 public intermediate stages: retain raw pixel boundaries
     * before ImageTracer's direction-limited line/quadratic fitting. */
    layeringstep(image: { array: number[][]; palette: { r: number; g: number; b: number; a: number }[] }, index: number): number[][];
    pathscan(layer: number[][], minimumBoundaryLength: number): {
      points: { x: number; y: number; t: number }[];
      boundingbox: [number, number, number, number];
      isholepath: boolean;
      holechildren: number[];
    }[];
  };
  export default tracer;
}
