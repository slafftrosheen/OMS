<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import Icon from '$lib/ui/Icon.svelte';
  let { children } = $props();
  const sections = [
    { href: '/toolkit/canvas', label: 'Canvas', icon: 'layout-grid' },
    { href: '/toolkit/chat', label: 'Conversations', icon: 'message-square' }
  ] as const;
</script>

<div class="toolkit">
  <header class="toolkit-header">
    <div class="identity">
      <span class="identity-icon"><Icon name="layers" size="md" /></span>
      <div><span class="eyebrow">Ideas · Projects · Concepts</span><h1>Toolkit</h1></div>
    </div>
    <nav class="toolkit-tabs" aria-label="Toolkit sections">
      {#each sections as s (s.href)}
        <a href="{base}{s.href}" class:active={page.url.pathname === `${base}${s.href}`}
          aria-current={page.url.pathname === `${base}${s.href}` ? 'page' : undefined}>
          <Icon name={s.icon} size="sm" />{s.label}
        </a>
      {/each}
    </nav>
  </header>
  <section class="toolkit-body">{@render children()}</section>
</div>
<style>
  .toolkit{width:100%;height:calc(100vh - var(--topbar-h,56px));min-height:600px;display:flex;flex-direction:column;gap:10px;padding:12px;max-width:100%;margin:auto}
  .toolkit-header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding:11px 16px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px}
  .identity{display:flex;gap:11px;align-items:center}
  .identity-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:var(--brand-soft);color:var(--brand)}
  .eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-tertiary)}
  h1{font-size:21px;line-height:1.15;letter-spacing:-.03em;margin:3px 0 0}
  .toolkit-tabs{display:flex;gap:6px;flex-wrap:wrap}
  .toolkit-tabs a{display:flex;align-items:center;gap:8px;min-height:40px;border-radius:10px;padding:8px 12px;text-decoration:none;color:var(--ink-secondary);font-size:13px}
  .toolkit-tabs a:hover,.toolkit-tabs a.active{color:var(--brand);background:var(--brand-soft)}
  .toolkit-tabs a:focus-visible{outline:2px solid var(--brand)}
  .toolkit-body{position:relative;min-height:0;display:flex;flex:1;overflow:hidden}
  @media(max-width:680px){.toolkit{padding:6px;min-height:500px}.toolkit-header{padding:8px 12px}.toolkit-tabs a{padding:6px 9px}.eyebrow{display:none}}
</style>