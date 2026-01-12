<script lang="ts">
  import { base } from '$app/paths';
  import { currentUser, switchSection } from '$lib/auth/user-store';
  import { logAction } from '$lib/auth/audit-log';
  import type { Section } from '$lib/auth/types';
  
  $: user = $currentUser;
  $: activeSection = user?.primarySection;
  $: sections = user?.sections ?? [];
  
  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const section = target.value as Section;
    
    if (user) {
      switchSection(section);
      logAction(user.username, section, 'switch_section', `Switched to ${section} section`);
      window.location.href = `${base}/${section.toLowerCase()}/dashboard`;
    }
  }
  
  function getInitials(name: string | undefined): string {
    if (!name) return '?';
    return name.split(' ')
      .filter(Boolean)
      .map(x => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  }
</script>

{#if user}
  <div class="section-indicator">
    <div class="section-select">
      <label for="section-switch" class="sr-only">Current Section</label>
      <select 
        id="section-switch"
        on:change={handleChange}
        aria-label="Switch section"
      >
        {#each sections as section}
          <option value={section} selected={section === activeSection}>
            {section}
          </option>
        {/each}
      </select>
    </div>
    <div class="user-display">
      <span class="user-avatar" aria-hidden="true">
        {getInitials(user.displayName)}
      </span>
      <span class="user-name">{user.displayName || user.username || 'User'}</span>
    </div>
  </div>
{/if}

<style>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.section-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-select select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-0);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.section-select select:hover {
  border-color: var(--accent, #3b82f6);
}

.section-select select:focus {
  outline: none;
  border-color: var(--accent, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.user-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent, #3b82f6);
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

@media (max-width: 640px) {
  .user-name {
    display: none;
  }
  
  .section-indicator {
    gap: 8px;
  }
}
</style>
