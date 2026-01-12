<script lang="ts">
  import dayjs from 'dayjs';
  export let po = '';                 // PO id
  export let onPick = (date:string)=>{}; // callback to parent
  let month = dayjs(); let open=true; let message='';
  function dates(){ const start=month.startOf('month'); return Array.from({length:month.daysInMonth()},(_,i)=>start.add(i,'day')); }
  function pick(d:string){ message = `Selected ${d}`; onPick(d); open=false; }
</script>

{#if open}
<div class="sheet" role="dialog" aria-modal="true" aria-label="Pick loading date">
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <strong>Loading date</strong>
      <div class="row">
        <button class="tag" on:click={()=>month = month.subtract(1,'month')}>◀</button>
        <span>{month.format('YYYY MMM')}</span>
        <button class="tag" on:click={()=>month = month.add(1,'month')}>▶</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(7,1fr);margin-top:8px">
      {#each dates() as d}
        {#key d.format('YYYY-MM-DD')}
        <button class="tile" on:click={()=>pick(d.format('YYYY-MM-DD'))}
          aria-label={`Select ${d.format('YYYY MMM DD')}`}>
          <div>{d.date()}</div>
        </button>
        {/key}
      {/each}
    </div>
    {#if message}<div class="muted" style="margin-top:6px">{message}</div>{/if}
  </div>
</div>
{/if}

<style>
.sheet{position:fixed;inset:0;background:color-mix(in oklab, var(--bg-0) 50%, transparent);display:grid;place-items:center;z-index:60}
.tile{height:64px;border:1px solid var(--border);background:var(--bg-0);border-radius:10px;padding:6px;text-align:left}
</style>
