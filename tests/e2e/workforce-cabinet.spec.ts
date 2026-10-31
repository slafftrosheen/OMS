import { expect, test, type Page, type Route } from '@playwright/test';
import { calendarMonth, classifyWorkDay } from '../../src/lib/workforce/calendar';
import { emptyTotals, sumTotals, totalEntries } from '../../src/lib/workforce/calculations';
import type { Absence, TeamWorker, WorkEntry, WorkforceReport } from '../../src/lib/workforce/types';
import { workforceFixtureEntry, workforceFixtureReportId, workforceFixtureUsers } from '../ui/workforce-fixtures';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

type Options = { manager?: boolean; query?: string; teamResponder?: (route: Route) => Promise<void>; failEntry?: boolean; reportHistory?: boolean };
async function fixture(page: Page, options: Options = {}) {
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
  let actor = options.manager ? workforceFixtureUsers.manager : workforceFixtureUsers.worker;
  const entries: WorkEntry[] = [workforceFixtureEntry()];
  const absences: Absence[] = [];
  const writes: Array<{ path: string; method: string; body: any }> = [];
  const assistantPosts: any[] = [];
  const unexpected: string[] = [];
  const workers = (): TeamWorker[] => Object.values(workforceFixtureUsers).map(user => ({
    userId: user.id, displayName: user.displayName, username: user.username, role: user.role, isActive: true,
    totals: totalEntries(entries.filter(row => row.userId === user.id)),
    activeAbsences: absences.filter(row => row.userId === user.id && row.status === 'active')
  }));
  const report: WorkforceReport = {
    id: workforceFixtureReportId, kind: 'monthly_hours', period: '2026-09-01', version: 1,
    generatedAt: '2026-10-01T05:00:00Z', isStale: false,
    payload: { month: '2026-09', workers: workers(), totals: sumTotals(workers().map(row => row.totals)), timeZone: 'Europe/Riga', policyVersion: 'lv-company-hours-v1' }
  };
  const reportRows: WorkforceReport[] = options.reportHistory ? [
    { ...report, id: 'e8888888-8888-4888-8888-888888888888', version: 2, generatedAt: '2026-10-03T05:00:00Z' }, report,
    { ...report, id: 'e9999999-9999-4999-8999-999999999999', kind: 'daily_absences', period: '2026-09-30',
      payload: { date: '2026-09-30', absences: [], totalAbsent: 0, timeZone: 'Europe/Riga', policyVersion: 'lv-company-hours-v1' } }
  ] : [report];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    if (path === '/api/auth' && method === 'GET') return route.fulfill({ json: { user: actor } });
    if (path === '/api/ai/assistant') {
      if (method === 'GET') return route.fulfill({ json: { tools: [] } });
      if (method === 'POST') { assistantPosts.push(request.postDataJSON()); return route.fulfill({ json: { reply: 'Your cabinet keeps actual and pay-equivalent hours separately.', toolsUsed: [] } }); }
    }
    if (!path.startsWith('/api/workforce')) { unexpected.push(`${method} ${path}`); return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } }); }
    if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON() });
    if (path === '/api/workforce/month' && method === 'GET') {
      const month = url.searchParams.get('month') || '2026-10', userId = url.searchParams.get('userId') || actor.id;
      const user = Object.values(workforceFixtureUsers).find(user => user.id === userId) || actor;
      const own = entries.filter(row => row.userId === userId);
      return route.fulfill({ json: {
        month, currentMonth: '2026-10', today: '2026-10-31', timeZone: 'Europe/Riga', policyVersion: 'lv-company-hours-v1',
        owner: { userId, displayName: user.displayName, username: user.username, role: user.role, isActive: true },
        days: calendarMonth(month), entries: own.filter(row => row.workDate.startsWith(month)),
        absences: absences.filter(row => row.userId === userId && row.startDate <= `${month}-31` && row.endDate >= `${month}-01`),
        totals: totalEntries(own.filter(row => row.workDate.startsWith(month))), currentMonthTotals: totalEntries(own.filter(row => row.workDate.startsWith('2026-10')))
      } });
    }
    if (path === '/api/workforce/team' && method === 'GET') {
      if (options.teamResponder) return options.teamResponder(route);
      const rows = workers(); return route.fulfill({ json: { month: url.searchParams.get('month'), today: '2026-10-31', workers: rows, totals: sumTotals(rows.map(row => row.totals)) } });
    }
    if (path === '/api/workforce/reports' && method === 'GET') return route.fulfill({ json: { reports: url.searchParams.get('month') === '2026-09' ? reportRows : [] } });
    if (path === '/api/workforce/reports' && method === 'POST') return route.fulfill({ json: { report } });
    if (path === `/api/workforce/reports/${workforceFixtureReportId}` && method === 'GET') return route.fulfill({ contentType: 'text/csv', body: 'worker,actual_minutes,credited_minutes\nElina,480,480\n' });
    if (path === '/api/workforce/holidays' && method === 'GET') return route.fulfill({ json: { holidays: [], overrides: [] } });
    if (path === '/api/workforce/entries' && method === 'POST') {
      if (options.failEntry) return route.fulfill({ status: 503, json: { code: 'DATABASE_UNAVAILABLE', error: 'Unavailable' } });
      const input = request.postDataJSON(), existing = entries.find(row => row.userId === actor.id && row.workDate === input.workDate);
      const day = classifyWorkDay(input.workDate);
      const entry = workforceFixtureEntry({ id: existing?.id ?? 'f6666666-6666-4666-8666-666666666666', userId: actor.id,
        workDate: input.workDate, actualMinutes: input.actualMinutes, creditedMinutes: input.actualMinutes * day.multiplier,
        multiplier: day.multiplier, holidayName: day.holidayName, note: input.note ?? '', version: (existing?.version ?? 0) + 1 });
      if (existing) entries[entries.indexOf(existing)] = entry; else entries.push(entry);
      return route.fulfill({ json: { entry } });
    }
    if (path.startsWith('/api/workforce/entries/') && method === 'DELETE') {
      const index = entries.findIndex(row => row.id === path.split('/').pop());
      if (index !== -1) entries.splice(index, 1);
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/workforce/absences' && method === 'POST') {
      const input = request.postDataJSON();
      const absence: Absence = { id: 'a7777777-7777-4777-8777-777777777777', userId: actor.id, ...input, note: input.note ?? '', status: 'active', version: 1, createdAt: '2026-10-31T10:00:00Z', updatedAt: '2026-10-31T10:00:00Z' };
      absences.push(absence); return route.fulfill({ json: { absence } });
    }
    if (path.startsWith('/api/workforce/absences/') && method === 'DELETE') {
      const row = absences.find(row => row.id === path.split('/').pop());
      if (row) { row.status = 'cancelled'; row.version++; }
      return route.fulfill({ json: { ok: true } });
    }
    unexpected.push(`${method} ${path}`); return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } });
  });
  await page.goto(`/workforce.html${options.query ?? ''}`);
  await expect(page.getByRole('heading', { name: 'My cabinet', exact: true })).toBeVisible();
  return { entries, absences, writes, assistantPosts, unexpected, setActor: (value: typeof actor) => { actor = value; } };
}

