import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['browser-order-flow.spec.ts'], workers:1,
  projects: [{name:'chromium',use:{browserName:'chromium'}},{name:'firefox',use:{browserName:'firefox',launchOptions:{}}}]
});
