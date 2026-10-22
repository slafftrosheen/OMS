<script lang="ts">
  import { onMount } from 'svelte';
  import type { CanvasAppProps } from './CanvasApp';
  import type { OrderSeed } from './templates/DraftOrderTemplate';

  interface Props {
    snapshot?: unknown;
    onSave?: (snapshot: unknown) => void;
    onDocumentChange?: () => void;
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
    toolkitBoardId?: string | null;
    onToolkitFilesDrop?: (files: File[], position: { x: number; y: number }) => void;
    onToolkitLinkDrop?: (url: string, position?: { x: number; y: number }) => void;
    onToolkitControlsChange?: (state: { tool: string; selected: number; runnable: number; canUndo: boolean; canRedo: boolean }) => void;
  }

  let {
    snapshot = undefined,
    onSave = undefined,
    onDocumentChange = undefined,
    onReady = () => {},
    onError = () => {},
    orderSeed = null,
    onOrderChange = undefined,
    onProfileChange = undefined,
    onAssetUploaded = undefined,
    hideUI = false,
    toolkitBoardId = null,
    onToolkitFilesDrop = undefined,
    onToolkitLinkDrop = undefined,
    onToolkitControlsChange = undefined,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let reactRoot: { unmount: () => void } | null = null;
  let renderCanvas = $state<((props: CanvasAppProps) => void) | null>(null);

  // Update the same React root when Svelte form data or callbacks change.
  // The snapshot is a mount-only seed: feeding onSave snapshots back into
  // tldraw would recreate the store and reset selection/history each edit.
  $effect(() => {
    renderCanvas?.({
      onSave, onDocumentChange, orderSeed, onOrderChange, onProfileChange,
      onAssetUploaded, hideUI, toolkitBoardId, onToolkitFilesDrop,
      onToolkitLinkDrop, onToolkitControlsChange,
    });
  });

  onMount(() => {
    let disposed = false;
    // tldraw freezes stored records, so detach any Svelte state proxies first.
    const initialSnapshot = $state.snapshot(snapshot);
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

        renderCanvas = (props) => root.render(
          React.createElement(CanvasApp, {
            ...props,
            initialSnapshot,
            onEditorReady: (editor: any) => {
              if (disposed) return;
              onReady(editor);
            },
          })
        );
      } catch (err) {
        console.error('Failed to load tldraw CanvasApp', err);
        if (!disposed) onError('Canvas failed to load. Refresh the page or report this error.');
      }
    })();

    return () => {
      disposed = true;
      renderCanvas = null;
      reactRoot?.unmount();
      reactRoot = null;
    };
  });
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
