<script lang="ts">
  /**
   * OrderTimeline — vertical activity timeline for the Order detail "Timeline" tab.
   * Synthesises events from order lifecycle dates, station consumption logs,
   * rework cycles, revisions, and activity_log (when present).
   *
   * Pure, defensive: tolerates missing fields. No fetch — feed it an order.
   */
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  import type { IconName } from '$lib/ui/icons';

  type ConsumptionRow = {
    station: string;
    first_logged_at: string;
    last_logged_at: string;
    sku?: string | null;
    name?: string | null;
    total_quantity?: number;
  };

  let {
    order,
    consumption = [] as ConsumptionRow[]
  }: {
    order: any;
    consumption?: ConsumptionRow[];
  } = $props();

  type EventTone = 'brand' | 'success' | 'warn' | 'danger' | 'muted';

  type TimelineEvent = {
    id: string;
    at: string;          // ISO
    title: string;
    detail?: string;
    icon: IconName;
    tone: EventTone;
  };

  function fmt(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return '';
    return d.toLocaleString();
  }

  function rel(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return '';
    const diff = Date.now() - d.valueOf();
    const min = Math.round(diff / 60_000);
    if (min < 1)   return $t('time.now',     { default: 'just now' });
    if (min < 60)  return $t('time.min_ago', { default: '{n} min ago', values: { n: min } });
    const hr = Math.round(min / 60);
    if (hr < 24)   return $t('time.hr_ago',  { default: '{n} h ago',   values: { n: hr } });
    const day = Math.round(hr / 24);
    if (day < 30)  return $t('time.day_ago', { default: '{n} d ago',   values: { n: day } });
    return d.toLocaleDateString();
  }

  function actorOf(entry: any): string {
    return (
      entry?.actor_name ||
      entry?.user_name  ||
      entry?.user?.profiles?.full_name ||
      entry?.creator?.profiles?.full_name ||
      entry?.created_by_name ||
      ''
    );
  }

  let events = $derived.by<TimelineEvent[]>(() => {
    if (!order) return [];
    const out: TimelineEvent[] = [];
    const push = (e: TimelineEvent | null | undefined) => { if (e) out.push(e); };

    if (order.created_at) {
      push({
        id: 'created',
        at: order.created_at,
        title: $t('orderTimeline.created', { default: 'Order created' }),
        detail: order.created_by_name
          ? $t('orderTimeline.by', { default: 'by {name}', values: { name: order.created_by_name } })
          : undefined,
        icon: 'file-plus',
        tone: 'brand'
      });
    }
    if (order.confirmed_at || order.po_assigned_at) {
      push({
        id: 'confirmed',
        at: order.confirmed_at || order.po_assigned_at,
        title: $t('orderTimeline.confirmed', { default: 'Confirmed by Head of Production' }),
        detail: order.po_number
          ? $t('orderTimeline.po', { default: 'PO {po}', values: { po: order.po_number } })
          : undefined,
        icon: 'badge-check',
        tone: 'success'
      });
    }

    // Station consumption logs — first time and last time each station logged
    for (const c of consumption || []) {
      if (c.first_logged_at) {
        push({
          id: `station-start-${c.station}-${c.first_logged_at}`,
          at: c.first_logged_at,
          title: $t('orderTimeline.station_started', {
            default: '{station} started',
            values: { station: c.station }
          }),
          detail: c.name ? `${c.name}${c.total_quantity ? ` × ${c.total_quantity}` : ''}` : undefined,
          icon: 'play',
          tone: 'brand'
        });
      }
      if (c.last_logged_at && c.last_logged_at !== c.first_logged_at) {
        push({
          id: `station-end-${c.station}-${c.last_logged_at}`,
          at: c.last_logged_at,
          title: $t('orderTimeline.station_logged', {
            default: '{station} logged',
            values: { station: c.station }
          }),
          detail: c.name ? `${c.name}${c.total_quantity ? ` × ${c.total_quantity}` : ''}` : undefined,
          icon: 'check',
          tone: 'success'
        });
      }
    }

    // Stage status snapshot (if exposed)
    for (const s of order.stages || []) {
      if (s?.completed_at) {
        push({
          id: `stage-${s.station}-completed`,
          at: s.completed_at,
          title: $t('orderTimeline.stage_completed', {
            default: '{station} completed',
            values: { station: s.station }
          }),
          icon: 'check-circle',
          tone: 'success'
        });
      }
      if (s?.skipped_at) {
        push({
          id: `stage-${s.station}-skipped`,
          at: s.skipped_at,
          title: $t('orderTimeline.stage_skipped', {
            default: '{station} skipped',
            values: { station: s.station }
          }),
          detail: s.skip_reason || undefined,
          icon: 'skip-forward',
          tone: 'warn'
        });
      }
      if (s?.blocked_at) {
        push({
          id: `stage-${s.station}-blocked`,
          at: s.blocked_at,
          title: $t('orderTimeline.stage_blocked', {
            default: '{station} blocked',
            values: { station: s.station }
          }),
          detail: s.block_reason || undefined,
          icon: 'circle-alert',
          tone: 'danger'
        });
      }
    }

    // Revisions
    for (const r of order.revisions || []) {
      if (!r?.created_at) continue;
      push({
        id: `rev-${r.id ?? r.revision_number ?? r.created_at}`,
        at: r.created_at,
        title: $t('orderTimeline.revision', {
          default: 'Revision {n} attached',
          values: { n: r.revision_number ?? '' }
        }),
        detail: actorOf(r) || r.notes || undefined,
        icon: 'history',
        tone: 'brand'
      });
    }

    // Rework cycles
    for (const w of order.rework_cycles || []) {
      if (w?.created_at) {
        push({
          id: `rework-open-${w.id ?? w.created_at}`,
          at: w.created_at,
          title: $t('orderTimeline.rework_opened', { default: 'Rework requested' }),
          detail: w.reason || actorOf(w) || undefined,
          icon: 'refresh-ccw',
          tone: 'warn'
        });
      }
      if (w?.resolved_at) {
        push({
          id: `rework-resolved-${w.id ?? w.resolved_at}`,
          at: w.resolved_at,
          title: $t('orderTimeline.rework_resolved', { default: 'Rework resolved' }),
          detail: w.resolution || undefined,
          icon: 'badge-check',
          tone: 'success'
        });
      }
    }

    // Generic activity log (best-effort mapping)
    for (const a of order.activity_log || []) {
      const at = a?.created_at || a?.at;
      if (!at) continue;
      const action = String(a?.action || a?.type || '').toLowerCase();
      let icon: IconName = 'activity';
      let tone: EventTone = 'muted';
      if (/dispatch/.test(action))     { icon = 'truck';        tone = 'success'; }
      else if (/archive/.test(action)) { icon = 'archive';      tone = 'muted'; }
      else if (/void/.test(action))    { icon = 'x-circle';     tone = 'danger'; }
      else if (/comment|chat/.test(action)) { icon = 'message-square'; tone = 'brand'; }
      else if (/assign/.test(action))  { icon = 'user-plus';    tone = 'brand'; }
      else if (/upload|file/.test(action)) { icon = 'paperclip'; tone = 'brand'; }
      else if (/status/.test(action))  { icon = 'workflow';     tone = 'brand'; }
      push({
        id: `act-${a.id ?? at}`,
        at,
        title: a?.message || a?.action_label || a?.action || $t('orderTimeline.activity', { default: 'Activity' }),
        detail: actorOf(a) || a?.detail || undefined,
        icon,
        tone
      });
    }

    if (order.dispatched_at) {
      push({
        id: 'dispatched',
        at: order.dispatched_at,
        title: $t('orderTimeline.dispatched', { default: 'Order dispatched' }),
        icon: 'truck',
        tone: 'success'
      });
    }
    if (order.archived_at) {
      push({
        id: 'archived',
        at: order.archived_at,
        title: $t('orderTimeline.archived', { default: 'Order archived' }),
        icon: 'archive',
        tone: 'muted'
      });
    }
    if (order.voided_at) {
      push({
        id: 'voided',
        at: order.voided_at,
        title: $t('orderTimeline.voided', { default: 'Order voided' }),
        detail: order.void_reason || undefined,
        icon: 'x-circle',
        tone: 'danger'
      });
    }

    // Newest first
    return out
      .filter(e => !!e.at)
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  });
</script>

