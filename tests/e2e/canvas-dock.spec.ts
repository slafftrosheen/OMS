import { test, expect, type Page } from '@playwright/test';
import PDFDocument from 'pdfkit';

const boardId = '7bced6d4-2789-4f76-b8be-10e8b49317b7';
const assetId = 'c279e6ea-3829-41b4-8a72-0d189ea727e5';

async function fixturePdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4' });
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text('Production drawing: sign width 1200 mm, quantity 2.');
    doc.rect(70, 100, 250, 60).stroke();
    doc.end();
  });
}

async function mountContentBar(page: Page, options: { pdf?: Buffer; failAnalysisOnce?: boolean } = {}) {
  const board: any = {
    id: boardId, title: 'Canvas workspace', revision: 0,
    created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z',
    payload: { version: 1, snapshot: null }
  };
  const errors: string[] = [];
  const previews: string[] = [];
  const analyses: any[] = [];
  const uploaded = { id: assetId, fileName: 'sign-drawing.pdf', mime: 'application/pdf',
    bytes: options.pdf?.length ?? 1, url: `/api/toolkit/assets/${boardId}/${assetId}` };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (value: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(value), headers
    });
    if (path === '/api/toolkit/models') return reply({
      models: [{ id: 'fixture/text', label: 'Configured text', isDefault: true }], web: {},
      media: { visionModel: 'fixture/vision', pdfModel: 'fixture/text', paidOcr: false }
    });
    if (path === '/api/ai/canvas') return reply({ items: [board] });
    if (path === `/api/ai/canvas/${boardId}`) {
      if (request.method() === 'PATCH') { board.payload = request.postDataJSON().payload; board.revision++; }
      return reply({ canvas: board });
    }
    if (path === `/api/toolkit/conversations/${boardId}`) return reply({ messages: [], proposals: [], legacyThreads: {} });
    if (path === `/api/toolkit/assets/${boardId}/library`) return reply({ files: [] });
    if (path === `/api/toolkit/assets/${boardId}`) return request.method() === 'POST'
      ? reply(uploaded, 201) : reply({ ready: true });
    if (path === `/api/toolkit/assets/${boardId}/${assetId}` && options.pdf)
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: options.pdf });
    if (path === '/api/toolkit/link-preview') {
      const url = request.postDataJSON().url;
      previews.push(url);
      return reply({ url, title: 'Corrected reference', description: 'A retained link draft', siteName: 'Example' });
    }
    if (path === '/api/toolkit/analyze-asset') {
      const body = request.postDataJSON();
      analyses.push(body);
      if (options.failAnalysisOnce && analyses.length === 1) return reply({
        error: 'OpenRouter has no available provider.', source: 'openrouter', retryAfter: 2
      }, 503, { 'Retry-After': '2' });
      const visual = body.pdfMode === 'visual';
      return reply({ assetId, kind: 'pdf', fileName: uploaded.fileName,
        reply: visual ? 'The drawing contains a rectangular sign.' : 'The source text specifies width 1200 mm and quantity 2.',
        evidence: visual ? '' : 'Production drawing: sign width 1200 mm, quantity 2.',
        evidenceType: visual ? 'model-interpretation' : 'locally-extracted-text',
        model: visual ? 'fixture/vision' : 'fixture/text', engine: visual ? 'page-images' : 'local-text',
        analysisScope: visual ? 'page-images' : 'text-only' });
    }
    return reply({ error: `Unmocked request ${path}` }, 404);
  });
  await page.goto('/canvas-media.html');
  await expect(page.getByTestId('canvas-content-bar').getByRole('button', { name: 'Insert', exact: true }))
    .toBeEnabled({ timeout: 45_000 });
  const shapes = () => Object.values(board.payload.snapshot?.document?.store ?? {})
    .filter((record: any) => record.typeName === 'shape') as any[];
  return { board, shapes, errors, previews, analyses };
}

