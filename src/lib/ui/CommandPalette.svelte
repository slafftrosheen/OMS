<script lang="ts">
  import Input from './Input.svelte';
  import Modal from './Modal.svelte';
  import { base } from '$app/paths';
  import { searchOrders } from '$lib/search/global-search';
  import { t } from 'svelte-i18n';

  export let open = false;
  export let onClose = () => {};
  let q = '';

  const withBase = (path: string) => {
    if (!base) return path;
    if (path === '/') return base || '/';
    return `${base}${path}`;
  };

  $: trimmed = q.trim();
  $: hits = open && trimmed ? searchOrders(trimmed) : [];
  $: if (!open) q = '';

  const toHref = (id: string) => withBase(`/orders/${id}`);
</script>

<Modal {open} title={$t('commands.title')} {onClose}>
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
          on:click={onClose}
          on:keydown={(event) => {
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
  <svelte:fragment slot="footer">
    <span class="muted">{$t('commands.tip')}</span>
  </svelte:fragment>
</Modal>