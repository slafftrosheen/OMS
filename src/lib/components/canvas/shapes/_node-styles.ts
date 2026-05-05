// Shared CSS-in-JS for the AI Lab canvas node shapes. Keeping these in one
// place means a tweak to the colour palette or status badge propagates
// across every shape.

import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
    border: '1px solid var(--border, #ccc)',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    background: 'var(--bg-1, #fafafa)',
    color: 'var(--text)'
};

export const labelStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted, #888)',
    width: 100,
    flexShrink: 0
};

export const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    margin: '2px 0'
};

export const headerStyle = (accent: string): CSSProperties => ({
    padding: '6px 10px',
    background: accent,
    color: 'white',
    fontWeight: 700,
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0
});

export const runButtonStyle = (accent: string): CSSProperties => ({
    background: accent,
    color: 'white',
    border: 0,
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 'auto'
});

export const statusBadgeStyle = (s: string): CSSProperties => ({
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background:
        s === 'done' ? '#34c759'
        : s === 'error' ? '#ff453a'
        : s === 'running' ? '#ffd60a'
        : 'rgba(255,255,255,0.25)',
    color: s === 'running' ? '#000' : 'white',
    textTransform: 'uppercase',
    fontWeight: 700,
    letterSpacing: '0.04em'
});

export const containerStyle = (
    width: number,
    height: number,
    accent: string,
    error: boolean
): CSSProperties => ({
    width,
    height,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-0, #fff)',
    border: `2px solid ${error ? '#ff453a' : accent}`,
    borderRadius: 12,
    boxShadow: 'var(--glass-shadow, 0 4px 16px rgba(0,0,0,0.1))',
    overflow: 'hidden',
    pointerEvents: 'all'
});

export const bodyStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    fontSize: 12
};

export const noteStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted, #888)',
    marginTop: 4
};

export const warnStyle: CSSProperties = {
    fontSize: 11,
    color: '#b45309',
    marginTop: 2
};
