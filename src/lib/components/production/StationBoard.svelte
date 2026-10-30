<script lang="ts">
  import { base } from '$app/paths';
  import { dueDateLabel } from '$lib/order/operator-ui';
  import {t} from 'svelte-i18n';
  import type {PlanningItem,StationSummary} from '$lib/order/production-planning';
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { priorityBadge, stageBadge } from '$lib/badges/catalog';

  let {station,orders=[],summary}:{
    station:string;orders?:PlanningItem[];summary?:StationSummary
  }=$props();
  let stationHref=$derived(`${base}/station/${station.toLowerCase()}`);
</script>

<section class="station-board" aria-label={`${station} production queue`}
  data-pressure={summary?.pressure ?? 'normal'}>
  <header class="station-header">
    <div class="station-heading">
      <h2>{station}</h2>
      <span class="count" aria-label={`${summary?.active ?? 0} active stages`}>{summary?.active ?? 0}</span>
    </div>
    <a class="station-link" href={stationHref} aria-label={`Open ${station} workstation`}>
      {$t('productionPlanning.workstation')} <span aria-hidden="true">↗</span>
    </a>
  </header>

  <div class="station-metrics">
    <span>{$t('productionPlanning.queued')}: <strong>{summary?.queued ?? 0}</strong></span>
    <span>{$t('productionPlanning.inProgress')}: <strong>{summary?.inProgress ?? 0}</strong></span>
    <span>{$t('productionPlanning.blocked')}: <strong>{(summary?.blocked??0)+(summary?.rework??0)}</strong></span>
    <span>{$t('productionPlanning.upcoming')}: <strong>{summary?.upcoming ?? 0}</strong></span>
    {#if summary && summary.knownHours>0}
      <span>{$t('productionPlanning.hours')}: <strong>{summary.knownHours}</strong></span>
    {/if}
  </div>
  {#if summary && summary.pressure!=='normal'}
    <p class="pressure-note" data-pressure={summary.pressure} role="note">
      {$t(`productionPlanning.pressure.${summary.pressure}`)}
    </p>
  {/if}
  {#if summary && summary.missingEstimates>0}
    <p class="estimate-note">{$t('productionPlanning.stationMissing',{count:summary.missingEstimates})}</p>
  {/if}
  <div class="orders-list">
    {#each orders as order (order.id)}
      <a class="order-card" href={`${base}/orders/${encodeURIComponent(order.id)}`}
        aria-label={`Open order ${order.poNumber ?? order.title} at ${station}`}>
        <div class="order-topline">
          <span class="order-po">{order.poNumber ?? $t('productionPlanning.pendingPo')}</span>
          <SemanticBadge badge={priorityBadge(order.priority)} />
        </div>
        <h3>{order.title || $t('productionPlanning.untitled')}</h3>
        <p class="client">{order.client || $t('productionPlanning.unknownClient')}</p>
        <div class="order-bottomline">
          <SemanticBadge badge={stageBadge(order.stageState)} />
          <span class="due-date">{dueDateLabel(order.dueDate)}</span>
        </div>
        <div class="schedule-badges"><OrderBadges {order} lifecycle={order.paused} priority={false} flags={false} /></div>
        {#if order.blockedReason}<p class="block-reason">{order.blockedReason}</p>{/if}
        {#if order.estimatedHours !== null}
          <small>{$t('productionPlanning.stageEstimate',{hours:order.estimatedHours})}</small>
        {/if}
      </a>
    {:else}
      <div class="empty-station">
        <p>{$t('productionPlanning.noResults')}</p>
        <a href={stationHref}>{$t('productionPlanning.workstation')}</a>
      </div>
    {/each}
  </div>
</section>

<style>
  .schedule-badges { margin-top:8px; }
  .station-board[data-pressure="blocked"]{border-color:var(--error)}
  .station-board[data-pressure="atRisk"]{border-color:var(--warn)}
  .station-metrics{padding:.6rem 1rem;display:flex;flex-wrap:wrap;gap:.5rem;
    color:var(--muted);font-size:.73rem;border-bottom:1px solid var(--border)}
  .station-metrics strong{color:var(--text);font-variant-numeric:tabular-nums}
  .pressure-note,.estimate-note{padding:.45rem 1rem;font-size:.74rem;margin:0;color:var(--muted)}
  .pressure-note[data-pressure="blocked"]{color:var(--error)}
  .pressure-note[data-pressure="atRisk"]{color:var(--warn)}

  .block-reason{font-size:.77rem;overflow-wrap:anywhere}
  .station-board {
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 14px);
    overflow: hidden;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .station-header {
    padding: 1rem 1.1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .75rem;
    background: var(--bg-2);
    border-bottom: 1px solid var(--border);
  }
  .station-heading { display: flex; align-items: center; gap: .65rem; min-width: 0; }
  h2 { font-size: 1.1rem; margin: 0; font-weight: 750; color: var(--text); }
  .count {
    background: var(--brand-soft, var(--bg-0));
    color: var(--text);
    border-radius: 999px;
    min-width: 2rem;
    padding: .2rem .5rem;
    font-size: .75rem;
    text-align: center;
    font-weight: 700;
  }
  .station-link {
    color: var(--brand);
    font-weight: 700;
    font-size: .82rem;
    text-decoration: none;
    white-space: nowrap;
  }
  .station-link:hover, .station-link:focus-visible { text-decoration: underline; }
  .orders-list { display: grid; gap: .65rem; padding: .8rem; align-content: start; }
  .order-card {
    display: block;
    padding: .9rem 1rem;
    border: 1px solid var(--border);
    background: var(--bg-0);
    color: var(--text);
    border-radius: var(--radius-md, 10px);
    text-decoration: none;
    min-width: 0;
    transition: border-color .15s ease, background .15s ease;
  }
  .order-card:hover, .order-card:focus-visible {
    border-color: var(--brand);
    background: var(--bg-2);
    outline-offset: 2px;
  }
  .order-card h3 { margin: .55rem 0 .25rem; font-size: .98rem; overflow-wrap: anywhere; }
  .order-topline, .order-bottomline {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: .5rem;
  }
  .order-po { font-weight: 750; font-variant-numeric: tabular-nums; font-size: .8rem; }

  .client { margin: 0 0 .75rem; color: var(--muted); font-size: .86rem; overflow-wrap: anywhere; }

  .due-date { color: var(--muted); font-size: .76rem; }
  .empty-station { padding: 1.4rem 1rem; text-align: center; color: var(--muted); }
  .empty-station p { margin: 0 0 .7rem; }
  .empty-station a { color: var(--brand); }
  @media (max-width: 480px) {
    .station-header { padding: .85rem; }
    .orders-list { padding: .65rem; }
    .order-card { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .order-card { transition: none; }
  }

  /* Visually classify station pressure without turning every card neon. */
  .station-board {
    background:var(--glass-bg-strong);border-color:var(--glass-border);
    border-radius:var(--radius-lg);box-shadow:var(--glass-shadow-sm);
  }
  .station-board[data-pressure="blocked"] {
    border-color:color-mix(in oklab,var(--error) 55%,var(--border));
  }
  .station-board[data-pressure="atRisk"] {
    border-color:color-mix(in oklab,var(--warn) 52%,var(--border));
  }
  .station-header {
    background:var(--bg-1);padding:var(--space-lg);
    position:relative;
  }
  .station-header::before {
    content:'';position:absolute;left:0;top:0;width:70px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);
  }
  .station-board[data-pressure="blocked"] .station-header::before {
    background:linear-gradient(90deg,var(--error),transparent);
  }
  .station-board[data-pressure="atRisk"] .station-header::before {
    background:linear-gradient(90deg,var(--warn),transparent);
  }
  .station-heading h2 { font-size:var(--text-lg);letter-spacing:var(--tracking-tight); }
  .count {
    background:var(--bg-2);border:1px solid var(--border);
    min-width:30px;color:var(--ink-primary);font-variant-numeric:tabular-nums;
  }
  .station-link { min-height:36px;display:inline-flex;align-items:center;gap:6px;
    color:var(--ink-secondary);font-weight:650; }
  .station-link:hover { color:var(--brand); }
  .station-metrics { background:var(--bg-1);gap:6px; }
  .station-metrics span { padding:4px 7px;background:var(--bg-2);
    border:1px solid var(--border);border-radius:var(--radius-sm); }
  .orders-list { gap:var(--space-sm);padding:var(--space-md); }
  .order-card { background:var(--bg-1);border-radius:var(--radius-md);
    min-height:110px; }
  .order-card:hover { background:var(--bg-2);border-color:color-mix(in oklab,var(--brand) 50%,var(--border)); }
  .order-po { color:var(--ink-primary);font-size:var(--text-sm); }
  .order-card h3 { color:var(--ink-primary); }

  .empty-station { min-height:125px;display:flex;flex-direction:column;
    justify-content:center;align-items:center;gap:var(--space-xs); }
  @media(prefers-reduced-transparency:reduce) { .station-board { background:var(--bg-1); } }
</style>
