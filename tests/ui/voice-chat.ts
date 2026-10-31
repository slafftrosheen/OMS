import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import lv from '../../src/locales/lv.json';
import ru from '../../src/locales/ru.json';
import '../../src/app.css';
import '../../src/lib/styles/a11y.css';
import '../../src/lib/styles/responsive.css';
import { authState } from '$lib/auth/authState.svelte';
import VoiceChatHarness from './VoiceChatHarness.svelte';
import { env } from './env-public';
import { supabase } from '$lib/supabase-client';

if (new URLSearchParams(location.search).has('realtime')) {
  Object.assign(env, { PUBLIC_SUPABASE_URL: 'https://fixture.invalid', PUBLIC_SUPABASE_ANON_KEY: 'fixture-only' });
  const channels = new Set<any>();
  supabase.channel = (() => {
    const callbacks: Array<(payload: any) => void> = [];
    const channel = { on(_event: string, _filter: unknown, callback: (payload: any) => void) { callbacks.push(callback); return channel; },
      subscribe(callback?: (status: string) => void) { channels.add(channel); callback?.('SUBSCRIBED'); return channel; },
      emit(payload: unknown) { for (const callback of callbacks) callback(payload); } };
    return channel;
  }) as any;
  supabase.removeChannel = (async channel => { channels.delete(channel); return 'ok'; }) as any;
  (window as any).__voiceRealtime = { emit: (payload: unknown) => { for (const channel of channels) channel.emit(payload); } };
}

addMessages('en', en); addMessages('lv', lv); addMessages('ru', ru);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
await authState.load();
mount(VoiceChatHarness, { target: document.getElementById('app')! });
