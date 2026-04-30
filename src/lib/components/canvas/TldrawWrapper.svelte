<script lang="ts">
  import { onMount } from 'svelte';

  export let snapshot: unknown = undefined;
  export let onSave: (snapshot: unknown) => void = () => {};

  let containerEl: HTMLDivElement;
  let reactRoot: { unmount: () => void } | null = null;
  let editorRef: any = null;

  onMount(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const [
          React,
          { createRoot },
          { Tldraw },
          { MakerShapeUtil },
          { ChatShapeUtil },
          { ForgeShapeUtil }
        ] = await Promise.all([
          import('react'),
          import('react-dom/client'),
          import('@tldraw/tldraw'),
          import('./shapes/MakerShape'),
          import('./shapes/ChatShape'),
          import('./shapes/ForgeShape')
        ]);
        
        await import('@tldraw/tldraw/tldraw.css');

        const customShapeUtils = [MakerShapeUtil, ChatShapeUtil, ForgeShapeUtil];

        const root = createRoot(containerEl);
        reactRoot = root;

        root.render(
          React.createElement(Tldraw, {
            snapshot: snapshot,
            shapeUtils: customShapeUtils,
            onMount(editor: any) {
              editorRef = editor;
              unlisten = editor.store.listen(
                () => {
                  onSave(editor.store.getSnapshot());
                },
                { scope: 'document' }
              );
            }
          })
        );
      } catch (err) {
        console.error('Failed to load tldraw', err);
      }
    })();

    return () => {
      unlisten?.();
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
  }
  :global(.tldraw-wrapper > *) {
    height: 100% !important;
  }
</style>
