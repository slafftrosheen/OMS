<script lang="ts">
 import {onMount,type Snippet} from 'svelte';
 import {locale} from 'svelte-i18n';
 import {base} from '$app/paths';
 import {page} from '$app/state';
 import {currentUser} from '$lib/auth/authState.svelte';
 import {notificationStore} from '$lib/stores/notifications';
 import {type IconName} from '$lib/ui/icons';
 import Icon from '$lib/ui/Icon.svelte';
 import {telegramAppCopy} from './app-copy';
 let {children,onExit}:{children:Snippet;onExit:()=>void}=$props();
 let c=$derived(telegramAppCopy($locale));
 let path=$derived(page.url.pathname.slice(base.length));
 let active=$derived(path==='/chat'?'chats':path==='/notifications'?'notifications':path==='/telegram'&&!page.url.searchParams.has('tab')?'home':'control');
 const tabs:Array<{id:'home'|'notifications'|'chats'|'control';href:string;icon:IconName}>=[{id:'home',href:'/telegram',icon:'home'},{id:'notifications',href:'/notifications',icon:'bell'},
  {id:'chats',href:'/chat',icon:'message-square'},{id:'control',href:'/telegram?tab=control',icon:'settings'}];
 $effect(()=>{const id=$currentUser?.id;if(id)return notificationStore.connect(id);});
 onMount(()=>{
  // Telegram data is used only for presentation; OMS session/RLS owns authorization.
  let disposed=false;
  const setup=()=>{if(disposed)return;const app=(window as any).Telegram?.WebApp;app?.ready();app?.expand();};
  if((window as any).Telegram?.WebApp)setup();
  else {const script=document.createElement('script');script.src='https://telegram.org/js/telegram-web-app.js';script.async=true;script.onload=setup;document.head.append(script);}
  return ()=>{disposed=true;};
 });
</script>
<div class="telegram-app">
 <header class="app-header">
  <a href={`${base}/telegram`} aria-label={c.home}><strong>OMS</strong></a>
  <span>{$currentUser?.displayName||$currentUser?.username}</span>
  <button type="button" onclick={onExit}>{c.full}</button>
 </header>
 <main id="main" class:chat={path==='/chat'}>{@render children()}</main>
 <nav aria-label="OMS" class="app-tabs">
  {#each tabs as tab}<a href={base+tab.href} aria-current={active===tab.id?'page':undefined}>
   <span class="tab-icon"><Icon name={tab.icon} size="md"/>{#if tab.id==='notifications'&&$notificationStore.unreadCount>0}<span class="count">{$notificationStore.unreadCount}</span>{/if}</span>
   <span>{c[tab.id as keyof typeof c]}</span></a>{/each}
 </nav>
</div>
<style>
 .telegram-app{--topbar-h:56px;--bottombar-h:76px;min-height:100dvh;background:var(--bg-0);color:var(--ink-primary)}
 .app-header{height:56px;box-sizing:border-box;display:flex;align-items:center;gap:var(--space-sm);padding:0 var(--space-md);border-bottom:1px solid var(--border);background:var(--bg-1);position:sticky;top:0;z-index:80}.app-header>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-sm)}
 .app-header a{color:var(--ink-primary);text-decoration:none}.app-header button{background:transparent;color:var(--ink-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;min-height:40px;font:inherit;font-size:var(--text-xs)}
 main{padding-bottom:calc(76px + env(safe-area-inset-bottom));min-width:0}main.chat{height:calc(100dvh - 56px);box-sizing:border-box}main.chat :global(.chat-page){height:100%}
 .app-tabs{position:fixed;bottom:0;inset-inline:0;display:grid;grid-template-columns:repeat(4,1fr);background:var(--bg-1);border-top:1px solid var(--border);padding:6px 4px calc(6px + env(safe-area-inset-bottom));z-index:90}.app-tabs a{display:grid;justify-items:center;align-content:center;gap:4px;min-height:58px;color:var(--ink-secondary);font-size:var(--text-xs);text-decoration:none;border-radius:var(--radius-sm)}.app-tabs a[aria-current]{background:var(--bg-2);color:var(--ink-primary);font-weight:650}.tab-icon{position:relative}.count{position:absolute;left:16px;top:-6px;background:var(--brand);color:var(--on-brand);font-size:10px;border-radius:12px;padding:1px 5px}
 :is(a,button):focus-visible{outline:2px solid var(--focus);outline-offset:2px}
</style>
