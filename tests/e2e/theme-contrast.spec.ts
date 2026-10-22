import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// These controls reproduce the shared legacy tokens used by profile fields.
// No authenticated app or database is needed to exercise the real CSS cascade.
const styles = [
  'static/brand.css',
  'src/app.css',
  'src/lib/styles/a11y.css',
  'src/lib/styles/responsive.css'
].map(path => readFileSync(path, 'utf8')).join('\n');

for (const systemTheme of ['light', 'dark'] as const) {
  for (const appTheme of ['LightVim', 'DarkVim', 'HighContrast']) {
    test(`${appTheme} controls stay readable with a ${systemTheme} system theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: systemTheme });
      await page.setContent(`
        <main>
          <label for="thickness">Thickness</label>
          <select id="thickness" style="color:var(--text-primary,var(--ink-primary));background:var(--bg-1)">
            <option value="3">3 mm — Acrylic</option>
          </select>
          <p id="secondary" style="color:var(--text-secondary,var(--ink-secondary))">Selected material</p>
          <div class="dark-mode-support">Material details</div>
          <p id="primary-reference" style="color:var(--text)">Primary</p>
          <p id="secondary-reference" style="color:var(--ink-secondary)">Secondary</p>
        </main>
      `);
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, appTheme);
      await page.addStyleTag({ content: styles });
      await expect.poll(() => page.evaluate(() => {
        const color = (id: string) => getComputedStyle(document.getElementById(id)!).color;
        return {
          primaryMatchesTheme: color('thickness') === color('primary-reference'),
          secondaryMatchesTheme: color('secondary') === color('secondary-reference'),
          nativeScheme: getComputedStyle(document.documentElement).colorScheme
        };
      })).toEqual({
        primaryMatchesTheme: true,
        secondaryMatchesTheme: true,
        nativeScheme: appTheme === 'LightVim' ? 'light' : 'dark'
      });
    });
  }
}
