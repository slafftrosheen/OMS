<script lang="ts">
  import dayjs from 'dayjs';
  import DayCell from './DayCell.svelte';
  import { capacityConfig, type CapacityConfig } from './capacity-config';
  
  export let year: number;
  export let month: number;
  
  let weekStart = dayjs().startOf('week');
  let capacities: CapacityConfig;
  
  const unsubCapacity = capacityConfig.subscribe(v => capacities = v);
  
  $: days = Array.from({length: 7}, (_, i) => weekStart.add(i, 'day'));
  
  function prev() {
    weekStart = weekStart.subtract(7, 'day');
  }
  
  function next() {
    weekStart = weekStart.add(7, 'day');
  }
  
  function getDayCapacity(iso: string): number {
    return capacities?.customCapacities[iso] ?? capacities?.defaultCapacity ?? 10;
  }
</script>

<div class="cal-weekstrip">
  <div class="row" style="justify-content:space-between;margin-bottom:8px">
    <button class="tag" on:click={prev}>◀</button>
    <strong>{weekStart.format('MMM D')} - {weekStart.add(6, 'day').format('MMM D, YYYY')}</strong>
    <button class="tag" on:click={next}>▶</button>
  </div>
  <div class="week-grid">
    {#each days as d}
      {#if capacities}
        <DayCell 
          iso={d.format('YYYY-MM-DD')} 
          dayNum={d.date()} 
          canEdit={true}
          capacity={getDayCapacity(d.format('YYYY-MM-DD'))}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
.cal-weekstrip{
  display:none;
  padding: 12px;
}
.week-grid{
  display:grid;
  grid-template-columns:repeat(7, 1fr);
  gap:8px;
}
</style>
