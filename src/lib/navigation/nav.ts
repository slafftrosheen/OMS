import type { ComponentType } from 'svelte';
import { Grid, Calendar, FolderOpen, PackageSearch, Settings, KanbanSquare, HelpCircle } from 'lucide-svelte';

export interface NavLink {
  href: string;
  labelKey: string;
  icon: ComponentType;
}

export const navLinks: NavLink[] = [
  { href: '/', labelKey: 'nav.dashboard', icon: Grid },
  { href: '/calendar', labelKey: 'nav.calendar', icon: Calendar },
  { href: '/orders', labelKey: 'nav.orders', icon: PackageSearch },
  { href: '/files', labelKey: 'nav.files', icon: FolderOpen },
  { href: '/help', labelKey: 'nav.help', icon: HelpCircle }
];

export const sanitizeBase = (basePath: string | undefined) => {
  const trimmed = (basePath ?? '').trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const normalizePath = (path: string | undefined) => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

export const resolveHref = (basePath: string | undefined, path: string) => {
  const normalizedBase = sanitizeBase(basePath);
  const normalizedPath = normalizePath(path);
  if (!normalizedBase) {
    return normalizedPath;
  }
  if (normalizedPath === '/') {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
};

export const normalize = (path: string | undefined) => {
  if (!path) return '/';
  const trimmed = path.replace(/\/+$/, '');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const toRelative = (basePath: string, path: string) => {
  const normalized = normalize(path);
  if (basePath === '/') return normalized;
  if (normalized === basePath) return '/';
  if (normalized.startsWith(`${basePath}/`)) {
    const remainder = normalized.slice(basePath.length);
    return remainder === '' ? '/' : remainder;
  }
  return normalized;
};

export type ActiveState = 'exact' | 'ancestor' | null;

export const getActiveState = (currentPath: string, href: string): ActiveState => {
  const target = normalize(href);
  if (target === '/') {
    return currentPath === '/' ? 'exact' : null;
  }
  if (currentPath === target) return 'exact';
  if (currentPath.startsWith(`${target}/`)) return 'ancestor';
  return null;
};

export const ariaCurrent = (state: ActiveState) => {
  if (state === 'exact') return 'page';
  if (state) return 'true';
  return undefined;
};