test('worker saves exact minutes with weekend credit, edits history and distinguishes a saved zero', async ({ page }) => {
  const observed = await fixture(page);
  await expect(page.getByTestId('current-month-hours')).toContainText('8 h');
  await page.getByLabel('Hours', { exact: true }).fill('3');
  await page.getByLabel('Minutes', { exact: true }).fill('7');
  const save = page.getByRole('button', { name: 'Save hours', exact: true });
  await expect(save).toHaveAttribute('data-next-action', 'true');
  await save.click();
  await expect(page.getByText('Working time saved.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('current-month-hours')).toContainText('11 h 7 min');
  await expect(page.locator('.wfc-summary-card').first()).toContainText('14 h 14 min');
  expect(observed.writes[0].body).toMatchObject({ workDate: '2026-10-31', actualMinutes: 187, expectedVersion: null });
  await page.getByLabel('Hours', { exact: true }).fill('4');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Leave cabinet fixture', exact: true }).click();
  await expect(page.getByTestId('workforce-navigation')).toHaveText('Blocked');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
  await page.getByRole('button', { name: 'Update hours', exact: true }).click();
  await expect.poll(() => observed.writes.filter(row => row.path === '/api/workforce/entries').length).toBe(2);
  expect(observed.writes[1].body).toMatchObject({ actualMinutes: 247, expectedVersion: 1 });
  await expect(page.getByRole('button', { name: 'Update hours', exact: true })).toBeDisabled();
  await page.getByLabel('Work date', { exact: true }).fill('2026-10-29');
  await page.getByLabel('Hours', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save hours', exact: true }).click();
  await expect(page.getByText('0 hours recorded', { exact: true })).toBeVisible();
  await page.getByLabel('Show days without an entry').check();
  await expect(page.getByText('Not recorded', { exact: true }).first()).toBeVisible();
  expect(observed.unexpected).toEqual([]);
});

test('unsaved date changes ask once; partial absences can be saved and cancelled with history retained', async ({ page }) => {
  const observed = await fixture(page);
  // Incomplete time still needs protection even though it cannot be saved yet.
  await page.getByLabel('Minutes', { exact: true }).fill('30');
  await expect(page.getByRole('button', { name: 'Save hours', exact: true })).toBeDisabled();
  await page.getByLabel('Work date', { exact: true }).fill('2026-10-30');
  const incompleteDialog = page.getByRole('dialog', { name: 'Leave your unsaved changes?' });
  await expect(incompleteDialog).toBeVisible();
  await incompleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Native dialog keeps the underlying form inert until its outro completes.
  await expect(incompleteDialog).toBeHidden();
  await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('30');
  await page.getByLabel('Hours', { exact: true }).fill('4');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
  await page.getByLabel('Work date', { exact: true }).fill('2026-10-30');
  const dialog = page.getByRole('dialog', { name: 'Leave your unsaved changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('Work date', { exact: true })).toHaveValue('2026-10-31');
  await page.getByLabel('Work date', { exact: true }).fill('2026-10-30');
  await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('8');
  await page.getByLabel('First day away', { exact: true }).fill('2026-10-30');
  await page.getByLabel('Partial day', { exact: true }).check();
  await page.getByRole('button', { name: 'Save absence', exact: true }).click();
  await expect(page.getByText('Absence saved. It will appear in production’s daily report.', { exact: true })).toBeVisible();
  expect(observed.absences[0]).toMatchObject({ startDate: '2026-10-30', endDate: '2026-10-30', partialDay: true });
  await page.getByRole('button', { name: 'Cancel absence', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cancel this absence?' }).getByRole('button', { name: 'Cancel absence', exact: true }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  expect(observed.absences[0].status).toBe('cancelled');
  expect(observed.unexpected).toEqual([]);
});

test('R&D sees all workers and notification links open saved monthly reports with CSV', async ({ page }, testInfo) => {
  const observed = await fixture(page, { manager: true, query: `?view=reports&month=2026-09&report=${workforceFixtureReportId}` });
  await expect(page.getByRole('heading', { name: 'Monthly hours · September 2026', exact: true })).toBeVisible();
  await expect(page.getByLabel('Report month', { exact: true })).toHaveValue('2026-09');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download CSV: Monthly hours/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('monthly_hours-2026-09-01-v1.csv');
  await page.getByRole('button', { name: 'Team overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View records: Elīna Ozola', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View records: Elīna Ozola', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elīna Ozola', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'View records', exact: true }).getByRole('button', { name: /Delete/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to team', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View records: Elīna Ozola', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('workforce-rd-team.png'), fullPage: true });
  expect(observed.unexpected).toEqual([]);
});

test('late manager responses and private drafts disappear after account or role changes', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => release = resolve);
  let started = false;
  const observed = await fixture(page, { manager: true, teamResponder: async route => {
    started = true; await held;
    await route.fulfill({ json: { month: '2026-10', today: '2026-10-31', workers: [{ userId: 'old-worker', displayName: 'PRIVATE OLD WORKER', username: 'private', role: 'Operator', isActive: true, totals: emptyTotals(), activeAbsences: [] }], totals: emptyTotals() } }).catch(() => {});
  } });
  await page.getByRole('button', { name: 'Team overview', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  observed.setActor({ ...workforceFixtureUsers.manager, role: 'Operator' });
  await page.getByRole('button', { name: 'Demote current R&D', exact: true }).click();
  release();
  await expect(page.getByRole('button', { name: 'Team overview', exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIVATE OLD WORKER')).toHaveCount(0);
  await page.getByLabel('Hours', { exact: true }).fill('6');
  await page.locator('#work-note').fill('PRIVATE OLD NOTE');
  observed.setActor(workforceFixtureUsers.second);
  await page.getByRole('button', { name: 'Switch account', exact: true }).click();
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('');
  await expect(page.locator('#work-note')).toHaveValue('');
  await expect(page.getByText('PRIVATE OLD NOTE')).toHaveCount(0);
  await expect(page.getByTestId('current-month-hours')).toContainText('0 h');
  expect(observed.unexpected).toEqual([]);
});

test('save errors preserve the draft; mobile localization and all themes keep the page readable', async ({ page }, testInfo) => {
  await fixture(page, { failEntry: true });
  await page.getByLabel('Hours', { exact: true }).fill('7');
  await page.locator('#work-note').fill('Keep this draft');
  await page.getByRole('button', { name: 'Save hours', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not available');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('7');
  await expect(page.locator('#work-note')).toHaveValue('Keep this draft');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const language of ['lv', 'ru', 'en']) {
    await page.getByLabel('Fixture language').selectOption(language);
    for (const theme of ['LightVim', 'DarkVim', 'HighContrastVim']) {
      await page.getByLabel('Fixture theme').selectOption(theme);
      const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
        overflowing: Array.from(document.querySelectorAll<HTMLElement>('.workforce-cabinet *')).filter(node => {
          const box = node.getBoundingClientRect(); return box.width > 1 && box.right > innerWidth + 1;
        }).slice(0, 8).map(node => ({ tag: node.tagName, class: node.className, text: node.textContent?.trim().slice(0, 100) })) }));
      expect(layout.width, `${language}/${theme}: ${JSON.stringify(layout.overflowing)}`).toBeLessThanOrEqual(layout.viewport + 1);
      await expect(page.locator('#work-hours')).toBeVisible();
    }
  }
  await page.screenshot({ path: testInfo.outputPath('workforce-mobile-high-contrast.png'), fullPage: true });
});

test('assistant context describes the cabinet without disclosing notes, absence reasons or worker identities', async ({ page }) => {
  const observed = await fixture(page);
  await page.getByLabel('Hours', { exact: true }).fill('2');
  await page.locator('#work-note').fill('PRIVATE WORK NOTE');
  await page.getByLabel('First day away', { exact: true }).fill('2026-11-02');
  await page.getByLabel('Reason', { exact: true }).selectOption('sick');
  await page.locator('#absence-note').fill('PRIVATE ABSENCE NOTE');
  await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question for the assistant', exact: true }).fill('Explain how this cabinet counts hours.');
  await page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.', exact: true }).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => observed.assistantPosts.length).toBe(1);
  expect(observed.assistantPosts[0].screen.data).toMatchObject({ screen: 'cabinet', pendingEntry: true, pendingAbsence: true, ownActualMinutes: 480, ownCreditedMinutes: 480 });
  const context = JSON.stringify(observed.assistantPosts[0].screen.data);
  expect(context).not.toContain('PRIVATE'); expect(context).not.toContain('sick'); expect(context).not.toContain('Elīna');
});

test('assistant context follows cabinet filters while search text and worker identities stay private', async ({ page }) => {
  const observed = await fixture(page, { manager: true, reportHistory: true });
  async function readContext() {
    const count = observed.assistantPosts.length;
    await page.getByRole('button', { name: 'Open assistant', exact: true }).click();
    const question = page.getByRole('textbox', { name: 'Question for the assistant', exact: true });
    await question.fill('Explain this view.');
    await page.getByRole('checkbox', { name: 'Send this screen’s context and my question to OpenRouter.', exact: true }).check();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => observed.assistantPosts.length).toBe(count + 1);
    await expect(question).toHaveValue('');
    await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
    const context = observed.assistantPosts[count].screen.data;
    const serialized = JSON.stringify(context);
    for (const privateText of ['JANIS berzins', 'Jānis', 'Elīna', workforceFixtureUsers.worker.id, workforceFixtureUsers.second.id]) {
      expect(serialized).not.toContain(privateText);
    }
    return context;
  }
  await page.getByRole('button', { name: 'Team overview', exact: true }).click();
  await page.getByLabel('Find a worker', { exact: true }).fill('JANIS berzins');
  await page.getByLabel('Worker filter', { exact: true }).selectOption('active');
  await expect(page.locator('.wfc-team-table tbody tr')).toHaveCount(1);
  expect(await readContext()).toMatchObject({ view: 'team', displayedWorkerCount: 1, workerFilter: 'active', workerSearchActive: true,
    displayedReportCount: null, reportKind: null, reportVersions: null });
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Worker filter', { exact: true }).selectOption('unrecorded');
  await expect(page.locator('.wfc-team-table tbody tr')).toHaveCount(2);
  expect(await readContext()).toMatchObject({ displayedWorkerCount: 2, workerFilter: 'unrecorded', workerSearchActive: false });

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/workforce/team?month=2026-09', async route => {
    await gate;
    await route.fulfill({ json: { month: '2026-09', today: '2026-10-31', workers: [], totals: emptyTotals() } }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.locator('.wfc-team-table')).toHaveCount(0);
  expect(await readContext()).toMatchObject({ view: 'team', loading: true, displayedWorkerCount: null, workerFilter: null, workerSearchActive: null });
  release();
  await expect(page.getByText('No workers found.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.locator('.wfc-report-list > li')).toHaveCount(2);
  await page.getByLabel('Report type', { exact: true }).selectOption('monthly_hours');
  await page.getByLabel('Versions', { exact: true }).selectOption('all');
  expect(await readContext()).toMatchObject({ view: 'reports', displayedReportCount: 2, reportKind: 'monthly_hours', reportVersions: 'all',
    displayedWorkerCount: null, workerFilter: null, workerSearchActive: null });
  await page.getByLabel('Versions', { exact: true }).selectOption('latest');
  expect(await readContext()).toMatchObject({ displayedReportCount: 1, reportKind: 'monthly_hours', reportVersions: 'latest' });
  await page.getByRole('button', { name: 'My hours', exact: true }).click();
  expect(await readContext()).toMatchObject({ view: 'personal', displayedReportCount: null, reportKind: null, reportVersions: null,
    displayedWorkerCount: null, workerFilter: null, workerSearchActive: null });
});

test('month overview selects days with draft protection and keyboard navigation, and future dates stay read only', async ({ page }) => {
  const observed = await fixture(page);
  const calendar = page.locator('.wfc-calendar-table');
  const savedDay = calendar.locator('[data-work-date="2026-10-30"]');
  await expect(savedDay).toHaveAccessibleName(/Time recorded.*8 h/);
  await page.getByLabel('Hours', { exact: true }).fill('4');
  await savedDay.click();
  const dialog = page.getByRole('dialog', { name: 'Leave your unsaved changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Work date', { exact: true })).toHaveValue('2026-10-31');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('4');
  await savedDay.click();
  await dialog.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Work date', { exact: true })).toHaveValue('2026-10-30');
  await expect(page.getByLabel('Hours', { exact: true })).toHaveValue('8');
  await expect(savedDay).toHaveAttribute('data-selected', 'true');
  await savedDay.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('[data-work-date="2026-10-29"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Work date', { exact: true })).toHaveValue('2026-10-29');
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2026-11');
  await expect(calendar.locator('button')).toHaveCount(0);
  await expect(calendar.locator('[data-status="future"]')).toHaveCount(30);
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await expect(page.getByLabel('Month', { exact: true })).toHaveValue('2026-10');
  expect(observed.writes).toEqual([]);
});

test('team search respects Latvian names and filters people without changing whole-team totals', async ({ page }) => {
  await fixture(page, { manager: true });
  await page.getByRole('button', { name: 'Team overview', exact: true }).click();
  const table = page.locator('.wfc-team-table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Find a worker', { exact: true }).fill('JANIS berzins');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Jānis Bērziņš');
  await expect(page.locator('.wfc-month-totals')).toContainText('8 h');
  await page.getByLabel('Find a worker', { exact: true }).fill('elina');
  await page.getByLabel('Worker filter', { exact: true }).selectOption('unrecorded');
  await expect(page.getByText('No workers match these filters.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Worker filter', { exact: true }).selectOption('unrecorded');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).not.toContainText('Elīna');
});

test('report archive filters latest versions per period and notification links reveal older snapshots', async ({ page }) => {
  await fixture(page, { manager: true, reportHistory: true });
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByLabel('Report month', { exact: true }).fill('2026-09');
  const rows = page.locator('.wfc-report-list > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Monthly hours');
  await expect(rows.first()).toContainText('Version 2');
  await page.getByLabel('Report type', { exact: true }).selectOption('monthly_hours');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Versions', { exact: true }).selectOption('all');
  await expect(rows).toHaveCount(2);
  await expect(rows.last()).toContainText('Earlier version');
  await page.getByLabel('Report type', { exact: true }).selectOption('daily_absences');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Daily absences');
  await page.goto(`/workforce.html?view=reports&month=2026-09&report=${workforceFixtureReportId}`);
  await expect(page.locator('#workforce-report-preview')).toBeVisible();
  await expect(page.getByLabel('Versions', { exact: true })).toHaveValue('all');
  await expect(rows).toHaveCount(3);
});

test('calendar and filters remain readable at 320px across languages and themes', async ({ page }, testInfo) => {
  await fixture(page, { manager: true, reportHistory: true });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const language of ['en', 'lv', 'ru']) {
    await page.getByLabel('Fixture language').selectOption(language);
    for (const theme of ['LightVim', 'DarkVim', 'HighContrastVim']) {
      await page.getByLabel('Fixture theme').selectOption(theme);
      const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
      expect(size.scroll, `${language}/${theme}`).toBeLessThanOrEqual(size.width + 1);
      await expect(page.locator('.wfc-calendar-table')).toBeVisible();
    }
  }
  await page.screenshot({ path: testInfo.outputPath('workforce-calendar-mobile.png'), fullPage: true });
  await page.getByLabel('Fixture language').selectOption('en');
  await page.getByRole('button', { name: 'Team overview', exact: true }).click();
  await page.getByLabel('Fixture language').selectOption('ru');
  await expect(page.locator('.wfc-filter-row')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await page.screenshot({ path: testInfo.outputPath('workforce-team-mobile.png'), fullPage: true });
});
