import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '../e2e',
  testMatch: ['profile-materials.spec.ts', 'theme-contrast.spec.ts', 'calendar-telegram.spec.ts', 'canvas-media.spec.ts', 'canvas-batch.spec.ts', 'canvas-dock.spec.ts', 'canvas-lifecycle.spec.ts', 'app-badges.spec.ts', 'telegram-admin.spec.ts', 'app-shell.spec.ts'],
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: process.env.OMS_QA_CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.OMS_QA_CHROMIUM_EXECUTABLE,
      args: JSON.parse(process.env.OMS_QA_CHROMIUM_ARGS || '[]')
    } : undefined
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config tests/ui/vite.config.ts',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: 'http://127.0.0.1:4175',
    timeout: 60000,
    reuseExistingServer: false
  }
});
