<script lang="ts">
  import { users, loadUsers } from './user-store';
  import { currentUser } from '$lib/auth/user-store';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';

  onMount(() => {
    loadUsers();
  });

  $: me = $currentUser;
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('users.current')}</h3>
  {#if me}
    <div class="user-info">
      <strong>{me.displayName || me.username}</strong>
      <span class="role">{me.roles?.[me.primarySection || 'Production'] || 'User'}</span>
    </div>
    <div class="sections">
      <span class="muted">Sections:</span>
      {#each me.sections || [] as section}
        <span class="tag">{section}</span>
      {/each}
    </div>
  {:else}
    <p class="muted">Not logged in</p>
  {/if}
</div>

<style>
  .user-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .role {
    font-size: 0.85em;
    color: var(--text-2);
    padding: 2px 8px;
    background: var(--bg-2);
    border-radius: 4px;
  }
  .sections {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .tag {
    font-size: 0.8em;
    padding: 2px 8px;
    background: var(--accent, #3b82f6);
    color: white;
    border-radius: 4px;
  }
</style>
