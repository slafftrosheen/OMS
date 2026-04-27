<script lang="ts">
  import Input from './Input.svelte';
  import Modal from './Modal.svelte';
  import { base } from '$app/paths';
  import { searchOrders } from '$lib/search/global-search';
  import type { SearchHit } from '$lib/search/global-search';
  import { t } from 'svelte-i18n';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  let { open = false, onClose = () => {} }: Props = $props();
  let q = $state('');
  let hits = $state<SearchHit[]>([]);

  const withBase = (path: string) => {
    if (!base) return path;
    if (path === '/') return base || '/';
    return `${base}${path}`;
  };

  let trimmed = $derived(q.trim());
  $effect(() => {
    if (!open || !trimmed) {
      hits = [];
      return;
    }
    void searchOrders(trimmed).then((r) => { hits = r; });
  });
  $effect(() => {
    if (!open) q = '';
  });

  const toHref = (id: string) => withBase(`/orders/${id}`);
</script>

<Modal {open} title={$t('commands.title')} {onClose}>
  {#snippet children()}
    <Input bind:value={q} placeholder={$t('commands.placeholder')} ariaLabel={$t('commands.aria')} />
    <div style="margin-top:10px;display:grid;gap:6px;max-height:300px;overflow:auto">
      {#if trimmed && hits.length===0}
        <div class="muted">{$t('commands.no_matches')}</div>
      {:else if !trimmed}
        <div class="muted">{$t('commands.start_typing')}</div>
      {:else}
        {#each hits as hit}
          <a
            class="tag"
            href={toHref(hit.id)}
            onclick={onClose}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onClose();
              }
            }}
          >
            <div style="display:flex;flex-direction:column;align-items:flex-start">
              <span><b>{hit.title}</b></span>
              <span class="muted">{hit.id} • {hit.client}</span>
              <span class="muted" style="font-size:0.8rem">{$t('commands.match_label')}: {hit.where.join(', ')}</span>
            </div>
          </a>
        {/each}
      {/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <span class="muted">{$t('commands.tip')}</span>
  {/snippet}
</Modal>