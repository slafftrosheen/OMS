<!-- src/lib/orders/components/ProfileSelector.svelte -->
<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { onMount } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let {
    disabled = false,
    selectedCode = '',
    onselected
  }: {
    disabled?: boolean;
    selectedCode?: string;
    onselected?: (profile: { code: string; name: string; description?: string }) => void;
  } = $props();

  let profiles: Array<{ code: string; name: string; description?: string }> = $state([]);
  let loading = $state(false);
  let isOpen = $state(false);

  onMount(async () => {
    await loadProfiles();
  });

  async function loadProfiles() {
    loading = true;
    try {
      const response = await fetch('/api/profiles/templates');
      const data = await response.json();
      profiles = data.items || data;
    } catch (err) {
      console.error('Failed to load profiles:', err);
      // Fallback to hardcoded profiles
      profiles = [
        { code: 'P1', name: 'Profile P1', description: 'Basic profile' },
        { code: 'P3', name: 'Profile P3', description: 'Advanced profile' },
        { code: 'P5', name: 'Profile P5', description: 'Premium profile' },
        { code: 'P7st', name: 'Profile P7st', description: 'Standard P7' },
        { code: 'P8', name: 'Profile P8', description: 'Custom profile' }
      ];
    } finally {
      loading = false;
    }
  }

  function selectProfile(profile: any) {
    selectedCode = profile.code;
    onselected?.(profile);
    isOpen = false;
  }

  function toggleDropdown() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  let selectedProfile = $derived(profiles.find(p => p.code === selectedCode));
</script>

<div class="profile-selector">
  <label>Profile Type <span class="required">*</span></label>
  
  <div class="selector-wrapper">
    <button
      type="button"
      class="selector-button"
      class:open={isOpen}
      onclick={toggleDropdown}
      {disabled}
    >
      {#if loading}
        <span>Loading profiles...</span>
      {:else if selectedProfile}
        <span class="selected-name">{selectedProfile.name} ({selectedProfile.code})</span>
      {:else}
        <span class="placeholder">Select a profile...</span>
      {/if}
      <ChevronDown size={18} />
    </button>

    {#if isOpen && !loading}
      <div class="dropdown-menu">
        {#each profiles as profile (profile.code)}
          <button
            type="button"
            class="profile-option"
            class:selected={profile.code === selectedCode}
            onclick={() => selectProfile(profile)}
          >
            <div class="profile-name">{profile.name}</div>
            <div class="profile-code">{profile.code}</div>
            {#if profile.description}
              <div class="profile-desc">{profile.description}</div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-selector {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    flex: 1;
  }

  label {
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    color: var(--text-primary, var(--ink-primary));
  }

  .required {
    color: var(--danger, var(--error));
  }

  .selector-wrapper {
    position: relative;
  }

  .selector-button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: var(--bg-2, var(--bg-2));
    border: 1px solid var(--border, var(--border));
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background var(--motion-sm) var(--ease-standard), color var(--motion-sm) var(--ease-standard);
    font-size: var(--text-sm, 0.875rem);
  }

  .selector-button:hover:not(:disabled) {
    border-color: var(--primary, var(--brand));
    background: var(--bg-1, var(--bg-0));
  }

  .selector-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .selector-button.open {
    border-color: var(--primary, var(--brand));
  }

  .placeholder {
    color: var(--text-muted, var(--ink-tertiary));
  }

  .selected-name {
    font-weight: 600;
    color: var(--text-primary, var(--ink-primary));
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-1, var(--bg-0));
    border: 1px solid var(--primary, var(--brand));
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 4px 12px color-mix(in oklab, var(--bg-0) 15%, transparent);
    z-index: var(--z-overlay);
    max-height: 300px;
    overflow-y: auto;
  }

  .profile-option {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-sm, 8px) var(--space-md, 12px);
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, var(--border));
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .profile-option:last-child {
    border-bottom: none;
  }

  .profile-option:hover {
    background: var(--bg-2, var(--bg-2));
  }

  .profile-option.selected {
    background: var(--primary-bg, var(--brand-soft));
  }

  .profile-name {
    font-weight: 600;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, var(--ink-primary));
  }

  .profile-code {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, var(--ink-tertiary));
    font-family: var(--font-mono, monospace);
  }

  .profile-desc {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, var(--ink-tertiary));
    margin-top: 2px;
  }
</style>
