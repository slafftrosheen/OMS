import { mount } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import '../../src/lib/styles/a11y.css';
import '../../src/lib/styles/responsive.css';
import { authState } from '$lib/auth/authState.svelte';
import { page } from './app-state';
import { detailFixtureIds } from './inventory-detail-fixtures';
import InventoryDetailHarness from './InventoryDetailHarness.svelte';

page.params = { id: detailFixtureIds.first };
page.url = new URL(`/inventory/${detailFixtureIds.first}`, window.location.origin);
page.route.id = '/inventory/[id]';
addMessages('en', en);
await init({ fallbackLocale: 'en', initialLocale: 'en' });
await authState.load();
mount(InventoryDetailHarness, { target: document.getElementById('app')! });
