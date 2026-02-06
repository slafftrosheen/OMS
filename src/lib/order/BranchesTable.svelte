<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { Branch } from './types';
  interface Props {
    branches?: Branch[];
    defaultBranch?: string;
    onSetDefault?: (name:string)=>void;
    onDelete?: (name:string)=>void;
    onRollback?: (name:string, commitId:string)=>void;
    id?: string | undefined;
  }

  let {
    branches = [],
    defaultBranch = 'main',
    onSetDefault = ()=>{},
    onDelete = ()=>{},
    onRollback = ()=>{},
    id = undefined
  }: Props = $props();
</script>

<div class="card" id={id}>
  <h3 style="margin:0 0 8px 0">{$t('branches.title')}</h3>
  <table class="rf-table">
    <thead>
      <tr>
        <th>{$t('branches.headers.name')}</th>
        <th>{$t('branches.headers.head')}</th>
        <th>{$t('branches.headers.commits')}</th>
        <th>{$t('branches.headers.actions')}</th>
      </tr>
    </thead>
    <tbody>
      {#if branches.length === 0}
        <tr>
          <td colspan="4"><span class="muted">{$t('branches.empty')}</span></td>
        </tr>
      {:else}
        {#each branches as b}
          <tr>
            <td>{b.name} {#if b.name===defaultBranch}<span class="muted">{$t('branches.default')}</span>{/if}</td>
            <td style="font-family:monospace">{b.head.slice(0,8)}</td>
            <td>{b.commits.length}</td>
            <td class="row" style="gap:6px">
              {#if b.name!==defaultBranch}
                <button class="tag" onclick={()=>onSetDefault(b.name)}>{$t('branches.set_default')}</button>
                <button class="tag" onclick={()=>onDelete(b.name)}>{$t('branches.delete')}</button>
              {/if}
              {#if b.commits.length>0}
                <button
                  class="tag"
                  onclick={() => onRollback(b.name, b.commits[b.commits.length - 1].id)}>
                  {$t('branches.rollback')}
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
