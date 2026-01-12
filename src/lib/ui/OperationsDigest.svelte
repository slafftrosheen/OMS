<script lang="ts">
  import { listOrders } from '$lib/order/signage-store';
  import { summarize } from '$lib/metrics/order-metrics';
  import {
    STATIONS,
    STAGE_SEQUENCE,
    STATE_LABEL,
    STATE_TONE,
    type StationTag,
    type StageState
  } from '$lib/order/stages';
  import { TERMS } from '$lib/order/names';
  import Badge from '$lib/ui/Badge.svelte';
  import type { Order } from '$lib/order/types.signage';
  import { t, locale } from 'svelte-i18n';

  export let style = '';
  export let className = '';

  const orders = listOrders();
  const metrics = summarize(orders);

  $: $t, $locale;

  $: formatterShort = new Intl.DateTimeFormat($locale || undefined, {
    month: 'short',
    day: 'numeric'
  });
  $: formatterLong = new Intl.DateTimeFormat($locale || undefined, {
    month: 'long',
    day: 'numeric'
  });

  function parseDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(target: Date, from = new Date()) {
    const diff = target.getTime() - from.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round(diff / 86400000));
  }

  function stationLabel(station: StationTag) {
    return $t(TERMS.stations[station]);
  }

  function stateLabel(state: StageState) {
    return $t(STATE_LABEL[state]);
  }

  function badgeTone(state: StageState): 'neutral' | 'primary' | 'success' | 'warn' | 'danger' {
    const tone = STATE_TONE[state];
    if (tone === 'muted') return 'neutral';
    return tone;
  }

  const stageOrder = STAGE_SEQUENCE;

  $: upcomingLoads = (() => {
    const groups = new Map<string, Order[]>();
    for (const order of orders) {
      const date = parseDate(order.loadingDate);
      if (!date) continue;
      const key = date.toISOString().split('T')[0];
      const group = groups.get(key) ?? [];
      group.push(order);
      groups.set(key, group);
    }
    const sorted = Array.from(groups.keys()).sort();
    if (!sorted.length) return null;
    const key = sorted[0];
    const date = parseDate(key);
    return {
      date,
      orders: groups.get(key) ?? []
    };
  })();

  $: dueSoon = orders
    .map((order) => {
      const dueDate = parseDate(order.due);
      if (!dueDate) return null;
      const diff = daysUntil(dueDate);
      if (diff > 7) return null;
      return { order, dueDate, days: diff };
    })
    .filter(Boolean)
    .sort((a, b) => (a!.dueDate.getTime() - b!.dueDate.getTime()))
    .slice(0, 4) as { order: Order; dueDate: Date; days: number }[];

  $: blockedOrders = orders
    .map((order) => {
      const station = STATIONS.find((code) => order.stages?.[code] === 'BLOCKED');
      return station ? { order, station } : null;
    })
    .filter(Boolean) as { order: Order; station: StationTag }[];

  $: reworkWatch = Object.entries(metrics.reworkCounts)
    .map(([station, count]) => ({ station: station as StationTag, count }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  $: stationMatrix = STATIONS.map((station) => {
    const totals = stageOrder
      .map((state) => ({
        state,
        count: metrics.stageBuckets[`${station}:${state}`] ?? 0
      }))
      .filter((entry) => entry.count > 0);
    return { station, totals };
  });
</script>

<section class={`card digest ${className}`} style={style}>
  <header class="digest-head">
    <div>
      <h2 class="digest-title">{$t('launchpad.digest.title')}</h2>
      <p class="muted">{$t('launchpad.digest.subtitle')}</p>
    </div>
  </header>

  <div class="digest-grid">
    <article class="digest-block" aria-labelledby="digest-load">
      <h3 id="digest-load">{$t('launchpad.digest.next_load')}</h3>
      {#if upcomingLoads}
        <div class="muted digest-meta">
          <span>{formatterLong.format(upcomingLoads.date ?? new Date())}</span>
          <span>• {$t('launchpad.digest.order_count', { count: upcomingLoads.orders.length })}</span>
        </div>
        <ul class="digest-list">
          {#each upcomingLoads.orders.slice(0, 4) as order (order.id)}
            <li>
              <div class="item-row">
                <span class="item-title">{order.id}</span>
                {#if order.client}
                  <span class="muted">{order.client}</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{$t('launchpad.digest.no_loading')}</p>
      {/if}
      {#if dueSoon.length}
        <div class="divider" role="presentation"></div>
        <h4>{$t('launchpad.digest.due_soon')}</h4>
        <ul class="digest-list">
          {#each dueSoon as entry (entry.order.id)}
            <li>
              <div class="item-row">
                <span class="item-title">{entry.order.id}</span>
                <Badge tone="warn">{$t('launchpad.digest.due_in', { days: entry.days })}</Badge>
              </div>
              <div class="muted">{formatterShort.format(entry.dueDate)}</div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{$t('launchpad.digest.due_none')}</p>
      {/if}
    </article>

    <article class="digest-block" aria-labelledby="digest-blocked">
      <h3 id="digest-blocked">{$t('launchpad.digest.blocked')}</h3>
      {#if blockedOrders.length}
        <ul class="digest-list">
          {#each blockedOrders.slice(0, 4) as item (item.order.id)}
            <li>
              <div class="item-row">
                <span class="item-title">{item.order.id}</span>
                <Badge tone="danger">{stateLabel('BLOCKED')}</Badge>
              </div>
              <div class="muted">{stationLabel(item.station)}</div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{$t('launchpad.digest.blocked_clear')}</p>
      {/if}
    </article>

    <article class="digest-block" aria-labelledby="digest-stations">
      <h3 id="digest-stations">{$t('launchpad.digest.station_health')}</h3>
      <div class="station-grid">
        {#each stationMatrix as row (row.station)}
          <div class="station-row">
            <div class="item-title">{stationLabel(row.station)}</div>
            {#if row.totals.length}
              <div class="chip-row">
                {#each row.totals as total (total.state)}
                  <Badge tone={badgeTone(total.state)}>{total.count}× {stateLabel(total.state)}</Badge>
                {/each}
              </div>
            {:else}
              <span class="muted">{$t('launchpad.digest.station_empty')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </article>

    <article class="digest-block" aria-labelledby="digest-rework">
      <h3 id="digest-rework">{$t('launchpad.digest.rework_watch')}</h3>
      {#if reworkWatch.length}
        <ul class="digest-list">
          {#each reworkWatch as entry (entry.station)}
            <li>
              <div class="item-row">
                <span class="item-title">{stationLabel(entry.station)}</span>
                <Badge tone="warn">×{entry.count}</Badge>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{$t('launchpad.digest.rework_none')}</p>
      {/if}
    </article>
  </div>
</section>

<style>
  .digest {
    display: grid;
    gap: 16px;
  }

  .digest-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .digest-title {
    margin: 0;
    font-size: 1.1rem;
  }

  .digest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .digest-block {
    display: grid;
    gap: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }

  .digest-block h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .digest-block h4 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .digest-meta {
    display: flex;
    gap: 6px;
    font-size: 0.85rem;
  }

  .digest-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .item-title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .station-grid {
    display: grid;
    gap: 10px;
  }

  .station-row {
    display: grid;
    gap: 6px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .divider {
    height: 1px;
    background: var(--border);
  }

  @media (max-width: 640px) {
    .digest-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
