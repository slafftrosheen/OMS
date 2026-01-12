export const TERMS = {
  stations: {
    CAD: 'stations.CAD',
    CNC: 'stations.CNC',
    SANDING: 'stations.SANDING',
    BENDING: 'stations.BENDING',
    WELDING: 'stations.WELDING',
    PAINT: 'stations.PAINT',
    FILM_COATING: 'stations.FILM_COATING',
    GLUEING: 'stations.GLUEING',
    ASSEMBLY: 'stations.ASSEMBLY',
    QC: 'stations.QC',
    LOGISTICS: 'stations.LOGISTICS'
  },
  badges: {
    OPEN: 'order.badgeLabels.OPEN',
    IN_PROGRESS: 'order.badgeLabels.IN_PROGRESS',
    BLOCKED: 'order.badgeLabels.BLOCKED',
    READY_TO_SHIP: 'order.badgeLabels.READY_TO_SHIP',
    DONE: 'order.badgeLabels.DONE',
    URGENT: 'order.badgeLabels.URGENT',
    LOW_STOCK: 'order.badgeLabels.LOW_STOCK',
    'R&D': 'order.badgeLabels.R&D',
    DRAFT: 'order.badgeLabels.DRAFT'
  }
} as const;

export type StationCode = keyof typeof TERMS.stations;
