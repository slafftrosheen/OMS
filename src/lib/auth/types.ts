// types.ts
export type Section = 'Admin' | 'Production' | 'Logistics';
export type Role = 'SuperAdmin' | 'StationLead' | 'Operator' | 'Viewer';

export interface User {
  username: string;
  displayName: string;
  passwordHash: string;
  primarySection: Section;
  sections: Section[]; // Accessible sections
  roles: Record<Section, Role>; // Role per section
  stations?: string[]; // Assigned stations e.g. ["CNC", "Assembly"]
}
