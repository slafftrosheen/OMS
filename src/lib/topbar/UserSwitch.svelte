<script lang="ts">

  import { currentUser, logout } from '$lib/auth/authState.svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { User, Settings, LogOut, ChevronDown } from 'lucide-svelte';
  
  let open = $state(false);
  let menuElement: HTMLDivElement | undefined = $state();
  
  let me = $derived($currentUser);
  
  async function signOut() {
    open = false;
    await logout();
    goto(`${base}/login`);
  }
  
  function toggleMenu(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
  }
  
  function handleClickOutside(event: MouseEvent) {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      open = false;
    }
  }
  
  const initials = (n: string | undefined) => 
    n?.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';
    
  let roleLabel = $derived(me?.roles?.[me?.primarySection || 'Admin'] || 'User');
</script>

<svelte:window onclick={handleClickOutside} />

<div class="user-menu" bind:this={menuElement}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button 
    class="user-trigger" 
    class:active={open}
    aria-haspopup="menu" 
    aria-expanded={open}
    onclick={toggleMenu}
  >
    <span class="avatar">{initials(me?.displayName || me?.username)}</span>
    <span class="user-info">
      <span class="user-name">{me?.displayName || me?.username || 'User'}</span>
      <span class="user-role">{roleLabel}</span>
    </span>
    <ChevronDown size={16} class="chevron" data-rotated={open ? 'true' : 'false'} />
  </button>
  
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="dropdown" role="menu" onclick={stopPropagation(bubble('click'))}>
      <div class="dropdown-header">
        <span class="avatar-lg">{initials(me?.displayName || me?.username)}</span>
        <div class="dropdown-user-info">
          <strong>{me?.displayName || me?.username}</strong>
          <span class="user-section">{me?.primarySection || 'Main'} • {roleLabel}</span>
        </div>
      </div>
      
      <div class="dropdown-divider"></div>
      
      <a href={`${base}/settings`} class="dropdown-item" onclick={() => open = false}>
        <Settings size={16} />
        <span>Settings</span>
      </a>
      
      <div class="dropdown-divider"></div>
      
      <button class="dropdown-item logout" onclick={signOut}>
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  {/if}
</div>

<style>
.user-menu {
  position: relative;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 6px;
  background: var(--bg-2, #f3f4f6);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.user-trigger:hover,
.user-trigger.active {
  background: var(--bg-1, #ffffff);
  border-color: var(--accent, #3b82f6);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.avatar-lg {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #111827);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.user-role {
  font-size: 11px;
  color: var(--text-2, #6b7280);
  line-height: 1.2;
}

:global(.chevron) {
  color: var(--text-2, #6b7280);
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

:global(.chevron[data-rotated="true"]) {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 260px;
  background: var(--bg-1, #ffffff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.25), 
              0 0 0 1px rgba(0, 0, 0, 0.05);
  z-index: 10000;
  overflow: hidden;
  animation: dropdownSlide 0.2s ease;
}

@keyframes dropdownSlide {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-2, #f9fafb);
}

.dropdown-user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.dropdown-user-info strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-section {
  font-size: 12px;
  color: var(--text-2, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-divider {
  height: 1px;
  background: var(--border, #e5e7eb);
  margin: 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: var(--text, #111827);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: var(--bg-2, #f3f4f6);
}

.dropdown-item.logout {
  color: #ef4444;
}

.dropdown-item.logout:hover {
  background: #fef2f2;
}

.dropdown-item:active {
  transform: scale(0.98);
}

@media (prefers-contrast: high) {
  .dropdown {
    border-width: 2px;
  }
}

@media (max-width: 1024px) {
  .user-info {
    display: none;
  }
  
  .user-trigger {
    padding: 6px;
    border-radius: 50%;
    min-width: 40px;
    height: 40px;
  }
  
  :global(.chevron) {
    display: none;
  }
  
  .dropdown {
    right: -8px;
  }
}
</style>
