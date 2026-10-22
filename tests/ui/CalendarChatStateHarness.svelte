<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import EventEditor from '$lib/calendar/EventEditor.svelte';
  import LoadingPicker from '$lib/calendar/LoadingPicker.svelte';
  import MonthGrid from '$lib/calendar/MonthGrid.svelte';
  import ChatInput from '$lib/components/chat/ChatInput.svelte';
  import ChatMessage from '$lib/components/chat/ChatMessage.svelte';
  import ChatContainer from '$lib/components/chat/ChatContainer.svelte';
  import ChatSidebar from '$lib/chat/ChatSidebar.svelte';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { isChatOpen } from '$lib/chat/chat-store';
  import type { CalEvent } from '$lib/calendar/types';

  const surface = new URLSearchParams(location.search).get('surface') ?? 'calendar';
  const eventA: CalEvent = { id: 'event-a', kind: 'meeting', title: 'Planning A', date: '2026-01-10', createdAt: '2026-01-01T12:00:00Z', start: '11:00', end: '12:00', attendees: ['Ann'] };
  const eventB: CalEvent = { id: 'event-b', kind: 'note', title: 'Note B', date: '2026-02-20', createdAt: '2026-01-01T12:00:00Z', note: 'B notes' };
  let event = $state<CalEvent | null>(eventA);
  let editorOpen = $state(false);
  let pickerOpen = $state(false);
  let picked = $state('');
  let month = $state(1);
  let year = $state(2026);
  let orderId = $state('order-a');
  let rejected = $state(false);
  let sent = $state<string[]>([]);
  let edits = $state<string[]>([]);
  let selectedFiles = $state(0);
  let replyingTo = $state<{ id: string; username: string; message: string } | null>(null);
  let holdNextSend = false;
  let releaseSend: (() => void) | undefined;

  async function send(data: { message: string }) {
    if (rejected) return false;
    if (holdNextSend) {
      holdNextSend = false;
      await new Promise<void>(resolve => { releaseSend = resolve; });
    }
    sent = [...sent, data.message];
    return true;
  }
  let message = $state({ id: 'message-a', userId: 'account-a', username: 'Ann', message: 'Original A', timestamp: new Date('2026-01-01T12:00:00Z') });

  function changeMonth(amount: number) {
    const date = new Date(year, month - 1 + amount, 1);
    year = date.getFullYear(); month = date.getMonth() + 1;
  }
  function switchAccount() {
    currentUser.set({ id: 'account-b', username: 'Bob', displayName: 'Bob', role: 'RD', stations: [] });
  }
  onMount(() => {
    const hooks = {
      eventB: () => event = eventB,
      refreshEvent: () => { if (event) event = { ...event, title: 'Server refreshed' } as CalEvent; },
      setMonth: (next: number) => month = next,
      messageB: () => message = { ...message, id: 'message-b', message: 'Original B' },
      refreshMessage: () => message = { ...message, message: 'Server message refresh' },
      setLocale: (value: string) => locale.set(value),
      setReply: (id: string) => replyingTo = { id, username: id, message: `Message ${id}` },
      holdSend: () => holdNextSend = true,
      resolveSend: () => releaseSend?.()
    };
    (window as any).__calendarChatFixture = hooks;
    return () => { delete (window as any).__calendarChatFixture; };
  });
</script>

<main>
  <label>Language <select aria-label="Language" bind:value={$locale}><option value="en">EN</option><option value="ru">RU</option><option value="lv">LV</option></select></label>
  {#if surface === 'calendar'}
    <button type="button" onclick={() => editorOpen = true}>Open event editor</button>
    <button type="button" onclick={() => pickerOpen = true}>Open loading picker</button>
    <output data-testid="picked-date">{picked}</output>
    <section aria-label="First month"><MonthGrid {year} {month} renderDay={() => ''} onprevmonth={() => changeMonth(-1)} onnextmonth={() => changeMonth(1)} /></section>
    <section aria-label="Second month"><MonthGrid year={2026} month={1} renderDay={() => ''} /></section>
    {#if editorOpen}<EventEditor {event} dateISO="2026-01-10" presetKind="meeting" onClose={() => editorOpen = false} />{/if}
    {#if pickerOpen}<LoadingPicker po="PO-1" onPick={value => picked = value} onClose={() => pickerOpen = false} />{/if}
  {:else if surface === 'composer'}
    <button type="button" onclick={() => rejected = !rejected}>Toggle failure</button>
    <output data-testid="send-count">{sent.length}</output>
    <output data-testid="edit-count">{edits.length}</output>
    <output data-testid="file-count">{selectedFiles}</output>
    <section aria-label="Composer">
      <ChatInput {replyingTo} oncancelReply={() => replyingTo = null} onsend={send} onfileSelect={files => selectedFiles += files.length} />
    </section>
    <section aria-label="Message">
      <ChatMessage {message} isOwn onedit={data => { if (rejected) return false; edits = [...edits, data.message]; message = { ...message, message: data.message }; return true; }} />
    </section>
  {:else if surface === 'order'}
    <button type="button" onclick={() => orderId = 'order-a'}>Order A</button>
    <button type="button" onclick={() => orderId = 'order-b'}>Order B</button>
    <button type="button" onclick={switchAccount}>Switch account</button>
    <ChatContainer {orderId} />
  {:else}
    <button type="button" onclick={() => isChatOpen.set(true)}>Open chat drawer</button>
    {#if $isChatOpen}<ChatSidebar />{/if}
  {/if}
</main>

<style>
main { padding: 24px; display: grid; gap: 16px; }
main > button { justify-self: start; }
section { padding: 16px; border: 1px solid var(--border); }
</style>
