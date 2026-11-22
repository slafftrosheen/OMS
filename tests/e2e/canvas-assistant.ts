import { expect, type Page } from '@playwright/test';

export async function openCanvasAssistant(page: Page) {
  if (!(await page.locator('#toolkit-prompt').isVisible())) {
    await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  }
  await expect(page.locator('#toolkit-prompt')).toBeVisible();
}

export async function closeCanvasAssistant(page: Page) {
  const close = page.getByRole('button', { name: 'Close assistant', exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.locator('#oms-assistant')).toBeHidden();
}
