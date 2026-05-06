<script lang="ts">
  // Reclame AI Lab — section shell. Mounted under /ai-lab and renders a
  // sub-nav with every Lab surface (Chat, Knowledge, Forge, Canvas, Tools,
  // Runs, Swarm). Hidden surfaces (PUBLIC_AILAB_*=false) are filtered out.
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import { env } from '$env/dynamic/public';
  import { t } from 'svelte-i18n';

  let { children } = $props();

  const sections: Array<{ href: string; labelKey: string; icon: IconName; flag: string }> = [
    { href: '/ai-lab',           labelKey: 'ailab.sections.overview',  icon: 'sparkles',       flag: 'PUBLIC_AILAB_ENABLED' },
    { href: '/ai-lab/chat',      labelKey: 'ailab.sections.chat',      icon: 'message-square', flag: 'PUBLIC_AILAB_CHAT_ENABLED' },
    { href: '/ai-lab/knowledge', labelKey: 'ailab.sections.knowledge', icon: 'library',        flag: 'PUBLIC_AILAB_KNOWLEDGE_ENABLED' },
    { href: '/ai-lab/canvas',    labelKey: 'ailab.sections.canvas',    icon: 'layout-grid',    flag: 'PUBLIC_AILAB_CANVAS_ENABLED' }
  ];

  const visible = $derived(
    sections.filter((s) => (env[s.flag as keyof typeof env] ?? 'true') !== 'false')
  );
  const path = $derived(page.url.pathname);
</script>

<div class="ai-lab">
  <header class="lab-header rf-aurora">
    <div class="lab-brand">
      <span class="lab-brand__glyph"><Icon name="sparkles" size="md" /></span>
      <h1 class="rf-text-gradient">{$t('ailab.title')}</h1>
      <span class="lab-tag">{$t('ailab.internal_toolset')}</span>
    </div>
    <nav class="lab-nav" aria-label={$t('ailab.title')}>
      {#each visible as s (s.href)}
        <a
          href="{base}{s.href}"
          class:active={path === `${base}${s.href}` || path.startsWith(`${base}${s.href}/`)}
        >
          <Icon name={s.icon} size="sm" />
          <span>{$t(s.labelKey)}</span>
        </a>
      {/each}
    </nav>
  </header>

  <section class="lab-body">
    {@render children()}
  </section>
</div>

<style>
  .ai-lab {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - var(--topbar-h, 56px));
    padding: calc(var(--space-md) * var(--density, 1)) calc(var(--space-lg) * var(--density, 1));
    gap: calc(var(--space-md) * var(--density, 1));
    max-width: var(--content-max, 1400px);
    margin-inline: auto;
    width: 100%;
  }

  .lab-header {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-sm) * var(--density, 1));
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow), var(--glass-border-highlight);
    border-radius: var(--radius-lg);
    padding: var(--space-lg) var(--space-xl);
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .lab-brand {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .lab-brand__glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--brand) 14%, transparent);
    color: var(--brand);
    animation: rf-float 3.6s ease-in-out infinite;
  }
  .lab-brand h1 {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: var(--tracking-tighter);
  }
  .lab-tag {
    margin-left: auto;
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--ink-tertiary);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    padding: var(--space-xxs) var(--space-md);
    background: color-mix(in oklab, var(--bg-1) 50%, transparent);
  }

  .lab-nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .lab-nav a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-md);
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    color: var(--ink-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    text-decoration: none;
    transition:
      background   var(--motion-sm) var(--ease-standard),
      border-color var(--motion-sm) var(--ease-standard),
      color        var(--motion-sm) var(--ease-standard),
      transform    var(--motion-xs) var(--ease-spring-soft);
  }
  .lab-nav a:hover {
    background: color-mix(in oklab, var(--brand) 8%, transparent);
    color: var(--ink-primary);
    transform: translateY(-1px);
  }
  .lab-nav a.active {
    background: var(--brand-soft);
    border-color: color-mix(in oklab, var(--brand) 35%, transparent);
    color: var(--brand);
    font-weight: 600;
    box-shadow: 0 4px 12px -4px color-mix(in oklab, var(--brand) 30%, transparent);
  }
  .lab-nav a:focus-visible { box-shadow: var(--focus-ring); outline: none; }

  .lab-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
</style>
