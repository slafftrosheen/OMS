<script lang="ts">
  import type { Revision } from './types';
  import { t } from 'svelte-i18n';

  interface Props {
    items?: Revision[];
    currentId?: string;
    onUse?: (id:string)=>void;
    canManage?: boolean;
  }

  let {
    items = [],
    currentId = '',
    onUse = ()=>{},
    canManage = false
  }: Props = $props();
</script>

<div class="card">
  <h3 style="margin:0 0 8px 0">{$t('revisions.title')}</h3>
  <ul style="display:grid;gap:8px">
    {#each items as r (r.id)}
      <li class="card" style="background:var(--bg-2);padding:10px">
        <div style="display:flex;justify-content:space-between">
          <div>
            <b>{r.message}</b>
            <div class="muted">{r.file.name} • {$t('revisions.by', { author: r.createdBy })}</div>
          </div>
          <div class="row">
            {#if currentId===r.id}
              <span class="tag">{$t('revisions.active')}</span>
            {:else if canManage}
              <button class="tag" onclick={()=>onUse(r.id)} aria-label={$t('revisions.use')}>{$t('revisions.use')}</button>
            {/if}
            <a class="tag" href={r.file.path} target="_blank" rel="noreferrer">{$t('revisions.download')}</a>
          </div>
        </div>
      </li>
    {/each}
    {#if items.length===0}<div class="muted">{$t('revisions.empty')}</div>{/if}
  </ul>
</div>
