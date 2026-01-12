<script lang="ts">
  export let params = {};
  import { ui } from '$lib/state/ui';
  import PasswordChange from '$lib/auth/PasswordChange.svelte';
  import { t, locale } from 'svelte-i18n';
  import { setLocale, locales } from '$lib/i18n';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Contrast from 'lucide-svelte/icons/contrast';
  import Type from 'lucide-svelte/icons/type';
  import Rows3 from 'lucide-svelte/icons/rows-3';
  import Languages from 'lucide-svelte/icons/languages';
  import Palette from 'lucide-svelte/icons/palette';
  import Shield from 'lucide-svelte/icons/shield';
  import Bell from 'lucide-svelte/icons/bell';
  import Plug from 'lucide-svelte/icons/plug';

  type Theme = 'LightVim' | 'DarkVim' | 'HighContrastVim';
  type Density = 'compact' | 'cozy' | 'comfortable';

  let currentTheme: Theme = 'DarkVim';
  let currentDensity: Density = 'cozy';
  let currentFontScale: number = 1.0;

  ui.subscribe(p => {
    currentTheme = p.theme as Theme;
    currentDensity = p.density;
    currentFontScale = p.fontScale;
  });

  const themes: { id: Theme; icon: any; label: string }[] = [
    { id: 'LightVim', icon: Sun, label: 'Light' },
    { id: 'DarkVim', icon: Moon, label: 'Dark' },
    { id: 'HighContrastVim', icon: Contrast, label: 'High Contrast' }
  ];

  const densities: { id: Density; label: string; desc: string }[] = [
    { id: 'compact', label: 'Compact', desc: 'Minimal spacing' },
    { id: 'cozy', label: 'Cozy', desc: 'Balanced spacing' },
    { id: 'comfortable', label: 'Comfortable', desc: 'Generous spacing' }
  ];

  const fontScales = [
    { value: 0.85, label: 'XS' },
    { value: 0.95, label: 'S' },
    { value: 1.0, label: 'M' },
    { value: 1.1, label: 'L' },
    { value: 1.2, label: 'XL' }
  ];

  function setTheme(theme: Theme) {
    ui.update(p => ({ ...p, theme }));
  }

  function setDensity(density: Density) {
    ui.update(p => ({ ...p, density }));
  }

  function setFontScale(scale: number) {
    ui.update(p => ({ ...p, fontScale: scale }));
  }

  function handleLocale(e: Event) {
    const target = e.target as HTMLSelectElement;
    setLocale(target.value);
  }
</script>

