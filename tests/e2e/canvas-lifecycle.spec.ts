import { test, expect, type Page } from '@playwright/test';

const A = '757c36ea-f6c9-4803-bbf1-339aebcc61b4';
const B = 'da794537-9568-46ce-84dd-7f0ad7a150ad';
const C = 'e046bdeb-eb2b-493c-b020-f3c0b02ece43';
const COPY = '96b2c681-eeec-4eb8-a5a7-a177fb3e34d4';
type Json = Record<string, any>;
type Write = { id: string; body: Json };
type Reply = { status: number; body: Json };
type Hooks = {
  beforeRead?: (id: string) => Promise<void>;
  patch?: (write: Write) => Promise<Reply | void>;
  privateWrite?: (write: Write) => Promise<Reply | void>;
  beforeRecover?: (write: Write) => Promise<void>;
  brainstorm?: (body: Json) => Promise<Json>;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

/** Keep network timing under test control while mounting the real Canvas page
 * and native editor. No provider, database or fixture-only page methods run. */
async function mountCanvas(page: Page, hooks: Hooks = {}, initialMessages: Json[] = []) {
  const boards = new Map<string, Json>([
    [A, 'Project A'], [B, 'Project B'], [C, 'Project C']
  ].map(([id, title]) => [id, {
    id, title, revision: 4, created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z',
    payload: { version: 1, snapshot: null }
  }]));
  const discussions = new Map<string, Json>([
    [A, { messages: initialMessages, proposals: [], legacyThreads: {} }],
    [B, { messages: [], proposals: [], legacyThreads: {} }],
    [C, { messages: [], proposals: [], legacyThreads: {} }]
  ]);
  const reads: string[] = [], patches: Write[] = [], privateWrites: Write[] = [], recoveries: Write[] = [];
  const questions: Json[] = [], failedRequests: string[] = [], errors: string[] = [], unexpected: string[] = [];
  let patchInFlight = 0, maxPatchInFlight = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(new URL(request.url()).pathname));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const method = request.method();
    const reply = (body: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body)
    });
    if (path === '/api/toolkit/models') return reply({ models: [{ id: 'openrouter/free', label: 'Free router', isDefault: true }], web: {}, media: {} });
    if (path === '/api/ai/canvas' && method === 'GET') return reply({ items: [...boards.values()] });
    const recovery = path.match(/^\/api\/ai\/canvas\/([^/]+)\/recover$/);
    if (recovery && method === 'POST') {
      const write = { id: recovery[1], body: request.postDataJSON() };
      recoveries.push(write);
      await hooks.beforeRecover?.(write);
      const copy = { ...boards.get(write.id), id: COPY, title: write.body.title, payload: write.body.payload, revision: 0 };
      boards.set(COPY, copy);
      return reply({ canvas: copy, copiedAssets: 0 }, 201);
    }
    const document = path.match(/^\/api\/ai\/canvas\/([^/]+)$/);
    if (document) {
      const id = document[1], board = boards.get(id);
      if (!board) return reply({ error: 'Unknown project' }, 404);
      if (method === 'GET') {
        if (!url.searchParams.has('meta')) {
          reads.push(id);
          await hooks.beforeRead?.(id);
        }
        return reply({ canvas: board });
      }
      if (method === 'PATCH') {
        const write = { id, body: request.postDataJSON() };
        patches.push(write);
        maxPatchInFlight = Math.max(maxPatchInFlight, ++patchInFlight);
        try {
          const override = await hooks.patch?.(write);
          if (override) return await reply(override.body, override.status);
          if (write.body.revision !== board.revision) return await reply({ error: 'Revision conflict' }, 409);
          board.title = write.body.title; board.payload = write.body.payload; board.revision++;
          return await reply({ canvas: board });
        } finally { patchInFlight--; }
      }
    }
    const conversation = path.match(/^\/api\/toolkit\/conversations\/([^/]+)$/);
    if (conversation) {
      const id = conversation[1];
      if (method === 'PUT') {
        const write = { id, body: request.postDataJSON() };
        privateWrites.push(write);
        const override = await hooks.privateWrite?.(write);
        if (override) return reply(override.body, override.status);
        discussions.set(id, { ...write.body, legacyThreads: {} });
      }
      return reply(discussions.get(id) ?? { messages: [], proposals: [], legacyThreads: {} });
    }
    if (/^\/api\/toolkit\/assets\/[^/]+\/library$/.test(path)) return reply({ files: [] });
    if (path === '/api/toolkit/brainstorm') {
      const body = request.postDataJSON();
      questions.push(body);
      const answer = await hooks.brainstorm?.(body) ?? { reply: 'Fixture answer', cards: [], actions: [] };
      return reply(answer);
    }
    unexpected.push(`${method} ${path}`);
    return reply({ error: `Unmocked ${method} ${path}` }, 404);
  });
  await page.goto('/canvas-media.html');
  await expect(page.getByTestId('canvas-dock')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Select / move', exact: true })).toBeEnabled({ timeout: 45_000 });
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue('Project A');
  return {
    boards, discussions, reads, patches, privateWrites, recoveries, questions, failedRequests,
    get maxPatchInFlight() { return maxPatchInFlight; },
    assertClean() { expect(errors).toEqual([]); expect(unexpected).toEqual([]); }
  };
}

