<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { users } from '$lib/users/user-store';
  import { stationAssignments } from '$lib/users/station-assignments';
  import { t } from 'svelte-i18n';
  import { TERMS } from '$lib/order/names';

  interface Props {
    value?: string;
    onCommit?: (text: string, mentions: string[]) => void;
    placeholder?: string;
  }

  let {
    value = $bindable(''),
    onCommit = () => {},
    placeholder = 'Message (use @name to mention)'
  }: Props = $props();

  let inputEl: HTMLTextAreaElement;
  let cursor = $state(0);
  let showList = $state(false);
  let query = $state('');
  let picked: string[] = $state([]);

  let suggestions = $derived(showList
    ? $users.filter((user) => {
        if (picked.includes(String(user.id))) return false;
        return user.name.toLowerCase().includes(query.toLowerCase());
      })
    : []);

  let quickPresets = $derived($stationAssignments);

  const normalizeHandle = (name: string) => name.replace(/\s+/g, '').toLowerCase();

  const nameFromId = (id: string) => $users.find((user) => String(user.id) === id)?.name ?? id;

  const removeMention = (id: string) => {
    picked = picked.filter((item) => item !== id);
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const payload = value.trim();
      if (!payload) return;
      const mentionIds = Array.from(new Set([...picked, ...extractMentionIds(payload)]));
      onCommit(payload, mentionIds);
      value = '';
      picked = [];
      showList = false;
      query = '';
      return;
    }
    if (event.key === 'ArrowDown' && showList) {
      event.preventDefault();
      inputEl?.blur();
    }
  }

  function insertMention(id: string) {
    const user = $users.find((item) => String(item.id) === id);
    if (!user) return;
    const handle = user.name.replace(/\s+/g, '');
    const before = value.slice(0, cursor).replace(/@[\w-]*$/i, `@${handle} `);
    const after = value.slice(cursor);
    value = `${before}${after}`;
    picked = picked.includes(id) ? picked : [...picked, id];
    showList = false;
    query = '';
    tick().then(() => {
      if (!inputEl) return;
      inputEl.focus();
      inputEl.selectionStart = inputEl.selectionEnd = before.length;
    });
  }

  function applyPreset(ids: string[]) {
    const newIds = ids.filter((id) => !picked.includes(id));
    if (newIds.length === 0) return;
    picked = Array.from(new Set([...picked, ...newIds]));
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
        >
          {$t(TERMS.stations[preset.station])}
          <span class="muted">×{preset.userIds.length}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if picked.length}
  <div class="mention-picked" aria-live="polite">
    <span class="muted label">{$t('chat.sending_to')}</span>
    {#each picked as id (id)}
      <span class="mention-chip">
        @{nameFromId(id)}
        <button
          type="button"
          class="chip-remove"
          onclick={() => removeMention(id)}
          aria-label={$t('chat.remove_mention', { name: nameFromId(id) })}
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
  oninput={handleInput}
  onclick={() => {
    updateCursor();
    updateMentionState();
  }}
  onkeyup={updateCursor}
  onkeydown={handleKeydown}
></textarea>

{#if showList && suggestions.length > 0}
  <div class="mention-list card" role="listbox">
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
  min-height:72px;
}
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
