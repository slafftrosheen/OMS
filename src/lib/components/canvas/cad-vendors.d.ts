declare module 'clipper-lib' {
  const ClipperLib: any;
  export default ClipperLib;
}
declare module 'fontkit' {
  export function create(bytes: Uint8Array): any;
}
declare module 'imagetracerjs' {
  const tracer: { imagedataToTracedata(image: { width: number; height: number; data: Uint8ClampedArray }, options: Record<string, unknown>): any };
  export default tracer;
}
