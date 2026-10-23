import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import '../../src/lib/styles/a11y.css';
import UiSupportHarness from './UiSupportHarness.svelte';
addMessages('en', en);
await init({fallbackLocale:'en',initialLocale:'en'});
mount(UiSupportHarness, {target:document.getElementById('app')!});
