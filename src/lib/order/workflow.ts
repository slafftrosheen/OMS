/** Source of truth for OMS station codes. Avoid dropping legacy station rows. */
export const WORKFLOW_STATIONS = [
  'CAD', 'CNC', 'EDGE', 'ASSEMBLY', 'PAINT', 'PACKAGING', 'DELIVERY'
] as const;

// Older production configurations still use these stages. Keep visible and
// addressable, but do not automatically advance them in the standard sequence.
export const EXTRA_STATIONS = [
  'SANDING', 'BENDING', 'WELDING', 'QC', 'LOGISTICS'
] as const;
export const ALL_STATIONS: readonly string[] = [...WORKFLOW_STATIONS, ...EXTRA_STATIONS];
export function isKnownStation(code: string): boolean {
  return ALL_STATIONS.includes(code.trim().toUpperCase());
}
