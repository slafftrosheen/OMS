<script lang="ts">
  import { t } from 'svelte-i18n';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { legacyOrderBadge } from '$lib/badges/catalog';
  import type { Badge as BadgeType } from './types.signage';
  import { TERMS } from './names';
  import { BADGE_ORDER } from './badges';

  let {
    value = [],
    onChange = () => {}
  }: {
    value?: BadgeType[];
    onChange?: (badges: BadgeType[]) => void;
  } = $props();

  const allBadges: BadgeType[] = BADGE_ORDER;

  function toggle(badge: BadgeType) {
    const next = new Set(value);
    if (next.has(badge)) {
      next.delete(badge);
    } else {
      next.add(badge);
    }
    onChange(Array.from(next));
  }

</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('badges.heading')}</h3>
  <div class="row" style="flex-wrap:wrap;gap:6px">
    {#each allBadges as badge}
      {@const label = $t(TERMS.badges[badge])}
      {@const descriptor = legacyOrderBadge(badge)}
      <button class="tag" aria-pressed={value.includes(badge)} aria-label={label} onclick={() => toggle(badge)}>
        {#if descriptor}<SemanticBadge badge={descriptor} />{/if}
      </button>
    {/each}
  </div>
</div>
