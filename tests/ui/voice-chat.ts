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

addMessages('en', en); addMessages('lv', lv); addMessages('ru', ru);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
await authState.load();
mount(VoiceChatHarness, { target: document.getElementById('app')! });
