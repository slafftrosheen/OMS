<script lang="ts">
 import {onMount,type Snippet} from 'svelte';
 import {locale} from 'svelte-i18n';
 import {base} from '$app/paths';
 import {goto} from '$app/navigation';
 import {page} from '$app/state';
 import {currentUser} from '$lib/auth/authState.svelte';
 import {notificationStore} from '$lib/stores/notifications';
 import {type IconName} from '$lib/ui/icons';
 import Icon from '$lib/ui/Icon.svelte';
 import {telegramAppCopy} from './app-copy';
 import {holdTelegramSwipes,paintTelegramChrome,rememberTelegramScheme,telegramHaptic,telegramInsets,telegramScheme,type TelegramWebAppLike} from './webapp';
 import {appearanceThemeColor,applyPlace} from '$lib/state/place';
 let {children,onExit}:{children:Snippet;onExit:()=>void}=$props();
 let c=$derived(telegramAppCopy($locale));
 let path=$derived(page.url.pathname.slice(base.length));
 let active=$derived(path==='/chat'?'chats':path==='/notifications'?'notifications':path==='/telegram'&&!page.url.searchParams.has('tab')?'home':'control');
 const tabs:Array<{id:'home'|'notifications'|'chats'|'control';href:string;icon:IconName}>=[{id:'home',href:'/telegram',icon:'home'},{id:'notifications',href:'/notifications',icon:'bell'},
  {id:'chats',href:'/chat',icon:'message-square'},{id:'control',href:'/telegram?tab=control',icon:'settings'}];
 $effect(()=>{const id=$currentUser?.id;if(id)return notificationStore.connect(id);});
 type TelegramBackButton = {
  show:()=>void; hide:()=>void; onClick:(callback:()=>void)=>void; offClick:(callback:()=>void)=>void;
 };
 type TelegramWebApp = TelegramWebAppLike & {ready:()=>void;expand:()=>void;BackButton?:TelegramBackButton};
 let insets=$state<Record<string,string>>({});
 let sdk=$state.raw<TelegramWebApp|null>(null);
 const insetStyle=$derived(Object.entries(insets).map(([k,v])=>`${k}:${v}`).join(';'));
 function syncLook(){
  const app=sdk;
  if(!app)return;
  rememberTelegramScheme(telegramScheme(app));
  applyPlace(page.url.pathname.slice(base.length),page.url.search);
  const root=document.documentElement;
  paintTelegramChrome(app,appearanceThemeColor(root.dataset.theme,root.dataset.place==='floor'?'floor':'office'));
  insets=telegramInsets(app);
 }
 // Re-paint Telegram's chrome when a route changes the place (e.g. a station page).
 $effect(()=>{void path;if(sdk)queueMicrotask(syncLook);});
 let backButton=$state.raw<TelegramBackButton|null>(null);
 const backHome=()=>{void goto(base+'/telegram');};
 $effect(()=>{
  if(!backButton)return;
  if(['/telegram','/chat','/notifications'].includes(path))backButton.hide();
  else backButton.show();
 });
 onMount(()=>{
  // The native controls affect presentation. The signed-in OMS account owns authorization.
  const webApp=()=>(window as Window & {Telegram?:{WebApp?:TelegramWebApp}}).Telegram?.WebApp;
  let script=document.querySelector<HTMLScriptElement>('#oms-telegram-sdk');
  function setup(){
   const app=webApp();
   if(!app)return;
   app.ready();app.expand();
   sdk=app;holdTelegramSwipes(app);syncLook();
   for(const event of ['themeChanged','safeAreaChanged','contentSafeAreaChanged'])app.onEvent?.(event,syncLook);
   backButton=app.BackButton??null;
   backButton?.onClick(backHome);
  }
  if(webApp())setup();
  else {
   if(!script){
    script=document.createElement('script');
    script.id='oms-telegram-sdk';script.src='https://telegram.org/js/telegram-web-app.js';script.async=true;
    script.addEventListener('load',setup,{once:true});document.head.append(script);
   }else script.addEventListener('load',setup,{once:true});
  }
  return ()=>{
   script?.removeEventListener('load',setup);
   for(const event of ['themeChanged','safeAreaChanged','contentSafeAreaChanged'])sdk?.offEvent?.(event,syncLook);
   rememberTelegramScheme(null);
   backButton?.offClick(backHome);backButton?.hide();
  };
 });
