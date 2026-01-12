<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { base } from '$app/paths';
  import { t, locale as activeLocale } from 'svelte-i18n';
  import {
    CalendarCheck,
    CalendarClock,
    Users,
    StickyNote,
    AlertTriangle,
    CircleCheck,
    PlusCircle,
    Activity,
    Ban
  } from 'lucide-svelte';
  import { toggleDay, listAll, setCarrier, setNote, usage } from '$lib/loading/loading-store';
  import { TERMS } from '$lib/order/names';
  import {
    STATE_LABEL,
    STATIONS,
    STATE_TONE,
    type StageMap,
    type StageState,
    type StationTag
  } from '$lib/order/stages';
  import type { Badge as OrderBadge } from '$lib/order/types';
  import { BADGE_ICONS, badgeTone as resolveBadgeTone } from '$lib/order/badges';
  import { capacityConfig, type CapacityConfig } from './capacity-config';

  export let year: number;
  export let month: number;
  export let adminMode = false;

  let capacities: CapacityConfig;
  const unsubCapacity = capacityConfig.subscribe(v => capacities = v);

  type DayCell = { d: Date; iso: string; inMonth: boolean };

  let days: DayCell[] = [];
  let selectedISO: string | null = null;
  const dispatch = createEventDispatcher<string>();
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const todayISO = toISO(new Date());
  let currentLocale = 'en';
  let ordersVersion = 0;

  const statusIcons = {
    idle: CalendarClock,
    open: PlusCircle,
    available: CircleCheck
  } as const;
  const legendKeys = Object.keys(statusIcons) as (keyof typeof statusIcons)[];

  const unsubscribeLocale = activeLocale.subscribe((value) => {
    currentLocale = value || 'en';
  });

  function toISO(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  function build() {
    days = [];
    const first = new Date(year, month, 1);
    const dow = first.getDay() || 7;
    const start = new Date(first);
    start.setDate(1 - (dow - 1));
    for (let i = 0; i < 42; i += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      days.push({ d: current, iso: toISO(current), inMonth: current.getMonth() === month });
    }
  }

  onMount(build);
  onMount(() => {
    const handleOrders = () => {
      ordersVersion += 1;
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('rf-orders-change', handleOrders);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('rf-orders-change', handleOrders);
      }
    };
  });
  $: (year, month, adminMode, build());

  $: if (days.length) {
    const inMonth = days.filter((day) => day.inMonth);
    if (selectedISO && !days.some((day) => day.iso === selectedISO)) {
      selectedISO = null;
    }
    if (!selectedISO && inMonth.length) {
      const today = inMonth.find((day) => day.iso === todayISO);
      const activeDay = inMonth.find((day) => meta(day.iso, ordersVersion).active);
      selectedISO = (today ?? activeDay ?? inMonth[0])?.iso ?? null;
    }
  }

  onDestroy(() => {
    unsubscribeLocale?.();
    unsubCapacity?.();
  });

  function clickDay(iso: string) {
    if (!adminMode) {
      selectedISO = iso;
      dispatch('selectDay', iso);
      return;
    }
    toggleDay(iso);
    selectedISO = iso;
    dispatch('selectDay', iso);
  }

  function meta(iso: string, _tick = ordersVersion) {
    void _tick;
    const stats = usage(iso);
    const day = listAll().find((item) => item.id === iso);
    return {
      active: Boolean(day?.active),
      note: day?.note ?? '',
      carrier: day?.carrier ?? stats.carrier ?? '',
      ...stats
    };
  }

  function formatDate(iso: string) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const formatter = new Intl.DateTimeFormat(currentLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return formatter.format(date);
  }

  type StageHighlight = { station: StationTag; state: StageState };

  function stageHighlights(stages: StageMap | undefined): StageHighlight[] {
    if (!stages) return [];
    const ordered = STATIONS.map((station) => ({ station, state: stages[station] ?? 'NOT_STARTED' }));
    const active = ordered.filter((item) => item.state !== 'COMPLETED');
    const selected = active.length ? active.slice(0, 2) : ordered.slice(-1);
    return selected;
  }

  function stageTone(state: StageState) {
    return STATE_TONE[state] ?? 'primary';
  }

  function badgeToneFor(badge: OrderBadge) {
    return resolveBadgeTone(badge);
  }

  function statusKey(info: ReturnType<typeof meta>) {
    if (!info.active) return 'idle';
    return info.assigned > 0 ? 'available' : 'open';
  }

  function capacityLabel(info: ReturnType<typeof meta>) {
    if (!info.active) return $t('calendar.summary.idle');
    return $t('calendar.summary.unlimited', { assigned: info.assigned });
  }

  function noteLabel(info: ReturnType<typeof meta>) {
    return info.note ? $t('calendar.summary.note', { note: info.note }) : $t('calendar.summary.no_note');
  }

  function fromISODate(iso: string) {
    const [yearStr, monthStr, dayStr] = iso.split('-');
    const year = Number.parseInt(yearStr ?? '', 10);
    const monthIndex = Number.parseInt(monthStr ?? '', 10) - 1;
    const day = Number.parseInt(dayStr ?? '', 10);
    return Number.isFinite(year) && Number.isFinite(monthIndex) && Number.isFinite(day)
      ? new Date(year, monthIndex, day)
      : new Date(iso);
  }

  function dayLabel(date: Date) {
    const formatter = new Intl.DateTimeFormat(currentLocale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    return formatter.format(date);
  }

  function describeDay(day: DayCell) {
    const info = meta(day.iso);
    const label = dayLabel(day.d);
    const status = $t(`calendar.summary.${statusKey(info)}`);
    return `${label} · ${status}. ${capacityLabel(info)} ${noteLabel(info)}`;
  }

  function badgeLabel(badge: OrderBadge) {
    return $t(TERMS.badges[badge]);
  }

  function badgeIconComponent(badge: OrderBadge) {
    return BADGE_ICONS[badge];
  }

  function handleCarrierChange(event: Event, iso: string | null) {
    if (!iso) return;
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    setCarrier(iso, target.value);
  }

  function handleNoteChange(event: Event, iso: string | null) {
    if (!iso) return;
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    setNote(iso, target.value);
  }
</script>

<div class="cal">
  <div class="head">
    {#each dayKeys as key}
      <div>{$t(`calendar.days.${key}`)}</div>
    {/each}
  </div>
  <div class="grid">
    {#each days as day (day.iso)}
      {#if day.inMonth}
        {@const info = meta(day.iso, ordersVersion)}
        <button
          class="cell"
          class:fade-in={info.active}
          aria-pressed={info.active}
          data-active={info.active}
          data-tone={statusKey(info)}
          data-today={day.iso === todayISO}
          data-selected={day.iso === selectedISO}
          aria-label={describeDay(day)}
          on:click={() => clickDay(day.iso)}>
          <div class="cell__header">
            <span class="cell__date">{day.d.getDate()}</span>
            {#if info.active}
              <span class="tag tag--status" data-tone={statusKey(info)}>
                <CalendarCheck size={14} aria-hidden="true" />
                {info.assigned}
              </span>
            {/if}
          </div>
          {#if info.active}
            <div class="cell__body">
              {#if info.carrier}
                <div class="cell__row" data-variant="carrier">
                  <Users size={14} aria-hidden="true" />
                  <span>{info.carrier}</span>
                </div>
              {/if}
              {#if info.note}
                <div class="cell__row" data-variant="note">
                  <StickyNote size={14} aria-hidden="true" />
                  <span>{info.note}</span>
                </div>
              {/if}
            </div>
          {/if}
        </button>
      {:else}
        <div class="cell muted"></div>
      {/if}
    {/each}
  </div>

  <ul class="legend" aria-label={$t('calendar.legend.title')}>
    {#each legendKeys as key (key)}
      {@const icon = statusIcons[key]}
      <li class="legend__item" data-tone={key}>
        <span class="legend__chip">
          <svelte:component this={icon} size={14} aria-hidden="true" />
        </span>
        <span>{$t(`calendar.legend.${key}`)}</span>
      </li>
    {/each}
  </ul>
</div>

<section class="card day-summary" aria-live="polite">
  {#if selectedISO}
    {@const currentISO = selectedISO}
    {@const info = meta(currentISO, ordersVersion)}
    <header class="day-summary__header">
      <div class="day-summary__title">
        <span class="muted">{$t('calendar.detail.title')}</span>
        <h3>{dayLabel(days.find((day) => day.iso === currentISO)?.d ?? fromISODate(currentISO))}</h3>
      </div>
      <span class="tag tag--status" data-tone={statusKey(info)}>
        {#if info.active}
          <CalendarCheck size={14} aria-hidden="true" />
          {$t(`calendar.summary.${statusKey(info)}`)}
        {:else}
          <CalendarClock size={14} aria-hidden="true" />
          {$t('calendar.detail.inactive')}
        {/if}
      </span>
    </header>
    <dl class="day-summary__grid">
      <div>
        <dt>{$t('calendar.detail.assignments')}</dt>
        <dd>{$t('calendar.detail.orders_count', { count: info.assigned ?? 0 })}</dd>
      </div>
      {#if info.carrier}
        <div>
          <dt>Carrier</dt>
          <dd>{info.carrier}</dd>
        </div>
      {/if}
      <div class="day-summary__note">
        <dt>{$t('calendar.detail.note')}</dt>
        <dd>{info.note ? info.note : $t('calendar.detail.no_note')}</dd>
      </div>
    </dl>
    <div class="day-summary__orders">
      <h4>{$t('calendar.detail.orders')}</h4>
      {#if info.orders && info.orders.length}
        <ul class="day-summary__orders-list">
          {#each info.orders as order (order.id)}
            <li class="day-order">
              <div class="day-order__header">
                <a class="day-order__link" href={`${base}/orders/${order.id}`}>
                  <span class="day-order__po">{order.id}</span>
                  <span class="day-order__title">{order.title}</span>
                </a>
                <span class="muted day-order__due">
                  {$t('calendar.detail.order_due', { date: formatDate(order.due) })}
                </span>
              </div>
              <div class="day-order__meta">{order.client}</div>
              <div class="day-order__chips">
                {#each stageHighlights(order.stages) as item (item.station)}
                  <span class="tag tag--status tag--compact" data-tone={stageTone(item.state)}>
                    {$t(TERMS.stations[item.station])}
                    <span aria-hidden="true"> · </span>
                    {$t(STATE_LABEL[item.state])}
                  </span>
                {/each}
              </div>
              {#if order.badges.length}
                <div class="day-order__badges">
                  {#each order.badges as badge (badge)}
                    {@const label = badgeLabel(badge)}
                    {@const icon = badgeIconComponent(badge)}
                    <span class="day-order__badge" data-tone={badgeToneFor(badge)} aria-label={label}>
                      <svelte:component this={icon} size={12} aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted day-summary__orders-empty">{$t('calendar.detail.orders_empty')}</p>
      {/if}
    </div>
  {:else}
    <p class="muted">{$t('calendar.detail.pick')}</p>
  {/if}
</section>

{#if adminMode && selectedISO}
  {@const currentISO = selectedISO}
  {@const info = meta(currentISO, ordersVersion)}
  <div class="card editor">
    <h3>{$t('calendar.loading_day_with_date', { date: currentISO })}</h3>
    <div class="editor__grid">
      <label>
        <span>Carrier</span>
        <input
          class="rf-input"
          type="text"
          value={info.carrier}
          on:change={(event) => handleCarrierChange(event, currentISO)}
        />
      </label>
      <label>
        <span>{$t('calendar.note')}</span>
        <input
          class="rf-input"
          type="text"
          value={info.note}
          on:change={(event) => handleNoteChange(event, currentISO)}
        />
      </label>
    </div>
  </div>
{/if}

<style>
  .cal{ display:grid; gap:12px }
  .head{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; text-align:center; font-size:.75rem; letter-spacing:.02em; color:var(--muted); text-transform:uppercase }
  .grid{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px }
  .cell{ position:relative; display:grid; gap:8px; padding:12px; border-radius:16px; background:var(--bg-1); border:1px solid color-mix(in oklab,var(--border) 90%, transparent); cursor:pointer; text-align:left; transition:box-shadow .18s ease, transform .18s ease, border-color .18s ease }
  .cell:hover{ transform:translateY(-2px); box-shadow:0 18px 32px rgba(var(--shadow-rgb)/.16) }
  .cell[data-today="true"]{ border-color:color-mix(in oklab,var(--accent-2) 45%, var(--border)); box-shadow:0 0 0 3px color-mix(in oklab,var(--accent-2) 20%, transparent) }
  .cell[data-active="true"]{ border-color:color-mix(in oklab,var(--accent-1) 55%, var(--border)); box-shadow:0 0 0 2px color-mix(in oklab,var(--accent-1) 25%, transparent) }
  .cell__header{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px }
  .cell__date{ font-weight:700; font-size:1.1rem }
  .cell__body{ display:grid; gap:6px; font-size:.82rem; line-height:1.35 }
  .cell__row{ display:flex; gap:6px; align-items:flex-start; color:var(--muted); overflow:hidden }
  .cell__row span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .cell__row[data-variant="carrier"]{ color:var(--text) }
  .cell__row :global(svg){ flex:0 0 auto; margin-top:2px }

  .grid > .cell, .grid > .cell.muted{ min-height:120px }
  .cell.muted{ opacity:.35; border-style:dashed }
  .cell[data-selected="true"]{ outline:2px solid color-mix(in oklab,var(--accent-2) 45%, transparent); outline-offset:2px }
  .tag--status[data-tone="busy"], .cell[data-tone="busy"] .tag--status{ background:color-mix(in oklab,var(--warn) 25%, transparent); border-color:color-mix(in oklab,var(--warn) 35%, transparent); color:var(--warn) }
  .tag--status[data-tone="full"], .cell[data-tone="full"] .tag--status{ background:color-mix(in oklab,var(--danger) 20%, transparent); border-color:color-mix(in oklab,var(--danger) 45%, transparent); color:var(--danger) }
  .tag--status[data-tone="available"], .cell[data-tone="available"] .tag--status{ background:color-mix(in oklab,var(--ok) 20%, transparent); border-color:color-mix(in oklab,var(--ok) 40%, transparent); color:var(--ok) }
  .tag--status[data-tone="open"], .cell[data-tone="open"] .tag--status{ background:color-mix(in oklab,var(--info) 18%, transparent); border-color:color-mix(in oklab,var(--info) 40%, transparent); color:var(--info) }
  .tag--status[data-tone="idle"], .cell[data-tone="idle"] .tag--status{ color:var(--muted); border-style:dashed }

  .legend{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; margin-top:4px; padding:0; list-style:none }
  .legend__item{ display:flex; align-items:center; gap:8px; font-size:.8rem; color:var(--muted) }
  .legend__chip{ display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:999px; border:1px solid color-mix(in oklab,var(--border) 80%, transparent); background:var(--bg-1) }
  .legend__item[data-tone="available"] .legend__chip{ background:color-mix(in oklab,var(--ok) 18%, transparent); color:var(--ok); border-color:color-mix(in oklab,var(--ok) 45%, transparent) }
  .legend__item[data-tone="open"] .legend__chip{ background:color-mix(in oklab,var(--info) 18%, transparent); color:var(--info); border-color:color-mix(in oklab,var(--info) 45%, transparent) }
  .legend__item[data-tone="busy"] .legend__chip{ background:color-mix(in oklab,var(--warn) 20%, transparent); color:var(--warn); border-color:color-mix(in oklab,var(--warn) 40%, transparent) }
  .legend__item[data-tone="full"] .legend__chip{ background:color-mix(in oklab,var(--danger) 20%, transparent); color:var(--danger); border-color:color-mix(in oklab,var(--danger) 40%, transparent) }
  .legend__item[data-tone="idle"] .legend__chip{ border-style:dashed }

  .day-summary{ margin-top:16px; display:grid; gap:12px }
  .day-summary__header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap }
  .day-summary__title{ display:flex; flex-direction:column; gap:4px }
  .day-summary__title h3{ margin:0; font-size:1.1rem }
  .day-summary__grid{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)) }
  .day-summary__grid dt{ font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted) }
  .day-summary__grid dd{ margin:4px 0 0; font-weight:600; line-height:1.4 }
  .day-summary__note{ grid-column:1/-1 }
  .day-summary__note dd{ font-weight:400 }
  .day-summary__orders{ display:grid; gap:10px; margin-top:6px }
  .day-summary__orders h4{ margin:0; font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted) }
  .day-summary__orders-list{ list-style:none; padding:0; margin:0; display:grid; gap:10px }
  .day-order{ display:grid; gap:8px; padding:10px 12px; border-radius:12px; border:1px solid color-mix(in oklab,var(--border) 75%, transparent); background:color-mix(in oklab,var(--bg-2) 55%, transparent) }
  .day-order__header{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap }
  .day-order__link{ display:flex; flex-direction:column; gap:4px; color:inherit; text-decoration:none }
  .day-order__po{ font-weight:700; font-size:.9rem }
  .day-order__title{ font-size:.92rem }
  .day-order__due{ font-size:.8rem }
  .day-order__meta{ font-size:.82rem; color:var(--muted) }
  .day-order__chips{ display:flex; flex-wrap:wrap; gap:6px }
  .day-order__badges{ display:flex; flex-wrap:wrap; gap:6px }
  .day-order__badge{
    display:inline-flex;
    align-items:center;
    gap:4px;
    padding:4px 8px;
    border-radius:999px;
    font-size:.7rem;
    font-weight:600;
    border:1px solid color-mix(in oklab,var(--border) 70%, transparent);
    background:color-mix(in oklab,var(--bg-2) 55%, transparent);
    color:var(--text);
  }
  .day-order__badge[data-tone='success']{ border-color:color-mix(in oklab,var(--ok) 45%, transparent); background:color-mix(in oklab,var(--ok) 18%, transparent); color:var(--ok) }
  .day-order__badge[data-tone='warn']{ border-color:color-mix(in oklab,var(--warn) 45%, transparent); background:color-mix(in oklab,var(--warn) 18%, transparent); color:var(--warn) }
  .day-order__badge[data-tone='danger']{ border-color:color-mix(in oklab,var(--danger) 45%, transparent); background:color-mix(in oklab,var(--danger) 18%, transparent); color:var(--danger) }
  .day-order__badge[data-tone='info']{ border-color:color-mix(in oklab,var(--accent-2) 45%, transparent); background:color-mix(in oklab,var(--accent-2) 18%, transparent); color:var(--accent-2) }
  .day-summary__orders-empty{ margin:0; font-size:.85rem }
  .tag--compact{ padding:4px 8px; font-size:.7rem; font-weight:600 }
  .tag--status[data-tone='primary']{ background:color-mix(in oklab,var(--accent-1) 18%, transparent); border-color:color-mix(in oklab,var(--accent-1) 38%, transparent); color:var(--accent-1) }
  .tag--status[data-tone='success']{ background:color-mix(in oklab,var(--ok) 22%, transparent); border-color:color-mix(in oklab,var(--ok) 45%, transparent); color:var(--ok) }
  .tag--status[data-tone='warn']{ background:color-mix(in oklab,var(--warn) 22%, transparent); border-color:color-mix(in oklab,var(--warn) 45%, transparent); color:var(--warn) }
  .tag--status[data-tone='danger']{ background:color-mix(in oklab,var(--danger) 22%, transparent); border-color:color-mix(in oklab,var(--danger) 45%, transparent); color:var(--danger) }
  .tag--status[data-tone='muted']{ background:color-mix(in oklab,var(--border) 35%, transparent); border-color:color-mix(in oklab,var(--border) 55%, transparent); color:var(--muted); border-style:dashed }

  .editor{ margin-top:16px; display:grid; gap:12px }
  .editor h3{ margin:0 }
  .editor__grid{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)) }
  .editor label{ display:grid; gap:6px; font-size:.85rem; color:var(--muted) }

  @media (max-width: 720px){
    .grid{ gap:6px }
    .cell{ min-height:110px }
  }
</style>
