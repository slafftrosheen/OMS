<script lang="ts">
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Contrast from 'lucide-svelte/icons/contrast';
  import { theme, type ThemeName } from '$lib/stores/theme';
  import { t } from 'svelte-i18n';
  import { savePrefs } from '$lib/settings/service';
  import { track } from '$lib/telemetry';

  type ThemeOption = {
    value: ThemeName;
    labelKey: string;
    Icon: typeof Sun;
  };

  const options: ThemeOption[] = [
    { value: 'LightVim', labelKey: 'header.theme.options.LightVim', Icon: Sun },
    { value: 'DarkVim', labelKey: 'header.theme.options.DarkVim', Icon: Moon },
    { value: 'HighContrast', labelKey: 'header.theme.options.HighContrast', Icon: Contrast }
  ];

  function selectTheme(value: ThemeName) {
    if ($theme === value) return;
    theme.set(value);
    savePrefs();
    track('theme_toggle', { theme: value });
  }
</script>

<div class="quick-group" role="group" aria-label="Theme">
  {#each options as { value, labelKey, Icon }}
    <button
      type="button"
      class="chip"
      aria-pressed={$theme === value}
      on:click={() => selectTheme(value)}
      title={$t(labelKey)}
    >
      <Icon aria-hidden="true" focusable="false" />
      <span class="sr-only">{$t(labelKey)}</span>
    </button>
  {/each}
</div>

<style>
  .quick-group {
    display: flex;
    gap: var(--space-tight);
  }

  .chip {
    align-items: center;
    background: var(--bg-0);
    border: 1px solid color-mix(in oklab, var(--border) 85%, transparent);
    border-radius: calc(var(--radius-md) - var(--space-xxs));
    color: var(--text);
    cursor: pointer;
    display: inline-grid;
    height: var(--control-sm);
    justify-items: center;
    width: var(--control-sm);
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .chip:hover,
  .chip:focus-visible {
    background: color-mix(in oklab, var(--bg-2) 70%, var(--bg-1) 30%);
    border-color: color-mix(in oklab, var(--border) 70%, transparent);
  }

  .chip[aria-pressed='true'] {
    background: color-mix(in oklab, var(--bg-2) 75%, var(--bg-1) 25%);
    border-color: color-mix(in oklab, var(--border) 90%, transparent);
    color: var(--text);
  }

  .chip :global(svg) {
    width: var(--icon-size);
    height: var(--icon-size);
    stroke-width: 2;
  }

  .sr-only {
    position: absolute;
    width: calc(1px * var(--font-scale, 1));
    height: calc(1px * var(--font-scale, 1));
    padding: 0;
    margin: calc(var(--space-xs) * -1);
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
