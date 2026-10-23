<script lang="ts">
  import { getContext } from 'svelte';
  import { AuthState, authState, currentUser } from '$lib/auth/authState.svelte';
  import { messages, rooms } from '$lib/chat/chat-store';
  import { users } from '$lib/users/user-store';
  import { ui } from '$lib/state/appState.svelte';
  import { theme } from '$lib/stores/theme';

  const contextAuth = getContext<AuthState>('authState');
  const nextUser = { id: 'account-b', username: 'second', displayName: 'Second account', role: 'Operator' as const, stations: [] };
  let logoutSettled = $state(false);

  async function replaceDuringLogout() {
    const pending = authState.logout();
    currentUser.set(nextUser);
    await pending;
    logoutSettled = true;
  }
</script>

<section aria-label="Session diagnostics">
  <h1>Application shell regression fixture</h1>
  <p>Context user: <output data-testid="context-user">{contextAuth.user?.id ?? 'none'}</output></p>
  <p>Context role: <output data-testid="context-role">{contextAuth.user?.role ?? 'none'}</output></p>
  <p>Shared instance: <output data-testid="shared-auth">{String(contextAuth === authState)}</output></p>
  <p>Room count: <output data-testid="room-count">{$rooms.length}</output></p>
  <p>Directory count: <output data-testid="directory-count">{$users.length}</output></p>
  <p>Messages: <output data-testid="message-text">{$messages.map(message => message.text).join(' | ')}</output></p>
  <p>UI theme: <output data-testid="ui-theme">{$ui.theme}</output></p>
  <p>Legacy theme: <output data-testid="legacy-theme">{$theme}</output></p>
  <button onclick={() => currentUser.set(nextUser)}>Switch account</button>
  <button onclick={replaceDuringLogout}>Sign in during pending logout</button>
  <output data-testid="logout-settled">{String(logoutSettled)}</output>
</section>
