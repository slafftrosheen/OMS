<script lang="ts">
 import Intake from '../../src/lib/order/OrderIntakeAssistant.svelte';
 import Addresses from '../../src/lib/order/ClientDeliveryAddresses.svelte';
 let current=$state<Record<string,any>>({clientName:'Client BV',notes:'',deliveryAddress:'User address',
  deliveryContact:'User contact',deliveryPhone:'',deliveryEmail:'',profiles:[{dbId:'p1',quantity:1,
  configuration:{CNC_FREZER:{},BENDER:{depth:100},ASSEMBLING:{}}}]});
 let applied=$state(0);
 let editable=$state(true);
</script>
<main style="max-width:480px;margin:auto;padding:16px;box-sizing:border-box">
 <button onclick={()=>{current={...current,notes:'Explicit local edit'};}}>Edit locally</button>
 <button onclick={()=>{current={...current,deliveryAddress:'New user delivery edit'};}}>Edit delivery locally</button>
 <button onclick={()=>{current={...current,deliveryEmail:'current@example.test'};}}>Edit delivery email locally</button>
 <button onclick={()=>{current={...current,clientName:'Other client'};}}>Change client</button>
 <button onclick={()=>editable=!editable}>Toggle read only</button>
 <Intake orderId="11111111-1111-4111-8111-111111111111" {editable} {current}
  selectedProfileIndex={0} profileNames={['Main sign']} orderUpdatedAt="2026-11-05T12:00:00Z"
  onApply={patch=>{current={...current,...patch};applied++;}}/>
 <Addresses {editable} clientName={current.clientName} current={{deliveryAddress:current.deliveryAddress,
  deliveryContact:current.deliveryContact,deliveryPhone:current.deliveryPhone,deliveryEmail:current.deliveryEmail}}
  onSelect={patch=>{current={...current,...patch};applied++;}}/>
 <output class="test-output" data-testid="applied">{applied}</output>
 <output class="test-output" data-testid="current">{JSON.stringify(current)}</output>
</main>

<style>.test-output{display:block;overflow-wrap:anywhere;font-size:12px;margin-top:12px}</style>
