<script lang="ts">
 import OrderEditor from '../../src/routes/orders/[id]/edit/+page.svelte';
 import NewOrder from '../../src/routes/orders/new/+page.svelte';
 import OrderDetail from '../../src/routes/orders/[id]/+page.svelte';
 import AssistantShell from '$lib/assistant/AssistantShell.svelte';
 import {provideAssistantContext} from '$lib/assistant/context';
 import {currentUser} from '$lib/auth/authState.svelte';
 import {page} from './app-state';
 const controller=provideAssistantContext();
 const mode=new URL(location.href).searchParams.get('mode');
</script>

{#if mode==='new'}<NewOrder />{:else if mode==='detail'}<OrderDetail />{:else}<OrderEditor data={{id:page.params.id,order:null,files:[],profilePresets:[],session:null}} />{/if}
<AssistantShell {controller} path={page.url.pathname} accountId={$currentUser?.id??''} />
