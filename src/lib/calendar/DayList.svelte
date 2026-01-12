<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import { calEvents } from './store';
  import { loads } from '$lib/state/loads';
  import { dragging } from '$lib/dnd';

  type Kind = 'all' | 'loading' | 'meeting' | 'note';

  let entries: any[] = [];
  let kind: Kind = 'all';
  let loadsList: any[] = [];

  const unsubscribe = calEvents.subscribe((value) => {
    entries = [...value].sort((a, b) => a.date.localeCompare(b.date));
  });
  
  const unsubLoads = loads.subscribe(v => loadsList = v);

  onDestroy(() => {
    unsubscribe?.();
    unsubLoads?.();
  });
  
  let dragOverDate: string | null = null;
  
  function onDragOver(e: DragEvent, dateISO: string) {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dragOverDate = dateISO;
    }
  }
  
  function onDrop(e: DragEvent, dateISO: string) {
    e.preventDefault();
    dragOverDate = null;
    const po = e.dataTransfer?.getData('text/plain');
    if (!po) return;
    
    let L = loadsList.find(l => l.id === dateISO);
    if (!L) {
      L = { id: dateISO, dateISO: dateISO, pos: [], carrier: '', notes: '', createdAt: new Date().toISOString() };
      loadsList.push(L);
    }
    if (!L.pos.includes(po)) {
      L.pos.push(po);
    }
    loads.set([...loadsList]);
    announce(`Assigned ${po} to ${dateISO}`);
  }
  
  function announce(msg: string) {
    const el = document.getElementById('rf-live') as HTMLElement;
    if (el) {
      el.textContent = msg;
      setTimeout(() => el.textContent = '', 1000);
    }
  }

  const filters: { value: Kind; label: string }[] = [
    { value: 'all', label: 'calendar.all' },
    { value: 'loading', label: 'calendar.loading' },
    { value: 'meeting', label: 'calendar.meeting' },
    { value: 'note', label: 'calendar.note' }
  ];
</script>

<div class="row" style="justify-content:space-between;align-items:center">
  <h3>{$t('calendar.upcoming')}</h3>
  <select bind:value={kind}>
    {#each filters as option}
      <option value={option.value}>{$t(option.label)}</option>
    {/each}
  </select>
</div>

<ul class="list">
  {#each entries.filter((event) => kind==='all' || event.kind===kind).slice(0, 100) as e}
    <li 
      class="row" 
      class:dragover={dragOverDate === e.date}
      style="justify-content:space-between"
      on:dragover={(ev) => onDragOver(ev, e.date)}
      on:drop={(ev) => onDrop(ev, e.date)}
      on:dragleave={() => dragOverDate = null}
      aria-dropeffect="copy"
      aria-label={`Day ${e.date} — drop PO here`}>
      <div>
        <b>{e.date}</b>
        {#if e.kind==='loading'} – Carrier: {e.carrier || 'n/a'}; POs: {e.poList?.length || 0}{/if}
        {#if e.kind==='meeting'} – {e.title}{/if}
        {#if e.kind==='note'} – {e.title || 'Note'}{/if}
      </div>
      <span class="muted">{new Date(e.createdAt).toLocaleString()}</span>
    </li>
  {/each}
</ul>

<style>
.list{display:grid;gap:6px}
.list li{border:1px solid var(--border);border-radius:10px;padding:8px;background:var(--bg-0)}
.list li.dragover{outline:2px dashed var(--ok);outline-offset:3px}
</style>
