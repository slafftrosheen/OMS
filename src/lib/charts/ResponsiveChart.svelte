<script lang="ts">
  import { onMount } from 'svelte';
  
  export let render: (host: HTMLElement) => (() => void) | void;
  
  let host: HTMLElement;
  let cleanup = () => {};
  
  onMount(() => {
    const ro = new ResizeObserver(() => {
      cleanup();
      const result = render(host);
      cleanup = result || (() => {});
    });
    
    ro.observe(host);
    
    return () => {
      ro.disconnect();
      cleanup();
    };
  });
</script>

<div bind:this={host} class="card" style="min-height:220px"></div>
