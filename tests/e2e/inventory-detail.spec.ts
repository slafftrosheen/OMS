import { test, expect, type Page, type Route } from '@playwright/test';
import { detailFixtureIds, detailFixtureItems, detailFixtureUsers } from '../ui/inventory-detail-fixtures';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

type DetailResponder = (route: Route, id: string, call: number) => Promise<void>;
async function fixture(page: Page, detailResponder?: DetailResponder) {
  const posts: any[] = [];
  const detailReads: string[] = [];
  const unexpected: string[] = [];
  const writes: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/auth' && method === 'GET') {
      return route.fulfill({ json: { user: detailFixtureUsers.first } });
    }
    if (url.pathname === '/api/ai/assistant') {
      if (method === 'GET') return route.fulfill({ json: { tools: [{ id: 'catalog.search', label: 'Material catalog' }] } });
      if (method === 'POST') {
        posts.push(request.postDataJSON());
        return route.fulfill({ json: { reply: `Fixture response ${posts.length}: recorded context received.`, toolsUsed: [] } });
      }
    }
    const detail = url.pathname.match(/^\/api\/inventory\/items\/([^/]+)$/);
    if (detail && method === 'GET') {
      const id = decodeURIComponent(detail[1]);
      detailReads.push(id);
      const call = detailReads.filter(value => value === id).length;
      if (detailResponder) return detailResponder(route, id, call);
      const item = id === detailFixtureIds.first ? detailFixtureItems.first : detailFixtureItems.second;
      return route.fulfill({ json: item });
    }
    if (method !== 'GET') writes.push(`${method} ${url.pathname}`);
    unexpected.push(`${method} ${url.pathname}`);
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } });
  });
  await page.goto('/inventory-detail.html');
  await expect(page.getByRole('button', { name: 'Open assistant', exact: true })).toBeVisible();
  return { posts, detailReads, unexpected, writes };
}

async function openAssistant(page: Page) {
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Question for the assistant', exact: true })).toBeVisible();
}

async function ask(page: Page, question: string) {
  await page.getByRole('textbox', { name: 'Question for the assistant', exact: true }).fill(question);
  await page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.', exact: true }).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Question for the assistant', exact: true })).toBeEmpty();
  await expect(page.getByRole('log')).toContainText('recorded context received.');
}

