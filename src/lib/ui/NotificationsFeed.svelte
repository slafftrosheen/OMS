<script lang="ts">
  import { notifications, togglePin, markSeen, type NotificationItem } from '$lib/notifications/store';
  import { t } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';
  import { STATIONS, type StationTag } from '$lib/order/stages';
  import StationBadge from '$lib/ui/StationBadge.svelte';
  import { BellRing, AlertTriangle, Clock } from 'lucide-svelte';

  export let items: NotificationItem[] = [];

  $: feed = Array.isArray(items) && items.length ? items : $notifications;

  let stationFilter: 'all' | StationTag = 'all';
  let urgencyFilter: 'all' | 'urgent' | 'normal' = 'all';

  const stationOptions = STATIONS;
  const stationLabel = (code: StationTag) => $t(TERMS.stations[code]);

  const urgencyLabel = (value: 'normal' | 'urgent') =>
    value === 'urgent' ? $t('notifications.urgency.urgent') : $t('notifications.urgency.normal');

  function applyFilters(list: NotificationItem[]) {
    let filtered = list;
    if (stationFilter !== 'all') {
      filtered = filtered.filter((item) => item.station === stationFilter);
    }
    if (urgencyFilter !== 'all') {
      filtered = filtered.filter((item) => item.urgency === urgencyFilter);
    }
    return filtered;
  }

  $: filtered = applyFilters(feed);
  $: pinned = filtered.filter((item) => item.pinned);
  $: unpinned = filtered.filter((item) => !item.pinned);

  function handlePin(id: string) {
    markSeen(id);
    togglePin(id);
  }

  function handleSeen(id: string) {
    markSeen(id);
  }
</script>

<div class="feed" aria-live="polite" aria-atomic="false">
  <div class="feed-controls">
    <label class="control">
      <span>{$t('notifications.filter.station')}</span>
      <select
        class="rf-input rf-input--compact"
        bind:value={stationFilter}
        aria-label={$t('notifications.filter.station')}
      >
        <option value="all">{$t('notifications.filter.all_stations')}</option>
        {#each stationOptions as option}
          <option value={option}>{stationLabel(option)}</option>
        {/each}
      </select>
    </label>
    <label class="control">
      <span>{$t('notifications.filter.urgency')}</span>
      <select
        class="rf-input rf-input--compact"
        bind:value={urgencyFilter}
        aria-label={$t('notifications.filter.urgency')}
      >
        <option value="all">{$t('notifications.filter.all_urgencies')}</option>
        <option value="urgent">{$t('notifications.urgency.urgent')}</option>
        <option value="normal">{$t('notifications.urgency.normal')}</option>
      </select>
    </label>
  </div>

  <div class="feed-section" role="log" aria-live="polite" aria-atomic="false">
    {#if pinned.length}
      <div class="section-label">{$t('notifications.pinned_section')}</div>
      {#each pinned as item (item.id)}
        <article
          class="card notif"
          data-urgency={item.urgency}
          data-seen={item.seen}
          aria-label={`${item.text} ${item.ts}`}
          on:mouseenter={() => handleSeen(item.id)}
          on:focusin={() => handleSeen(item.id)}
        >
        <header class="notif-head">
          <span class="notif-icon" aria-hidden="true">
            <BellRing size={16} />
          </span>
          <div class="notif-body">
            <div class="notif-text">{item.text}</div>
            <div class="notif-meta">
              <span class="muted">
                <Clock size={14} aria-hidden="true" /> {item.ts}
              </span>
              {#if item.station}
                <StationBadge station={item.station} size="sm" />
              {/if}
              <span class="tag tag--meta" data-urgency={item.urgency}>
                {item.urgency === 'urgent'
                  ? $t('notifications.urgency.urgent')
                  : $t('notifications.urgency.normal')}
              </span>
            </div>
          </div>
          <button
            class="pin"
            type="button"
            on:click={() => handlePin(item.id)}
            aria-pressed={item.pinned}
            aria-label={$t('notifications.unpin_label')}
          >★</button>
        </header>
        </article>
      {/each}
    {/if}

    {#if unpinned.length && pinned.length}
      <div class="divider" role="presentation"></div>
    {/if}

    {#each unpinned as item (item.id)}
      <article
        class="card notif"
        data-urgency={item.urgency}
        data-seen={item.seen}
        aria-label={`${item.text} ${item.ts}`}
        on:mouseenter={() => handleSeen(item.id)}
        on:focusin={() => handleSeen(item.id)}
      >
        <header class="notif-head">
          <span class="notif-icon" aria-hidden="true">
            {#if item.urgency === 'urgent'}
              <AlertTriangle size={16} />
            {:else}
              <BellRing size={16} />
            {/if}
          </span>
          <div class="notif-body">
            <div class="notif-text">{item.text}</div>
            <div class="notif-meta">
              <span class="muted">
                <Clock size={14} aria-hidden="true" /> {item.ts}
              </span>
              {#if item.station}
                <StationBadge station={item.station} size="sm" />
              {/if}
              <span class="tag tag--meta" data-urgency={item.urgency}>{urgencyLabel(item.urgency)}</span>
            </div>
          </div>
          <button
            class="pin"
            type="button"
            on:click={() => handlePin(item.id)}
            aria-pressed={item.pinned}
            aria-label={item.pinned ? $t('notifications.unpin_label') : $t('notifications.pin_label')}
          >{item.pinned ? '★' : '☆'}</button>
        </header>
      </article>
    {/each}

    {#if filtered.length === 0}
      <div class="muted empty">{$t('notifications.empty')}</div>
    {/if}
  </div>
</div>

<style>
  .feed {
    display: grid;
    gap: 12px;
    min-height: 0;
  }

  .feed-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .control {
    display: grid;
    gap: 4px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .feed-section {
    display: grid;
    gap: 8px;
  }

  .section-label {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .notif {
    background: var(--bg-1);
    padding: 14px;
    display: grid;
    border-radius: 16px;
    border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
    box-shadow: 0 12px 28px rgba(var(--shadow-rgb)/.12);
  }

  .notif[data-urgency='urgent'] {
    border-color: color-mix(in oklab, var(--danger) 40%, transparent);
  }

  .notif[data-seen='false'] {
    box-shadow: 0 16px 32px rgba(var(--shadow-rgb)/.16);
  }

  .notif-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .notif-body {
    display: grid;
    gap: 8px;
  }

  .notif-icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: color-mix(in oklab, var(--bg-2) 80%, transparent);
    color: var(--accent-2);
  }

  .notif[data-urgency='urgent'] .notif-icon {
    color: var(--danger);
    background: color-mix(in oklab, var(--danger) 18%, transparent);
  }

  .notif-text {
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .notif-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .notif-meta > .muted {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .tag--meta {
    border-radius: 999px;
    padding: 2px 8px;
    background: color-mix(in oklab, var(--bg-2) 70%, transparent);
    border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
    color: var(--muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tag--meta[data-urgency='urgent'] {
    color: var(--danger);
    border-color: color-mix(in oklab, var(--danger) 40%, transparent);
    background: color-mix(in oklab, var(--danger) 12%, transparent);
  }

  .pin {
    border: none;
    background: transparent;
    font-size: 1rem;
    cursor: pointer;
    color: var(--text);
  }

  .divider {
    border-bottom: 1px dashed var(--border);
    margin: 4px 0;
  }

  .empty {
    padding: 12px 0;
  }
</style>
