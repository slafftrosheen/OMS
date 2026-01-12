export type Stage = 'CNC'|'SANDING'|'BENDING'|'WELDING'|'PAINT'|'ASSEMBLY'|'QC'|'LOGISTICS';

export const WIP: Record<Stage, number> = {
  CNC: 4, SANDING: 5, BENDING: 4, WELDING: 3, PAINT: 3, ASSEMBLY: 5, QC: 3, LOGISTICS: 6
};

export function atLimit(stage: Stage, count: number){ return count >= WIP[stage]; }
