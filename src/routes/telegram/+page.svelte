<script lang="ts">
 import {onMount} from 'svelte';
 import {locale} from 'svelte-i18n';
 import {page} from '$app/state';
 import {base} from '$app/paths';
 import {goto} from '$app/navigation';
 import {currentUser} from '$lib/auth/authState.svelte';
 import {can} from '$lib/auth/permission-utils';
 import {notificationStore} from '$lib/stores/notifications';
 import TelegramSettings from '$lib/notifications/TelegramSettings.svelte';
 import {telegramAppCopy} from '$lib/telegram/app-copy';
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
 $effect(()=>{const id=$currentUser?.id;if(id)return notificationStore.connect(id);});
 onMount(()=>{const view=page.url.searchParams.get('view');if(view==='chat'||view==='notifications')void goto(base+'/'+(view==='chat'?'chat':'notifications'),{replaceState:true});});
</script>
<svelte:head><title>OMS · Telegram</title></svelte:head>
<div class="workspace">
 <header><p class="eyebrow">{c.account}</p><h1>{controls?c.control:c.title}</h1><p>{controls?c.controlsHint:c.intro}</p></header>
 <section class="actions" aria-label={c.control}>{#each (controls?actions:actions.slice(0,4)) as action}<a href={base+action.href}><Icon name={action.icon as IconName} size="md"/><span>{action.label}</span><span aria-hidden="true">→</span></a>{/each}</section>
 {#if controls}<section class="preferences"><h2>{c.settings}</h2><TelegramSettings/></section>
 {:else}<section class="notifications"><div class="heading"><h2>{c.recent}</h2><a href={`${base}/notifications`}>{c.notifications} →</a></div>
  {#if $notificationStore.loading}<p role="status">{c.loading}</p>
  {:else if $notificationStore.error}<p role="alert">{$notificationStore.error}</p><button onclick={()=>{if($currentUser)void notificationStore.load($currentUser.id);}}>{c.retry}</button>
  {:else if !$notificationStore.items.some(item=>!item.read)}<p>{c.empty}</p>
  {:else}{#each $notificationStore.items.filter(item=>!item.read).slice(0,5) as item (item.id)}<article><h3>{item.title}</h3><p>{item.message}</p><div class="notification-actions">{#if item.link}<a href={base+item.link}>{c.open}</a>{/if}<button onclick={()=>notificationStore.markAsRead(item.id)}>{c.read}</button></div></article>{/each}{/if}
 </section>{/if}
</div>
<style>
 .workspace{max-width:920px;margin:auto;padding:var(--space-lg);display:grid;gap:var(--space-lg);color:var(--ink-primary)}header{display:grid;gap:var(--space-sm)}h1,h2,h3,p{margin:0;overflow-wrap:anywhere}h1{font-size:var(--text-2xl);line-height:1.2}h2{font-size:var(--text-lg)}h3{font-size:var(--text-md)}p{color:var(--ink-secondary);line-height:1.5;font-size:var(--text-sm)}.eyebrow{font-size:var(--text-xs)}
 .actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:var(--space-sm)}.actions a{display:flex;align-items:center;gap:var(--space-sm);min-height:64px;padding:var(--space-md);background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-md);text-decoration:none;color:var(--ink-primary);font-weight:550}.actions a>span:first-of-type{flex:1}.actions a:hover{background:var(--bg-2)}
 .heading{display:flex;justify-content:space-between;gap:var(--space-sm);flex-wrap:wrap;align-items:center}.notifications,.preferences{display:grid;gap:var(--space-md)}article{padding:var(--space-md) 0;border-bottom:1px solid var(--border);display:grid;gap:var(--space-sm)}.notification-actions{display:flex;gap:var(--space-md);align-items:center}a{color:var(--link);font-size:var(--text-sm)}button{font:inherit;padding:8px 12px;min-height:40px;background:var(--bg-1);color:var(--ink-primary);border:1px solid var(--border);border-radius:var(--radius-sm)}:is(a,button):focus-visible{outline:2px solid var(--focus);outline-offset:3px}
 @media(max-width:480px){.workspace{padding:var(--space-md)}}
</style>