<div class="settings-page">
  <header class="settings-header">
    <h1>{$t('settings.title', { default: 'Settings' })}</h1>
    <p class="muted">{$t('settings.description', { default: 'Customize your experience' })}</p>
  </header>

  <div class="settings-grid">
    <!-- Appearance Section -->
    <section class="settings-section">
      <div class="section-header">
        <Palette size={20} />
        <h2>{$t('settings.appearance', { default: 'Appearance' })}</h2>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span class="label-text">{$t('theme.title', { default: 'Theme' })}</span>
          <span class="label-hint">{$t('theme.hint', { default: 'Choose your preferred color scheme' })}</span>
        </div>
        <div class="theme-options" role="radiogroup" aria-label="Theme selection">
          {#each themes as theme}
            <button
              class="theme-option"
              class:active={currentTheme === theme.id}
              role="radio"
              aria-checked={currentTheme === theme.id}
              on:click={() => setTheme(theme.id)}
            >
              <div class="theme-icon">
                <svelte:component this={theme.icon} size={20} />
              </div>
              <span>{theme.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Accessibility Section -->
    <section class="settings-section">
      <div class="section-header">
        <Type size={20} />
        <h2>{$t('settings.accessibility', { default: 'Accessibility' })}</h2>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span class="label-text">{$t('settings.textSize', { default: 'Text Size' })}</span>
          <span class="label-hint">{$t('settings.textSizeHint', { default: 'Adjust text size for readability' })}</span>
        </div>
        <div class="scale-options" role="radiogroup" aria-label="Text size selection">
          {#each fontScales as scale}
            <button
              class="scale-option"
              class:active={Math.abs(currentFontScale - scale.value) < 0.01}
              role="radio"
              aria-checked={Math.abs(currentFontScale - scale.value) < 0.01}
              on:click={() => setFontScale(scale.value)}
            >
              {scale.label}
            </button>
          {/each}
        </div>
        <div class="preview-text" style="font-size: calc(1rem * {currentFontScale})">
          {$t('settings.previewText', { default: 'Preview: The quick brown fox jumps over the lazy dog.' })}
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span class="label-text">{$t('settings.density', { default: 'Density' })}</span>
          <span class="label-hint">{$t('settings.densityHint', { default: 'Control spacing between elements' })}</span>
        </div>
        <div class="density-options" role="radiogroup" aria-label="Density selection">
          {#each densities as density}
            <button
              class="density-option"
              class:active={currentDensity === density.id}
              role="radio"
              aria-checked={currentDensity === density.id}
              on:click={() => setDensity(density.id)}
            >
              <span class="density-label">{density.label}</span>
              <span class="density-desc">{density.desc}</span>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <!-- Language Section -->
    <section class="settings-section">
      <div class="section-header">
        <Languages size={20} />
        <h2>{$t('settings.language', { default: 'Language' })}</h2>
      </div>

      <div class="setting-group">
        <label class="setting-label" for="locale-select">
          <span class="label-text">{$t('settings.interfaceLanguage', { default: 'Interface Language' })}</span>
        </label>
        <select id="locale-select" class="rf-select" value={$locale} on:change={handleLocale}>
          {#each locales as loc}
            <option value={loc}>{loc === 'en' ? 'English' : loc === 'lv' ? 'Latviešu' : loc === 'ru' ? 'Русский' : loc}</option>
          {/each}
        </select>
      </div>
    </section>

    <!-- Security Section -->
    <section class="settings-section">
      <div class="section-header">
        <Shield size={20} />
        <h2>{$t('settings.security', { default: 'Security' })}</h2>
      </div>
      <PasswordChange />
    </section>

    <!-- Integrations Section -->
    <section class="settings-section">
      <div class="section-header">
        <Plug size={20} />
        <h2>{$t('settings.sections.integrations', { default: 'Integrations' })}</h2>
      </div>
      <div class="integrations-list">
        <div class="integration-item">
          <div class="integration-info">
            <strong>Telegram</strong>
            <span class="muted">{$t('settings.integrations.telegram', { default: 'Notifications via Telegram bot' })}</span>
          </div>
          <span class="status-badge">Coming soon</span>
        </div>
        <div class="integration-item">
          <div class="integration-info">
            <strong>n8n</strong>
            <span class="muted">{$t('settings.integrations.n8n', { default: 'Workflow automation' })}</span>
          </div>
          <span class="status-badge">Coming soon</span>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-lg);
}

.settings-header {
  margin-bottom: var(--space-xl);
}

.settings-header h1 {
  margin: 0 0 var(--space-xs) 0;
  font-size: var(--step-2);
  font-weight: 700;
}

.settings-header .muted {
  margin: 0;
}

.settings-grid {
  display: grid;
  gap: var(--space-lg);
}

.settings-section {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}

.section-header h2 {
  margin: 0;
  font-size: var(--step-1);
  font-weight: 600;
}

.setting-group {
  margin-bottom: var(--space-lg);
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: block;
  margin-bottom: var(--space-sm);
}

.label-text {
  display: block;
  font-weight: 600;
  color: var(--text);
  margin-bottom: var(--space-xxs);
}

.label-hint {
  display: block;
  font-size: 0.875rem;
  color: var(--muted);
}

/* Theme Options */
.theme-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--bg-0);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-option:hover {
  border-color: var(--accent-1, var(--brand));
  background: var(--bg-2);
}

.theme-option.active {
  border-color: var(--accent-1, var(--brand));
  background: color-mix(in oklab, var(--accent-1, var(--brand)) 10%, var(--bg-1));
}

.theme-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-2);
  border-radius: var(--radius-full);
}

/* Scale Options */
.scale-options {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.scale-option {
  min-width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-0);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scale-option:hover {
  border-color: var(--accent-1, var(--brand));
}

.scale-option.active {
  border-color: var(--accent-1, var(--brand));
  background: var(--accent-1, var(--brand));
  color: white;
}

.preview-text {
  padding: var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--muted);
}

/* Density Options */
.density-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-sm);
}

.density-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--space-md);
  background: var(--bg-0);
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.density-option:hover {
  border-color: var(--accent-1, var(--brand));
}

.density-option.active {
  border-color: var(--accent-1, var(--brand));
  background: color-mix(in oklab, var(--accent-1, var(--brand)) 10%, var(--bg-1));
}

.density-label {
  font-weight: 600;
  color: var(--text);
}

.density-desc {
  font-size: 0.75rem;
  color: var(--muted);
}

/* Select */
.rf-select {
  width: 100%;
  max-width: 300px;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 1rem;
  cursor: pointer;
}

/* Integrations */
.integrations-list {
  display: grid;
  gap: var(--space-sm);
}

.integration-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md);
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.integration-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
}

.integration-info strong {
  color: var(--text);
}

.status-badge {
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-2);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  color: var(--muted);
}

@media (max-width: 600px) {
  .settings-page {
    padding: var(--space-md);
  }
  
  .theme-options,
  .density-options {
    grid-template-columns: 1fr;
  }
  
  .scale-options {
    flex-wrap: wrap;
  }
}
</style>
