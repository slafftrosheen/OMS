import type { ApexOptions } from 'apexcharts';
import { get } from 'svelte/store';
import { theme, type ThemeName } from '$lib/stores/theme';

const FALLBACKS = {
  text: '#17181c',
  muted: '#535764',
  border: '#d6d8e1',
  neutral: '#888888'
};

const VAR_PATTERN = /^var\((--[^)]+)\)$/;

export const seriesPalette = [
  'var(--accent-1)',
  'var(--accent-2)',
  '#00a7d1',
  '#ff7a59',
  '#7bc96f',
  '#c3a6ff'
];

function resolveToken(token: string) {
  if (typeof window === 'undefined') return undefined;
  const match = VAR_PATTERN.exec(token.trim());
  const varName = match ? match[1] : null;
  const key = varName ?? token;
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(key);
  if (match && !value.trim()) return undefined;
  const resolved = (value || (!match ? token : '')).trim();
  return resolved || undefined;
}

function resolvePalette() {
  return seriesPalette.map((token) => resolveToken(token) ?? FALLBACKS.neutral);
}

function resolveThemeName(name?: ThemeName) {
  return name ?? get(theme);
}

export function withTheme(options: ApexOptions, activeTheme?: ThemeName): ApexOptions {
  const current = resolveThemeName(activeTheme);
  const mode = current === 'LightVim' ? 'light' : 'dark';
  const colors = options.colors ?? resolvePalette();
  const text = resolveToken('var(--text)') ?? FALLBACKS.text;
  const muted = resolveToken('var(--muted)') ?? FALLBACKS.muted;
  const border = resolveToken('var(--border)') ?? FALLBACKS.border;

  const legend = {
    ...options.legend,
    labels: {
      colors: text,
      ...(options.legend?.labels ?? {})
    }
  };

  const xaxis = Array.isArray(options.xaxis)
    ? options.xaxis
    : {
        ...options.xaxis,
        labels: {
          style: { colors: muted },
          ...(options.xaxis?.labels ?? {})
        },
        axisBorder: {
          color: border,
          ...(options.xaxis?.axisBorder ?? {})
        },
        axisTicks: {
          color: border,
          ...(options.xaxis?.axisTicks ?? {})
        }
      };

  const yaxis = Array.isArray(options.yaxis)
    ? options.yaxis
    : {
        ...options.yaxis,
        labels: {
          style: { colors: muted },
          ...(options.yaxis?.labels ?? {})
        }
      };

  return {
    ...options,
    theme: { mode, ...(options.theme ?? {}) },
    colors,
    stroke: {
      width: 2,
      ...(options.stroke ?? {})
    },
    grid: {
      borderColor: border,
      ...(options.grid ?? {})
    },
    legend,
    xaxis,
    yaxis,
    tooltip: {
      theme: mode,
      ...(options.tooltip ?? {})
    }
  };
}
