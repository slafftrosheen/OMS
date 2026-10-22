<script lang="ts">
  import { locale } from 'svelte-i18n';
  import OrderBadges from '$lib/badges/OrderBadges.svelte';
  import SemanticBadge from '$lib/badges/SemanticBadge.svelte';
  import { badgeDescriptor, notificationBadge, stageBadge } from '$lib/badges/catalog';
  import CalendarDayBadges from '$lib/calendar/CalendarDayBadges.svelte';
  import { buildCalendarDaySummary, normalizeCalendarOrder } from '$lib/calendar/day-summary';
  import StationBoard from '$lib/components/production/StationBoard.svelte';

  let theme = $state('LightVim');
  let status = $state('IN_PRODUCTION');
  let due = $state('2026-10-21');
  const today = '2026-10-22';
  let order = $derived({id:'10000000-0000-4000-8000-000000000001', poNumber:'PO-1042', title:'Reception lettering',
    client:'North Studio', status, priority:'URGENT', dueDate:due, loadingDate:today, badges:['URGENT','R&D'], isRD:true });
  let summary = $derived(buildCalendarDaySummary(today, {today, orders:[normalizeCalendarOrder(order)!],
    events:[{id:'meeting',date:today,kind:'meeting',createdAt:'',title:'Production review'},{id:'note',date:today,kind:'note',createdAt:'',title:'Samples'}]}));
  $effect(() => { document.documentElement.dataset.theme=theme; });
</script>

<main>
  <h1>Shared workflow badges</h1>
  <div class="controls">
    <label>Theme<select aria-label="Theme" bind:value={theme}><option>LightVim</option><option>DarkVim</option><option>HighContrastVim</option></select></label>
    <label>Language<select aria-label="Language" value={$locale} onchange={e=>locale.set(e.currentTarget.value)}><option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option></select></label>
    <label>Order status<select aria-label="Order status" bind:value={status}><option>IN_PRODUCTION</option><option>DISPATCHED</option><option>CANCELLED</option><option>DRAFT</option></select></label>
    <label>Due date<input aria-label="Due date" type="date" bind:value={due} /></label>
  </div>
  <div class="grid">
    <section aria-label="Order summary"><h2>PO-1042 · Reception lettering</h2><p>North Studio</p><OrderBadges {order} size="md" /></section>
    <section aria-label="Calendar summary"><h2>22 October</h2><CalendarDayBadges {summary} /><div class="mini"><CalendarDayBadges {summary} compact /></div></section>
    <section aria-label="Notifications"><h2>Notifications</h2><div class="signals">
      <SemanticBadge badge={notificationBadge({type:'ORDER_CONFIRMED',category:'ORDER'})} />
      <SemanticBadge badge={badgeDescriptor('unread',{count:3})} />
      <SemanticBadge badge={notificationBadge({type:'CHAT_MESSAGE',category:'CHAT'})} />
      <SemanticBadge badge={notificationBadge({type:'LOW_STOCK',category:'INVENTORY'})} />
    </div></section>
    <section aria-label="Station states"><h2>Station states</h2><div class="signals">{#each ['QUEUED','IN_PROGRESS','BLOCKED','REWORK','COMPLETED'] as state}<SemanticBadge badge={stageBadge(state)} />{/each}</div></section>
  </div>
  <div class="station"><StationBoard station="CNC" orders={[{...order,station:'CNC',stageState:'BLOCKED',upcoming:false,paused:false,risk:'blocked',estimatedHours:2,actualHours:null,blockedReason:'Waiting for approved material'}]} /></div>
</main>

<style>
  main { max-width:1100px;margin:0 auto;padding:24px;color:var(--text); }
  h1 { margin:0 0 20px;font-size:24px; } h2 { font-size:16px;margin:0 0 12px; }
  p { color:var(--ink-secondary); }
  .controls { display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px; }
  label { display:flex;flex-direction:column;gap:6px;font-size:12px;min-width:0; }
  select,input { max-width:100%;min-width:0;color:var(--text);background:var(--bg-1); }
  .grid { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
  section { min-width:0;border:1px solid var(--border);border-radius:12px;padding:20px;background:var(--bg-1); }
  .signals { display:flex;flex-wrap:wrap;gap:6px; }
  .mini { width:55px;margin-top:16px; }
  .station { max-width:430px;margin-top:16px; }
  @media(max-width:600px) { main { padding:16px; }.grid{grid-template-columns:1fr;}label{flex:1 1 120px;}section{padding:16px;} }
</style>
