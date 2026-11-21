<script lang="ts">
 import {locale} from 'svelte-i18n';
 import {page} from '$app/state';
 import {base} from '$app/paths';
 import {goto} from '$app/navigation';
 import {currentUser} from '$lib/auth/authState.svelte';
 import {can} from '$lib/auth/permission-utils';
 import {notificationStore} from '$lib/stores/notifications';
 import TelegramSettings from '$lib/notifications/TelegramSettings.svelte';
 import {telegramAppCopy} from '$lib/telegram/app-copy';
 import {telegramLaunchDestination,telegramNotificationPath} from '$lib/telegram/launch';
 import {type IconName} from '$lib/ui/icons';
 import Icon from '$lib/ui/Icon.svelte';
 let c=$derived(telegramAppCopy($locale));
 let controls=$derived(page.url.searchParams.get('tab')==='control');
 let actions=$derived([
  {label:c.orders,href:'/orders',icon:'clipboard-list'},
  {label:c.calendar,href:'/calendar',icon:'calendar'},
  {label:c.cabinet,href:'/cabinet',icon:'clock'},
  {label:c.inventory,href:'/inventory',icon:'package'},
  ...(can($currentUser,'editOrder')?[{label:c.production,href:'/production',icon:'factory'}]:[]),
  ...(can($currentUser,'createDraftOrder')?[{label:c.newOrder,href:'/orders/new',icon:'upload'}]:[]),
  ...(can($currentUser,'reviewQueue')?[{label:c.review,href:'/orders/review',icon:'check-circle'}]:[])
 ]);
 type Today = {
  date: string; timezone:string;
  orders: Array<{id:string;po_number:string|null;title:string|null;status:string;due_today:boolean;loading_today:boolean}>;
  events: Array<{id:string;kind:string;title:string|null}>;
 };
 let today=$state<Today|null>(null);
 let todayBusy=$state(false);
 let todayError=$state(false);
 let readingAll=$state(false);
 let todayRequest:AbortController|undefined;
 let unread=$derived($notificationStore.items.filter(item=>!item.read));
 let humanDate=$derived(today ? new Intl.DateTimeFormat($locale ?? 'en',{
  weekday:'short',day:'numeric',month:'long',timeZone:'UTC'
 }).format(new Date(today.date+'T12:00:00Z')) : '');

 async function loadToday(){
  todayRequest?.abort();
  const current=new AbortController();
  let timedOut=false;
  const deadline=setTimeout(()=>{
   timedOut=true;
   current.abort();
  },15_000);
  todayRequest=current;todayBusy=true;todayError=false;
  try {
   const response=await fetch(base+'/api/telegram/workspace',{cache:'no-store',signal:current.signal});
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(data?.date)||!Array.isArray(data.orders)||!Array.isArray(data.events))throw Error('unavailable');
   if(todayRequest===current&&!current.signal.aborted)today=data;
  } catch {
   if(todayRequest===current&&(!current.signal.aborted||timedOut))todayError=true;
  } finally {
   clearTimeout(deadline);
   if(todayRequest===current)todayBusy=false;
  }
 }

 async function markAll(){
  const id=$currentUser?.id;
  if(!id||readingAll)return;
  readingAll=true;
  try {await notificationStore.markAllAsRead(id);}
  finally {readingAll=false;}
 }

 $effect(()=>{const id=$currentUser?.id;if(id)return notificationStore.connect(id);});
 $effect(()=>{
  const destination=telegramLaunchDestination(page.url.searchParams);
  if($currentUser&&destination)void goto(base+destination,{replaceState:true});
 });
 $effect(()=>{
  if(!$currentUser?.id||controls||telegramLaunchDestination(page.url.searchParams))return;
  today=null;
  void loadToday();
  return ()=>{todayRequest?.abort();todayRequest=undefined;};
 });
