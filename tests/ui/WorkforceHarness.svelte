<script lang="ts">
  import CabinetPage from '../../src/routes/cabinet/+page.svelte';
  import AssistantShell from '$lib/assistant/AssistantShell.svelte';
  import { provideAssistantContext } from '$lib/assistant/context';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { locale } from 'svelte-i18n';
  import { page } from './app-state';
  import { workforceFixtureUsers } from './workforce-fixtures';
  import { requestFixtureNavigation } from './navigation';
  const controller = provideAssistantContext();
  let navigationAllowed = $state(false);
</script>

<header class="fixture-controls" aria-label="Workforce fixture controls">
  <button type="button" onclick={() => currentUser.set(workforceFixtureUsers.second)}>Switch account</button>
  <button type="button" onclick={() => currentUser.set(workforceFixtureUsers.manager)}>Switch to R&D</button>
  <button type="button" onclick={() => currentUser.set({ ...workforceFixtureUsers.manager, role: 'Operator' })}>Demote current R&D</button>
  <button type="button" onclick={() => currentUser.set(null)}>Sign out fixture</button>
  <button type="button" onclick={() => navigationAllowed = requestFixtureNavigation()}>Leave cabinet fixture</button><output data-testid="workforce-navigation">{navigationAllowed ? 'Allowed' : 'Blocked'}</output>
  <label>Fixture language<select onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="lv">Latviešu</option><option value="ru">Русский</option></select></label>
  <label>Fixture theme<select onchange={event => document.documentElement.dataset.theme = event.currentTarget.value}><option value="LightVim">Light</option><option value="DarkVim">Dark</option><option value="HighContrastVim">High contrast</option></select></label>
</header>
<main><CabinetPage /></main>
<AssistantShell {controller} path={page.url.pathname} accountId={$currentUser?.id ?? ''} />

<style>
  :global(html) { --topbar-h: 72px; --bottombar-h: 0px; }
  .fixture-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px; }
  .fixture-controls button, .fixture-controls select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  .fixture-controls label { display: grid; gap: 4px; font-size: 12px; color: var(--ink-secondary); }
  main { padding-bottom: 72px; }
</style>
