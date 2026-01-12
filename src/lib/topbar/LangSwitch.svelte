<script>
  import Languages from 'lucide-svelte/icons/languages';
  import { setLocale, locale } from '$lib/i18n';
  import { onMount } from 'svelte';
  
  let v = 'en';
  const langs=[{id:'en',label:'English'},{id:'ru',label:'Русский'},{id:'lv',label:'Latviešu'}];
  
  onMount(() => {
    const unsubscribe = locale.subscribe(val => {
      if (val) v = val;
    });
    return unsubscribe;
  });
  
  function set(id){
    setLocale(id);
  }
</script>

<div class="menu lang-menu">
  <button class="lang-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Language">
    <Languages size={18} aria-hidden="true"/>
    <span class="lang-badge">{v.toUpperCase()}</span>
  </button>
  <div class="dropdown" role="menu">
    {#each langs as l}
      <button role="menuitem" class:active={v === l.id} on:click={() => set(l.id)}>
        <span class="lang-code">{l.id.toUpperCase()}</span>
        <span>{l.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .lang-menu {
    position: relative;
  }

  .lang-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 8px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-2);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .lang-btn:hover {
    background: var(--bg-2);
    color: var(--text);
  }

  .lang-badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    min-width: 140px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 100;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: all 0.15s ease;
  }

  .lang-menu:hover .dropdown,
  .lang-menu:focus-within .dropdown {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  .dropdown button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--text);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .dropdown button:hover {
    background: var(--bg-2);
  }

  .dropdown button.active {
    background: var(--bg-2);
    font-weight: 600;
  }

  .lang-code {
    font-weight: 600;
    color: var(--accent-1);
    min-width: 24px;
  }
</style>
