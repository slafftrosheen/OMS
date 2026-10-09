<script lang="ts">
  import { base } from '$app/paths';
  import { dueDateLabel, priorityLabel, stageStateLabel } from '$lib/order/operator-ui';

  type BoardOrder = {
    id: string;
    poNumber?: string | null;
    title: string;
    client: string;
    status: string;
    stageState?: string;
    dueDate?: string | null;
    priority?: string | number | null;
  };

  let { station, orders = [] }: { station: string; orders?: BoardOrder[] } = $props();
  let stationHref = $derived(`${base}/station/${station.toLowerCase()}`);
</script>

<section class="station-board" aria-label={`${station} production queue`}>
  <header class="station-header">
    <div class="station-heading">
      <h2>{station}</h2>
      <span class="count" aria-label={`${orders.length} orders`}>{orders.length}</span>
    </div>
    <a class="station-link" href={stationHref} aria-label={`Open ${station} workstation`}>
      Workstation <span aria-hidden="true">↗</span>
    </a>
  </header>

  <div class="orders-list">
    {#each orders as order (order.id)}
      <a class="order-card" href={`${base}/orders/${encodeURIComponent(order.id)}`}
        aria-label={`Open order ${order.poNumber ?? order.title} at ${station}`}>
        <div class="order-topline">
          <span class="order-po">{order.poNumber ?? 'Pending PO'}</span>
          <span class="order-priority">{priorityLabel(order.priority)}</span>
        </div>
        <h3>{order.title || 'Untitled order'}</h3>
        <p class="client">{order.client || 'Unknown client'}</p>
        <div class="order-bottomline">
          <span class="stage-state" data-state={(order.stageState ?? 'NOT_STARTED').toLowerCase()}>
            {stageStateLabel(order.stageState)}
          </span>
          <span class="due-date">{dueDateLabel(order.dueDate)}</span>
        </div>
      </a>
    {:else}
      <div class="empty-station">
        <p>Nothing queued at this station.</p>
        <a href={stationHref}>Open workstation</a>
      </div>
    {/each}
  </div>
</section>

<style>
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
  .order-priority { color: var(--muted); font-size: .75rem; font-weight: 600; }
  .client { margin: 0 0 .75rem; color: var(--muted); font-size: .86rem; overflow-wrap: anywhere; }
  .stage-state {
    font-size: .72rem; font-weight: 750; border: 1px solid var(--border);
    color: var(--text); border-radius: 999px; padding: .3rem .55rem;
    background: var(--bg-2);
  }
  .stage-state[data-state="in_progress"] { border-color: var(--brand); }
  .stage-state[data-state="blocked"] { border-color: var(--error); color: var(--error); }
  .stage-state[data-state="rework"] { border-color: var(--warn); }
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
</style>
