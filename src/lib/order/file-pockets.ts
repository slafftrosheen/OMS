export const PRODUCTION_FILE_POCKETS = ['laser', 'cnc', 'bender', 'visuals'] as const;
export type ProductionFilePocket = typeof PRODUCTION_FILE_POCKETS[number];
export interface CanvasOrderAttachment {
  id: string; originalName: string; mimeType: string; url: string; file_type: ProductionFilePocket;
}
export function filePocket(type: unknown): ProductionFilePocket {
  const value = String(type ?? '').toLowerCase();
  if (['laser', 'laser_cutting'].includes(value)) return 'laser';
  if (['cnc', 'cnc_frezer', 'cnc_routing'].includes(value)) return 'cnc';
  if (value === 'bender') return 'bender';
  return 'visuals';
}
export function frameFilePocket(shape: {type: string; meta?: Record<string, any>; props?: any}): ProductionFilePocket | null {
  if (shape.type !== 'frame') return null;
  if (PRODUCTION_FILE_POCKETS.includes(shape.meta?.omsFilePocket)) return shape.meta!.omsFilePocket;
  // Existing saved order canvases predate explicit pocket metadata.
  return ({'Laser (DXF)': 'laser', 'CNC Routing': 'cnc', 'Bender': 'bender', 'Visuals (PDF/Rasters)': 'visuals'} as const)[shape.props?.name as string] ?? null;
}
