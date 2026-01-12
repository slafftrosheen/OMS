<script lang="ts">
  import { base } from '$app/paths';
  import Badge from '$lib/ui/Badge.svelte';
  import { t } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';
  import type { Badge as BadgeCode } from '$lib/order/types';
  import { BADGE_ICONS, badgeTone } from './badges';

  export let id = '';
  export let title = '';
  export let client = '';
  export let badges: BadgeCode[] = [];

  const toneFor = (badge: BadgeCode) => badgeTone(badge);
</script>

<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
  <div>
    <div style="font-size:1.2rem;font-weight:900">{id} <span class="muted">/</span> {title}</div>
    <div class="muted">{client}</div>
    <div class="row" style="margin-top:6px;gap:6px">
      {#each badges as badge}
        {@const label = $t(TERMS.badges[badge])}
        <Badge tone={toneFor(badge)} label={label}>
          <svelte:component this={BADGE_ICONS[badge]} size={14} aria-hidden="true" />
          <span>{label}</span>
        </Badge>
      {/each}
    </div>
  </div>
  <div class="row">
    <a class="tag" href="#logs">{$t('terms.stationLogs')}</a>
    <a class="tag" href="#workstreams">{$t('terms.workstreams')}</a>
    <a class="tag" href="#revisions">{$t('terms.currentRevision')}</a>
    <a class="tag ghost" href="{base}/orders/{id}/print" target="_blank" rel="noopener">Print pack</a>
  </div>
</div>
