<script lang="ts">
  import { t } from 'svelte-i18n';
  type ChangeRequest = {
    id:string;title:string;author:string;status:string;
    message?:string;proposed?:Record<string,unknown>;
    reviewNotes?:string|null;
  };

  let {
    items = [] as ChangeRequest[],
    isAdmin = false,
    onApprove = (_id: string) => {},
    onDecline = (_id: string) => {},
    selectedId: initialSelectedId = null as string | null,
    onselect,
    onselectedId
  }: {
    items?: ChangeRequest[];
    isAdmin?: boolean;
    onApprove?: (id: string) => void;
    onDecline?: (id: string) => void;
    selectedId?: string | null;
    onselect?: (data: { id: string | null }) => void;
    onselectedId?: (id: string | null) => void;
  } = $props();

  // User toggles may override this until the parent supplies a new selection.
  let localSelectedId = $derived(initialSelectedId);

  function toggle(id: string) {
    const next = localSelectedId === id ? null : id;
    localSelectedId = next;
    onselect?.({ id: next });
    onselectedId?.(next);
  }
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('order.changeRequests.heading')}</h3>
  <ul style="display:grid;gap:8px" aria-label={$t('order.changeRequests.heading')}>
    {#each items as p (p.id)}
      {@const selected = localSelectedId === p.id}
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
              onclick={() => toggle(p.id)}
            >
              {$t('compare.heading')}
            </button>
            {#if isAdmin && p.status==='pending'}
              <button class="tag" onclick={()=>onApprove(p.id)} aria-label={$t('orderWorkspace.approveReview')}>
                {$t('orderWorkspace.approveReview')}
              </button>
              <button class="tag" onclick={()=>onDecline(p.id)} aria-label={$t('orderWorkspace.rejectReview')}>
                {$t('orderWorkspace.rejectReview')}
              </button>
            {/if}
          </div>
        </div>
        {#if p.reviewNotes}<p class="muted">{p.reviewNotes}</p>{/if}
        <details style="margin-top:6px">
          <summary>{$t('order.changeRequests.proposed')}</summary>
          <pre style="white-space:pre-wrap;margin:6px 0">{JSON.stringify(p.proposed, null, 2)}</pre>
        </details>
      </li>
    {/each}
    {#if items.length===0}<li class="muted">{$t('order.changeRequests.empty')}</li>{/if}
  </ul>
</div>

<style>
  li[data-selected='true'] {
    outline: 2px solid var(--accent-1);
  }
</style>
