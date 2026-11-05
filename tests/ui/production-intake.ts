import {mount} from 'svelte';
import {addMessages,init} from 'svelte-i18n';
import en from '../../src/locales/en.json';
import '../../src/app.css';
import Harness from './ProductionIntakeHarness.svelte';
addMessages('en',en);
await init({fallbackLocale:'en',initialLocale:'en'});
mount(Harness,{target:document.getElementById('app')!});
