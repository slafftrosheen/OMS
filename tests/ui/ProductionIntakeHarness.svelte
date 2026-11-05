<script lang="ts">
 import Intake from '../../src/lib/order/OrderIntakeAssistant.svelte';
 import Addresses from '../../src/lib/order/ClientDeliveryAddresses.svelte';
 let current=$state<Record<string,any>>({clientName:'Client BV',notes:'',deliveryAddress:'User address',
  deliveryContact:'User contact',deliveryPhone:'',deliveryEmail:'',profiles:[{dbId:'p1',quantity:1,
  configuration:{CNC_FREZER:{},BENDER:{depth:100},ASSEMBLING:{}}}]});
 let applied=$state(0);
</script>
<main style="max-width:720px;margin:auto">
 <button onclick={()=>{current={...current,notes:'Explicit local edit'};}}>Edit locally</button>
 <Intake orderId="11111111-1111-4111-8111-111111111111" editable={true} {current}
  selectedProfileIndex={0} profileNames={['Main sign']} orderUpdatedAt="2026-11-05T12:00:00Z"
  onApply={patch=>{current={...current,...patch};applied++;}}/>
 <Addresses clientName={current.clientName} current={{deliveryAddress:current.deliveryAddress,
  deliveryContact:current.deliveryContact,deliveryPhone:current.deliveryPhone,deliveryEmail:current.deliveryEmail}}
  onSelect={patch=>{current={...current,...patch};applied++;}}/>
 <output data-testid="applied">{applied}</output>
 <output data-testid="current">{JSON.stringify(current)}</output>
</main>
