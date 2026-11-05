<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { users } from '$lib/users/user-store';
  import { stationAssignments } from '$lib/users/station-assignments';
  import { t, locale } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';
  import Send from 'lucide-svelte/icons/send';
  import { conversationCopy } from './conversation-copy';

  interface Props {
    value?: string;
    mentions?: string[];
    onCommit?: (text: string, mentions: string[]) => boolean | void | Promise<boolean | void>;
    placeholder?: string;
    disabled?: boolean;
    sending?: boolean;
    failed?: boolean;
    managed?: boolean;
  }

  let {
    value = $bindable(''),
    mentions = $bindable([]),
    onCommit = () => {},
    placeholder = 'Message (use @name to mention)',
    disabled = false,
    sending = $bindable(false),
    failed = $bindable(false),
    managed = false
  }: Props = $props();

  let inputEl: HTMLTextAreaElement;
  let cursor = $state(0);
  let showList = $state(false);
  let query = $state('');
  let suggestionList = $state<HTMLDivElement>();
  let alive = true;
  let c = $derived(conversationCopy($locale));
  const hintId = $props.id();
  onDestroy(() => { alive = false; });

  async function commit() {
    const payload = value.trim();
    if (!payload || disabled || sending) return;
    const mentionIds = Array.from(new Set([...mentions, ...extractMentionIds(payload)]));
    const previousText = value, previousMentions = [...mentions];
    if (!managed) { sending = true; failed = false; }
    showList = false;
    try {
      const confirmed = await onCommit(payload, mentionIds);
      if (!alive) return;
      if (confirmed === false) { if (!managed) failed = true; return; }
      if (!managed && value === previousText && mentions.length === previousMentions.length && mentions.every((id, index) => id === previousMentions[index])) {
        value = ''; mentions = [];
      }
      query = '';
      await tick(); inputEl?.focus();
    } catch { if (alive && !managed) failed = true; }
    finally { if (alive && !managed) sending = false; }
  }

  let suggestions = $derived(showList
    ? $users.filter((user) => {
        if (mentions.includes(String(user.id))) return false;
        return user.name.toLowerCase().includes(query.toLowerCase());
      })
    : []);

  let quickPresets = $derived($stationAssignments);

  const normalizeHandle = (name: string) => name.replace(/\s+/g, '').toLowerCase();

  const nameFromId = (id: string) => $users.find((user) => String(user.id) === id)?.name ?? id;

  const removeMention = (id: string) => {
    mentions = mentions.filter((item) => item !== id);
  };

  const extractMentionIds = (text: string) => {
    const handles = new Set<string>();
    const matches = text.matchAll(/@([\w-]+)/g);
    for (const match of matches) {
      const handle = match[1]?.toLowerCase();
      if (handle) handles.add(handle);
    }
    const resolved: string[] = [];
    handles.forEach((handle) => {
      const user = $users.find((item) => normalizeHandle(item.name) === handle);
      if (user) resolved.push(String(user.id));
    });
    return resolved;
  };

  function updateCursor() {
    cursor = inputEl?.selectionStart ?? value.length;
  }

  function updateMentionState() {
    const head = value.slice(0, cursor);
    const match = /@([\w-]*)$/i.exec(head);
    if (!match) {
      query = '';
      showList = false;
      return;
    }
    query = match[1] ?? '';
    showList = true;
  }

  function handleInput(event: Event) {
    value = (event.target as HTMLTextAreaElement).value;
    updateCursor();
    updateMentionState();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void commit();
      return;
    }
    if (event.key === 'ArrowDown' && showList) {
      event.preventDefault();
      suggestionList?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }

  function handleSuggestionKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      showList = false;
      inputEl?.focus();
      return;
    }
    const options = Array.from(suggestionList?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const current = options.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowDown') next = Math.min(options.length - 1, current + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    options[next]?.focus();
  }

  function insertMention(id: string) {
    const user = $users.find((item) => String(item.id) === id);
    if (!user) return;
    const handle = user.name.replace(/\s+/g, '');
    const before = value.slice(0, cursor).replace(/@[\w-]*$/i, `@${handle} `);
    const after = value.slice(cursor);
    value = `${before}${after}`;
    mentions = mentions.includes(id) ? mentions : [...mentions, id];
    showList = false;
    query = '';
    tick().then(() => {
      if (!inputEl?.isConnected) return;
      inputEl.focus();
      inputEl.selectionStart = inputEl.selectionEnd = before.length;
    });
  }

  function applyPreset(ids: string[]) {
    const newIds = ids.filter((id) => !mentions.includes(id));
    if (newIds.length === 0) return;
    mentions = Array.from(new Set([...mentions, ...newIds]));
  }

  onMount(() => {
    updateCursor();
  });
</script>

