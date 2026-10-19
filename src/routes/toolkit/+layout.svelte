<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';
  import { t } from 'svelte-i18n';
  let { children } = $props();
  const sections = [
    { href: '/toolkit/canvas', labelKey: 'toolkit.canvasTab', icon: 'layout-grid' },
    { href: '/toolkit/chat', labelKey: 'toolkit.chatTab', icon: 'message-square' }
  ] as const;
</script>

<div class="toolkit">
  <header class="toolkit-header">
    <div class="identity">
      <span class="identity-icon"><Icon name="layers" size="md" /></span>
      <div><span class="eyebrow">{$t('toolkit.subtitle')}</span><h1>{$t('toolkit.title')}</h1></div>
    </div>
    <nav class="toolkit-tabs" aria-label={$t('toolkit.sections')}>
      {#each sections as s (s.href)}
        <a href="{base}{s.href}" class:active={page.url.pathname === `${base}${s.href}`}
          aria-current={page.url.pathname === `${base}${s.href}` ? 'page' : undefined}>
          <Icon name={s.icon} size="sm" />{$t(s.labelKey)}
        </a>
      {/each}
    </nav>
  </header>
  <section class="toolkit-body">{@render children()}</section>
</div>
<style>
  /* The Toolkit is an operator workspace, not a second landing page. */
  .toolkit {
    width:100%; max-width:100%; min-width:0; margin:0 auto; padding:0;
    display:flex; flex-direction:column; gap:var(--space-sm);
    height:calc(100dvh - var(--topbar-h) - var(--bottombar-h) - 2 * var(--space-xl));
    min-height:580px;
  }
  .toolkit-header {
    display:flex; align-items:center; justify-content:space-between;
    gap:var(--space-md); flex-wrap:wrap; padding:var(--space-md) var(--space-lg);
    background:var(--glass-bg-strong); border:1px solid var(--glass-border);
    border-radius:var(--radius-lg); position:relative;
  }
  .toolkit-header::before {
    content:'';position:absolute;left:0;top:0;width:84px;height:2px;
    background:linear-gradient(90deg,var(--brand),var(--brand-2),transparent);
  }
  .identity { display:flex; gap:var(--space-md); align-items:center; min-width:0; }
  .identity-icon { width:38px;height:38px;display:grid;place-items:center;
    border:1px solid color-mix(in oklab,var(--brand) 28%,var(--border));
    border-radius:var(--radius-md);background:var(--brand-soft);color:var(--brand); }
  .eyebrow { font-size:var(--text-xs);letter-spacing:.10em;text-transform:uppercase;
    color:var(--ink-tertiary); }
  h1 { font-size:var(--text-xl);line-height:1.15;letter-spacing:var(--tracking-tight);margin:2px 0 0; }
  .toolkit-tabs { display:flex;gap:var(--space-xs);min-width:0;flex-wrap:wrap; }
  .toolkit-tabs a { display:inline-flex;align-items:center;gap:var(--space-sm);
    min-height:42px;border-radius:var(--radius-sm);padding:8px 14px;
    text-decoration:none;color:var(--ink-secondary);font-size:var(--text-sm);
    border:1px solid transparent;font-weight:600; }
  .toolkit-tabs a:hover { color:var(--ink-primary);background:var(--bg-2); }
  .toolkit-tabs a.active { color:var(--brand);background:var(--brand-soft);
    border-color:color-mix(in oklab,var(--brand) 30%,var(--border)); }
  .toolkit-tabs a:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  .toolkit-body { position:relative;min-height:0;min-width:0;display:flex;flex:1;overflow:hidden; }
  @media(max-width:800px) {
    .toolkit {
      height:calc(100dvh - var(--topbar-h) - var(--mobile-nav-h) - 2 * var(--space-md));
      min-height:520px;
    }
    .toolkit-header { padding:var(--space-sm) var(--space-md); gap:var(--space-xs); }
    .identity-icon { width:32px;height:32px; }
    .toolkit-tabs { width:100%; }
    .toolkit-tabs a { flex:1;justify-content:center; }
    .eyebrow { display:none; }
  }
  @media(prefers-reduced-transparency:reduce) { .toolkit-header { background:var(--bg-1); } }
</style>
