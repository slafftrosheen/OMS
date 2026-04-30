<script lang="ts">
  import { onMount } from 'svelte';

  export let snapshot: unknown = undefined;
  export let onSave: (snapshot: unknown) => void = () => {};

  let containerEl: HTMLDivElement;
  let reactRoot: { unmount: () => void } | null = null;
  let editorRef: any = null;

  onMount(() => {
    (async () => {
      try {
        const [
          React,
          { createRoot },
          { CanvasApp }
        ] = await Promise.all([
          import('react'),
          import('react-dom/client'),
          import('./CanvasApp')
        ]);
        
        const root = createRoot(containerEl);
        reactRoot = root;

        root.render(
          React.createElement(CanvasApp, {
            initialSnapshot: snapshot,
            onSave: onSave,
            onEditorReady: (editor: any) => {
              editorRef = editor;
            }
          })
        );
      } catch (err) {
        console.error('Failed to load tldraw CanvasApp', err);
      }
    })();

    return () => {
      reactRoot?.unmount();
    };
  });

  export function getEditor() {
    return editorRef;
  }
</script>

<div class="tldraw-wrapper" bind:this={containerEl}></div>

<style>
  .tldraw-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }
  :global(.tldraw-wrapper > *) {
    height: 100% !important;
  }
</style>