const title = (page: Page) => page.getByLabel('Project title', { exact: true });
const project = (page: Page, name: string) => page.locator('.project-open').filter({ has: page.getByText(name, { exact: true }) });
async function ask(page: Page, question: string) {
  await page.locator('#toolkit-prompt').fill(question);
  await page.locator('#toolkit-prompt').press('Enter');
}
async function saveConflict(page: Page, value: string) {
  await title(page).fill(value);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.workspace-alert').getByRole('button', { name: 'Save a copy', exact: true })).toBeVisible();
}

test('rapid project changes abort old AI and board loads without leaking private history', async ({ page }) => {
  test.setTimeout(120_000);
  const oldAnswer = deferred(), delayedB = deferred();
  const answerReleased = deferred(), bReleased = deferred();
  const question = 'Question only for project A', obsolete = 'Obsolete answer from project A';
  const fixture = await mountCanvas(page, {
    async beforeRead(id) { if (id === B) { await delayedB.promise; bReleased.resolve(); } },
    async brainstorm() { await oldAnswer.promise; answerReleased.resolve(); return { reply: obsolete, cards: [], actions: [] }; }
  });
  try {
    await ask(page, question);
    await expect.poll(() => fixture.questions.length).toBe(1);
    await project(page, 'Project B').click();
    await expect.poll(() => fixture.reads.includes(B)).toBe(true);
    await project(page, 'Project C').click();
    await expect(title(page)).toHaveValue('Project C');
    await expect(page.locator('#toolkit-prompt')).toBeEnabled();
    delayedB.resolve();
    await bReleased.promise;
    await expect(title(page)).toHaveValue('Project C');

    // Returning to the same ID must not make the abandoned request current.
    await project(page, 'Project A').click();
    await expect(title(page)).toHaveValue('Project A');
    await expect(page.locator('#toolkit-prompt')).toBeEnabled();
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    oldAnswer.resolve();
    await answerReleased.promise;
    await expect.poll(() => fixture.failedRequests.includes('/api/toolkit/brainstorm')).toBe(true);
    await expect(page.getByText(obsolete, { exact: true })).toHaveCount(0);
    expect(fixture.discussions.get(A)?.messages).toEqual([{ role: 'user', content: question }]);
    expect(fixture.discussions.get(B)?.messages).toEqual([]);
    expect(fixture.discussions.get(C)?.messages).toEqual([]);
    expect(fixture.privateWrites.some(write => JSON.stringify(write.body).includes(obsolete))).toBe(false);
    expect(fixture.questions[0].boardId).toBe(A);
    fixture.assertClean();
  } finally { oldAnswer.resolve(); delayedB.resolve(); }
});

