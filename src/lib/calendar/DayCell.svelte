<script lang="ts">
  import { onDestroy } from 'svelte';
  import { byDate } from './store';
  import EventEditor from './EventEditor.svelte';
  import OrderHoverCard from './OrderHoverCard.svelte';
  import OrderBadge from './OrderBadge.svelte';
  import CapacityBar from './CapacityBar.svelte';
  import Truck from 'lucide-svelte/icons/truck';
  import Calendar from 'lucide-svelte/icons/calendar';
  import Sticky from 'lucide-svelte/icons/sticky-note';
  import Package from 'lucide-svelte/icons/package';
  import { loads } from '$lib/state/loads';
  import { listOrders } from '$lib/order/signage-store';
  import type { Order } from '$lib/order/types';

  export let iso = '';
  export let dayNum = 1;
  export let canEdit = false;
  export let capacity = 10; // Default capacity

  let open=false; let pressTimer:any;
  let items = byDate(iso);
  let loadsList: any[] = [];
  let over = false;
  let hoverOrder: Order | null = null;
  let hoverX = 0;
  let hoverY = 0;
  let hoverTimeout: any;
  
  const unsub = loads.subscribe(v => loadsList = v);
  
  // Get orders for this day
  $: dayOrders = listOrders().filter(o => o.loadingDate === iso);
  $: orderCount = dayOrders.length;
  $: utilizationPercentage = capacity > 0 ? (orderCount / capacity) * 100 : 0;
  
  onDestroy(() => {
    unsub?.();
    clearTimeout(hoverTimeout);
  });

  function refresh(){ items = byDate(iso); }
  function onDown(){ clearTimeout(pressTimer); pressTimer=setTimeout(()=>open=true, 450); }
  function onUp(){ clearTimeout(pressTimer); }
  
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }
  
  function onDrop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const po = e.dataTransfer?.getData('text/plain');
    if (!po) return;
    
    let L = loadsList.find(l => l.id === iso);
    if (!L) {
      L = { id: iso, dateISO: iso, pos: [], carrier: '', notes: '', createdAt: new Date().toISOString() };
      loadsList.push(L);
    }
    if (!L.pos.includes(po)) {
      L.pos.push(po);
    }
    loads.set([...loadsList]);
    announce(`Assigned ${po} to ${iso}`);
  }
  
  function announce(msg: string) {
    const el = document.getElementById('rf-live') as HTMLElement;
    if (el) {
      el.textContent = msg;
      setTimeout(() => el.textContent = '', 1000);
    }
  }
  
  function handleOrderHover(order: Order, event: MouseEvent) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hoverOrder = order;
      hoverX = event.clientX + 10;
      hoverY = event.clientY + 10;
    }, 400);
  }
  
  function handleOrderLeave() {
    clearTimeout(hoverTimeout);
    hoverOrder = null;
  }
</script>

<div 
  class="day" 
  class:dragover={over}
  class:has-orders={orderCount > 0}
  class:over-capacity={utilizationPercentage >= 100}
  tabindex="0" 
  aria-label={`Day ${iso} — ${orderCount} orders — drop PO here`}
  aria-dropeffect="copy"
  on:pointerdown={onDown} 
  on:pointerup={onUp} 
  on:pointerleave={onUp}
  on:dragover={onDragOver}
  on:drop={onDrop}
  on:dragenter={() => over = true}
  on:dragleave={() => over = false}
>
  <div class="day-header">
    <div class="day-num">{dayNum}</div>
    {#if canEdit}
      <button class="tag ghost sm" title="Add entry" on:click={() => (open = true)}>+</button>
    {/if}
  </div>

  {#if orderCount > 0}
    <div class="capacity-mini">
      <CapacityBar current={orderCount} {capacity} unit="orders" />
    </div>
  {/if}

  <div class="events-stack">
    {#each items as e (e.id)}
      {@const eventData = e}
      <button
        class="event-chip"
        data-kind={e.kind}
        title={e.kind==='loading' ? `Carrier: ${eventData.carrier||'-'}` : eventData.title || e.kind}
        on:click={() => { open = true; }}
      >
        {#if e.kind==='loading'}<Truck size={14} aria-hidden="true"/>{/if}
        {#if e.kind==='meeting'}<Calendar size={14} aria-hidden="true"/>{/if}
        {#if e.kind==='note'}<Sticky size={14} aria-hidden="true"/>{/if}
        <span class="event-text">
          {e.kind==='loading' ? `POs: ${eventData.poList?.length||0}` :
           e.kind==='meeting' ? eventData.title :
           eventData.title || 'Note'}
        </span>
      </button>
    {/each}
    
    {#each dayOrders.slice(0, 3) as order (order.id)}
      <button
        class="order-card"
        on:mouseenter={(e) => handleOrderHover(order, e)}
        on:mouseleave={handleOrderLeave}
        on:focus={(e) => handleOrderHover(order, e)}
        on:blur={handleOrderLeave}
        aria-label={`Order PO-${order.id}: ${order.title}`}
      >
        <div class="order-card-header">
          <Package size={12} aria-hidden="true" />
          <span class="order-id">PO-{order.id}</span>
        </div>
        <div class="order-badges">
          {#each order.badges.slice(0, 2) as badge}
            <OrderBadge {badge} size="sm" />
          {/each}
        </div>
      </button>
    {/each}
    
    {#if dayOrders.length > 3}
      <div class="more-orders">
        +{dayOrders.length - 3} more
      </div>
    {/if}
  </div>
</div>

{#if open}
  <EventEditor dateISO={iso} onClose={()=>{open=false; refresh();}} />
{/if}

{#if hoverOrder}
  <OrderHoverCard order={hoverOrder} x={hoverX} y={hoverY} />
{/if}

<style>
  .day {
    background: var(--cal-day, var(--bg-1));
    border: 1px solid var(--cal-day-border, var(--border));
    border-radius: 12px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 120px;
    transition: all 0.2s ease;
    position: relative;
  }
  
  .day.dragover {
    outline: 2px dashed var(--ok);
    outline-offset: 3px;
    background: color-mix(in srgb, var(--ok) 5%, transparent);
  }
  
  .day.over-capacity {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 3%, transparent);
  }
  
  .day-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .day-num {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--cal-num, var(--text));
  }
  
  .capacity-mini {
    margin-top: -4px;
  }
  
  .events-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
    max-height: 200px;
  }
  
  .event-chip {
    display: flex;
    gap: 6px;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 0.85rem;
    background: var(--bg-0);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }
  
  .event-chip:hover {
    background: var(--bg-2);
    transform: translateY(-1px);
  }
  
  .event-chip[data-kind="loading"] {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  
  .event-chip[data-kind="meeting"] {
    border-color: var(--ok);
    background: color-mix(in srgb, var(--ok) 8%, transparent);
  }
  
  .event-chip[data-kind="note"] {
    border-color: var(--muted);
  }
  
  .order-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  
  .order-card:hover,
  .order-card:focus {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .order-card-header {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .order-id {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
  }
  
  .order-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  
  .more-orders {
    padding: 4px 8px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 600;
    background: var(--bg-0);
    border-radius: 6px;
    border: 1px dashed var(--border);
  }
  
  @media (prefers-reduced-motion: reduce) {
    .day,
    .event-chip,
    .order-card {
      transition: none;
    }
  }
</style>
