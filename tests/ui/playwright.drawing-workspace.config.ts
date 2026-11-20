import base from './playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['drawing-workspace.spec.ts', 'drawing-corel-editing.spec.ts', 'drawing-guides-skew.spec.ts', 'drawing-pick-workflows.spec.ts', 'drawing-pen-freehand.spec.ts'] });