test('navigation shares an in-flight save and drains newer edits with the next revision', async ({ page }) => {
  test.setTimeout(120_000);
  const firstSave = deferred();
  let attempts = 0;
  const fixture = await mountCanvas(page, {
    async patch() { if (++attempts === 1) await firstSave.promise; }
  });
  try {
    await title(page).fill('First title');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fixture.patches.length).toBe(1);
    await title(page).fill('Latest title');
    // Switching calls flush again while the explicit Save is pending. Both
    // callers must wait for the new edit rather than issuing revision 4 twice.
    await project(page, 'Project B').click();
    await expect(title(page)).toHaveValue('Latest title');
    expect(fixture.reads).toEqual([A]);
    firstSave.resolve();
    await expect(title(page)).toHaveValue('Project B');
    await expect(page.locator('#toolkit-prompt')).toBeEnabled();
    expect(fixture.patches.map(write => ({ id: write.id, revision: write.body.revision, title: write.body.title })))
      .toEqual([{ id: A, revision: 4, title: 'First title' }, { id: A, revision: 5, title: 'Latest title' }]);
    expect(fixture.maxPatchInFlight).toBe(1);
    expect(fixture.boards.get(A)).toMatchObject({ title: 'Latest title', revision: 6 });
    expect(fixture.patches.every(write => write.body.payload.snapshot.document.store)).toBe(true);
    await expect(page.locator('.workspace-alert')).toHaveCount(0);
    fixture.assertClean();
  } finally { firstSave.resolve(); }
});

test('choosing the current project cancels a pending switch while its save finishes', async ({ page }) => {
  test.setTimeout(120_000);
  const pendingSave = deferred();
  const fixture = await mountCanvas(page, {
    async patch() { await pendingSave.promise; }
  });
  try {
    await title(page).fill('Stay with these edits');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fixture.patches.length).toBe(1);
    await project(page, 'Project B').click();
    // A is still visible while B waits for its save. Choosing A is a new
    // navigation intent even though no editor reload is needed for that ID.
    await project(page, 'Project A').click();
    pendingSave.resolve();
    await expect(page.locator('.save-indicator')).toContainText('Saved');
    await expect(title(page)).toHaveValue('Stay with these edits');
    await expect(project(page, 'Stay with these edits')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#toolkit-prompt')).toBeEnabled();
    expect(fixture.reads).toEqual([A]);
    expect(fixture.patches).toHaveLength(1);
    expect(fixture.boards.get(A)).toMatchObject({ title: 'Stay with these edits', revision: 5 });
    fixture.assertClean();
  } finally { pendingSave.resolve(); }
});

test('a failed private recovery copy retries the existing copied project', async ({ page }) => {
  test.setTimeout(120_000);
  const history = [{ role: 'user', content: 'Keep this project discussion' }, { role: 'assistant', content: 'Saved private context' }];
  let privateCopyAttempts = 0;
  const fixture = await mountCanvas(page, {
    async patch() { return { status: 409, body: { error: 'Newer shared version' } }; },
    async privateWrite(write) {
      if (write.id === COPY && ++privateCopyAttempts === 1) return { status: 503, body: { error: 'Temporary private storage failure' } };
    }
  }, history);
  await saveConflict(page, 'Unsaved A');
  await page.locator('.workspace-alert').getByRole('button', { name: 'Save a copy', exact: true }).click();
  const retry = page.locator('.private-banner').getByRole('button', { name: 'Save a copy', exact: true });
  await expect(retry).toBeEnabled();
  await expect(title(page)).toHaveValue('Unsaved A');
  expect(fixture.recoveries).toHaveLength(1);
  expect(fixture.reads.includes(COPY)).toBe(false);
  await retry.click();
  await expect(title(page)).toHaveValue('Unsaved A — recovered copy');
  await expect(page.locator('#toolkit-prompt')).toBeEnabled();
  await expect(page.getByText('Saved private context', { exact: true })).toBeVisible();
  await expect(page.locator('.private-banner')).toHaveCount(0);
  expect(fixture.recoveries).toHaveLength(1);
  expect(fixture.recoveries[0].id).toBe(A);
  expect(fixture.recoveries[0].body.payload.snapshot.document.store).toBeTruthy();
  const copies = fixture.privateWrites.filter(write => write.id === COPY);
  expect(copies).toHaveLength(2);
  expect(copies[0].body).toEqual(copies[1].body);
  expect(fixture.discussions.get(COPY)?.messages).toEqual(history);
  expect(fixture.boards.get(A)?.title).toBe('Project A');
  fixture.assertClean();
});

