<script lang="ts">
  import DetailPage from '../../src/routes/inventory/[id]/+page.svelte';
  import AssistantShell from '$lib/assistant/AssistantShell.svelte';
  import { provideAssistantContext } from '$lib/assistant/context';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { page } from './app-state';
  import { detailFixtureIds, detailFixtureUsers } from './inventory-detail-fixtures';

  const controller = provideAssistantContext();

  function navigate(id: string) {
    page.params = { id };
    page.url = new URL(`/inventory/${id}`, window.location.origin);
  }
</script>

<header class="fixture-controls" aria-label="Inventory fixture navigation">
  <button type="button" onclick={() => navigate(detailFixtureIds.first)}>Show first material</button>
  <button type="button" onclick={() => navigate(detailFixtureIds.second)}>Show second material</button>
  <button type="button" onclick={() => currentUser.set(detailFixtureUsers.second)}>Switch account</button>
  <span>Account: <output data-testid="detail-account">{$currentUser?.id}</output></span>
</header>

<!-- No key block: navigation must work within the same real route instance. -->
<main><DetailPage /></main>
<AssistantShell {controller} path={page.url.pathname} accountId={$currentUser?.id ?? ''} />

<style>
  :global(html) { --topbar-h: 72px; --bottombar-h: 0px; }
  .fixture-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px; max-width: 850px; }
  .fixture-controls button { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  .fixture-controls button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
  .fixture-controls span { font-size: 12px; color: var(--ink-secondary); }
  main { padding-bottom: 72px; }
</style>
