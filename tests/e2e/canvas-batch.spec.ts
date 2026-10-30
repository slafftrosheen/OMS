import { test, expect } from '@playwright/test';

test('a linked AI diagram groups from Draw, uses real bindings and remains one native Undo step', async ({ page }) => {
  test.setTimeout(150_000);
  const boardId = '29cb97db-01da-4a9d-9fa7-5357c94f772e';
  const board: any = { id: boardId, title: 'Connected diagram', revision: 0,
    created_at: '2026-10-22T12:00:00Z', updated_at: '2026-10-22T12:00:00Z',
    payload: { version: 1, snapshot: null } };
  const saved: any[] = [];
  const errors: string[] = [];
  let assistantRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (value: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(value)
    });
    if (path === '/api/toolkit/models') return reply({ models: [{ id: 'openrouter/free', label: 'Free router', isDefault: true }], web: {}, media: {} });
    if (path === '/api/ai/canvas') return reply({ items: [board] });
    if (path === `/api/ai/canvas/${boardId}`) {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON(); board.payload = body.payload; board.revision++; saved.push(body);
      }
      return reply({ canvas: board });
    }
    if (path === `/api/toolkit/conversations/${boardId}`) return reply({ messages: [], proposals: [], legacyThreads: {} });
    if (path === `/api/toolkit/assets/${boardId}/library`) return reply({ files: [] });
    if (path === '/api/toolkit/brainstorm') {
      const body = request.postDataJSON();
      assistantRequests++;
      const group = body.scene.shapes.find((shape: any) => shape.type === 'group');
      const actions = assistantRequests === 1 ? [
        { kind: 'create', ref: 'start', shape: { type: 'geo', x: 100, y: 120,
          props: { geo: 'rectangle', w: 180, h: 100, text: 'Prepare', color: 'black' } }, reason: 'First stage' },
        { kind: 'create', ref: 'finish', shape: { type: 'geo', x: 430, y: 200,
          props: { geo: 'rectangle', w: 180, h: 100, text: 'Produce', color: 'black' } }, reason: 'Second stage' },
        { kind: 'update', target: '@start', patch: { props: { color: 'violet' } }, reason: 'Emphasize the start' },
        { kind: 'resize', target: '@finish', width: 220, height: 120, reason: 'Make room for detail' },
        { kind: 'align', targets: ['@start','@finish'], alignment: 'top', reason: 'Align the stages' },
        { kind: 'connect', from: '@start', to: '@finish', label: 'Next', reason: 'Show the workflow' },
        { kind: 'group', targets: ['@start','@finish'], reason: 'Keep the diagram together' }
      ] : [{ kind: 'ungroup', targets: [group.id], reason: 'Edit the stages independently' }];
      return reply({ reply: 'Review the proposed diagram.', cards: [], actions, model: 'fixture/canvas',
        scene: { visibleShapes: body.scene.shapes.length, totalShapes: body.scene.totalShapes, truncated: false } });
    }
    return reply({ error: `Unmocked request ${path}` }, 404);
  });

  await page.goto('/canvas-media.html');
  await expect(page.getByTestId('canvas-dock')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Select / move', exact: true })).toBeEnabled({ timeout: 45_000 });
  const allRecords = () => Object.values(saved.at(-1)?.payload?.snapshot?.document?.store ?? {}) as any[];
  const shapes = () => allRecords().filter(record => record.typeName === 'shape');
  const draw = page.getByRole('button', { name: 'Freehand drawing', exact: true });
  const select = page.getByRole('button', { name: 'Select / move', exact: true });
  const applyAll = page.getByRole('button', { name: 'Apply all edits', exact: true });
  const historyAction = async (name: string) => {
    await page.getByRole('button', { name: 'More tools', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
  };

  await page.locator('#toolkit-prompt').fill('Create a connected two-step diagram, align it and group it');
  await page.locator('#toolkit-prompt').press('Enter');
  await expect(applyAll).toBeVisible();
  // The route must not offer individual application of a dependent action.
  await expect(page.getByRole('button', { name: 'Review & apply', exact: true })).toHaveCount(0);
  await draw.click();
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await applyAll.click();
  await expect.poll(() => shapes().length).toBe(4);
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  const group = shapes().find(shape => shape.type === 'group');
  const start = shapes().find(shape => shape.type === 'geo' && shape.props.text === 'Prepare');
  const finish = shapes().find(shape => shape.type === 'geo' && shape.props.text === 'Produce');
  const arrow = shapes().find(shape => shape.type === 'arrow');
  expect(group).toBeTruthy();
  expect(start.props.color).toBe('violet');
  expect(finish.props.w).toBeCloseTo(220);
  expect(start.y).toBeCloseTo(finish.y);
  expect([start.parentId, finish.parentId]).toEqual([group.id, group.id]);
  expect(arrow.props.text).toBe('Next');
  expect(allRecords().filter(record => record.typeName === 'binding' && record.fromId === arrow.id)
    .map(binding => binding.toId).sort()).toEqual([start.id,finish.id].sort());
  expect(shapes().every(shape => shape.id.startsWith('shape:') && !('ref' in shape))).toBe(true);

  await historyAction('Undo last canvas edit');
  await expect.poll(() => shapes().length).toBe(0);
  await historyAction('Redo last canvas edit');
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(1);

  // Ungroup has the same native tool gate; exercise it separately on the saved
  // real group, whose descendants and fingerprints now exist in scene context.
  await page.locator('#toolkit-prompt').fill('Ungroup this diagram');
  await page.locator('#toolkit-prompt').press('Enter');
  await expect(applyAll).toBeVisible();
  await draw.click();
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await applyAll.click();
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(0);
  expect(shapes().filter(shape => shape.type === 'geo')).toHaveLength(2);
  expect(shapes().filter(shape => shape.type === 'arrow')).toHaveLength(1);
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await historyAction('Undo last canvas edit');
  await expect.poll(() => shapes().filter(shape => shape.type === 'group').length).toBe(1);
  expect(assistantRequests).toBe(2);
  expect(errors).toEqual([]);
});
