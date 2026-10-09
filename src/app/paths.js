// src/app/paths.js
export const base = '';
export const assets = '';

/**
 * Core Application Routes (Simplified Phase 2)
 */
export const APP_ROUTES = [
  { path: '/orders',    label: 'Orders',    icon: 'clipboard-list' },
  { path: '/calendar',  label: 'Calendar',  icon: 'calendar' },
  { path: '/inventory', label: 'Inventory', icon: 'package' },
  { path: '/toolkit',    label: 'Toolkit',    icon: 'sparkles' }
];

/**
 * Toolkit sub-pages
 */
export const TOOLKIT_ROUTES = [
  { path: '/toolkit',           label: 'Overview',  icon: 'sparkles' },
  { path: '/toolkit/chat',      label: 'Chat',      icon: 'message-square' },

  { path: '/toolkit/canvas',    label: 'Canvas',    icon: 'layout-grid' }
];