test('real inventory facts and provenance accompany the current draft, and cancel removes the edited context', async ({ page }, testInfo) => {
  const observed = await fixture(page);
  await expect(page.getByRole('heading', { name: detailFixtureItems.first.name, exact: true })).toBeVisible();
  const details = page.getByRole('region', { name: 'Product details', exact: true });
  await expect(details.locator('.identity')).toHaveText('LED LINE · TEST-COB-24');
  await expect(details.getByRole('link', { name: 'Lemona source', exact: true }))
    .toHaveAttribute('href', detailFixtureItems.first.metadata.source_url);
  await expect(details.getByRole('link', { name: 'Manufacturer reference', exact: true }))
    .toHaveAttribute('href', detailFixtureItems.first.metadata.manufacturer_source_url);
  const visibleFacts = await details.locator('dl > div').evaluateAll(rows => rows.map(row => ({
    label: row.querySelector('dt')!.textContent!.trim(), value: row.querySelector('dd')!.textContent!.trim()
  })));
  expect(visibleFacts).toEqual(expect.arrayContaining([
    { label: 'Voltage', value: '24 V' }, { label: 'Power per metre', value: '10 W/m' },
    { label: 'LED type', value: 'COB' }, { label: 'Package contents', value: '5 m reel' },
    { label: 'Stock unit', value: 'roll' }
  ]));
  await details.screenshot({ path: testInfo.outputPath('inventory-product-details-desktop.png') });
  await page.getByRole('button', { name: 'Edit item', exact: true }).click();
  await openAssistant(page);
  // Edit after opening: a captured-on-open draft would send the old values.
  await page.getByRole('textbox', { name: 'Material name', exact: true }).fill('Pending customer LED name');
  await page.getByRole('textbox', { name: 'SKU', exact: true }).fill('PENDING-SKU');
  await page.getByRole('textbox', { name: 'Category', exact: true }).fill('Pending LED group');
  await page.getByRole('textbox', { name: 'Location', exact: true }).fill('Pending shelf C7');
  await ask(page, 'Check the current product and my pending changes.');
  expect(observed.posts).toHaveLength(1);
  const draft = observed.posts[0];
  expect(draft).toMatchObject({
    consent: true, history: [], screen: { path: `/inventory/${detailFixtureIds.first}`, data: {
      screen: 'inventory-detail', materialId: detailFixtureIds.first, loading: false, unavailable: false,
      material: { name: detailFixtureItems.first.name, sku: 'TEST-LED-REEL', stock: 6, unit: 'roll', location: 'Shelf A1' },
      unsaved: true, editor: { unsavedChanges: true, saving: false, fields: {
        name: 'Pending customer LED name', sku: 'PENDING-SKU', group: 'Pending LED group', location: 'Pending shelf C7'
      } },
      catalog: {
        brand: 'LED LINE', model: 'TEST-COB-24', sourceUrl: detailFixtureItems.first.metadata.source_url,
        manufacturerSourceUrl: detailFixtureItems.first.metadata.manufacturer_source_url,
        verifiedAt: '2026-10-30', dataNotes: detailFixtureItems.first.metadata.data_notes
      }
    } }
  });
  expect(draft.screen.data.specifications.rows).toEqual(visibleFacts);
  expect(JSON.stringify(draft)).not.toContain('TEST-PRIVATE-COST');
  expect(JSON.stringify(draft)).not.toContain('TEST-SECRET-MUST-NOT-LEAVE');

  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: detailFixtureItems.first.name, exact: true })).toBeVisible();
  await openAssistant(page);
  await ask(page, 'Check the product after canceling my edit.');
  const canceled = observed.posts[1].screen.data;
  expect(canceled).toMatchObject({ unsaved: false, editor: null, material: { name: detailFixtureItems.first.name, sku: 'TEST-LED-REEL', location: 'Shelf A1' } });
  expect(JSON.stringify(canceled)).not.toContain('Pending');
  expect(canceled.specifications.rows).toEqual(visibleFacts);
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Edit item', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Material name', exact: true })).toHaveValue(detailFixtureItems.first.name);
  await expect(page.getByRole('textbox', { name: 'SKU', exact: true })).toHaveValue('TEST-LED-REEL');
  await expect(page.getByRole('textbox', { name: 'Category', exact: true })).toHaveValue('LED strips');
  await expect(page.getByRole('textbox', { name: 'Location', exact: true })).toHaveValue('Shelf A1');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await details.scrollIntoViewIfNeeded();
  expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await details.screenshot({ path: testInfo.outputPath('inventory-product-details-phone.png') });
  expect(observed.writes).toEqual([]);
  expect(observed.unexpected).toEqual([]);
});

