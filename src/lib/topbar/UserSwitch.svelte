<script lang="ts">
  import { currentUser, logout } from '$lib/auth/user-store';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { User, Settings, LogOut, ChevronDown } from 'lucide-svelte';
  
  let open = false;
  
  $: me = $currentUser;
  
  async function signOut() {
    open = false;
    await logout();
    goto(`${base}/login`);
  }
  
  function toggleMenu() {
    open = !open;
  }
  
  function closeMenu() {
    open = false;
  }
  
  const initials = (n: string | undefined) => 
    n?.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';
    
  $: roleLabel = me?.roles?.[me?.primarySection || 'Admin'] || 'User';
</script>

<svelte:window on:click={closeMenu} />

<div class="user-menu">
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <button 
    class="user-trigger" 
    aria-haspopup="menu" 
    aria-expanded={open}
    on:click|stopPropagation={toggleMenu}
  >
    <span class="avatar">{initials(me?.displayName || me?.username)}</span>
    <span class="user-info">
      <span class="user-name">{me?.displayName || me?.username || 'User'}</span>
      <span class="user-role">{roleLabel}</span>
    </span>
    <ChevronDown size={16} class="chevron" />
  </button>
  
  {#if open}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="dropdown" role="menu" on:click|stopPropagation>
      <div class="dropdown-header">
        <span class="avatar-lg">{initials(me?.displayName || me?.username)}</span>
        <div class="dropdown-user-info">
          <strong>{me?.displayName || me?.username}</strong>
          <span class="user-section">{me?.primarySection} • {roleLabel}</span>
        </div>
      </div>
      
      <div class="dropdown-divider"></div>
      
      <a href="{base}/settings" class="dropdown-item" on:click={closeMenu}>
        <Settings size={16} />
        Settings
      </a>
      
      <div class="dropdown-divider"></div>
      
      <button class="dropdown-item logout" on:click={signOut}>
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
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.user-trigger:hover {
  background: var(--bg-1);
  border-color: var(--accent, #3b82f6);
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff2d95 0%, #ff6b6b 100%);
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
  background: linear-gradient(135deg, #ff2d95 0%, #ff6b6b 100%);
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
  gap: 1px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}

.user-role {
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.2;
}

:global(.chevron) {
  color: var(--text-2);
  flex-shrink: 0;
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.2);
  z-index: 200;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-2);
}

.dropdown-user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-user-info strong {
  font-size: 14px;
  color: var(--text);
}

.user-section {
  font-size: 12px;
  color: var(--text-2);
}

.dropdown-divider {
  height: 1px;
  background: var(--border);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.dropdown-item:hover {
  background: var(--bg-2);
}

.dropdown-item.logout {
  color: #ef4444;
}

.dropdown-item.logout:hover {
  background: rgba(239, 68, 68, 0.1);
}

@media (max-width: 720px) {
  .user-info {
    display: none;
  }
  
  .user-trigger {
    padding: 4px;
    border-radius: 50%;
  }
  
  :global(.chevron) {
    display: none;
  }
}
</style>
