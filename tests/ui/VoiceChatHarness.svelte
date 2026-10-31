<script lang="ts">
  import { onMount } from 'svelte';
  import { locale } from 'svelte-i18n';
  import { currentUser } from '$lib/auth/authState.svelte';
  import { isChatOpen, loadMessages, loadRooms, messages, resetChatState, sendVoiceMessage } from '$lib/chat/chat-store';
  import VoiceRecorder from '$lib/chat/VoiceRecorder.svelte';
  import ChatAttachments from '$lib/chat/ChatAttachments.svelte';
  import ChatContainer from '$lib/components/chat/ChatContainer.svelte';
  import ChatPane from '$lib/ui/ChatPane.svelte';
  import ChatPopover from '$lib/topbar/ChatPopover.svelte';
  import ChatSidebar from '$lib/chat/ChatSidebar.svelte';
  import ChatPage from '../../src/routes/chat/+page.svelte';

  const surface = new URLSearchParams(location.search).get('surface') || 'recorder';
  let room = $state('general');
  let order = $state('order-a');
  let mounted = $state(true);
  function setRoom(value: string) { room = value; void loadMessages(room); }
  function setAccount(id: string) {
    resetChatState();
    currentUser.set({ id, username: id === 'account-a' ? 'Ann' : 'Bob', displayName: id === 'account-a' ? 'Ann' : 'Bob', role: 'RD', stations: [] });
    void loadRooms();
  }
  onMount(() => {
    void loadRooms();
    if (surface !== 'order') void loadMessages(room);
    (window as any).__voiceFixture = {
      setRoom, setAccount,
      setOrder: (value: string) => order = value,
      setMounted: (value: boolean) => mounted = value,
      setLocale: (value: string) => locale.set(value),
      setTheme: (value: string) => document.documentElement.dataset.theme = value,
      expire: () => messages.update(rows => rows.map(message => ({ ...message, attachments: message.attachments?.map(attachment =>
        typeof attachment === 'object' && attachment.kind === 'voice' ? { ...attachment, expiresAt: new Date(Date.now() - 1).toISOString() } : attachment) }))),
      refreshOrder: () => document.dispatchEvent(new Event('visibilitychange'))
    };
    return () => { delete (window as any).__voiceFixture; resetChatState(); };
  });
</script>

<header class="fixture-controls" aria-label="Voice chat fixture controls">
  <button type="button" onclick={() => setRoom(room === 'general' ? 'other' : 'general')}>Switch fixture room</button>
  <button type="button" onclick={() => setAccount('account-b')}>Switch fixture account</button>
  <button type="button" onclick={() => order = order === 'order-a' ? 'order-b' : 'order-a'}>Switch fixture order</button>
  <button type="button" onclick={() => mounted = !mounted}>Toggle fixture surface</button>
  <label>Fixture language<select onchange={event => locale.set(event.currentTarget.value)}><option value="en">English</option><option value="lv">Latviešu</option><option value="ru">Русский</option></select></label>
  <label>Fixture theme<select onchange={event => document.documentElement.dataset.theme = event.currentTarget.value}><option value="LightVim">Light</option><option value="DarkVim">Dark</option><option value="HighContrastVim">High contrast</option></select></label>
</header>
<main class:full-chat={surface === 'page'}>
  {#if mounted}
    {#if surface === 'order'}<ChatContainer orderId={order} />
    {:else if surface === 'pane'}<ChatPane />
    {:else if surface === 'popover'}<div class="popover-anchor"><ChatPopover /></div>
    {:else if surface === 'sidebar'}<button type="button" onclick={() => isChatOpen.set(true)}>Open chat drawer</button>{#if $isChatOpen}<ChatSidebar />{/if}
    {:else if surface === 'page'}<ChatPage />
    {:else}
      <h1>Voice conversation</h1>
      <output data-testid="conversation-owner">{$currentUser?.id}:{room}</output>
      <section aria-label="Conversation messages">
        {#each $messages.filter(message => message.roomId === room) as message (message.id)}
          <article data-testid="room-message"><p>{message.text}</p><ChatAttachments attachments={message.attachments} contextKey={`${$currentUser?.id}:${room}`} /></article>
        {/each}
      </section>
      <VoiceRecorder contextKey={`${$currentUser?.id ?? ''}:${$currentUser?.role ?? ''}:${room}`} disabled={!$currentUser}
        onSend={(draft, signal) => sendVoiceMessage(room, draft, signal)} />
    {/if}
  {/if}
</main>

<style>
  :global(html) { --topbar-h: 0px; --bottombar-h: 0px; }
  .fixture-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; min-width: 0; }
  .fixture-controls button, .fixture-controls select, main > button { min-height: 40px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-1); color: var(--ink-primary); font: inherit; }
  .fixture-controls label { display: grid; gap: 4px; color: var(--ink-secondary); }
  main { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); min-width: 0; max-width: 960px; padding: 16px; margin: auto; box-sizing: border-box; }
  main.full-chat { max-width: none; padding: 0; }
  .popover-anchor { display: flex; justify-content: flex-end; }
  article { padding: 12px; border: 1px solid var(--border); margin-bottom: 12px; min-width: 0; }
  section { min-width: 0; }
  h1 { font-size: var(--text-xl); margin: 0; }
  p { margin: 0 0 8px; overflow-wrap: anywhere; }
</style>
