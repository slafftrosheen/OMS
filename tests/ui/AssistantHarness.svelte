<script lang="ts">
  import { untrack } from 'svelte';
  import { locale } from 'svelte-i18n';
  import AssistantShell from '$lib/assistant/AssistantShell.svelte';
  import { provideAssistantContext } from '$lib/assistant/context';
  import { chatScreenContext } from '$lib/assistant/guidance';
  import OrderFlowAssistant from '$lib/order/OrderFlowAssistant.svelte';
  import OrderIntakeAssistant from '$lib/order/OrderIntakeAssistant.svelte';
  import OrderReadinessAssistant from '$lib/order/OrderReadinessAssistant.svelte';
  import { modalDialog } from '$lib/ui/modal-dialog';

  const controller = provideAssistantContext();
  const realNative = new URL(window.location.href).searchParams.get('native') === 'order';
  const chatScreen = new URL(window.location.href).searchParams.get('screen') === 'chat';
  const orderId = '11111111-1111-4111-8111-111111111111';
  const orderUpdatedAt = '2026-10-30T10:00:00.000Z';
  let orderCurrent = $state<Record<string, unknown>>({
    clientName: 'Workshop customer', title: 'Outdoor illuminated channel letters',
    deadline: '2026-11-20', priority: 'NORMAL', notes: 'Verify the 12V power supply and attachment before production.'
  });
  let path = $state(chatScreen ? '/chat' : realNative ? `/orders/${orderId}/edit` : '/orders/new');
  let accountId = $state('account-one');
  let draftNotes = $state('Original draft notes');
  let nativeMounts = $state(0);
  let nativeDisposals = $state(0);
  let nativeActions = $state(0);
  let selectedMaterial = $state('Mean Well LRS-100-12');
  let profileEditorOpen = $state(false);
  let confirmationOpen = $state(false);
  let intakeAvailable = $state(true);
  let profileDraft = $state('Original profile material');

  // Match a real route lease: unmount/re-register on navigation, while an
  // account change independently exercises the shell's account boundary.
  $effect(() => {
    const route = path;
    return untrack(() => controller.register({
      id: `fixture:${route}`,
      title: () => route === '/chat' ? 'Team chat' : route === '/inventory' ? 'Workshop inventory' : 'Window-sign draft',
      tools: () => route === '/chat' ? [] : realNative ? [
        { id: 'discuss', label: 'Order discussion' },
        ...(intakeAvailable ? [{ id: 'intake', label: 'Drawing intake' }] : []),
        { id: 'readiness', label: 'Production readiness' }
      ] : route === '/inventory'
        ? [{ id: 'stock', label: 'Stock checks' }]
        : [{ id: 'review', label: 'Order checks' }, { id: 'files', label: 'Attachment analysis' }],
      context: () => route === '/chat' ? chatScreenContext({
        current: true, loading: false, error: false, selected: true, roomKind: 'channel',
        visibleMessages: 100, hasEarlierMessages: true, loadingEarlier: false,
        draftPresent: !!draftNotes, sending: false, voiceAvailable: true
      }) : ({
        account: accountId,
        notes: draftNotes,
        selectedMaterial,
        unsaved: true,
        nativeProfileDraft: profileEditorOpen ? { profileIndex: 0, material: profileDraft, appliedToOrder: false } : null,
        credentials: { apiKey: 'fixture-secret-must-not-leave-browser' },
        fileBytes: 'fixture-file-bytes-must-not-leave-browser'
      }),
      content: route === '/chat' ? undefined : realNative ? orderTools : nativeTools
    }));
  });

  function trackNativeMount(_node: HTMLElement) {
    nativeMounts++;
    return { destroy() { nativeDisposals++; } };
  }
  function navigate() {
    path = path === '/orders/new' ? '/inventory' : '/orders/new';
    draftNotes = path === '/inventory' ? 'Inventory context' : 'A different draft';
  }
  function switchAccount() {
    accountId = accountId === 'account-one' ? 'account-two' : 'account-one';
    draftNotes = `Private notes for ${accountId}`;
  }
</script>

