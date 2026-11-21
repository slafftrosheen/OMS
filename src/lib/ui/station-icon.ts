import type { IconName } from './icons';

const stationIcons = new Map<string, IconName>([
  ['CAD', 'station-cad'],
  ['CNC', 'station-cnc'],
  ['EDGE', 'station-edge'],
  ['ASSEMBLY', 'station-assembly'],
  ['PAINT', 'station-paint'],
  ['PACKAGING', 'station-packaging'],
  ['DELIVERY', 'station-delivery'],
  ['SANDING', 'sparkles'],
  ['BENDING', 'component'],
  ['WELDING', 'weld'],
  ['QC', 'shield-check'],
  ['LOGISTICS', 'truck'],
  ['FILM_COATING', 'layers'],
  ['GLUEING', 'droplets']
]);

export function stationIcon(station: string): IconName {
  return stationIcons.get(station.trim().toUpperCase()) ?? 'factory';
}
