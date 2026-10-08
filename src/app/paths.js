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
  { path: '/ai-lab',    label: 'AI Lab',    icon: 'sparkles' }
];

/**
 * AI Lab sub-pages
 */
export const AI_LAB_ROUTES = [
  { path: '/ai-lab',           label: 'Overview',  icon: 'sparkles' },
  { path: '/ai-lab/chat',      label: 'Chat',      icon: 'message-square' },

  { path: '/ai-lab/canvas',    label: 'Canvas',    icon: 'layout-grid' }
];