<div class="rf-timeline" aria-label={$t('orderTimeline.aria', { default: 'Order timeline' })}>
  {#if events.length === 0}
    <div class="rf-empty">
      <span class="rf-empty__icon"><Icon name="history" size="xl" /></span>
      <p class="rf-empty__title">{$t('orderTimeline.empty', { default: 'No timeline events yet' })}</p>
      <p class="rf-empty__text">
        {$t('orderTimeline.empty_hint', { default: 'Activity will appear here as the order moves through production.' })}
      </p>
    </div>
  {:else}
    <ol class="timeline">
      {#each events as ev, i (ev.id)}
        <li class="timeline__row" style="--i:{i}">
          <span class="timeline__dot" data-tone={ev.tone}>
            <Icon name={ev.icon} size="sm" />
          </span>
          <div class="timeline__body">
            <div class="timeline__head">
              <span class="timeline__title">{ev.title}</span>
              <time class="timeline__time" datetime={ev.at} title={fmt(ev.at)}>
                {rel(ev.at)}
              </time>
            </div>
            {#if ev.detail}<p class="timeline__detail">{ev.detail}</p>{/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .rf-timeline { animation: rf-fade-in var(--motion-md) var(--ease-standard) both; }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: calc(var(--space-md) + 12px);
    top: 0; bottom: 0;
    width: 1.5px;
    background: linear-gradient(to bottom,
      transparent 0,
      var(--divider) 4%,
      var(--divider) 96%,
      transparent 100%);
    pointer-events: none;
  }

  .timeline__row {
    position: relative;
    display: grid;
    grid-template-columns: calc(var(--space-md) + 28px) 1fr;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    animation: rf-stagger-in var(--motion-md) var(--ease-emphasized) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }

  .timeline__dot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thin);
    -webkit-backdrop-filter: var(--glass-material-thin);
    border: 1px solid var(--glass-border);
    color: var(--ink-secondary);
    margin-left: var(--space-md);
    flex-shrink: 0;
    box-shadow: var(--elevation-1);
    z-index: 1;
  }
  .timeline__dot[data-tone="brand"]   { color: var(--brand); border-color: color-mix(in oklab, var(--brand) 40%, var(--glass-border)); }
  .timeline__dot[data-tone="success"] { color: var(--ok);    border-color: color-mix(in oklab, var(--ok)    40%, var(--glass-border)); }
  .timeline__dot[data-tone="warn"]    { color: var(--warn);  border-color: color-mix(in oklab, var(--warn)  40%, var(--glass-border)); }
  .timeline__dot[data-tone="danger"]  { color: var(--error); border-color: color-mix(in oklab, var(--error) 40%, var(--glass-border)); }
  .timeline__dot[data-tone="muted"]   { color: var(--ink-3); }

  .timeline__body {
    min-width: 0;
    padding: var(--space-xs) 0 var(--space-sm);
  }

  .timeline__head {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .timeline__title {
    font-weight: 600;
    color: var(--ink-primary);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
  }
  .timeline__time {
    color: var(--ink-tertiary);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .timeline__detail {
    margin: var(--space-xxs) 0 0;
    color: var(--ink-secondary);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
</style>
