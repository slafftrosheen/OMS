<script lang="ts">
  import { onMount } from 'svelte';
  import type { OrderSeed } from './templates/DraftOrderTemplate';

  interface Props {
    snapshot?: unknown;
    onSave?: (snapshot: unknown) => void;
    onReady?: (editor: any) => void;
    onError?: (message: string) => void;
    /** Seed data → triggers DraftOrderTemplate auto-spawn */
    orderSeed?: OrderSeed | null;
    /** Called when any order-details or order-address field changes on canvas */
    onOrderChange?: (orderId: string, patch: Partial<OrderSeed>) => void;
    /** Called when a profile-7st field changes on canvas */
    onProfileChange?: (orderId: string, profileIndex: number, profileData: any) => void;
    /** Called when a file has been uploaded via drag-drop and rendered on the canvas */
    onAssetUploaded?: (orderId: string, asset: { url: string; fileName: string; kind: string }) => void;
    /** Pass true to hide the default tldraw UI chrome */
    hideUI?: boolean;
  }

  let {
    snapshot = undefined,
    onSave = () => {},
    onReady = () => {},
    onError = () => {},
    orderSeed = null,
    onOrderChange = undefined,
    onProfileChange = undefined,
    onAssetUploaded = undefined,
    hideUI = false,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let reactRoot: { unmount: () => void } | null = null;
  let editorRef: any = null;

  onMount(() => {
    let disposed = false;
    (async () => {
      try {
        const [React, { createRoot }, { CanvasApp }] = await Promise.all([
          import('react'),
          import('react-dom/client'),
          import('./CanvasApp'),
        ]);

        if (disposed) return;
        const root = createRoot(containerEl);
        reactRoot = root;

        root.render(
          React.createElement(CanvasApp, {
            initialSnapshot: snapshot,
            onSave,
            onEditorReady: (editor: any) => {
              if (disposed) return;
              editorRef = editor;
              onReady(editor);
            },
            orderSeed,
            onOrderChange,
            onProfileChange,
            onAssetUploaded,
            hideUI,
          })
        );
      } catch (err) {
        console.error('Failed to load tldraw CanvasApp', err);
        if (!disposed) onError('Canvas failed to load. Refresh the page or report this error.');
      }
    })();

    return () => {
      disposed = true;
      editorRef = null;
      reactRoot?.unmount();
      reactRoot = null;
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
