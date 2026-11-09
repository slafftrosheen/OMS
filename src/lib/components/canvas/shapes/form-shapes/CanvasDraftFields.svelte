<script lang="ts">
 import type {Writable} from 'svelte/store';
 import OrderDraftFields from '$lib/order/OrderDraftFields.svelte';
 let {formState,section,idPrefix,onChange}:{formState:Writable<{data:Record<string,unknown>;editable:boolean}>;section:'details'|'delivery';idPrefix:string;onChange:(patch:Record<string,unknown>)=>void}=$props();
</script>
<OrderDraftFields data={$formState.data} editable={$formState.editable} {section} {idPrefix} {onChange}/>
