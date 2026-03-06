<script lang="ts">

  import { t } from 'svelte-i18n';
  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();
  
  function close(e: MouseEvent | KeyboardEvent) {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    open = false;
  }
</script>

{#if open}
<div class="cmd" role="dialog" tabindex="0" aria-modal="true" aria-label={$t('help.title') || 'Keyboard shortcuts'} onclick={close} onkeydown={close}>
  <div class="panel" onclick={stopPropagation(bubble('click'))} onkeydown={stopPropagation(bubble('keydown'))} role="document" tabindex="0">
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
</div>
{/if}

<style>
.cmd{
  position:fixed;
  inset:0;
  display:grid;
  place-items:center;
  background:color-mix(in oklab,var(--bg-0) 35%, black 40%);
  z-index:90
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
