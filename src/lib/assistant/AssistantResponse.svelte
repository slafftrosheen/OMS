<script lang="ts">
  import { t } from 'svelte-i18n';
  import { scrollRegion } from '$lib/a11y/scroll-region';
  import { parseAssistantResponse, type AssistantInline } from './response-format';
  let { content }: { content: string } = $props();
  let blocks = $derived(parseAssistantResponse(content));
</script>

{#snippet inline(tokens: AssistantInline[])}
  {#each tokens as token}
    {#if token.type === 'strong'}<strong>{token.text}</strong>
    {:else if token.type === 'code'}<code>{token.text}</code>
    {:else if token.type === 'link'}<a href={token.href} target="_blank" rel="noopener noreferrer nofollow">{token.text}</a>
    {:else}{token.text}{/if}
  {/each}
{/snippet}

<div class="assistant-response">
  {#each blocks as block}
    {#if block.type === 'heading'}<h3>{@render inline(block.content)}</h3>
    {:else if block.type === 'paragraph'}<p>{@render inline(block.content)}</p>
    {:else if block.type === 'code'}<pre role="region" aria-label={$t('assistant.codeBlock')} use:scrollRegion><code>{block.text}</code></pre>
    {:else if block.type === 'list'}
      {#if block.ordered}<ol start={block.start}>{#each block.items as item}<li>{@render inline(item)}</li>{/each}</ol>
      {:else}<ul>{#each block.items as item}<li>{@render inline(item)}</li>{/each}</ul>{/if}
    {:else if block.type === 'table'}
      <div class="table-scroll" role="region" aria-label={$t('assistant.comparisonTable')} use:scrollRegion>
        <table>
          <thead><tr>{#each block.headings as cell}<th scope="col">{@render inline(cell)}</th>{/each}</tr></thead>
          <tbody>{#each block.rows as row}<tr>{#each row as cell}<td>{@render inline(cell)}</td>{/each}</tr>{/each}</tbody>
        </table>
      </div>
    {/if}
  {/each}
</div>

<style>
  .assistant-response { min-width:0;font-size:14px;line-height:1.65;overflow-wrap:anywhere; }
  h3 { margin:14px 0 6px;font-size:14px;line-height:1.5;font-weight:650; }
  p { white-space:pre-wrap;margin:6px 0; }
  h3:first-child,p:first-child { margin-top:5px; }
  ul,ol { padding-left:22px;margin:8px 0; }
  li { padding-left:2px;margin:4px 0; }
  strong { font-weight:650; }
  a { color:var(--ink-primary);text-decoration:underline;text-underline-offset:3px; }
  a:hover { color:var(--brand); }
  a:focus-visible,.table-scroll:focus-visible,pre:focus-visible { outline:2px solid var(--focus);outline-offset:2px; }
  code { font: .9em var(--font-mono,monospace);padding:1px 4px;border-radius:3px;background:var(--bg-2); }
  pre { max-width:100%;overflow:auto;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;white-space:pre; }
  pre code { padding:0;background:none; }
  .table-scroll { max-width:100%;overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin:10px 0;overscroll-behavior:contain; }
  table { border-collapse:collapse;width:100%;font-size:12px;line-height:1.5;text-align:left; }
  th,td { padding:8px 10px;vertical-align:top;min-width:100px;border-bottom:1px solid var(--border); }
  th { font-weight:650;background:var(--bg-1); }
  tr:last-child td { border-bottom:0; }
</style>
