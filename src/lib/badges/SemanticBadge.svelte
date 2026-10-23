<script lang="ts">
  import { t } from 'svelte-i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import type { BadgeDescriptor } from './catalog';
  let { badge, size = 'sm', compact = false, class: className = '', dataBadge }: {
    badge: BadgeDescriptor; size?: 'sm' | 'md'; compact?: boolean; class?: string; dataBadge?: string;
  } = $props();
  let label = $derived($t(badge.labelKey, badge.values ?? {}));
  let title = $derived(`${label}${badge.count && badge.count > 0 ? `: ${badge.count}` : ''}${badge.detail ? ` · ${badge.detail}` : ''}`);
</script>

<span class="semantic-badge {className}" class:compact data-size={size} data-tone={badge.tone}
  data-badge={dataBadge ?? badge.id} title={title} aria-label={title}>
  <Icon name={badge.icon} size={size === 'sm' ? 12 : 14} />
  <span class="badge-label">{label}</span>
  {#if badge.count !== undefined && badge.count > 0}<strong class="badge-count">{badge.count}</strong>{/if}
</span>

<style>
  .semantic-badge { --badge-tone:var(--ink-secondary);display:inline-flex;align-items:center;gap:4px;
    min-width:0;max-width:100%;vertical-align:middle;padding:3px 6px;
    border:1px solid color-mix(in srgb,var(--badge-tone) 38%,var(--border));border-radius:6px;
    color:var(--text);background:color-mix(in srgb,var(--badge-tone) 9%,var(--bg-1));
    font-size:11px;font-weight:600;line-height:1.35; }
  .semantic-badge[data-size="md"] { padding:4px 8px;font-size:12px; }
  .semantic-badge[data-tone="brand"] { --badge-tone:var(--brand); }
  .semantic-badge[data-tone="info"] { --badge-tone:var(--link); }
  .semantic-badge[data-tone="success"] { --badge-tone:var(--ok); }
  .semantic-badge[data-tone="warn"] { --badge-tone:var(--warn); }
  .semantic-badge[data-tone="danger"] { --badge-tone:var(--error); }
  .semantic-badge :global(svg) { flex-shrink:0;color:var(--badge-tone); }
  .badge-label { min-width:0;overflow-wrap:anywhere; }
  .badge-count { flex-shrink:0;margin-left:auto;font-variant-numeric:tabular-nums; }
  .compact { width:100%;padding:3px 4px; }
  .compact .badge-label { white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  @media(max-width:600px) {
    .compact { padding:3px;gap:2px; }
    .compact .badge-label { position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%); }
    .compact .badge-count { font-size:10px; }
  }
</style>
