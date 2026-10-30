import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import '../../src/lib/styles/a11y.css';
import '../../src/lib/styles/responsive.css';
import WorkflowDialogsHarness from './WorkflowDialogsHarness.svelte';
import { authState } from '$lib/auth/authState.svelte';
import { page } from './app-state';

const surface = page.url.searchParams.get('surface') === 'station' ? 'station' : 'inventory';
if (surface === 'station') {
  page.params = { station: 'CNC' };
  page.route.id = '/station/[station]';
}

addMessages('en', en);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
await authState.load();
mount(WorkflowDialogsHarness, { target: document.getElementById('app')!, props: { surface } });
