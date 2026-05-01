<script lang="ts">
  import { onMount } from 'svelte';
  import type { OrderSeed } from './templates/DraftOrderTemplate';

  interface Props {
    snapshot?: unknown;
    onSave?: (snapshot: unknown) => void;
    onReady?: (editor: any) => void;
    /** Seed data → triggers DraftOrderTemplate auto-spawn */
    orderSeed?: OrderSeed | null;
    /** Called when any order-details or order-address field changes on canvas */
    onOrderChange?: (orderId: string, patch: Partial<OrderSeed>) => void;
    /** Called when a profile-7st field changes on canvas */
    onProfileChange?: (orderId: string, profileIndex: number, profileData: any) => void;
    /** Pass true to hide the default tldraw UI chrome */
    hideUI?: boolean;
  }

  let {
    snapshot = undefined,
    onSave = () => {},
    onReady = () => {},
    orderSeed = null,
    onOrderChange = undefined,
    onProfileChange = undefined,
    hideUI = false,
  }: Props = $props();

  let containerEl: HTMLDivElement;
  let reactRoot: { unmount: () => void } | null = null;
  let editorRef: any = null;

  onMount(() => {
    (async () => {
      try {
        const [React, { createRoot }, { CanvasApp }] = await Promise.all([
          import('react'),
          import('react-dom/client'),
          import('./CanvasApp'),
        ]);

        const root = createRoot(containerEl);
        reactRoot = root;

        root.render(
          React.createElement(CanvasApp, {
            initialSnapshot: snapshot,
            onSave,
            onEditorReady: (editor: any) => {
              editorRef = editor;
              onReady(editor);
            },
            orderSeed,
            onOrderChange,
            onProfileChange,
            hideUI,
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
