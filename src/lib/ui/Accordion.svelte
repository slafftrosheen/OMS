<script lang="ts">
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';

  type Section = { id: string; title: string; subtitle?: string };

  let {
    sections = [],
    multiple = false,
    children
  }: {
    sections?: Section[];
    multiple?: boolean;
    children?: Snippet<[{ s: Section }]>;
  } = $props();

  let openIds = $state<Set<string>>(new Set([sections[0]?.id ?? '']));

  function toggle(id: string) {
    if (multiple) {
      const next = new Set(openIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      openIds = next;
    } else {
      openIds = openIds.has(id) ? new Set() : new Set([id]);
    }
  }

  function isOpen(id: string) { return openIds.has(id); }
</script>

<div class="rf-accordion">
  {#each sections as s}
    {@const open = isOpen(s.id)}
    <div class="rf-accordion__item" data-open={open || null}>
      <h3 class="rf-accordion__heading">
        <button
          class="rf-accordion__trigger"
          type="button"
          aria-expanded={open}
          aria-controls={`rf-acc-panel-${s.id}`}
          id={`rf-acc-hdr-${s.id}`}
          onclick={() => toggle(s.id)}
        >
          <span class="rf-accordion__trigger-body">
            <span class="rf-accordion__trigger-title">{s.title}</span>
            {#if s.subtitle}
              <span class="rf-accordion__trigger-sub">{s.subtitle}</span>
            {/if}
          </span>
          <span class="rf-accordion__chevron" aria-hidden="true">
            <Icon name="chevron-right" size="sm" />
          </span>
        </button>
      </h3>

      {#if open}
        <div
          role="region"
          id={`rf-acc-panel-${s.id}`}
          aria-labelledby={`rf-acc-hdr-${s.id}`}
          class="rf-accordion__panel"
          transition:slide={{ duration: 220 }}
        >
          <div class="rf-accordion__panel-inner">
            {#if children}
              {@render children({ s })}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .rf-accordion {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }

  .rf-accordion__item {
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: color-mix(in oklab, var(--bg-1) 45%, var(--bg-0));
    overflow: hidden;
    transition: border-color var(--motion-sm) var(--ease-standard);
  }
  .rf-accordion__item[data-open] {
    border-color: color-mix(in oklab, var(--brand) 35%, var(--border));
  }

  .rf-accordion__heading { margin: 0; }

  .rf-accordion__trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-md) var(--space-lg);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--ink-primary);
    transition: background var(--motion-sm) var(--ease-standard);
  }
  .rf-accordion__trigger:hover {
    background: color-mix(in oklab, var(--bg-2) 60%, transparent);
  }
  .rf-accordion__trigger:focus-visible {
    outline: none;
    box-shadow: inset var(--focus-ring);
  }

  .rf-accordion__trigger-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .rf-accordion__trigger-title {
    font-weight: 600;
    font-size: var(--text-sm);
  }
  .rf-accordion__trigger-sub {
    font-size: var(--text-xs);
    color: var(--ink-tertiary);
  }

  .rf-accordion__chevron {
    display: inline-flex;
    align-items: center;
    color: var(--ink-tertiary);
    transition: transform var(--motion-sm) var(--ease-emphasized);
    flex-shrink: 0;
  }
  .rf-accordion__item[data-open] .rf-accordion__chevron {
    transform: rotate(90deg);
    color: var(--brand);
  }

  .rf-accordion__panel-inner {
    padding: 0 var(--space-lg) var(--space-lg);
    color: var(--ink-secondary);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }
</style>