</script>
<div class="telegram-app" style={insetStyle}>
 <header class="app-header">
  <a href={`${base}/telegram`} aria-label={c.home}><strong>OMS</strong></a>
  <span>{$currentUser?.displayName||$currentUser?.username}</span>
  <button type="button" onclick={onExit}>{c.full}</button>
 </header>
 <main id="main" class:chat={path==='/chat'}>{@render children()}</main>
 <nav aria-label="OMS" class="app-tabs">
  {#each tabs as tab}<a href={base+tab.href} aria-current={active===tab.id?'page':undefined} onclick={()=>{if(active!==tab.id)telegramHaptic('select');}}>
   <span class="tab-icon"><Icon name={tab.icon} size="md"/>{#if tab.id==='notifications'&&$notificationStore.unreadCount>0}<span class="count">{$notificationStore.unreadCount}</span>{/if}</span>
   <span>{c[tab.id as keyof typeof c]}</span></a>{/each}
 </nav>
</div>
<style>
 .telegram-app{--topbar-h:56px;--bottombar-h:76px;min-height:100dvh;background:var(--bg-0);color:var(--ink-primary)}
 .app-header{height:calc(56px + var(--tg-inset-top,0px));box-sizing:border-box;display:flex;align-items:center;gap:var(--space-sm);padding:var(--tg-inset-top,0px) var(--space-md) 0;border-bottom:1px solid var(--border);background:var(--bg-1);position:sticky;top:0;z-index:80}.app-header>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--text-sm)}
 .app-header a{color:var(--ink-primary);text-decoration:none}.app-header button{background:transparent;color:var(--ink-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px;min-height:40px;font:inherit;font-size:var(--text-xs)}
 main{padding-bottom:calc(76px + env(safe-area-inset-bottom));min-width:0}main.chat{height:calc(100dvh - 56px - var(--tg-inset-top,0px));box-sizing:border-box}main.chat :global(.chat-page){height:100%}
 .app-tabs{position:fixed;bottom:0;inset-inline:0;display:grid;grid-template-columns:repeat(4,1fr);background:var(--bg-1);border-top:1px solid var(--border);padding:6px 4px calc(6px + max(env(safe-area-inset-bottom),var(--tg-inset-bottom,0px)));z-index:90}.app-tabs a{display:grid;justify-items:center;align-content:center;gap:4px;min-height:58px;color:var(--ink-secondary);font-size:var(--text-xs);text-decoration:none;border-radius:var(--radius-sm)}.app-tabs a[aria-current]{background:var(--bg-2);color:var(--ink-primary);font-weight:650}.tab-icon{position:relative}.count{position:absolute;left:16px;top:-6px;background:var(--brand);color:var(--on-brand);font-size:10px;border-radius:12px;padding:1px 5px}
 .app-tabs a{position:relative;transition:color var(--motion-sm,140ms) var(--ease-machine,ease-out),background-color var(--motion-sm,140ms) var(--ease-machine,ease-out)}
 .app-tabs a::before{content:'';position:absolute;top:0;left:30%;right:30%;height:2px;border-radius:1px;background:var(--ink-primary);transform:scaleX(0);transition:transform var(--motion-md,200ms) var(--ease-machine,ease-out)}
 .app-tabs a[aria-current]::before{transform:none}
 .app-tabs a:active .tab-icon{transform:scale(.92)}.tab-icon{transition:transform var(--motion-xs,90ms) var(--ease-machine,ease-out)}
 .count{animation:rf-stamp var(--motion-lg,280ms) var(--ease-machine,ease-out) both}
 main{animation:tg-in var(--motion-md,200ms) var(--ease-carriage,ease-out) both}
 @keyframes tg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
 @media (prefers-reduced-motion:reduce){main,.count{animation:none}.app-tabs a::before{transition:none}}
 :is(a,button):focus-visible{outline:2px solid var(--focus);outline-offset:2px}
</style>
