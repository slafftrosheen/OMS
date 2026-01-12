<!-- src/lib/orders/components/ProfileSelector.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { ChevronDown } from 'lucide-svelte';

  export let disabled: boolean = false;
  export let selectedCode: string = '';

  const dispatch = createEventDispatcher();

  let profiles: Array<{ code: string; name: string; description?: string }> = [];
  let loading = false;
  let isOpen = false;

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
    dispatch('selected', profile);
    isOpen = false;
  }

  function toggleDropdown() {
    if (!disabled) {
      isOpen = !isOpen;
    }
  }

  $: selectedProfile = profiles.find(p => p.code === selectedCode);
</script>

<div class="profile-selector">
  <label>Profile Type <span class="required">*</span></label>
  
  <div class="selector-wrapper">
    <button
      type="button"
      class="selector-button"
      class:open={isOpen}
      on:click={toggleDropdown}
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
            on:click={() => selectProfile(profile)}
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
    color: var(--text-primary, #1a1a1a);
  }

  .required {
    color: var(--danger, #dc2626);
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
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: var(--text-sm, 0.875rem);
  }

  .selector-button:hover:not(:disabled) {
    border-color: var(--primary, #3b82f6);
    background: var(--bg-1, #ffffff);
  }

  .selector-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .selector-button.open {
    border-color: var(--primary, #3b82f6);
  }

  .placeholder {
    color: var(--text-muted, #6b7280);
  }

  .selected-name {
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-1, #ffffff);
    border: 1px solid var(--primary, #3b82f6);
    border-radius: var(--radius-md, 6px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
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
    border-bottom: 1px solid var(--border, #e5e7eb);
    cursor: pointer;
    transition: background 0.15s ease;
    text-align: left;
  }

  .profile-option:last-child {
    border-bottom: none;
  }

  .profile-option:hover {
    background: var(--bg-2, #f9fafb);
  }

  .profile-option.selected {
    background: var(--primary-bg, #dbeafe);
  }

  .profile-name {
    font-weight: 600;
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-primary, #1a1a1a);
  }

  .profile-code {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
    font-family: var(--font-mono, monospace);
  }

  .profile-desc {
    font-size: var(--text-xs, 0.75rem);
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }
</style>
