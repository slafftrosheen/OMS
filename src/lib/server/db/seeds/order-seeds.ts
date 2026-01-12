// src/lib/order/order-seeds.ts
// Demo order seed data for development and testing

import type { Order, Badge, StageMap } from './types';

export interface OrderSeed {
  id: string;
  title: string;
  client: string;
  due: string;
  loadingDate?: string;
  badges: Badge[];
  fields: Array<{ key: string; label: string; value: string }>;
  materials: Array<{ key: string; label: string; value: string }>;
  stages?: Partial<StageMap>;
  isRD?: boolean;
  rdNotes?: string;
  fileName?: string;
}

const ORDER_SEEDS: Record<string, OrderSeed> = {
  'PO-250375': {
    id: 'PO-250375',
    title: '4500mm Long Frame',
    client: 'ABTB BIJEN',
    due: '2025-10-26',
    loadingDate: '2025-10-24',
    badges: ['OPEN', 'IN_PROGRESS'],
    fields: [
      { key: 'priority', label: 'Priority', value: 'Normal' }
    ],
    materials: [
      { key: 'face', label: 'Face', value: 'Acrylic 3mm White' }
    ],
    stages: {
      CAD: 'COMPLETED',
      CNC: 'COMPLETED',
      SANDING: 'IN_PROGRESS'
    },
    fileName: 'PO-250375_ABTB-BIJEN_4500mm.pdf'
  },
  'PO-250376': {
    id: 'PO-250376',
    title: 'LED Channel Letters',
    client: 'Signage Pro',
    due: '2025-10-30',
    loadingDate: '2025-10-28',
    badges: ['OPEN'],
    fields: [
      { key: 'priority', label: 'Priority', value: 'High' }
    ],
    materials: [
      { key: 'face', label: 'Face', value: 'Aluminium 1.5mm' },
      { key: 'back', label: 'Back', value: 'Aluminium 1mm' }
    ],
    stages: {
      CAD: 'IN_PROGRESS'
    }
  },
  'PO-250377': {
    id: 'PO-250377',
    title: 'Light Box 2x3m',
    client: 'Media Corp',
    due: '2025-11-05',
    badges: ['DRAFT'],
    fields: [],
    materials: [],
    isRD: true,
    rdNotes: 'Waiting for final artwork approval'
  }
};

export function getOrderSeed(id: string): OrderSeed | null {
  return ORDER_SEEDS[id] || null;
}

export function getAllOrderSeeds(): OrderSeed[] {
  return Object.values(ORDER_SEEDS);
}
