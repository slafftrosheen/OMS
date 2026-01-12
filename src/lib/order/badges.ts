import type { Badge } from './types';
import {
  CircleDashed,
  Loader,
  OctagonAlert,
  PackageCheck,
  CheckCircle2,
  Flame,
  PackageMinus,
  FlaskConical,
  FileEdit
} from 'lucide-svelte';

export const BADGE_ICONS: Record<Badge, typeof CircleDashed> = {
  OPEN: CircleDashed,
  IN_PROGRESS: Loader,
  BLOCKED: OctagonAlert,
  READY_TO_SHIP: PackageCheck,
  DONE: CheckCircle2,
  URGENT: Flame,
  LOW_STOCK: PackageMinus,
  'R&D': FlaskConical,
  DRAFT: FileEdit
};

export const BADGE_TONES: Record<Badge, 'primary' | 'info' | 'success' | 'warn' | 'danger'> = {
  OPEN: 'primary',
  IN_PROGRESS: 'primary',
  BLOCKED: 'warn',
  READY_TO_SHIP: 'success',
  DONE: 'success',
  URGENT: 'danger',
  LOW_STOCK: 'warn',
  'R&D': 'info',
  DRAFT: 'info'
};

export const BADGE_ORDER: Badge[] = [
  'DRAFT',
  'URGENT',
  'BLOCKED',
  'LOW_STOCK',
  'READY_TO_SHIP',
  'IN_PROGRESS',
  'OPEN',
  'R&D',
  'DONE'
];

export function badgeTone(badge: Badge): 'primary' | 'info' | 'success' | 'warn' | 'danger' {
  return BADGE_TONES[badge] ?? 'primary';
}