test('same-component material navigation clears stale context and rejects a late previous material response', async ({ page }) => {
  let pendingSecond: Route | undefined;
  const observed = await fixture(page, async (route, id) => {
    if (id === detailFixtureIds.second) { pendingSecond = route; return; }
    await route.fulfill({ json: detailFixtureItems.first });
  });
  await expect(page.getByRole('heading', { name: detailFixtureItems.first.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit item', exact: true }).click();
  await page.getByRole('textbox', { name: 'Material name', exact: true }).fill('Abandoned first material draft');
  await page.getByRole('button', { name: 'Show second material', exact: true }).click();
  await expect.poll(() => !!pendingSecond).toBe(true);
  await expect(page.getByText('Loading the saved material record…', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Product details', exact: true })).toHaveCount(0);
  await openAssistant(page);
  await ask(page, 'What material is available while this record loads?');
  expect(observed.posts[0]).toMatchObject({ history: [], screen: {
    path: `/inventory/${detailFixtureIds.second}`, data: {
      materialId: detailFixtureIds.second, loading: true, material: null, editor: null,
      catalog: null, unsaved: false, specifications: { rows: [] }
    }
  } });
  expect(JSON.stringify(observed.posts[0])).not.toContain('TEST-COB-24');
  expect(JSON.stringify(observed.posts[0])).not.toContain('Abandoned first material draft');

  await page.getByRole('button', { name: 'Show first material', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toHaveCount(0);
  await expect.poll(() => observed.detailReads.filter(id => id === detailFixtureIds.first).length).toBe(2);
  await expect(page.getByRole('heading', { name: detailFixtureItems.first.name, exact: true })).toBeVisible();
  await pendingSecond!.fulfill({ json: detailFixtureItems.second }).catch(() => { /* Navigation may already abort it. */ });
  await openAssistant(page);
  await ask(page, 'Read the current material after returning.');
  expect(observed.posts[1]).toMatchObject({ history: [], screen: {
    path: `/inventory/${detailFixtureIds.first}`, data: {
      loading: false, unavailable: false, material: { id: detailFixtureIds.first, name: detailFixtureItems.first.name },
      editor: null, catalog: { brand: 'LED LINE', model: 'TEST-COB-24' }, unsaved: false
    }
  } });
  expect(JSON.stringify(observed.posts[1])).not.toContain('HLG-120H-24A');
  await expect(page.getByRole('heading', { name: detailFixtureItems.second.name, exact: true })).toHaveCount(0);
  expect(observed.unexpected).toEqual([]);
});

test('account changes clear the prior draft, conversation and catalog before reloading the same material id', async ({ page }) => {
  let pendingAccount: Route | undefined;
  const observed = await fixture(page, async (route, _id, call) => {
    if (call > 1) { pendingAccount = route; return; }
    await route.fulfill({ json: detailFixtureItems.first });
  });
  await expect(page.getByRole('heading', { name: detailFixtureItems.first.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit item', exact: true }).click();
  await page.getByRole('textbox', { name: 'Material name', exact: true }).fill('Account one private draft');
  await page.getByPlaceholder('Note (optional)', { exact: true }).fill('Account one stock note');
  await openAssistant(page);
  await ask(page, 'First account conversation marker.');
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Switch account', exact: true }).click();
  await expect(page.getByTestId('detail-account')).toHaveText(detailFixtureUsers.second.id);
  await expect.poll(() => !!pendingAccount).toBe(true);
  await expect(page.getByText('Loading the saved material record…', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Product details', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Material name', exact: true })).toHaveCount(0);
  await openAssistant(page);
  await expect(page.getByRole('log')).not.toContainText('First account conversation marker.');
  await expect(page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.', exact: true })).not.toBeChecked();
  await ask(page, 'Read the new account while loading.');
  expect(observed.posts[1]).toMatchObject({ history: [], screen: { data: {
    materialId: detailFixtureIds.first, loading: true, canManage: false,
    material: null, editor: null, catalog: null, stockAdjustment: null, unsaved: false
  } } });
  expect(JSON.stringify(observed.posts[1])).not.toContain('Account one');
  expect(JSON.stringify(observed.posts[1])).not.toContain('TEST-COB-24');
  await pendingAccount!.fulfill({ json: detailFixtureItems.otherAccount });
  await expect(page.getByRole('heading', { name: detailFixtureItems.otherAccount.name, exact: true })).toBeVisible();
  await ask(page, 'Read the newly loaded account product.');
  expect(observed.posts[2]).toMatchObject({ screen: { data: {
    loading: false, unavailable: false, canManage: false, editor: null, stockAdjustment: null,
    material: { id: detailFixtureIds.first, name: detailFixtureItems.otherAccount.name, stock: 17, unit: 'PCS' },
    catalog: { brand: 'WAGO', model: '221-413', sourceUrl: detailFixtureItems.otherAccount.metadata.source_url }
  } } });
  expect(JSON.stringify(observed.posts[2])).not.toContain('First account conversation marker.');
  expect(JSON.stringify(observed.posts[2])).not.toContain('Account one');
  expect(JSON.stringify(observed.posts[2])).not.toContain('TEST-COB-24');
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit item', exact: true })).toBeDisabled();
  await expect(page.getByPlaceholder('Note (optional)', { exact: true })).toHaveCount(0);
  expect(observed.unexpected).toEqual([]);
});
