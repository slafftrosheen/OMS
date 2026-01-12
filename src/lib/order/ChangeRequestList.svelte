<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ChangeRequest } from './types.signage';
  export let items: ChangeRequest[] = [];
  export let isAdmin = false;
  export let onApprove: (id:string)=>void = ()=>{};
  export let onDecline: (id:string)=>void = ()=>{};
  export let selectedId: string | null = null;

  const dispatch = createEventDispatcher<{
    select: { id: string | null };
    selectedId: string | null;
  }>();

  function toggle(id: string) {
    const next = selectedId === id ? null : id;
    selectedId = next;
    dispatch('select', { id: next });
    dispatch('selectedId', next);
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('order.changeRequests.heading')}</h3>
  <ul style="display:grid;gap:8px" aria-label={$t('order.changeRequests.heading')}>
    {#each items as p (p.id)}
      {@const selected = selectedId === p.id}
      <li class="card" data-selected={selected} style="background:var(--bg-2);padding:10px">
        <div style="display:flex;justify-content:space-between;gap:12px">
          <div>
            <b>{p.title}</b>
            <div class="muted">
              {$t('order.changeRequests.from', { author: p.author })}
              — {$t('order.changeRequests.status', { status: p.status })}
            </div>
            {#if p.message}<div class="muted" style="margin-top:4px">{p.message}</div>{/if}
          </div>
          <div class="row">
            <button
              class="tag"
              class:is-active={selected}
              aria-pressed={selected}
              on:click={() => toggle(p.id)}
            >
              {$t('compare.heading')}
            </button>
            {#if isAdmin && p.status==='open'}
              <button class="tag" on:click={()=>onApprove(p.id)} aria-label={$t('terms.approve')}>
                {$t('terms.approve')}
              </button>
              <button class="tag" on:click={()=>onDecline(p.id)} aria-label={$t('terms.decline')}>
                {$t('terms.decline')}
              </button>
            {/if}
          </div>
        </div>
        <details style="margin-top:6px">
          <summary>{$t('order.changeRequests.proposed')}</summary>
          <pre style="white-space:pre-wrap;margin:6px 0">{JSON.stringify(p.proposed, null, 2)}</pre>
        </details>
      </li>
    {/each}
    {#if items.length===0}<div class="muted">{$t('order.changeRequests.empty')}</div>{/if}
  </ul>
</div>

<style>
  li[data-selected='true'] {
    outline: 2px solid var(--accent-1);
  }
</style>
