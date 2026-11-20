/** Pure configuration shared by the controls and the worker. Importing these
 * controls must not pull the raster extraction/fitting engine into the UI. */
export type TraceBackground = 'keep' | 'border' | 'all';
export type TraceMethod = 'outline' | 'centerline';
export interface TraceOptions {
  /** Older callers and saved drafts continue to use filled-outline tracing. */
  method?: TraceMethod;
  mode: 'mono' | 'color';
  threshold: number;
  colors: number;
  smoothing: number;
  noise: number;
  /** Legacy callers retain their original global-white behavior. */
  removeWhite: boolean;
  preserveCorners: boolean;
  /** Explicit scope wins; absence resolves from removeWhite for compatibility. */
  background?: TraceBackground;
}
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  mode: 'mono', threshold: 128, colors: 8, smoothing: .75, noise: 0,
  removeWhite: true, preserveCorners: true,
};
export const MAX_TRACE_PIXELS = 2048 * 2048, MAX_TRACE_SIDE = 2048, MAX_TRACE_BOUNDARY_POINTS = 131072;
export const DEFAULT_CENTERLINE_STROKE_WIDTH_MM = .25;
export const MIN_CENTERLINE_STROKE_WIDTH_MM = .001, MAX_CENTERLINE_STROKE_WIDTH_MM = 1000;

export function resolveTraceMethod(options: Pick<TraceOptions, 'method'>): TraceMethod {
  return options.method ?? 'outline';
}
export function resolveTraceBackground(options: TraceOptions): TraceBackground {
  return options.background ?? (options.removeWhite ? 'all' : 'keep');
}
export function validTraceOptions(value: unknown): value is TraceOptions {
  if (!value || typeof value !== 'object') return false;
  const o = value as TraceOptions;
  return ['mono', 'color'].includes(o.mode) && typeof o.removeWhite === 'boolean' && typeof o.preserveCorners === 'boolean' &&
    (o.method === undefined || ['outline', 'centerline'].includes(o.method)) &&
    (resolveTraceMethod(o) !== 'centerline' || o.mode === 'mono') &&
    (o.background === undefined || ['keep', 'border', 'all'].includes(o.background)) &&
    Number.isInteger(o.colors) && o.colors >= 2 && o.colors <= 32 &&
    Number.isFinite(o.threshold) && o.threshold >= 0 && o.threshold <= 255 &&
    Number.isFinite(o.smoothing) && o.smoothing >= .1 && o.smoothing <= 5 &&
    Number.isInteger(o.noise) && o.noise >= 0 && o.noise <= 100;
}

export type TracePresetId = 'logo' | 'lineart' | 'color' | 'technical' | 'drawing';
type PresetValues = Pick<TraceOptions, 'mode' | 'threshold' | 'colors' | 'smoothing' | 'noise' | 'preserveCorners'> & { method: TraceMethod };
export const TRACE_PRESETS: Readonly<Record<TracePresetId, Readonly<PresetValues>>> = {
  logo: { method: 'outline', mode: 'mono', threshold: 128, colors: 8, smoothing: .75, noise: 0, preserveCorners: true },
  lineart: { method: 'outline', mode: 'mono', threshold: 160, colors: 8, smoothing: .35, noise: 0, preserveCorners: true },
  color: { method: 'outline', mode: 'color', threshold: 128, colors: 8, smoothing: .75, noise: 0, preserveCorners: true },
  technical: { method: 'centerline', mode: 'mono', threshold: 160, colors: 8, smoothing: .35, noise: 0, preserveCorners: true },
  drawing: { method: 'centerline', mode: 'mono', threshold: 128, colors: 8, smoothing: .75, noise: 0, preserveCorners: false },
};
/** Background, source, resolution and output decisions are never preset side effects. */
export function applyTracePreset(options: TraceOptions, preset: TracePresetId): TraceOptions {
  if (!Object.hasOwn(TRACE_PRESETS, preset)) throw new Error('geometry');
  return { ...options, ...TRACE_PRESETS[preset] };
}
