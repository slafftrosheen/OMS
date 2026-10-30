<script lang="ts">

  import { t } from 'svelte-i18n';
  import { modalDialog } from '$lib/ui/modal-dialog';
  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();
  
  function close() { open = false; }
</script>

{#if open}
<dialog class="cmd" aria-label={$t('help.title') || 'Keyboard shortcuts'} use:modalDialog={{ onClose: close }}>
  <div class="panel">
    <h3>{$t('help.title') || 'Shortcuts'}</h3>
    <ul>
      <li><b>Ctrl/Cmd + K</b> — Command palette</li>
      <li><b>?</b> — This help</li>
      <li><b>← / →</b> — Calendar month</li>
      <li><b>F</b> — Focus search/filter in lists</li>
    </ul>
    <div style="text-align:right;margin-top:12px">
      <button class="tag" onclick={()=>open=false}>Close</button>
    </div>
  </div>
</dialog>
{/if}

<style>
.cmd:not([open]){display:none}
.cmd::backdrop{background:transparent}
.cmd{
    margin: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
    color: inherit;
  position:fixed;
  inset:0;
  display:grid;
  place-items:center;
  background:color-mix(in oklab,var(--bg-0) 35%, black 40%);
  z-index: var(--z-modal)
}
.panel{
  width:min(640px,94vw);
  background:var(--bg-0);
  border:1px solid var(--border);
  border-radius:14px;
  padding:12px
}
ul {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}
li {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
li:last-child {
  border-bottom: none;
}
</style>