</script>
<svelte:head><title>OMS · Telegram</title></svelte:head>
<div class="workspace">
 <header><p class="eyebrow">{c.account}</p><h1>{controls?c.control:c.title}</h1><p>{controls?c.controlsHint:c.intro}</p></header>
 <section class="actions" aria-label={c.control}>{#each (controls?actions:actions.slice(0,4)) as action}<a href={base+action.href}><Icon name={action.icon as IconName} size="md"/><span>{action.label}</span><span aria-hidden="true">→</span></a>{/each}</section>
 {#if controls}<section class="preferences"><h2>{c.settings}</h2><TelegramSettings/></section>
 {:else}
  <section class="today" aria-labelledby="telegram-today">
   <div class="heading">
    <div><h2 id="telegram-today">{c.today}</h2>{#if humanDate}<p>{humanDate} · {today?.timezone}</p>{/if}</div>
    <button type="button" disabled={todayBusy} onclick={()=>void loadToday()}>{todayError?c.retry:c.refresh}</button>
   </div>
   {#if todayBusy&&!today}<p role="status">{c.todayLoading}</p>{/if}
   {#if todayError}<p role="alert">{c.todayFailed}</p>{/if}
   {#if today}
    <div class="today-grid">
     <section aria-label={c.myOrders}>
      <div class="heading"><h3>{c.myOrders}</h3><a href={base+'/orders'}>{c.orders} →</a></div>
      {#if !today.orders.length}<p>{c.noOrders}</p>
      {:else}<ul class="today-list">{#each today.orders as order (order.id)}
       <li><a href={base+'/orders/'+encodeURIComponent(order.id)}>
        <strong>{order.po_number||order.title||c.orders}</strong>
        {#if order.title&&order.po_number}<span>{order.title}</span>{/if}
        <span class="order-tags">{#if order.loading_today}<span>{c.loadingToday}</span>{/if}{#if order.due_today}<span>{c.dueToday}</span>{/if}</span>
       </a></li>
      {/each}</ul>{/if}
     </section>
     <section aria-label={c.agenda}>
      <div class="heading"><h3>{c.agenda}</h3><a href={base+'/calendar'}>{c.openCalendar} →</a></div>
      {#if !today.events.length}<p>{c.noEvents}</p>
      {:else}<ul class="today-list">{#each today.events as event (event.id)}<li class="event">{event.title||event.kind}</li>{/each}</ul>{/if}
     </section>
    </div>
   {/if}
  </section>
  <section class="notifications"><div class="heading"><h2>{c.recent}</h2><a href={`${base}/notifications`}>{c.notifications} →</a></div>
   {#if $notificationStore.loading}<p role="status">{c.loading}</p>
   {:else if $notificationStore.error}<p role="alert">{$notificationStore.error}</p><button onclick={()=>{if($currentUser)void notificationStore.load($currentUser.id);}}>{c.retry}</button>
   {:else if !unread.length}<p>{c.empty}</p>
   {:else}
    <div class="bulk-notifications"><button type="button" disabled={readingAll} onclick={()=>void markAll()}>{c.markAll}</button></div>
    {#each unread.slice(0,5) as item (item.id)}
     {@const link=telegramNotificationPath(item.link)}
     <article><h3>{item.title}</h3><p>{item.message}</p><div class="notification-actions">
      {#if link}<a href={base+link}>{c.open}</a>{/if}<button onclick={()=>notificationStore.markAsRead(item.id)}>{c.read}</button>
     </div></article>
    {/each}
   {/if}
  </section>
 {/if}
</div>
<style>
 .workspace{max-width:920px;margin:auto;padding:var(--space-lg);display:grid;gap:var(--space-lg);color:var(--ink-primary)}header{display:grid;gap:var(--space-sm)}h1,h2,h3,p{margin:0;overflow-wrap:anywhere}h1{font-size:var(--text-2xl);line-height:1.2}h2{font-size:var(--text-lg)}h3{font-size:var(--text-md)}p{color:var(--ink-secondary);line-height:1.5;font-size:var(--text-sm)}.eyebrow{font-size:var(--text-xs)}
 .actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--space-sm)}.actions a{display:flex;align-items:center;gap:var(--space-sm);min-height:64px;padding:var(--space-md);background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-md);text-decoration:none;color:var(--ink-primary);font-weight:550}.actions a>span:first-of-type{flex:1}.actions a:hover{background:var(--bg-2)}
 .heading{display:flex;justify-content:space-between;gap:var(--space-sm);flex-wrap:wrap;align-items:center}.notifications,.preferences{display:grid;gap:var(--space-md)}article{padding:var(--space-md) 0;border-bottom:1px solid var(--border);display:grid;gap:var(--space-sm)}.notification-actions{display:flex;gap:var(--space-md);align-items:center}a{color:var(--link);font-size:var(--text-sm)}button{font:inherit;padding:8px 12px;min-height:40px;background:var(--bg-1);color:var(--ink-primary);border:1px solid var(--border);border-radius:var(--radius-sm)}:is(a,button):focus-visible{outline:2px solid var(--focus);outline-offset:3px}

 .today{padding:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--bg-1);display:grid;gap:var(--space-md)}
 .today-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:var(--space-md)}
 .today-grid section{min-width:0;display:grid;align-content:start;gap:var(--space-sm)}
 .today-list{list-style:none;padding:0;margin:0;display:grid}
 .today-list li{border-top:1px solid var(--border);min-width:0}
 .today-list a{display:grid;gap:3px;padding:10px 0;text-decoration:none;color:var(--ink-primary);overflow-wrap:anywhere}
 .today-list a:hover strong{text-decoration:underline}.today-list a>span{color:var(--ink-secondary)}
 .today-list .event{padding:10px 0;overflow-wrap:anywhere}
 .order-tags{display:flex;flex-wrap:wrap;gap:4px}.order-tags span{font-size:var(--text-xs);background:var(--bg-2);border-radius:var(--radius-sm);padding:2px 6px}
 .bulk-notifications{justify-self:start}
 @media(max-width:480px){.workspace{padding:var(--space-md)}}
</style>
