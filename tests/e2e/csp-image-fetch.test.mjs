import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import config from '../../svelte.config.js';

test('the production CSP permits canvas code to read an embedded PNG', async () => {
  const sources = config.kit.csp.directives['connect-src'];
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': `connect-src ${sources.join(' ')}` });
    response.end('<!doctype html><html><body>Canvas image policy check</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.OMS_QA_CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.OMS_QA_CHROMIUM_EXECUTABLE
    } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const image = await page.evaluate(async () => {
      const response = await fetch('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
      const blob = await response.blob();
      return { type: blob.type, bytes: blob.size };
    });
    assert.equal(image.type, 'image/png');
    assert.ok(image.bytes > 0);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
