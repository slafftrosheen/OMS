// tests/a11y/contrast-check.ts
// Checks WCAG AA contrast ratios (4.5:1 text, 3:1 UI components) for all three
// OMS themes by evaluating computed CSS custom properties in a real browser.
// Run against the preview server: npm run build && npm run preview && npm run test:contrast
import { chromium, type Browser, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const THEMES = ['LightVim', 'DarkVim', 'HighContrastVim'] as const;

// Token pairs to check: [foreground-token, background-token, context, large-text?]
const PAIRS: [string, string, string, boolean?][] = [
  ['--ink-primary',   '--bg-0',        'body text'],
  ['--ink-secondary', '--bg-0',        'secondary text'],
  ['--ink-secondary', '--bg-1',        'secondary text on card'],
  ['--ink-primary',   '--bg-1',        'body text on card'],
  ['--brand',         '--bg-0',        'brand on background', true],
  ['--ok',            '--bg-0',        'ok status', true],
  ['--warn',          '--bg-0',        'warn status', true],
  ['--error',         '--bg-0',        'error status', true],
  ['--ink-primary',   '--brand-soft',  'text on brand-soft'],
  ['--bg-0',          '--brand',       'text on brand button'],
];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function getComputedColor(page: Page, token: string): Promise<[number, number, number] | null> {
  return page.evaluate((tok) => {
    const el = document.createElement('div');
    el.style.color = `var(${tok})`;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    return m ? [+m[1], +m[2], +m[3]] as [number, number, number] : null;
  }, token);
}

async function runContrastChecks() {
  console.log('🎨 WCAG contrast check — all three OMS themes\n');

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  const report: any[] = [];
  let failures = 0;

  for (const theme of THEMES) {
    console.log(`\n── Theme: ${theme} ──`);
    await page.goto('http://localhost:4173');
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(100);

    for (const [fg, bg, context, isLarge] of PAIRS) {
      const fgRgb = await getComputedColor(page, fg);
      const bgRgb = await getComputedColor(page, bg);

      if (!fgRgb || !bgRgb) {
        console.log(`  ⚠️  Could not resolve ${fg} or ${bg}`);
        continue;
      }

      const fgL = relativeLuminance(...fgRgb);
      const bgL = relativeLuminance(...bgRgb);
      const ratio = contrastRatio(fgL, bgL);
      const threshold = isLarge ? 3 : 4.5;
      const pass = ratio >= threshold;

      const icon = pass ? '✅' : '❌';
      console.log(`  ${icon} ${context}: ${ratio.toFixed(2)}:1 (need ${threshold}:1)`);

      if (!pass) failures++;

      report.push({ theme, fg, bg, context, ratio: +ratio.toFixed(2), threshold, pass });
    }
  }

  await browser.close();

  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'contrast-report.json'), JSON.stringify(report, null, 2));

  const passing = report.filter(r => r.pass).length;
  console.log(`\n📊 ${passing}/${report.length} pairs pass WCAG AA`);
  console.log('📄 Full report: test-results/contrast-report.json');

  if (failures > 0) {
    console.error(`\n❌ ${failures} contrast failures`);
    process.exit(1);
  }

  console.log('\n✅ All contrast checks pass');
}

runContrastChecks().catch((err) => {
  console.error('Contrast check failed:', err);
  process.exit(1);
});
