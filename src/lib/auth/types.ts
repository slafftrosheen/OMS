// Role hierarchy (from highest to lowest privilege)
// RD / Boss         — full superuser, all features, R&D orders
// HeadOfProduction  — full except draft order creation; notified on new drafts
// StationHead       — full read + station-scoped writes (own station name)
// Operator          — full read, no AI lab, no admin

export type Role =
  | 'RD'
  | 'Boss'
  | 'HeadOfProduction'
  | 'StationHead'
  | 'Operator';

export const ROLE_LABELS: Record<Role, string> = {
  RD:               'R&D',
  Boss:             'Boss',
  HeadOfProduction: 'Head of Production',
  StationHead:      'Station Head',
  Operator:         'Operator',
};

export const ROLE_ORDER: Role[] = [
  'RD',
  'Boss',
  'HeadOfProduction',
  'StationHead',
  'Operator',
];

// Canonical production stations
export type StationId =
  | 'cnc'
  | 'sanding'
  | 'bending'
  | 'welding'
  | 'painting'
  | 'film_covering'
  | 'glueing'
  | 'assembly'
  | 'anton'
  | 'qc'
  | 'packing';

export const STATION_LABELS: Record<StationId, string> = {
  cnc:          'CNC',
  sanding:      'Sanding',
  bending:      'Bending',
  welding:      'Welding',
  painting:     'Painting',
  film_covering:'Film Covering',
  glueing:      'Glueing',
  assembly:     'Assembly',
  anton:        'Anton Station',
  qc:           'Quality Control',
  packing:      'Packing',
};

export const STATION_IDS = Object.keys(STATION_LABELS) as StationId[];

export interface UserStation {
  stationId: StationId;
  isHead: boolean;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: Role;
  stations: UserStation[];
  // Legacy fields kept for backward compat during transition
  primarySection?: string;
  sections?: string[];
  roles?: Record<string, string>;
  passwordHash?: string;
}
