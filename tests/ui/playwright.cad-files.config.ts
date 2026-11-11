import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['cad-files-regressions.spec.ts'],workers:1,timeout:60000});
