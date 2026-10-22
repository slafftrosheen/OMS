<script lang="ts">
  import dayjs from 'dayjs';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  let { year, month, renderDay, onprevmonth, onnextmonth }: {
    year: number;
    month: number; // 1–12
    renderDay: (iso: string) => any;
    onprevmonth?: () => void;
    onnextmonth?: () => void;
  } = $props();

  let start = $derived(dayjs(`${year}-${String(month).padStart(2, '0')}-01`));
  let days = $derived(Array.from({ length: start.daysInMonth() }, (_, i) => start.add(i, 'day')));
  let rows = $derived(Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7)));
  let preferredDay = $state(1);
  let active = $derived(Math.min(preferredDay, days.length));
  let grid: HTMLDivElement;
  let focusRequest = 0;

  async function focusDay() {
    const request = ++focusRequest;
    await tick();
    if (request !== focusRequest || !grid?.isConnected) return;
    grid.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)?.focus();
  }

  $effect.pre(() => {
    start;
    if (grid?.contains(grid.ownerDocument.activeElement)) void focusDay();
  });

  function keyNav(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const max = days.length;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(max, active + 1), ArrowLeft: Math.max(1, active - 1),
      ArrowDown: Math.min(max, active + 7), ArrowUp: Math.max(1, active - 7),
      Home: 1, End: max
    };
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      if (event.key === 'PageUp') onprevmonth?.();
      else onnextmonth?.();
      void focusDay();
    } else if (event.key in moves) {
      event.preventDefault();
      preferredDay = moves[event.key];
      void focusDay();
    }
  }
</script>

<div bind:this={grid} class="grid cal" style="grid-template-columns:repeat(7,1fr)" onkeydown={keyNav} role="grid" tabindex="-1" aria-label={$t('calendar.title')}>
  {#each rows as row}
    <div role="row" class="week">
      {#each row as day}
        <button
          type="button"
          data-day={day.date()}
          class="day"
          role="gridcell"
          tabindex={day.date() === active ? 0 : -1}
          aria-label={day.format('YYYY-MM-DD')}
          onfocus={() => preferredDay = day.date()}
        >
          <span class="day-num">{day.date()}</span>
          {@html renderDay(day.format('YYYY-MM-DD'))}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
.week { display: contents; }
.day {
  border: 1px solid var(--cal-day-border);
  border-radius: 12px;
  padding: 8px;
  text-align: left;
  background: var(--bg-1);
  color: var(--text);
  cursor: pointer;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.day:hover { background: var(--bg-2); }
.day:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.day-num { font-weight: 700; color: var(--cal-num); }
</style>
