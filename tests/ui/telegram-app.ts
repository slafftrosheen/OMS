import {mount} from 'svelte';
import {setupI18n} from '$lib/i18n';
import Harness from './TelegramAppHarness.svelte';
await setupI18n('en');mount(Harness,{target:document.getElementById('app')!});
