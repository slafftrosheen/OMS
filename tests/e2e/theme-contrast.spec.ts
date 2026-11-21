import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// These controls reproduce the shared legacy tokens used by profile fields.
// No authenticated app or database is needed to exercise the real CSS cascade.
const styles = [
  'static/brand.css',
  'static/fabriek.css',
  'static/fabriek-components.css',
  'static/fabriek-screens.css',
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

const appearanceCases = [
  { name: 'Paper', theme: 'ByPlace', place: 'office', scheme: 'light' },
  { name: 'Night Shift', theme: 'ByPlace', place: 'floor', scheme: 'dark' },
  { name: 'High contrast', theme: 'HighContrastVim', place: 'floor', scheme: 'dark' }
] as const;

for (const appearance of appearanceCases) {
  test(`${appearance.name} pairs action labels with readable default and hover fills`, async ({ page }) => {
    await page.setContent(`
      <main>
        <button class="submit-btn">Sign in</button>
        <button class="btn btn-danger">Block</button>
      </main>
    `);
    await page.evaluate(({ theme, place }) => Object.assign(document.documentElement.dataset, { theme, place }), appearance);
    await page.addStyleTag({ content: styles });

    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(appearance.scheme);
    const contrast = (button: Element) => {
      const style = getComputedStyle(button);
      const luminance = (color: string) => {
        const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
        const linear = channels.map(value => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    };

    const signIn = page.getByRole('button', { name: 'Sign in' });
    expect(await signIn.evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
    await signIn.hover();
    await expect.poll(() => signIn.evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
    const block = page.getByRole('button', { name: 'Block' });
    await block.hover();
    await expect.poll(() => block.evaluate(contrast)).toBeGreaterThanOrEqual(4.5);
  });
}
