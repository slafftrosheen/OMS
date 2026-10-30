<script lang="ts">
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import { onMount, tick } from 'svelte';
  import { getAssistantContext } from '$lib/assistant/context';
  import { base } from '$app/paths';
  import { t, locale } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { mayAssignLoading } from '$lib/order/lifecycle-guards';
  import { downloadCSV, toCSV } from '$lib/export/csv';
  import Icon from '$lib/ui/Icon.svelte';
  import CalendarDayBadges from '$lib/calendar/CalendarDayBadges.svelte';
  import {
    buildCalendarDaySummary, localDateKey, normalizeCalendarEvent, normalizeLoadingDay,
    isOutstandingOrder, type CalendarDaySummary, type CalendarLoadingDay, type CalendarOrder
  } from '$lib/calendar/day-summary';
  import { fetchCalendarJson, fetchCalendarOrders } from '$lib/calendar/calendar-data';
  import type { CalEvent } from '$lib/calendar/types';

  const initialDate = new Date();
  const assistant = getAssistantContext();
  onMount(() => assistant.register({
    id: 'calendar', title: () => $t('assistant.screen.calendar'), tools: () => [],
    context: () => ({ selectedDate, displayedMonth: `${year}-${String(month + 1).padStart(2, '0')}`,
      filter: filterStatus, loading, unavailableSources: errors,
      selectedDay: { badges: selected.badges.map(badge => ({ type: badge.kind, count: badge.count })) },
      visibleOrders: filteredOrders.slice(0, Math.min(visibleOrderCount, 15)).map(order => ({
        reference: order.poNumber, title: order.title, status: order.status,
        dueDate: order.dueDate, loadingDate: order.loadingDate })) })
  }));
  let year = $state(initialDate.getFullYear());
  let month = $state(initialDate.getMonth());
  let today = $state(localDateKey(initialDate));
  let selectedDate = $state(localDateKey(initialDate));
  let orders = $state<CalendarOrder[]>([]);
  let loadingDays = $state<CalendarLoadingDay[]>([]);
  let events = $state<CalEvent[]>([]);
  let loading = $state(true);
  let errors = $state<string[]>([]);
  let mounted = $state(false);
  let filterStatus = $state<'all' | 'scheduled' | 'unscheduled'>('all');
  let visibleOrderCount = $state(20);
  let modal = $state<'assign' | 'loading' | null>(null);
  let dialog = $state<HTMLDialogElement>();
  let newCarrier = $state('');
  let newNote = $state('');
  let operation = $state(false);
  let actionError = $state('');
  let actionNotice = $state('');
  let requestId = 0;
  let controller: AbortController | null = null;
  let mutationController: AbortController | null = null;
  let alive = true;

  const canManage = $derived(['RD', 'Boss', 'HeadOfProduction'].includes($currentUser?.role ?? ''));
  const currentLocale = $derived($locale || 'en');
  const days = $derived.by(() => {
    const start = new Date(year, month, 1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  });
  const summaries = $derived(new Map(days.map(day => {
    const date = localDateKey(day);
    return [date, buildCalendarDaySummary(date, { orders, loadingDays, events, today })] as const;
  })));
  const selected = $derived(summaries.get(selectedDate) ?? buildCalendarDaySummary(selectedDate, { orders, loadingDays, events, today }));
  const monthName = $derived(new Intl.DateTimeFormat(currentLocale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)));
  const eligibleOrders = $derived(orders.filter(order => !order.loadingDate && mayAssignLoading(order.status)));
  const filteredOrders = $derived(orders.filter(order => filterStatus === 'all' ||
    (filterStatus === 'scheduled' ? !!order.loadingDate : !order.loadingDate)));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const badgeKinds = ['loading', 'due', 'overdue', 'meeting', 'note', 'closed'] as const;
  const sources = ['orders', 'loading_days', 'events'] as const;

  function formatDate(date: string, full = false): string {
    return new Intl.DateTimeFormat(currentLocale, full
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
  }

  function dayDescription(summary: CalendarDaySummary): string {
    const badges = summary.badges.map(badge => {
      const key = badge.kind === 'loading' && badge.count === 0 ? 'loading_day' : badge.kind;
      return `${$t(`calendar.badges.${key}`)}${badge.count > 0 ? `: ${badge.count}` : ''}`;
    });
    return `${formatDate(summary.date, true)}${badges.length ? ` — ${badges.join(', ')}` : ''}`;
  }

  async function refreshCalendar(from = localDateKey(days[0]), to = localDateKey(days[41])) {
    const version = ++requestId;
    controller?.abort();
    controller = new AbortController();
    const options = { basePath: base, signal: controller.signal };
    loading = true;
    errors = [];
    const results = await Promise.allSettled([
      fetchCalendarOrders(options),
      fetchCalendarJson('/api/loading-days', options).then(payload => {
        if (!Array.isArray(payload)) throw new Error('Invalid loading days response');
        return payload.map(normalizeLoadingDay).filter((day): day is CalendarLoadingDay => !!day);
      }),
      fetchCalendarJson(`/api/calendar?from=${from}&to=${to}`, options).then(payload => {
        if (!Array.isArray(payload)) throw new Error('Invalid calendar events response');
        return payload.map(normalizeCalendarEvent).filter((event): event is CalEvent => !!event);
      })
    ]);
    if (!alive || version !== requestId) return;
    orders = results[0].status === 'fulfilled' ? results[0].value : [];
    loadingDays = results[1].status === 'fulfilled' ? results[1].value : [];
    events = results[2].status === 'fulfilled' ? results[2].value : [];
    errors = results.flatMap((result, index) => result.status === 'rejected' ? [sources[index]] : []);
    loading = false;
  }

  $effect(() => {
    if (mounted) void refreshCalendar(localDateKey(days[0]), localDateKey(days[41]));
  });

  $effect(() => {
    if (dialog && modal && !dialog.open) dialog.showModal();
  });

  function navigateMonth(offset: number) {
    const next = new Date(year, month + offset, 1);
    year = next.getFullYear();
    month = next.getMonth();
    selectedDate = localDateKey(next);
  }

  function selectDay(date: Date) {
    selectedDate = localDateKey(date);
    if (date.getMonth() !== month || date.getFullYear() !== year) {
      year = date.getFullYear();
      month = date.getMonth();
    }
    actionNotice = '';
  }

  async function navigateDay(event: KeyboardEvent, date: Date) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsets[event.key]);
    selectDay(next);
    await tick();
    document.querySelector<HTMLButtonElement>(`[data-date="${selectedDate}"]`)?.focus();
  }

  function jumpToToday() { selectDay(new Date()); }

  function openModal(kind: 'assign' | 'loading') {
    if (!canManage || loading || errors.includes('loading_days') || (kind === 'assign' && errors.includes('orders'))) return;
    actionError = '';
    actionNotice = '';
    newCarrier = '';
    newNote = '';
    modal = kind;
  }

  async function mutate(path: string, init: RequestInit, success: string): Promise<boolean> {
    if (!canManage || operation) return false;
    operation = true;
    actionError = '';
    actionNotice = '';
    mutationController = new AbortController();
    try {
      await fetchCalendarJson(path, { basePath: base, signal: mutationController.signal }, init);
      if (!alive) return false;
      modal = null;
      actionNotice = success;
      await refreshCalendar();
      return true;
    } catch (error) {
      if (alive) actionError = error instanceof Error ? error.message : $t('calendar.agenda.save_failed');
      return false;
    } finally {
      if (alive) operation = false;
    }
  }

  async function createLoadingDay(event: SubmitEvent) {
    event.preventDefault();
    if (selected.loadingDay) return;
    await mutate('/api/loading-days', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedDate, carrier: newCarrier.trim(), note: newNote.trim() })
    }, $t('calendar.agenda.loading_created'));
  }

  async function assignOrder(order: CalendarOrder) {
    const day = selected.loadingDay;
    if (!day?.active || !mayAssignLoading(order.status)) return;
    await mutate(`/api/loading-days/${encodeURIComponent(day.id)}/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id })
    }, $t('calendar.agenda.order_assigned'));
  }

  async function removeOrder(order: CalendarOrder) {
    const day = selected.loadingDay;
    if (!day || order.status !== 'READY_TO_LOAD') return;
    await mutate(`/api/loading-days/${encodeURIComponent(day.id)}/orders?orderId=${encodeURIComponent(order.id)}`, {
      method: 'DELETE'
    }, $t('calendar.agenda.order_removed'));
  }

  function exportDay() {
    const rows = selected.loadingOrders.map(order => ({
      PO: order.poNumber || order.id,
      [$t('calendar.columns.client')]: order.client,
      [$t('calendar.columns.title')]: order.title,
      [$t('calendar.columns.due')]: order.dueDate ?? ''
    }));
    downloadCSV(`loading-${selectedDate}.csv`, toCSV(rows));
  }

  onMount(() => {
    mounted = true;
    const handleRefresh = () => void refreshCalendar();
    const timer = window.setInterval(() => today = localDateKey(new Date()), 60_000);
    window.addEventListener('rf-orders-change', handleRefresh);
    return () => {
      alive = false;
      requestId += 1;
      controller?.abort();
      mutationController?.abort();
      window.clearInterval(timer);
      window.removeEventListener('rf-orders-change', handleRefresh);
    };
  });
</script>

<svelte:head><title>{$t('calendar.schedule_title')} — OMS</title></svelte:head>

<div class="calendar-page">
  <header class="calendar-topbar">
    <div>
      <h1>{$t('calendar.schedule_title')}</h1>
      <p class="page-description">{$t('calendar.agenda.description')}</p>
    </div>
    <div class="topbar-actions">
      <a class="text-link" href={`${base}/notifications`}><Icon name="bell" size={16} />{$t('calendar.agenda.notifications')}</a>
      <button class="btn-secondary" type="button" onclick={() => refreshCalendar()} disabled={loading || operation}>
        <Icon name="refresh-cw" size={16} />{$t('common.refresh', { default: 'Refresh' })}
      </button>
    </div>
  </header>

  {#if errors.length}
    <div class="calendar-alert" role="alert">
      <Icon name="alert-triangle" size={18} />
      <div><strong>{$t('calendar.agenda.incomplete')}</strong>
        <p>{$t('calendar.agenda.unavailable', { sources: errors.map(source => $t(`calendar.agenda.sources.${source}`)).join(', ') })}</p></div>
      <button class="btn-secondary" type="button" onclick={() => refreshCalendar()} disabled={loading}>{$t('common.retry', { default: 'Retry' })}</button>
    </div>
  {/if}
  {#if actionError && !modal}<div class="calendar-alert" role="alert">{$t('calendar.agenda.save_failed')} {actionError}</div>{/if}
  {#if actionNotice}<p class="notice" role="status">{actionNotice}</p>{/if}

  <div class="calendar-layout">
    <section class="calendar-section" aria-label={$t('calendar.schedule_title')} aria-busy={loading}>
      <div class="calendar-header">
        <div class="month-controls">
          <button class="icon-button" type="button" onclick={() => navigateMonth(-1)} aria-label={$t('calendar.prevMonth')}><Icon name="chevron-left" size={18} /></button>
          <h2>{monthName}</h2>
          <button class="icon-button" type="button" onclick={() => navigateMonth(1)} aria-label={$t('calendar.nextMonth')}><Icon name="chevron-right" size={18} /></button>
        </div>
        <button class="btn-secondary today-button" type="button" onclick={jumpToToday}>{$t('calendar.agenda.today')}</button>
      </div>
      <p class="calendar-status" aria-live="polite">{loading ? $t('calendar.agenda.loading') : $t('calendar.agenda.select_hint')}</p>
      <div class="calendar-body">
        <div class="weekdays" aria-hidden="true">{#each dayNames as name}<span>{$t(`calendar.days.${name}`)}</span>{/each}</div>
        <div class="days-grid">
          {#each days as day (localDateKey(day))}
            {@const date = localDateKey(day)}
            {@const summary = summaries.get(date)!}
            <button class="day-cell" type="button" data-date={date}
              class:other-month={day.getMonth() !== month}
              class:today={date === today} class:selected={date === selectedDate}
              aria-pressed={date === selectedDate} aria-current={date === today ? 'date' : undefined}
              aria-label={dayDescription(summary)} onclick={() => selectDay(day)} onkeydown={event => navigateDay(event, day)}>
              <span class="day-number">{day.getDate()}{#if date === today}<span class="today-dot" aria-hidden="true"></span>{/if}</span>
              <CalendarDayBadges {summary} compact />
            </button>
          {/each}
        </div>
      </div>
      <div class="calendar-legend" aria-label={$t('calendar.legend.title')}>
        {#each badgeKinds as kind}
          <CalendarDayBadges summary={{ date: '', loadingDay: null, loadingOrders: [], dueOrders: [], events: [], badges: [{ kind, count: 0 }] }} />
        {/each}
      </div>
      <p class="calendar-footnote">{$t('calendar.agenda.overdue_hint')}</p>
    </section>

    <section class="day-agenda" aria-label={$t('calendar.agenda.day_title')} aria-busy={loading}>
      <header class="agenda-header">
        <h2>{formatDate(selectedDate, true)}</h2>
        <CalendarDayBadges summary={selected} />
      </header>
      {#if errors.length}<p class="agenda-warning">{$t('calendar.agenda.partial_agenda')}</p>{/if}
      {#if selected.loadingDay}
        <div class="loading-detail" class:closed={!selected.loadingDay.active}>
          <Icon name="truck" size={18} />
          <div><strong>{$t(selected.loadingDay.active ? 'calendar.badges.loading_day' : 'calendar.badges.closed')}</strong>
            {#if selected.loadingDay.carrier}<p>{selected.loadingDay.carrier}</p>{/if}
            {#if selected.loadingDay.note}<p class="preserve-lines">{selected.loadingDay.note}</p>{/if}
            {#if selected.loadingDay.capacity !== null}<p>{$t('calendar.agenda.capacity', { assigned: selected.loadingOrders.length, capacity: selected.loadingDay.capacity })}</p>{/if}
          </div>
        </div>
      {/if}

      {#if selected.loadingOrders.length}
        <div class="agenda-group">
          <div class="group-heading"><h3><Icon name="truck" size={16} />{$t('calendar.agenda.loading_orders')}</h3><span>{selected.loadingOrders.length}</span></div>
          {#each selected.loadingOrders as order (order.id)}
            <article class="agenda-order">
              <a href={`${base}/orders/${encodeURIComponent(order.id)}`}><strong>{order.poNumber || $t('calendar.agenda.no_po')}</strong><span>{order.title || order.client}</span><small>{order.client}</small></a>
              <OrderBadges {order} />
              <div class="order-footer">
                <span>{$t('calendar.due_prefix')} {order.dueDate ? formatDate(order.dueDate) : '—'}</span>
                {#if canManage && selected.loadingDay && order.status === 'READY_TO_LOAD'}
                  <button class="icon-button small" type="button" onclick={() => removeOrder(order)} disabled={operation || loading}
                    aria-label={$t('calendar.agenda.remove_order', { po: order.poNumber || order.title })} title={$t('calendar_widget.remove_from_schedule')}><Icon name="x" size={14} /></button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if selected.dueOrders.length}
        <div class="agenda-group">
          <div class="group-heading"><h3><Icon name="clock" size={16} />{$t('calendar.agenda.deadlines')}</h3><span>{selected.dueOrders.length}</span></div>
          {#each selected.dueOrders as order (order.id)}
            <a class="deadline-item" href={`${base}/orders/${encodeURIComponent(order.id)}`}>
              <div><strong>{order.poNumber || $t('calendar.agenda.no_po')}</strong><span>{order.title || order.client}</span></div>
              <OrderBadges {order} priority={false} flags={false} />
            </a>
          {/each}
        </div>
      {/if}

      {#if selected.events.length}
        <div class="agenda-group">
          <div class="group-heading"><h3><Icon name="calendar" size={16} />{$t('calendar.agenda.events')}</h3><span>{selected.events.length}</span></div>
          {#each selected.events as event (event.id)}
            <article class="event-item" data-kind={event.kind}>
              <Icon name={event.kind === 'loading' ? 'truck' : event.kind === 'meeting' ? 'users' : 'file-text'} size={16} />
              <div>
                <strong>{event.kind === 'loading' ? $t('calendar.badges.loading_day') : event.title || $t(`calendar.badges.${event.kind}`)}</strong>
                {#if event.kind === 'meeting'}
                  {#if event.start}<p><time>{event.start}{event.end ? `–${event.end}` : ''}</time></p>{/if}
                  {#if event.location}<p>{event.location}</p>{/if}
                {:else if event.kind === 'loading'}
                  {#if event.carrier}<p>{event.carrier}</p>{/if}
                  {#if event.window?.start || event.window?.end}<p>{event.window?.start || '—'}–{event.window?.end || '—'}</p>{/if}
                  {#if event.poList.length}<p>{event.poList.join(', ')}</p>{/if}
                {/if}
                {#if event.note}<p class="preserve-lines">{event.note}</p>{/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if !loading && !errors.length && !selected.loadingDay && !selected.loadingOrders.length && !selected.dueOrders.length && !selected.events.length}
        <div class="empty-agenda"><Icon name="calendar-check" size={26} /><h3>{$t('calendar.agenda.clear_day')}</h3><p>{$t('calendar.agenda.clear_day_hint')}</p></div>
      {/if}

      <footer class="agenda-actions">
        {#if canManage}
          {#if selected.loadingDay?.active}
            <button class="btn-primary" type="button" onclick={() => openModal('assign')} disabled={operation || loading || errors.includes('orders') || errors.includes('loading_days')}><Icon name="plus" size={16} />{$t('calendar.add_order')}</button>
          {:else if !selected.loadingDay}
            <button class="btn-primary" type="button" onclick={() => openModal('loading')} disabled={operation || loading || errors.includes('loading_days')}><Icon name="plus" size={16} />{$t('calendar.mark_loading_day')}</button>
          {/if}
        {:else}<p class="muted">{$t('calendar.agenda.read_only')}</p>{/if}
        {#if selected.loadingOrders.length}<button class="btn-secondary" type="button" onclick={exportDay} disabled={loading || errors.includes('orders')}><Icon name="download" size={16} />{$t('calendar.export_csv')}</button>{/if}
      </footer>
    </section>
  </div>

  <section class="orders-section" aria-label={$t('calendar.all_orders')}>
    <header class="orders-header"><h2>{$t('calendar.all_orders')}</h2>
      <div class="filter-group">
        {#each ['all', 'scheduled', 'unscheduled'] as filter}
          <button type="button" class="filter-button" class:active={filterStatus === filter} aria-pressed={filterStatus === filter}
            onclick={() => { filterStatus = filter as typeof filterStatus; visibleOrderCount = 20; }}>{$t(`calendar.${filter}`)}</button>
        {/each}
      </div>
    </header>
    {#if errors.includes('orders')}<p class="agenda-warning">{$t('calendar.agenda.orders_unavailable')}</p>
    {:else if !loading && filteredOrders.length === 0}<p class="muted">{$t('calendar.agenda.no_matching_orders')}</p>
    {:else}
      <div class="orders-scroll"><table>
        <thead><tr><th>PO</th><th>{$t('calendar.columns.client')}</th><th>{$t('calendar.columns.title')}</th><th>{$t('calendar.columns.due')}</th><th>{$t('calendar.agenda.loading_date')}</th></tr></thead>
        <tbody>{#each filteredOrders.slice(0, visibleOrderCount) as order (order.id)}<tr>
          <td><a href={`${base}/orders/${encodeURIComponent(order.id)}`}>{order.poNumber || $t('calendar.agenda.no_po')}</a></td>
          <td>{order.client || '—'}</td><td>{order.title || '—'}</td><td>{order.dueDate ? formatDate(order.dueDate) : '—'}</td>
          <td>{#if order.loadingDate}<button type="button" class="date-link" onclick={() => selectDay(new Date(`${order.loadingDate}T12:00:00`))}>{formatDate(order.loadingDate)}</button>{:else}—{/if}</td>
        </tr>{/each}</tbody>
      </table></div>
      <div class="orders-footer"><p>{$t('calendar.agenda.showing_orders', { shown: Math.min(visibleOrderCount, filteredOrders.length), total: filteredOrders.length })}</p>
        {#if visibleOrderCount < filteredOrders.length}<button class="btn-secondary" type="button" onclick={() => visibleOrderCount += 20}>{$t('calendar.agenda.show_more')}</button>{/if}
      </div>
    {/if}
  </section>
</div>

{#if modal}
  <dialog bind:this={dialog} class="calendar-dialog" aria-labelledby="calendar-dialog-title"
    oncancel={event => { if (operation) event.preventDefault(); else modal = null; }} onclose={() => modal = null}>
    <header class="dialog-header"><div><p class="dialog-date">{formatDate(selectedDate, true)}</p><h2 id="calendar-dialog-title">{$t(modal === 'assign' ? 'calendar.add_order' : 'calendar.mark_loading_day')}</h2></div>
      <button class="icon-button" type="button" onclick={() => modal = null} disabled={operation} aria-label={$t('common.close')}><Icon name="x" size={18} /></button></header>
    {#if actionError}<div class="calendar-alert" role="alert">{$t('calendar.agenda.save_failed')} {actionError}</div>{/if}
    {#if modal === 'assign'}
      <p class="muted">{$t('calendar.agenda.ready_hint')}</p>
      {#if eligibleOrders.length === 0}<p class="empty-modal">{$t('calendar.agenda.no_eligible_orders')}</p>{/if}
      <div class="available-orders">{#each eligibleOrders as order (order.id)}
        <button type="button" class="available-order" onclick={() => assignOrder(order)} disabled={operation}>
          <span><strong>{order.poNumber || $t('calendar.agenda.no_po')}</strong><span>{order.title || order.client}</span><small>{order.client}{order.dueDate ? ` · ${formatDate(order.dueDate)}` : ''}</small></span><Icon name="plus" size={18} />
        </button>
      {/each}</div>
    {:else}
      <form onsubmit={createLoadingDay}>
        <label for="calendar-carrier">{$t('calendar.carrier_optional')}</label><input id="calendar-carrier" bind:value={newCarrier} maxlength={120} disabled={operation} />
        <label for="calendar-note">{$t('calendar.note_optional')}</label><textarea id="calendar-note" bind:value={newNote} maxlength={4000} rows="3" disabled={operation}></textarea>
        <footer class="dialog-footer"><button class="btn-secondary" type="button" onclick={() => modal = null} disabled={operation}>{$t('actions.cancel', { default: 'Cancel' })}</button>
          <button class="btn-primary" type="submit" disabled={operation}>{operation ? $t('calendar.agenda.saving') : $t('calendar.create_loading_day')}</button></footer>
      </form>
    {/if}
  </dialog>
{/if}

<style>
  .calendar-page{max-width:1660px;margin:0 auto;padding:24px;display:grid;gap:20px;color:var(--text)}
  h1,h2,h3,p{margin:0}h1{font-size:clamp(24px,3vw,34px);font-weight:750;line-height:1.15;letter-spacing:-.025em}h2{font-size:20px;line-height:1.3;letter-spacing:-.015em}h3{font-size:14px;line-height:1.4}
  .calendar-topbar{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:8px 0}.dialog-date{font-size:12px;color:var(--ink-secondary);margin-bottom:6px}.page-description{margin-top:10px;max-width:62ch;font-size:14px;color:var(--ink-secondary);line-height:1.5}.topbar-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end}.text-link{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text);text-decoration:none}.text-link:hover{text-decoration:underline}
  .btn-primary,.btn-secondary,.icon-button,.filter-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:9px 13px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.btn-primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)}.btn-secondary,.icon-button{background:var(--bg-1);color:var(--text)}button:disabled{opacity:.5;cursor:not-allowed}.btn-secondary:hover:not(:disabled),.icon-button:hover:not(:disabled){background:var(--bg-2);border-color:var(--border-strong)}button:focus-visible,a:focus-visible{outline:2px solid var(--focus);outline-offset:3px}.icon-button{width:40px;padding:0;flex-shrink:0}.small{width:32px;min-height:32px}
  .calendar-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,1fr);gap:20px;align-items:start}.calendar-section,.day-agenda,.orders-section{min-width:0;background:var(--bg-1);border:1px solid var(--border);border-radius:14px}.calendar-section{padding:20px}.calendar-header{display:flex;justify-content:space-between;gap:12px;align-items:center}.month-controls{display:flex;align-items:center;gap:10px;min-width:0}.month-controls h2{text-align:center;min-width:0;text-transform:capitalize}.calendar-status{min-height:20px;margin:12px 0;color:var(--ink-secondary);font-size:12px;line-height:1.5}.calendar-body{min-width:0}.weekdays,.days-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.weekdays{margin-bottom:8px;color:var(--ink-secondary);font-size:11px;font-weight:600;text-align:center}
  .day-cell{font:inherit;min-width:0;min-height:112px;display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--bg-1);color:var(--text);cursor:pointer;text-align:left}.day-cell:hover{background:var(--bg-2);border-color:var(--border-strong)}.day-cell.other-month{background:var(--bg-2)}.day-cell.other-month .day-number{color:var(--muted)}.day-cell.today{border-color:color-mix(in srgb,var(--brand) 60%,var(--border))}.day-cell.selected{background:var(--brand-soft);border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}.day-number{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.today-dot{width:5px;height:5px;background:var(--brand);border-radius:50%}.calendar-legend{display:flex;gap:6px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}.calendar-footnote{color:var(--ink-secondary);font-size:11px;line-height:1.5;margin-top:10px}
  .day-agenda{display:grid;gap:18px;padding:20px}.agenda-header{display:grid;gap:8px}.agenda-header h2{text-transform:capitalize}.loading-detail{display:flex;gap:10px;padding:12px;background:var(--bg-2);border:1px solid var(--border);border-radius:8px}.loading-detail.closed{background:color-mix(in srgb,var(--danger) 6%,var(--bg-1));border-color:color-mix(in srgb,var(--danger) 35%,var(--border))}.loading-detail strong{font-size:13px}.loading-detail p{font-size:12px;line-height:1.5;margin-top:4px;overflow-wrap:anywhere}.preserve-lines{white-space:pre-wrap}.agenda-group{display:grid;gap:8px;min-width:0}.group-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px}.group-heading h3{display:flex;gap:7px;align-items:center}.group-heading>span{color:var(--ink-secondary);font-size:12px;font-variant-numeric:tabular-nums}
  .agenda-order{border:1px solid var(--border);border-radius:8px;overflow:hidden}.agenda-order>a{display:grid;gap:4px;padding:11px;color:var(--text);text-decoration:none;overflow-wrap:anywhere}.agenda-order>a:hover{background:var(--bg-2)}.agenda-order strong,.deadline-item strong{font-size:12px}.agenda-order span{font-size:13px;line-height:1.4}.agenda-order small{color:var(--ink-secondary);font-size:11px}.order-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;background:var(--bg-2)}.order-footer span{font-size:11px;color:var(--ink-secondary)}.deadline-item{display:flex;align-items:start;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px;text-decoration:none;color:var(--text)}.deadline-item:hover{background:var(--bg-2)}.deadline-item>div{display:grid;gap:4px;min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:1.4}
  .event-item{display:flex;gap:9px;padding:10px;border:1px solid var(--border);background:var(--bg-2);border-radius:8px;min-width:0}.event-item>div{min-width:0;overflow-wrap:anywhere}.event-item strong{font-size:13px}.event-item p{font-size:12px;line-height:1.5;margin-top:4px;color:var(--ink-secondary)}.empty-agenda{display:grid;justify-items:center;text-align:center;gap:10px;padding:28px 10px;color:var(--ink-secondary)}.empty-agenda h3{color:var(--text)}.empty-agenda p{max-width:28ch;font-size:13px;line-height:1.5}.agenda-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:14px;border-top:1px solid var(--border)}.muted,.agenda-warning{font-size:12px;line-height:1.5;color:var(--ink-secondary)}.agenda-warning{padding:10px;background:color-mix(in srgb,var(--warn) 8%,var(--bg-1));border-radius:6px}
  .calendar-alert{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--border));background:color-mix(in srgb,var(--warn) 7%,var(--bg-1));border-radius:9px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.calendar-alert>div{flex:1;min-width:0}.calendar-alert p{margin-top:3px}.notice{padding:10px 14px;background:color-mix(in srgb,var(--ok) 9%,var(--bg-1));border:1px solid color-mix(in srgb,var(--ok) 40%,var(--border));border-radius:8px;font-size:13px}
  .orders-section{padding:20px}.orders-header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}.filter-group{display:flex;gap:5px;flex-wrap:wrap}.filter-button{min-height:36px;padding:6px 11px;background:var(--bg-1);color:var(--ink-secondary);font-size:12px}.filter-button.active{background:var(--brand-soft);border-color:var(--brand);color:var(--text)}.orders-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:12px}th{font-weight:600;color:var(--ink-secondary);font-size:11px;white-space:nowrap}th,td{padding:11px 10px;border-bottom:1px solid var(--border)}td{overflow-wrap:anywhere;min-width:100px;max-width:360px}td a,.date-link{color:var(--text);text-decoration:underline;text-underline-offset:3px}.date-link{border:0;background:none;padding:0;cursor:pointer;font:inherit;white-space:nowrap}.orders-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;font-size:12px;color:var(--ink-secondary)}
  .calendar-dialog{width:min(520px,calc(100vw - 32px));max-height:85dvh;overflow:auto;padding:22px;background:var(--bg-1);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-xl)}.calendar-dialog::backdrop{background:rgba(0,0,0,.5)}.dialog-header{display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:16px}.calendar-dialog .calendar-alert{margin-bottom:14px}.calendar-dialog form{display:grid;gap:10px}.calendar-dialog label{font-size:13px;font-weight:600;margin-top:8px}.calendar-dialog input,.calendar-dialog textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:7px;background:var(--bg-2);color:var(--text);font:inherit;font-size:14px}.dialog-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.available-orders{display:grid;gap:8px;margin-top:14px}.available-order{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:var(--bg-1);color:var(--text);border:1px solid var(--border);border-radius:8px;text-align:left;cursor:pointer}.available-order:hover:not(:disabled){background:var(--bg-2);border-color:var(--brand)}.available-order>span{display:grid;gap:4px;min-width:0;overflow-wrap:anywhere;font-size:13px}.available-order small{color:var(--ink-secondary);font-size:11px}.empty-modal{margin:20px 0;font-size:13px;line-height:1.5;color:var(--ink-secondary)}
  @media(max-width:1150px){.calendar-layout{grid-template-columns:minmax(0,1fr)}.day-cell{min-height:108px}.day-agenda{gap:16px}}
  @media(max-width:600px){.calendar-page{padding:12px 8px;gap:14px}.calendar-topbar{flex-direction:column;align-items:stretch;gap:14px}.topbar-actions{justify-content:space-between}.calendar-section,.day-agenda,.orders-section{padding:12px}.calendar-header{gap:6px}.month-controls{gap:4px}.month-controls h2{font-size:15px}.month-controls .icon-button{width:32px;min-height:40px}.today-button{padding:8px;font-size:11px}.weekdays,.days-grid{gap:3px}.weekdays{font-size:10px}.day-cell{padding:4px;min-height:92px;gap:6px;border-radius:5px}.day-number{font-size:11px;gap:3px}.calendar-legend{gap:5px}.calendar-alert{flex-wrap:wrap;gap:8px}.calendar-alert>div{flex-basis:calc(100% - 30px)}.calendar-dialog{padding:16px}.orders-footer{flex-wrap:wrap}}
</style>
