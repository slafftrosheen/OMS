import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import ru from '../../src/locales/ru.json';
import lv from '../../src/locales/lv.json';
import '../../src/app.css';
import '../../src/lib/styles/a11y.css';
import '../../src/lib/styles/responsive.css';
import AssistantHarness from './AssistantHarness.svelte';

addMessages('en', en);
addMessages('ru', ru);
addMessages('lv', lv);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
mount(AssistantHarness, { target: document.getElementById('app')! });
