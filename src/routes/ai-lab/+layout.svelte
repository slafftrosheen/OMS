<script lang="ts">
  // Reclame AI Lab — section shell. Mounted under /ai-lab and renders a
  // sub-nav with every Lab surface (Chat, Knowledge, Forge, Canvas, Tools,
  // Runs, Swarm). Hidden surfaces (PUBLIC_AILAB_*=false) are filtered out.
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons';
  import { env } from '$env/dynamic/public';

  let { children } = $props();

  const sections: Array<{ href: string; label: string; icon: IconName; flag: string }> = [
    { href: '/ai-lab',           label: 'Overview',  icon: 'sparkles',       flag: 'PUBLIC_AILAB_ENABLED' },
    { href: '/ai-lab/chat',      label: 'Chat',      icon: 'message-square', flag: 'PUBLIC_AILAB_CHAT_ENABLED' },
    { href: '/ai-lab/knowledge', label: 'Knowledge', icon: 'library',        flag: 'PUBLIC_AILAB_KNOWLEDGE_ENABLED' },
    { href: '/ai-lab/forge',     label: 'Forge',     icon: 'image',          flag: 'PUBLIC_AILAB_FORGE_ENABLED' },
    { href: '/ai-lab/canvas',    label: 'Canvas',    icon: 'layout-grid',    flag: 'PUBLIC_AILAB_CANVAS_ENABLED' },
    { href: '/ai-lab/tools',     label: 'Tools',     icon: 'wrench',         flag: 'PUBLIC_AILAB_ENABLED' },
    { href: '/ai-lab/runs',      label: 'Runs',      icon: 'list-checks',    flag: 'PUBLIC_AILAB_RUNS_ENABLED' },
    { href: '/ai-lab/swarm',     label: 'Swarm',     icon: 'network',        flag: 'PUBLIC_AILAB_ENABLED' }
  ];

  const visible = $derived(
    sections.filter((s) => (env[s.flag as keyof typeof env] ?? 'true') !== 'false')
  );
  const path = $derived(page.url.pathname);
</script>

<div class="ai-lab">
  <header class="lab-header">
    <div class="lab-brand">
      <Icon name="sparkles" size="md" />
      <h1>Reclame AI Lab</h1>
      <span class="lab-tag">internal toolset</span>
    </div>
    <nav class="lab-nav" aria-label="AI Lab sections">
      {#each visible as s (s.href)}
        <a
          href="{base}{s.href}"
          class:active={path === `${base}${s.href}` || path.startsWith(`${base}${s.href}/`)}
        >
          <Icon name={s.icon} size="sm" />
          <span>{s.label}</span>
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
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    border-radius: var(--radius-lg);
    padding: calc(var(--space-md) * var(--density, 1)) calc(var(--space-lg) * var(--density, 1));
  }

  .lab-brand {
    display: flex;
    align-items: center;
    gap: calc(var(--space-sm) * var(--density, 1));
  }
  .lab-brand h1 {
    margin: 0;
    font-size: calc(1.4rem * var(--font-scale, 1));
    font-weight: 700;
  }
  .lab-tag {
    margin-left: auto;
    font-size: calc(0.75rem * var(--font-scale, 1));
    color: var(--text-muted, #888);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-full);
    padding: 2px 10px;
  }

  .lab-nav {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--space-xs) * var(--density, 1));
  }
  .lab-nav a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-full);
    border: 1px solid transparent;
    color: var(--text, #ddd);
    font-size: calc(0.9rem * var(--font-scale, 1));
    text-decoration: none;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .lab-nav a:hover { background: color-mix(in oklab, var(--brand) 8%, transparent); }
  .lab-nav a.active {
    background: color-mix(in oklab, var(--brand) 16%, transparent);
    border-color: color-mix(in oklab, var(--brand) 40%, transparent);
    color: var(--brand);
  }
  .lab-nav a:focus-visible { box-shadow: var(--focus-ring); outline: none; }

  .lab-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-md) * var(--density, 1));
  }
</style>
