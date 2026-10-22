import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import OrderCanvasBridgeHarness from './OrderCanvasBridgeHarness.svelte';

addMessages('en', en);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
mount(OrderCanvasBridgeHarness, { target: document.getElementById('app')! });
