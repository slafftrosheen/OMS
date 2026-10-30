import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import ChatPage from '../../src/routes/toolkit/chat/+page.svelte';

addMessages('en', en);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
mount(ChatPage, { target: document.getElementById('app')! });
