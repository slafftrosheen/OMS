<script lang="ts">
  import dayjs from 'dayjs';
  import { createEventDispatcher } from 'svelte';
  
  export let year: number;
  export let month: number; // 1-12
  export let renderDay: (iso: string) => any; // slotless renderer (we reuse DayCell)
  
  const dispatch = createEventDispatcher();
  
  let start = dayjs(`${year}-${String(month).padStart(2,'0')}-01`);
  let days = Array.from({length: start.daysInMonth()}, (_, i) => start.add(i, 'day'));
  let active = 1;
  
  function keyNav(e: KeyboardEvent) {
    const max = days.length;
    let next = active;
    
    if (e.key === 'ArrowRight') next = Math.min(max, active + 1);
    if (e.key === 'ArrowLeft') next = Math.max(1, active - 1);
    if (e.key === 'ArrowDown') next = Math.min(max, active + 7);
    if (e.key === 'ArrowUp') next = Math.max(1, active - 7);
    if (e.key === 'Home') next = 1;
    if (e.key === 'End') next = max;
    
    if (e.key === 'PageUp') {
      dispatch('prevmonth');
      e.preventDefault();
      return;
    }
    if (e.key === 'PageDown') {
      dispatch('nextmonth');
      e.preventDefault();
      return;
    }
    
    if (next !== active) {
      active = next;
      e.preventDefault();
      setTimeout(() => {
        (document.getElementById(`d-${next}`) as HTMLButtonElement)?.focus();
      }, 0);
    }
  }
  
  $: {
    // Recalculate days when year or month changes
    start = dayjs(`${year}-${String(month).padStart(2,'0')}-01`);
    days = Array.from({length: start.daysInMonth()}, (_, i) => start.add(i, 'day'));
  }
</script>

<div class="grid cal" style="grid-template-columns:repeat(7,1fr)" on:keydown={keyNav} role="grid" aria-label="Month">
  {#each days as d, i}
    <button 
      id={`d-${i+1}`} 
      class="day" 
      role="gridcell" 
      tabindex={i+1 === active ? 0 : -1}
      aria-label={d.format('YYYY-MM-DD')}
    >
      <div class="day-num">{d.date()}</div>
      {@html renderDay(d.format('YYYY-MM-DD'))}
    </button>
  {/each}
</div>

<style>
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
.day:hover {
  background: var(--bg-2);
}
.day-num {
  font-weight: 700;
  color: var(--cal-num);
}
</style>