test('a title edit made during recovery remains on the source project with a notice', async ({ page }) => {
  test.setTimeout(120_000);
  const recovery = deferred();
  const fixture = await mountCanvas(page, {
    async patch() { return { status: 409, body: { error: 'Newer shared version' } }; },
    async beforeRecover() { await recovery.promise; }
  });
  try {
    await saveConflict(page, 'Captured before recovery');
    await page.locator('.workspace-alert').getByRole('button', { name: 'Save a copy', exact: true }).click();
    await expect.poll(() => fixture.recoveries.length).toBe(1);
    await title(page).fill('Newer original title');
    recovery.resolve();
    await expect(page.locator('.canvas-notice')).toHaveText('Recovery copy saved. Newer edits remain in this project.');
    await expect(title(page)).toHaveValue('Newer original title');
    await expect(project(page, 'Project A')).toHaveAttribute('aria-current', 'true');
    await expect(project(page, 'Captured before recovery — recovered copy')).toBeVisible();
    expect(fixture.recoveries[0].body.title).toBe('Captured before recovery — recovered copy');
    expect(fixture.reads.includes(COPY)).toBe(false);
    expect(fixture.boards.get(COPY)?.title).toBe('Captured before recovery — recovered copy');
    expect(fixture.patches).toHaveLength(1);
    expect(fixture.boards.get(A)?.title).toBe('Project A');
    fixture.assertClean();
  } finally { recovery.resolve(); }
});

test('canceling navigation preserves dirty edits; leaving aborts AI and clears pending saves', async ({ page }) => {
  test.setTimeout(120_000);
  const answer = deferred(), answerReleased = deferred();
  const fixture = await mountCanvas(page, {
    async brainstorm() { await answer.promise; answerReleased.resolve(); return { reply: 'Late answer after closing', cards: [], actions: [] }; }
  });
  try {
    await ask(page, 'Keep working until I leave');
    await expect.poll(() => fixture.questions.length).toBe(1);
    // Freeze the debounce timers so only explicit navigation controls this case.
    // The real editor has already mounted before installing the test clock.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await title(page).fill('Unsaved title stays here');
    const leave = page.getByRole('button', { name: 'Leave canvas', exact: true });
    page.once('dialog', dialog => { expect(dialog.type()).toBe('confirm'); void dialog.dismiss(); });
    await leave.click();
    await expect(title(page)).toHaveValue('Unsaved title stays here');
    await expect(page.getByTestId('canvas-dock')).toBeVisible();
    await expect(page.getByText('Keep working until I leave', { exact: true })).toBeVisible();

    page.once('dialog', dialog => { expect(dialog.type()).toBe('confirm'); void dialog.accept(); });
    await leave.click();
    await expect(page.getByText('Canvas closed', { exact: true })).toBeVisible();
    await expect(title(page)).toHaveCount(0);
    await expect(page.getByTestId('canvas-dock')).toHaveCount(0);
    answer.resolve();
    await answerReleased.promise;
    await expect.poll(() => fixture.failedRequests.includes('/api/toolkit/brainstorm')).toBe(true);
    await page.clock.runFor(2_000);
    expect(fixture.patches).toHaveLength(0);
    expect(fixture.privateWrites.some(write => JSON.stringify(write.body).includes('Late answer after closing'))).toBe(false);
    await expect(page.getByText('Late answer after closing', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Canvas closed', { exact: true })).toBeVisible();
    fixture.assertClean();
  } finally { answer.resolve(); }
});
