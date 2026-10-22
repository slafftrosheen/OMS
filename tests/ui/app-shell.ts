import { mount } from 'svelte';
import { setupI18n } from '$lib/i18n';
import AppShellHarness from './AppShellHarness.svelte';

await setupI18n('en');
mount(AppShellHarness, { target: document.getElementById('app')! });
