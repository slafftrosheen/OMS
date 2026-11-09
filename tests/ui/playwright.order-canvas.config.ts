import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['canvas-media.spec.ts'],grep:/order form updates|native order canvas/});
