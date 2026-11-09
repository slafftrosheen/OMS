<script lang="ts">
 import {onMount} from 'svelte';
 import Layout from '../../src/routes/+layout.svelte';
 import Home from '../../src/routes/telegram/+page.svelte';
 import Chat from '../../src/routes/chat/+page.svelte';
 import Notifications from '../../src/routes/notifications/+page.svelte';
 import {page} from './app-state';
 page.url=new URL('/telegram',window.location.origin);
 onMount(()=>{const follow=(event:MouseEvent)=>{const anchor=(event.target as Element).closest('a');if(!anchor)return;const url=new URL(anchor.href);if(url.origin!==location.origin)return;event.preventDefault();page.url=url;};document.addEventListener('click',follow);return()=>document.removeEventListener('click',follow);});
</script>
<Layout>{#if page.url.pathname==='/chat'}<Chat/>{:else if page.url.pathname==='/notifications'}<Notifications/>{:else}<Home/>{/if}</Layout>
