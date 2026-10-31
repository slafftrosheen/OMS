<script lang="ts">
  import type { Attachment } from './types';
  import VoicePlayer from './VoicePlayer.svelte';
  let { attachments = [], contextKey = '' }: { attachments?: Array<Attachment | string>; contextKey?: string } = $props();
  let items = $derived(attachments.flatMap((item, index) => {
    if (typeof item !== 'string') return item && typeof item === 'object' ? [{ key: `${item.id ?? 'file'}:${index}`, attachment: item }] : [];
    if (!fileURL(item)) return [];
    const parsed = new URL(item, 'https://local.invalid');
    let fileName = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    try { fileName = decodeURIComponent(fileName); } catch { /* Keep a readable literal filename. */ }
    const attachment: Attachment = { id: `legacy:${index}`, kind: 'file', fileName, fileType: '', fileSize: 0, url: item };
    return [{ key: `legacy:${index}:${item}`, attachment }];
  }));
  function fileURL(value: string | null): string | null {
    if (!value) return null;
    try { return ['http:', 'https:'].includes(new URL(value, 'https://local.invalid').protocol) ? value : null; }
    catch { return null; }
  }
</script>

{#if items.length}
  <div class="chat-attachments">
    {#each items as { key, attachment } (key)}
      {#if attachment.kind === 'voice'}<VoicePlayer {attachment} {contextKey} />
      {:else if fileURL(attachment.url)}<a href={fileURL(attachment.url) ?? undefined} target="_blank" rel="noopener noreferrer">{attachment.fileName}</a>{/if}
    {/each}
  </div>
{/if}

<style>
  .chat-attachments { display: grid; gap: var(--space-sm); min-width: 0; max-width: 100%; margin-top: var(--space-sm); }
  a { color: var(--ink-primary); background: var(--bg-1); border: 1px solid var(--border); padding: var(--space-sm); border-radius: var(--radius-sm); font-size: var(--text-sm); overflow-wrap: anywhere; text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--focus); outline-offset: var(--space-xxs); }
</style>
