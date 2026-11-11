<script lang="ts">
 import type {Writable} from 'svelte/store';
 import OrderNativeProfileForm from '$lib/order/OrderNativeProfileForm.svelte';
 let {formState,onChange}:{formState:Writable<{configuration:Record<string,unknown>;editable:boolean}>;onChange:(value:Record<string,unknown>)=>void}=$props();
</script>
<OrderNativeProfileForm canvasLayout configuration={$formState.configuration} editable={$formState.editable} {onChange}/>
