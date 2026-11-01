<script lang="ts">
  import OrderDetailPage from '../../src/routes/orders/[id]/+page.svelte';
  import OrderEditorPage from '../../src/routes/orders/[id]/edit/+page.svelte';
  import OrderProfileSheet from '$lib/order/OrderProfileSheet.svelte';
  import OrderNativeProfileForm from '$lib/order/OrderNativeProfileForm.svelte';
  import StationProductionPacket from '$lib/components/station/StationProductionPacket.svelte';
  import { provideAssistantContext } from '$lib/assistant/context';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { locale } from 'svelte-i18n';
  import { page } from './app-state';
  import { orderSheetIds, orderSheetSnapshot, orderSheetUsers } from './order-sheet-fixtures';
  import type { OrderSheetProfile } from '$lib/order/order-sheet';

  provideAssistantContext();
  const mode = new URLSearchParams(window.location.search).get('mode') || 'detail';
  let profiles = $state<OrderSheetProfile[]>(orderSheetSnapshot().profiles);
  let changes = $state(0);
  let focused = $state<number | null>(null);
  let staged = $state<Record<string, unknown>>({});
  function switchOrder() {
    page.params = { id: orderSheetIds.second };
    page.url = new URL(`/orders/${orderSheetIds.second}`, window.location.origin);
  }
  function replaceConfiguration() {
    profiles = profiles.map(profile => ({ ...profile, configuration: orderSheetSnapshot(orderSheetIds.second).profiles[0].configuration }));
  }
  function focusProfile(index: number) {
    staged = JSON.parse(JSON.stringify(profiles[index].configuration ?? {})); focused = index;
  }
</script>

<div class="order-fixture" class:editor-fixture={mode === 'editor'}>
<header class="fixture-controls" aria-label="Order fixture controls">
  <button type="button" onclick={switchOrder}>Switch order fixture</button>
  <button type="button" onclick={() => currentUser.set(orderSheetUsers.second)}>Switch account fixture</button>
  <button type="button" onclick={() => currentUser.set(null)}>Sign out fixture</button>
  <button type="button" onclick={() => currentUser.update(user => user ? { ...user, role: 'Operator' } : null)}>Demote current account fixture</button>
  <button type="button" onclick={() => currentUser.update(user => user ? { ...user, stations: [{ stationId: 'painting', isHead: true }] } : null)}>Change station assignment fixture</button>
  <label>Fixture language<select onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="lv">Latviešu</option><option value="ru">Русский</option></select></label>
  <label>Fixture theme<select onchange={event => document.documentElement.dataset.theme = event.currentTarget.value}><option value="LightVim">Light</option><option value="DarkVim">Dark</option><option value="HighContrastVim">High contrast</option></select></label>
  {#if mode === 'sheet'}<button type="button" onclick={replaceConfiguration}>Replace saved profile fixture</button>{/if}
</header>
<main>
  {#if mode === 'packet'}
    <StationProductionPacket orderId={page.params.id} station="cnc" onClose={() => {}} />
  {:else if mode === 'editor'}
    <OrderEditorPage data={{id:page.params.id,order:null,files:[],profilePresets:[],session:null}} />
  {:else if mode === 'sheet'}
    <OrderProfileSheet {profiles} editable focusedProfileIndex={focused}
      onChange={(index, profile) => { profiles = profiles.map((value, i) => i === index ? profile : value); changes++; }}
      onFocusProfile={focusProfile} />
    {#if focused !== null}
      <section aria-label="Focused fixture editor">
        <OrderNativeProfileForm configuration={staged} editable onChange={value => staged = value} />
        <button type="button" onclick={() => { profiles = profiles.map((profile, index) => index === focused ? { ...profile, configuration: staged } : profile); focused = null; }}>Apply focused fixture</button>
        <button type="button" onclick={() => focused = null}>Discard focused fixture</button>
      </section>
    {/if}
    <output data-testid="order-sheet-changes">{changes}</output>
    <output data-testid="order-sheet-configuration">{JSON.stringify(profiles[0].configuration)}</output>
  {:else}
    <OrderDetailPage />
  {/if}
</main>
</div>

<style>
  :global(html) { --topbar-h: 0px; --bottombar-h: 0px; }
  .fixture-controls { position: relative; z-index: 2; flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); padding: var(--space-md); }
  .fixture-controls button, .fixture-controls select { min-height: var(--control-size); padding: var(--space-sm) var(--space-md); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  .fixture-controls label { display: grid; gap: var(--space-xs); font-size: var(--text-sm); color: var(--ink-secondary); }
  .editor-fixture { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
  .editor-fixture main { position: relative; min-height: 0; flex: 1 1 auto; padding: 0; }
  main { padding: 0 var(--space-md) var(--space-xl); min-width: 0; }
  output { display: block; overflow-wrap: anywhere; font-size: var(--text-sm); }
</style>