{#if quickPresets.length}
  <div class="quick-mentions" aria-live="polite">
    <span class="muted label">{$t('chat.quick_mentions')}</span>
    <div class="quick-row">
      {#each quickPresets as preset (preset.station)}
        {@const names = preset.userIds.map((id) => nameFromId(id)).join(', ')}
        <button
          type="button"
          class="tag quick-chip"
          onclick={() => applyPreset(preset.userIds)}
          aria-label={$t('chat.quick_mentions_station', { station: $t(TERMS.stations[preset.station]) })}
          title={names}
          disabled={disabled || sending}
        >
          {$t(TERMS.stations[preset.station])}
          <span class="muted">×{preset.userIds.length}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if mentions.length}
  <div class="mention-picked" aria-live="polite">
    <span class="muted label">{$t('chat.sending_to')}</span>
    {#each mentions as id (id)}
      <span class="mention-chip">
        @{nameFromId(id)}
        <button
          type="button"
          class="chip-remove"
          onclick={() => removeMention(id)}
          aria-label={$t('chat.remove_mention', { name: nameFromId(id) })}
          disabled={disabled || sending}
        >
          ×
        </button>
      </span>
    {/each}
  </div>
{/if}

<textarea
  class="rf-input"
  rows="3"
  bind:this={inputEl}
  bind:value
  placeholder={placeholder}
  aria-label={placeholder}
  aria-describedby={hintId}
  disabled={disabled || sending}
  oninput={handleInput}
  onclick={() => {
    updateCursor();
    updateMentionState();
  }}
  onkeyup={updateCursor}
  onkeydown={handleKeydown}
></textarea>

<div class="composer-actions">
  <span id={hintId}>{c.keyboardHint}</span>
  <button type="button" class="send-message" onclick={commit} disabled={disabled || sending || !value.trim()}>
    {sending ? c.sending : c.send}<Send size={16} aria-hidden="true" />
  </button>
</div>
{#if failed}<p class="send-error" role="alert">{c.sendFailed}</p>{/if}

{#if showList && suggestions.length > 0}
  <div class="mention-list card" role="listbox" tabindex="-1" aria-label={$t('chat.mentions')} bind:this={suggestionList} onkeydown={handleSuggestionKeydown}>
    {#each suggestions as user}
      <button
        type="button"
        class="mention-item"
        role="option"
        aria-selected="false"
        onclick={() => insertMention(String(user.id))}
      >
        @{user.name}
      </button>
    {/each}
  </div>
{/if}

<style>
textarea.rf-input{
  resize:vertical;
  min-height:calc(var(--control-sm) * 2);
  min-width:0;
  max-width:100%;
  box-sizing:border-box;
}
.composer-actions { display:flex; flex-wrap:wrap; gap:var(--space-sm); align-items:center; justify-content:space-between; color:var(--ink-secondary); font-size:var(--text-xs); }
.composer-actions span { flex:1 1 160px; overflow-wrap:anywhere; }
.send-message { display:inline-flex; gap:var(--space-sm); align-items:center; justify-content:center; min-height:var(--control-size); border:1px solid var(--brand); border-radius:var(--radius-sm); padding:var(--space-sm) var(--space-md); background:var(--brand-soft); color:var(--ink-primary); font:inherit; font-size:var(--text-sm); font-weight:600; cursor:pointer; }
.send-message:disabled, textarea.rf-input:disabled { opacity:1; color:var(--ink-secondary); background:var(--bg-2); border-color:var(--border); cursor:not-allowed; }
.send-message:focus-visible { outline:2px solid var(--focus); outline-offset:var(--space-xxs); }
.send-error { margin:0; padding:var(--space-sm); color:var(--ink-primary); background:var(--error-soft); border-radius:var(--radius-sm); font-size:var(--text-sm); }
.quick-mentions{
  display:grid;
  gap:6px;
  margin-bottom:6px;
}
.quick-row{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.quick-chip{
  display:flex;
  align-items:center;
  gap:6px;
}
.mention-picked{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  align-items:center;
  margin-bottom:6px;
}
.mention-picked .label{
  font-size:.75rem;
  text-transform:uppercase;
  letter-spacing:.04em;
}
.mention-chip{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:4px 10px;
  border-radius:999px;
  background:color-mix(in oklab, var(--accent-2) 20%, var(--bg-2));
  color:var(--text);
  font-size:.8rem;
}
.chip-remove{
  background:transparent;
  border:none;
  color:inherit;
  font-size:.9rem;
  line-height:1;
  cursor:pointer;
  padding:0;
}
.mention-list{
  margin-top:6px;
  display:grid;
  gap:6px;
  padding:8px;
  background:var(--bg-2);
}
.mention-item{
  border:none;
  text-align:left;
  background:transparent;
  color:var(--text);
  padding:6px 8px;
  border-radius:8px;
  cursor:pointer;
}
.mention-item:hover{
  background:color-mix(in oklab, var(--border) 30%, transparent);
}
</style>