test('content insertion is distinct from drawing controls and remains keyboard usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const { shapes, previews, errors } = await mountContentBar(page);
  const bar = page.getByTestId('canvas-content-bar');
  const insert = bar.getByRole('button', { name: 'Insert', exact: true });
  await expect(bar.getByRole('button', { name: /Freehand drawing|Undo|Rectangle|Zoom/ })).toHaveCount(0);
  await insert.focus();
  await insert.press('End');
  await expect(bar.getByRole('button', { name: 'Assistant', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(insert).toBeFocused();
  await insert.press('ArrowDown');
  const panel = page.getByRole('dialog', { name: 'Insert', exact: true });
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(insert).toBeFocused();
  await insert.click();
  const input = panel.getByLabel('Website or media link');
  await input.fill('http://localhost/reference');
  await panel.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText('Enter a public HTTP or HTTPS website or media link.');
  await expect(input).toHaveValue('http://localhost/reference');
  expect(previews).toEqual([]);
  await panel.getByRole('button', { name: 'Close tools', exact: true }).click();
  await insert.click();
  await expect(input).toHaveValue('http://localhost/reference');
  await input.fill('https://example.com/corrected');
  await panel.getByRole('button', { name: 'Add link', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => shapes().some(shape => shape.type === 'document' && shape.props.url === 'https://example.com/corrected')).toBe(true);
  await insert.click();
  await panel.getByRole('button', { name: 'Note', exact: true }).click();
  await expect.poll(() => shapes().some(shape => shape.type === 'idea' && shape.props.kind === 'note')).toBe(true);
  for (const [locale, label] of [['ru', 'Содержимое и автоматизация холста'], ['lv', 'Audekla saturs un automatizācija']]) {
    await page.getByLabel('Language', { exact: true }).selectOption(locale);
    await expect(page.getByRole('toolbar', { name: label, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('PDF analysis respects provider backoff, sends the selected mode and preserves its evidence scope', async ({ page }) => {
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1500, height: 1100 });
  const pdf = await fixturePdf();
  const { analyses, shapes, errors } = await mountContentBar(page, { pdf, failAnalysisOnce: true });
  await page.getByRole('button', { name: 'Hide assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByLabel('Choose images, PDFs, video or audio').setInputFiles({
    name: 'sign-drawing.pdf', mimeType: 'application/pdf', buffer: pdf
  });
  await page.locator('.tl-shape').getByText('sign-drawing.pdf', { exact: true }).click();
  await page.getByTestId('canvas-content-bar').getByRole('button', { name: 'Ask about selection', exact: true }).click();
  await page.locator('.assistant-options > summary').click();
  const mode = page.getByLabel('Read PDF as', { exact: true });
  await expect(mode).toHaveValue('auto');
  await page.getByRole('button', { name: 'Analyze selected image / PDF', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Waiting to retry · see message', exact: true })).toBeDisabled();
  await expect(page.getByText(/OpenRouter has no available provider.*2 seconds/)).toBeVisible();
  expect(analyses).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Analyze selected image / PDF', exact: true })).toBeEnabled({ timeout: 7000 });
  expect(analyses).toHaveLength(1); // Backoff never automatically resubmits a private file.
  await mode.selectOption('visual');
  await page.getByRole('button', { name: 'Analyze selected image / PDF', exact: true }).click();
  await expect.poll(() => analyses.length).toBe(2);
  expect(analyses[1]).toMatchObject({ pdfMode: 'visual', model: 'fixture/text', ocr: false });
  await expect(page.getByRole('log').getByText(/Page-image analysis/)).toBeVisible();
  await mode.selectOption('text');
  await page.getByRole('button', { name: 'Analyze selected image / PDF', exact: true }).click();
  await expect.poll(() => analyses.length).toBe(3);
  expect(analyses[2].pdfMode).toBe('text');
  await expect(page.getByRole('log').getByText(/Text-only analysis.*Graphics and page layout/s)).toBeVisible();
  await page.getByRole('button', { name: 'Add findings to shared Canvas', exact: true }).click();
  await expect.poll(() => shapes().some(shape => shape.type === 'idea' &&
    shape.props.body.includes('Text-only analysis') && shape.props.body.includes('EXTRACTED PDF SOURCE TEXT'))).toBe(true);
  expect(errors).toEqual([]);
});
