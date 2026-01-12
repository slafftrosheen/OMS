<script lang="ts">
  export let tabs: { id: string; label: string }[] = [];
  export let active = tabs[0]?.id ?? '';
  export let onChange: (id: string) => void = () => {};

  let buttons: (HTMLButtonElement | undefined)[] = [];

  function select(id: string){
    active = id;
    onChange(id);
    const nextIndex = tabs.findIndex(t => t.id === id);
    buttons[nextIndex]?.focus();
  }

  function onKey(e: KeyboardEvent, idx: number) {
    const key = e.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;
    e.preventDefault();

    let next = idx;
    if (key === 'ArrowRight') next = Math.min(idx + 1, tabs.length - 1);
    if (key === 'ArrowLeft') next = Math.max(idx - 1, 0);
    if (key === 'Home') next = 0;
    if (key === 'End') next = tabs.length - 1;

    if (next !== idx && tabs[next]) {
      select(tabs[next].id);
    }
  }

  function register(node: HTMLButtonElement, index: number) {
    buttons[index] = node;
    return {
      destroy() {
        buttons[index] = undefined;
      }
    };
  }

  function focusRegister(node: HTMLButtonElement, params: { index: number }) {
    const { index } = params;
    return register(node, index);
  }
</script>

<div role="tablist" aria-label="Sections" class="row" style="gap:6px;flex-wrap:wrap">
  {#each tabs as t, i}
    <button
      role="tab"
      aria-selected={active===t.id}
      tabindex={active===t.id ? 0 : -1}
      type="button"
      class="tag"
      on:click={() => select(t.id)}
      on:keydown={(e)=>onKey(e,i)}
      use:focusRegister={{ index: i }}>
      {t.label}
    </button>
  {/each}
</div>
