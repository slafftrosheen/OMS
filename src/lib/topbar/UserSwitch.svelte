<script lang="ts">
  import { currentUser, logout } from '$lib/auth/authState.svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';

  let open = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();
  let me = $derived($currentUser);

  async function signOut() {
    open = false;
    await logout();
    goto(`${base}/login`);
  }

  function toggleMenu(e: MouseEvent) { e.stopPropagation(); open = !open; }
  function handleClickOutside(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) open = false;
  }

  const initials = (n: string | undefined) =>
    n?.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';

  let roleLabel = $derived(me?.roles?.[me?.primarySection || 'Admin'] || 'User');
</script>

<svelte:window onclick={handleClickOutside} />

<div class="rf-user" bind:this={menuEl}>
  <button
    class="rf-user__trigger"
    class:open
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`User menu — ${me?.displayName || me?.username || 'User'}`}
    onclick={toggleMenu}
  >
    <span class="rf-user__avatar" aria-hidden="true">{initials(me?.displayName || me?.username)}</span>
    <span class="rf-user__info">
      <span class="rf-user__name">{me?.displayName || me?.username || 'User'}</span>
      <span class="rf-user__role">{roleLabel}</span>
    </span>
    <span class="rf-user__chevron" aria-hidden="true">
      <Icon name="chevron-down" size="xs" />
    </span>
  </button>

  {#if open}
    <div class="rf-user__dropdown" role="menu" onclick={(e) => e.stopPropagation()}>
      <div class="rf-user__header">
        <span class="rf-user__avatar rf-user__avatar--lg" aria-hidden="true">{initials(me?.displayName || me?.username)}</span>
        <div class="rf-user__header-info">
          <strong class="rf-user__header-name">{me?.displayName || me?.username}</strong>
          <span class="rf-user__header-section">{me?.primarySection || 'Main'} · {roleLabel}</span>
        </div>
      </div>

      <div class="rf-user__divider" role="separator"></div>

      <a href={`${base}/settings`} class="rf-user__item" onclick={() => open = false}>
        <Icon name="settings" size="sm" />
        <span>Settings</span>
      </a>

      <div class="rf-user__divider" role="separator"></div>

      <button class="rf-user__item rf-user__item--danger" type="button" onclick={signOut}>
        <Icon name="log-out" size="sm" />
        Sign out
      </button>
    </div>
  {/if}
</div>

<style>
  .rf-user { position: relative; }

  .rf-user__trigger {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xxs) var(--space-sm) var(--space-xxs) var(--space-xxs);
    background: color-mix(in oklab, var(--bg-2) 55%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      background    var(--motion-sm) var(--ease-standard),
      border-color  var(--motion-sm) var(--ease-standard);
  }
  .rf-user__trigger:hover,
  .rf-user__trigger.open {
    background: var(--brand-soft);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
  }
  .rf-user__trigger:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .rf-user__avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: var(--brand);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--bg-0);
    flex-shrink: 0;
  }
  .rf-user__avatar--lg {
    width: 44px;
    height: 44px;
    font-size: var(--text-md);
  }

  .rf-user__info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
  }
  .rf-user__name {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
    line-height: 1.2;
  }
  .rf-user__role {
    font-size: calc(var(--text-xs) - 1px);
    color: var(--ink-tertiary);
    line-height: 1.2;
  }
  .rf-user__chevron {
    color: var(--ink-tertiary);
    flex-shrink: 0;
    transition: transform var(--motion-sm) var(--ease-emphasized);
    display: flex;
  }
  .rf-user__trigger.open .rf-user__chevron { transform: rotate(180deg); }

  /* Dropdown */
  .rf-user__dropdown {
    position: absolute;
    top: calc(100% + var(--space-sm));
    right: 0;
    min-width: 260px;
    background: var(--glass-bg-strong);
    backdrop-filter: var(--glass-material-thick);
    -webkit-backdrop-filter: var(--glass-material-thick);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--glass-shadow-lg);
    z-index: var(--z-popover);
    overflow: hidden;
    animation: rf-dd-in var(--motion-sm) var(--ease-standard) both;
  }

  @keyframes rf-dd-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  .rf-user__header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: color-mix(in oklab, var(--bg-1) 35%, transparent);
    border-bottom: 1px solid var(--divider);
  }
  .rf-user__header-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .rf-user__header-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rf-user__header-section {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
  }

  .rf-user__divider {
    height: 1px;
    background: var(--divider);
  }

  .rf-user__item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: none;
    color: var(--ink-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--motion-sm) var(--ease-standard),
      color      var(--motion-sm) var(--ease-standard);
    text-align: left;
  }
  .rf-user__item:hover { background: color-mix(in oklab, var(--bg-2) 60%, transparent); color: var(--ink-primary); }
  .rf-user__item:active { transform: scale(0.98); }
  .rf-user__item:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }

  .rf-user__item--danger { color: var(--error); }
  .rf-user__item--danger:hover { background: var(--error-soft); color: var(--error); }

  @media (max-width: 1024px) {
    .rf-user__info,
    .rf-user__chevron { display: none; }
    .rf-user__trigger {
      padding: var(--space-xxs);
      border-radius: var(--radius-full);
      width: 36px;
      height: 36px;
    }
    .rf-user__dropdown { right: -8px; }
  }
</style>