<header class="fixture-topbar">OMS assistant regression fixture</header>
<main>
  <h1>{path === '/inventory' ? 'Inventory' : 'Draft order'}</h1>
  <p>The normal work surface remains usable while the assistant is open.</p>
  <label>Current draft notes <input bind:value={draftNotes} /></label>
  <label>Selected material <input bind:value={selectedMaterial} /></label>
  <label>Interface language
    <select value={$locale} onchange={event => locale.set(event.currentTarget.value)}>
      <option value="en">English</option><option value="ru">Русский</option><option value="lv">Latviešu</option>
    </select>
  </label>
  <div class="fixture-actions">
    <button onclick={navigate}>Change route</button>
    <button onclick={switchAccount}>Change account</button>
    <button onclick={() => controller.open('files')}>Open attachment context</button>
    <button onclick={() => profileEditorOpen = true}>Edit profile in dialog</button>
    <button onclick={() => confirmationOpen = true}>Open confirmation</button>
    {#if realNative}<button onclick={() => intakeAvailable = false}>Disable intake tool</button>{/if}
  </div>
  <dl>
    <div><dt>Current route</dt><dd data-testid="route">{path}</dd></div>
    <div><dt>Current account</dt><dd data-testid="account">{accountId}</dd></div>
    <div><dt>Native mounts</dt><dd data-testid="native-mounts">{nativeMounts}</dd></div>
    <div><dt>Native disposals</dt><dd data-testid="native-disposals">{nativeDisposals}</dd></div>
    <div><dt>Native actions</dt><dd data-testid="native-actions">{nativeActions}</dd></div>
  </dl>
</main>
<footer class="fixture-bottom-nav" data-testid="bottom-navigation">Home · Orders · Inventory · Settings</footer>

<AssistantShell {controller} {path} {accountId} />

{#if profileEditorOpen}
  <dialog class="fixture-dialog" data-assistant-host aria-label="Profile editor fixture"
    use:modalDialog={{ onClose: () => profileEditorOpen = false, initialFocus: '#profile-draft' }}>
    <h2>Profile editor fixture</h2>
    <label for="profile-draft">Pending profile material</label><input id="profile-draft" bind:value={profileDraft} />
    <button onclick={() => profileEditorOpen = false}>Close profile editor</button>
  </dialog>
{/if}
{#if confirmationOpen}
  <dialog class="fixture-dialog" aria-label="Confirmation fixture"
    use:modalDialog={{ onClose: () => confirmationOpen = false }}>
    <h2>Confirm the change</h2><button onclick={() => confirmationOpen = false}>Cancel confirmation</button>
  </dialog>
{/if}

{#snippet orderTools(toolId: string)}
  <div class="native-order-probe">
    <div hidden={toolId !== 'discuss'}>
      <OrderFlowAssistant {orderId} {orderUpdatedAt} editable={true} canAsk={true}
        current={orderCurrent} dirty={false}
        onOpenIntake={() => controller.open('intake')}
        onOpenProfiles={() => controller.close()}
        onApply={patch => { orderCurrent = { ...orderCurrent, ...patch }; }} />
    </div>
    <div hidden={toolId !== 'intake'}>
      <OrderIntakeAssistant {orderId} {orderUpdatedAt} editable={true} current={orderCurrent}
        profileNames={['Outdoor illuminated channel letters — acrylic face with aluminium returns']}
        dirty={false} onApply={patch => { orderCurrent = { ...orderCurrent, ...patch }; }} />
    </div>
    <div hidden={toolId !== 'readiness'}>
      <OrderReadinessAssistant {orderId} {orderUpdatedAt} canRun={true} />
    </div>
  </div>
{/snippet}

{#snippet nativeTools(toolId: string)}
  <div use:trackNativeMount class="native-probe">
    <section hidden={toolId !== 'review'}>
      <h3>Review the selected order</h3>
      <!-- Deliberately uncontrolled: a remount loses the typed value. -->
      <label>Native review draft <input value="Initial native draft" /></label>
      <button onclick={() => nativeActions++}>Run native order check</button>
    </section>
    <section hidden={toolId !== 'files'}>
      <h3>Analyze an attachment</h3>
      <label>Native file note <textarea rows="3"></textarea></label>
    </section>
    <section hidden={toolId !== 'stock'}>
      <h3>Check recorded stock</h3>
      <p>Inventory tools only appear on the inventory route.</p>
    </section>
  </div>
{/snippet}

<style>
  :global(html) { --topbar-h: 60px; --bottombar-h: 52px; --mobile-nav-h: 72px; }
  .fixture-topbar { position: fixed; inset: 0 0 auto; height: 60px; padding: 18px 24px; box-sizing: border-box; background: var(--bg-1); border-bottom: 1px solid var(--border); }
  main { max-width: 560px; margin: 80px 20px 100px; padding: 16px; }
  h1 { font-size: 26px; margin: 0 0 12px; }
  p { line-height: 1.6; }
  label { display: grid; gap: 6px; margin: 14px 0; font-size: 14px; }
  input, textarea, select { box-sizing: border-box; width: 100%; min-width: 0; min-height: 40px; padding: 9px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-0); color: var(--ink-primary); font: inherit; }
  button { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  input:focus-visible, button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .fixture-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  dl > div { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; margin: 6px 0; }
  dd { margin: 0; }
  .fixture-bottom-nav { position: fixed; inset: auto 0 0; height: 52px; display: flex; align-items: center; justify-content: center; background: var(--bg-1); border-top: 1px solid var(--border); }
  .native-probe { min-width: 0; }
  .native-probe [hidden] { display: none; }
  .native-order-probe { min-width: 0; }
  .native-order-probe [hidden] { display: none; }
  .fixture-dialog { width:min(850px,95vw);max-height:90dvh;padding:24px;border:1px solid var(--border);border-radius:var(--radius-lg);color:var(--ink-primary);background:var(--bg-1); }
  .fixture-dialog::backdrop { background:rgb(0 0 0 / .4); }
  .native-probe h3 { font-size: 17px; margin: 0 0 12px; }
  @media (max-width: 1024px) { .fixture-bottom-nav { height: 72px; } }
  @media (max-width: 600px) { main { margin: 70px 0 90px; } }
</style>
