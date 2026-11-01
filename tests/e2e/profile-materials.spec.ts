import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

const materials = [
  { id: 1, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_0F00', name_en: 'PLEXIGLAS GS Clear 0F00', name_ru: 'Литой акрил прозрачный 0F00', name_lv: 'Caurspīdīgs liets akrils 0F00', thickness_options: [1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25], metadata: { hex: '#f5f5f0', short_name: '0F00' } },
  { id: 2, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_LONG', name_en: 'PLEXIGLAS GS White translucent acrylic with a deliberately long catalog name', name_ru: 'Белый светорассеивающий литой акрил с длинным названием материала', name_lv: 'Balts gaismu izkliedējošs liets akrils ar garu materiāla nosaukumu', thickness_options: [3, 5, 8, 10], metadata: { hex: '#ffffff', short_name: 'WH10' } },
  { id: 3, category: 'ALU_COMPOSITE', code: 'ALU_COMPOSITE_0A000', name_en: 'Aluminum composite white 0A000', name_ru: 'Белый алюминиевый композит 0A000', name_lv: 'Balts alumīnija kompozīts 0A000', thickness_options: [2, 3, 4], metadata: { hex: '#ffffff', short_name: '0A000' } },
  { id: 4, category: 'PVC_FOAM', code: 'PVC_CUSTOM', name_en: 'PVC made to order', thickness_options: [], metadata: {} },
  { id: 5, category: 'ALU_PROFILE', code: 'ALU_TUBE', name_en: 'Aluminium tube 40x40', thickness_options: [1.5, 2, 3], metadata: { short_name: 'ALU' } },
  // Specifications below are isolated test fixtures, never supplier catalog input.
  { id: 6, category: 'LED_STRIP', code: 'LED_001', name_en: 'Lemlux LP-2835-120-24V LED strip 4000K', unit: 'm', thickness_options: [], metadata: { short_name: 'LED', brand: 'LEMLUX', voltage_v: 24, watts_per_m: 9.6, led_type: 'SMD 2835', leds_per_m: 120, color_temperature_k: 4000, packSize: '5 m reel; sold per metre', length_m: 5 } },
  { id: 7, category: 'LED_STRIP', code: 'LED_002', name_en: 'Lemlux COB-480-24V LED strip 3000K', unit: 'roll', thickness_options: [], metadata: { short_name: 'LED', brand: 'LEMLUX', voltage_v: 24, watts_per_m: 10, led_type: 'COB', leds_per_m: 480, color_temperature_k: 3000, packSize: '5 m reel', length_m: 5 } },
  { id: 8, category: 'PSU_MEANWELL', code: 'MW_LRS_100_12', name_en: 'Mean Well LRS-100-12 12V 102W', unit: 'PCS', thickness_options: [], metadata: { short_name: 'PSU', brand: 'MEAN WELL', series: 'LRS', model: 'LRS-100-12', voltage_v: 12, power_w: 102, current_a: 8.5, ip_rating: 'IP20' } },
  { id: 9, category: 'WIRE', code: 'WIRE_001', name_en: 'LAPP H05VV-F 3G0.75 white', unit: 'm', thickness_options: [], metadata: { short_name: 'CABLE', brand: 'LAPP', cable_application: 'mains', cable_type: 'H05VV-F', rated_voltage: '300/500 V', wire_cross_section_mm2: 0.75, cores: 3, length_m: 100, packSize: '100 m reel' } },
  { id: 10, category: 'FDM_PETG', code: 'PETG_001', name_en: 'Spectrum PET-G Premium 1.75mm Polar White', unit: 'PCS', thickness_options: [], metadata: { short_name: 'PETG', brand: 'Spectrum', material: 'PET-G', color: 'white', diameter_mm: 1.75, weight_kg: 1, packSize: '1 spool' } },
  { id: 11, category: 'LED_ACCESSORY', code: 'WAGO_221_413', name_en: 'WAGO 221-413 3-conductor connector', unit: 'PCS', thickness_options: [], metadata: { brand: 'WAGO', model: '221-413', short_name: 'WAGO 221-413', connections: 3, wire_cross_section_range_mm2: [0.14, 4] } },
  { id: 12, category: 'PAINT_RAL', code: 'RAL_9005', name_en: 'RAL 9005 Jet black', thickness_options: [], metadata: { hex: '#0a0a0a', short_name: '9005' } },
  { id: 13, category: 'PAINT_PANTONE', code: 'PANTONE_186_C', name_en: 'Pantone 186 C', thickness_options: [], metadata: { hex: '#c8102e', short_name: '186 C' } },
  { id: 14, category: 'LED_STRIP', code: 'TEST_RGBW', name_en: 'TEST SK6812 RGBW strip', unit: 'm', thickness_options: [], metadata: { brand: 'TEST', voltage_v: 12, max_watts_per_m: 32, led_type: 'SK6812 RGBW', white_channel_temperature_range_k: [2800, 3200], length_m: 5, packSize: '5 m reel; sold per metre' } },
  { id: 15, category: 'ALU_SHEET', code: 'TEST_SHEET_1500X3000', name_en: 'Aluminium sheet 1500 × 3000 mm', thickness_options: [0.5, 1, 1.5, 2, 3, 5, 8, 10, 15], metadata: { type: 'sheet', product_form: 'sheet', standardSize: '1500x3000mm' } },
  { id: 16, category: 'ALU_SHEET', code: 'ALU_FLAT_20X3', name_en: 'Aluminium flat bar 20x3', thickness_options: [3], metadata: { type: 'flat', short_name: '20x3' } },
  { id: 17, category: 'WIRE', code: 'TEST_MAINS_CABLE', name_en: 'TEST H07RN-F 3G1.5 mains cable', unit: 'm', thickness_options: [], metadata: { cable_application: 'mains', cable_type: 'H07RN-F', rated_voltage: '450/750 V', outer_diameter_range_mm: [8.2, 9.8], wire_cross_section_mm2: 1.5, cores: 3, length_m: 100, packSize: '100 m reel' } },
  { id: 18, category: 'WIRE', code: 'TEST_CONTROL_CABLE', name_en: 'TEST LIYCY 2x0.5 control cable', unit: 'm', thickness_options: [], metadata: { cable_application: 'control', wire_cross_section_mm2: 0.5, cores: 2 } },
  { id: 19, category: 'WIRE', code: 'TEST_SINGLE_WIRE', name_en: 'TEST red silicone wire', unit: 'm', thickness_options: [], metadata: { cable_application: 'internal', wire_cross_section_mm2: 0.75, cores: 1 } },
  // Selected identity/color fixtures mirror the existing material data and Lemona seed metadata.
  { id: 20, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_1C33', name_en: 'PLEXIGLAS® GS Yellow 1C33', thickness_options: [3, 4, 5, 6, 8, 10], metadata: { brand: 'PLEXIGLAS®', series: 'GS', colorCode: '1C33', hex: '#FFD700' } },
  { id: 21, category: 'VINYL_ORACAL', code: '005S', name_en: 'ORACAL® 8500 Middle Blue', thickness_options: [0.1], metadata: { brand: 'ORACAL®', series: '8500', colorCode: '005', hex: '#0539A2' } },
  { id: 22, category: 'PAINT_RAL', code: 'RAL_3024', name_en: 'RAL 3024 Luminous red', thickness_options: [], metadata: { brand: 'RAL', ralCode: '3024', hex: '#FF2D21' } },
  { id: 23, category: 'FDM_ASA', code: '3S-ASA-BLACK-100-175', name_en: 'Filament Fiberlogy ASA · black / 1.75 mm / 1 kg · 3S-ASA-BLACK-100-175', unit: 'PCS', thickness_options: [], metadata: { brand: 'Fiberlogy', material: 'ASA', color: 'black', diameter_mm: 1.75, weight_kg: 1, packSize: '1 spool' } },
  { id: 24, category: 'RESIN_ANYCUBIC', code: 'SCRWH-10-IPO-01', name_en: 'Anycubic Tough Resin Ultra · white · SCRWH-10-IPO-01', unit: 'PCS', thickness_options: [], metadata: { brand: 'Anycubic', material: 'Photopolymer resin', color: 'white', product_family: 'Tough Resin Ultra' } }
];

async function catalogResponse(route: Route) {
  const url = new URL(route.request().url());
  const categories = (url.searchParams.get('categories') || url.searchParams.get('category'))?.split(',');
  await route.fulfill({ json: categories ? materials.filter(item => categories.includes(item.category)) : materials });
}

let runtimeErrors: string[];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('**/api/materials**', catalogResponse);
  await page.route('**/api/material-thickness-options**', async route => {
    const type = new URL(route.request().url()).searchParams.get('materialType');
    const values = type === 'ACRYLIC' ? [2, 3, 5, 10] : type === 'PVC' ? [5, 10] : [2, 3, 4];
    await route.fulfill({ json: values.map(thickness => ({ thickness, unit: 'mm' })) });
  });
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));

async function savedConfiguration(page: Page) {
  return JSON.parse(await page.getByTestId('configuration').innerText());
}

async function openEditor(field: Locator) {
  await expect(field.locator('.material-select').first()).toBeVisible();
  const edit = field.locator('.edit-selection');
  if (await edit.count()) await edit.click();
  await expect(field.locator('.selection-editor')).toBeVisible();
}

async function finishSelection(field: Locator) {
  await field.locator('.done-editing').click();
  await expect(field.locator('[data-material-badge]')).toHaveCount(1);
  await expect(field.locator('.select-trigger')).toHaveCount(0);
}

test('configured production materials show one physical-color badge and an adjacent edit action', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1765, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load configured materials' }).click();
  const face = page.locator('.face-material-entry').first();
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  const sides = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^SIDES$/ }) }).first();
  const film = page.locator('.inline-field').filter({ has: page.getByRole('checkbox', { name: 'FACE', exact: true }) });
  const paint = page.locator('.paint-item').filter({ has: page.getByRole('checkbox', { name: 'FRONT', exact: true }) });
  const printing = page.locator('.print3d-material');
  await expect(face.locator('[data-material-badge]')).toHaveText('PLEX 1C33/3mm');
  await expect(face.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 215, 0)');
  await expect(face.locator('[data-material-badge]')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(back.locator('[data-material-badge]')).toHaveText('PLEX 0F00/1.5mm');
  await expect(sides.locator('[data-material-badge]')).toHaveText('ALU /1.5mm');
  await expect(sides.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(196, 201, 206)');
  await expect(film.locator('[data-material-badge]')).toHaveText('ORA 8500/005');
  await expect(film.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(5, 57, 162)');
  await expect(paint.locator('[data-material-badge]')).toHaveText('RAL 3024');
  await expect(paint.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 45, 33)');
  await expect(printing.locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('color', 'rgb(255, 255, 255)');
  for (const field of [face, back, sides, film, paint, printing]) {
    await expect(field.locator('[data-material-badge]')).toHaveCount(1);
    await expect(field.locator('.edit-selection')).toBeVisible();
    await expect(field.locator('.select-trigger, .thickness-select, .specification-summary, .custom-input, .material-badge-lg, .ral-badge')).toHaveCount(0);
  }
  await expect(page.getByTestId('change-count')).toHaveText('0');
  await page.locator('.profile-form').screenshot({ path: testInfo.outputPath('compact-materials-desktop.png') });
  await page.setViewportSize({ width: 360, height: 950 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await film.screenshot({ path: testInfo.outputPath('compact-film-phone.png') });
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(page.locator('.edit-selection, .done-editing')).toHaveCount(0);
  await expect(page.getByLabel('FRONT · Notes', { exact: true })).toContainText('Apply before trimming');
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('Edit and Done are keyboard operable and expose film notes without duplicating the selected badge', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load configured materials' }).click();
  const film = page.locator('.inline-field').filter({ has: page.getByRole('checkbox', { name: 'FACE', exact: true }) });
  const edit = film.locator('.edit-selection');
  await expect(film.locator('[data-material-badge]')).toHaveText('ORA 8500/005');
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(film.locator('.select-trigger')).toBeFocused();
  await expect(film.locator('[data-material-badge]')).toHaveCount(0);
  const note = film.getByRole('textbox', { name: 'FRONT · FACE · Material note', exact: true });
  await expect(note).toHaveValue('Apply before trimming');
  await note.fill('Apply before trimming; keep the liner');
  const edits = await page.getByTestId('change-count').innerText();
  await film.locator('.done-editing').focus();
  await page.keyboard.press('Enter');
  await expect(edit).toBeFocused();
  await expect(film.locator('[data-material-badge]')).toHaveText('ORA 8500/005');
  await expect(film.locator('.select-trigger, .custom-input')).toHaveCount(0);
  await expect(page.getByTestId('change-count')).toHaveText(edits);
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await openEditor(film);
  await expect(note).toHaveValue('Apply before trimming; keep the liner');
  await finishSelection(film);
  await expect(page.getByTestId('change-count')).toHaveText(edits);

  // Notes remain production information even if the material is cleared.
  // Read-only empty selections must not show a second disabled note input.
  const paint = page.locator('.paint-item').filter({ has: page.getByRole('checkbox', { name: 'FRONT', exact: true }) });
  await openEditor(paint);
  await paint.getByRole('textbox', { name: 'PAINTING · FRONT · Material note', exact: true }).fill('Mask the fixing holes');
  await paint.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await openEditor(film);
  await film.getByRole('button', { name: 'Clear selection', exact: true }).click();
  const editsAfterClear = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(page.getByLabel('FRONT · Notes', { exact: true }).locator('.material-note')).toHaveText('FACE: Apply before trimming; keep the liner');
  await expect(page.getByLabel('PAINTING · Notes', { exact: true }).locator('.material-note')).toHaveText('FRONT: Mask the fixing holes');
  await expect(film.locator('input.custom-input')).toHaveCount(0);
  await expect(paint.locator('input.custom-input')).toHaveCount(0);
  await expect(page.getByTestId('change-count')).toHaveText(editsAfterClear);
});

test('resin identity and recorded material color replace FDM cleanly and survive save and read-only reopen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load configured materials' }).click();
  const printing = page.locator('.print3d-material');
  await expect(printing.locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await openEditor(printing);
  await printing.locator('.select-trigger').click();
  await printing.getByRole('searchbox').fill('SCRWH-10-IPO-01');
  await printing.getByRole('button', { name: /Anycubic Tough Resin Ultra/ }).click();
  await expect(printing.locator('.thickness-field')).toHaveCount(0);
  await finishSelection(printing);
  await expect(printing.locator('[data-material-badge]')).toHaveText('Anycubic Resin Tough Ultra');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(printing.locator('.select-trigger')).toHaveCount(0);
  expect((await savedConfiguration(page)).CNC_FREZER.faceMaterials[1]).toMatchObject({
    category: 'RESIN_ANYCUBIC', hex: '#FFFFFF', process: '3D_PRINT'
  });
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(printing.locator('[data-material-badge]')).toHaveText('Anycubic Resin Tough Ultra');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(printing.locator('.edit-selection, .select-trigger')).toHaveCount(0);
});

test('FACE and BACK offer printed materials without a standalone 3D switch or a filament thickness field', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: '3D', exact: true })).toHaveCount(0);
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  await openEditor(back);
  await back.locator('.select-trigger').click();
  await back.getByRole('button', { name: /ASA filament/ }).click();
  await back.getByRole('button', { name: /Filament Fiberlogy ASA/ }).click();
  await expect(back.locator('.thickness-field')).toHaveCount(0);
  await finishSelection(back);
  await expect(back.locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  expect((await savedConfiguration(page)).CNC_FREZER).toMatchObject({
    backCategory: 'FDM_ASA', backProcess: '3D_PRINT', backThickness: '', backHex: '#000000'
  });
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await openEditor(back);
  await expect(back.locator('.thickness-field')).toHaveCount(0);
  await back.locator('.select-trigger').click();
  await back.getByRole('button', { name: /Aluminum sheets/ }).click();
  await back.getByRole('button', { name: /Aluminium sheet 1500/ }).click();
  await expect(back.locator('.thickness-select')).toBeVisible();
  await back.locator('.thickness-select').selectOption('1.5mm');
  await finishSelection(back);
  await expect(back.locator('[data-material-badge]')).toHaveText('ALU /1.5mm');
  expect((await savedConfiguration(page)).CNC_FREZER.backProcess).toBeUndefined();
});

test('legacy unassigned 3D materials stay visible without edits and are assigned only by an explicit safe action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load legacy 3D material', exact: true }).click();
  const notice = page.locator('.legacy-print-notice');
  await expect(notice.locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await expect(notice.getByRole('button', { name: 'Assign to BACK', exact: true })).toBeDisabled();
  await expect(page.getByTestId('change-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(notice.locator('button')).toHaveCount(0);
  await expect(notice.locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await expect(page.getByTestId('change-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await notice.getByRole('button', { name: 'Assign to FACE', exact: true }).click();
  await expect(notice).toHaveCount(0);
  const rows = page.locator('.face-material-entry');
  await expect(rows).toHaveCount(2);
  await expect(rows.last().locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await expect(rows.last().locator('.edit-selection')).toBeFocused();
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials[0].value).toBe('PLEXIGLAS_GS_0F00');
  expect(saved.CNC_FREZER.back).toBe('ALU_COMPOSITE_0A000');
  expect(saved.CNC_FREZER.print3d).toBe(false);
  expect(saved.CNC_FREZER.print3dMaterial).toBe('3S-ASA-BLACK-100-175');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(rows.last().locator('[data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  await expect(notice).toHaveCount(0);
});

test('film PRINT is independent per part, survives reopen and supports instructions without a chosen substrate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load configured materials' }).click();
  const front = page.locator('.section').filter({ has: page.locator('.section-title', { hasText: 'FRONT' }) });
  const face = front.locator('.inline-field').first();
  const back = front.locator('.inline-field').nth(1);
  await face.getByRole('checkbox', { name: 'FRONT · FACE · Print on film', exact: true }).check();
  await back.getByRole('checkbox', { name: 'BACK', exact: true }).check();
  await expect(back.getByRole('checkbox', { name: 'FRONT · BACK · Print on film', exact: true })).not.toBeChecked();
  await openEditor(face);
  await face.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await face.getByRole('textbox', { name: 'FRONT · FACE · Material note', exact: true }).fill('Order printed translucent film for the lightbox');
  const saved = await savedConfiguration(page);
  expect(saved.FRONT.facePrint).toBe(true);
  expect(saved.FRONT.backPrint).toBe(false);
  expect(saved.FRONT.faceFilm).toBe('');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(face.getByRole('checkbox', { name: 'FRONT · FACE · Print on film', exact: true })).toBeChecked();
  await expect(face.getByRole('checkbox', { name: 'FRONT · FACE · Print on film', exact: true })).toBeDisabled();
  await expect(front.locator('.material-note')).toHaveText('FACE: Order printed translucent film for the lightbox');
  await front.getByRole('button', { name: 'Show FRONT notes', exact: true }).click();
  await expect(front.locator('.station-notes')).toBeFocused();
});

test('every production station exposes a warning badge and full readable notes after locking the form', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const stations = ['CNC FREZER', 'BENDER', 'FRONT', 'PAINTING', 'ASSEMBLING'];
  const note = 'Keep the approved sample beside the machine.\nCheck every edge before assembly.\n' + 'This production instruction must remain fully visible. '.repeat(12);
  for (const station of stations) {
    await page.getByRole('textbox', { name: `${station} · Notes`, exact: true }).fill(note);
    await expect(page.getByRole('button', { name: `Show ${station} notes`, exact: true })).toBeVisible();
  }
  const changes = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(page.locator('textarea.notes')).toHaveCount(0);
  await expect(page.locator('.notes-readonly')).toHaveCount(5);
  for (const station of stations) {
    await page.getByRole('button', { name: `Show ${station} notes`, exact: true }).click();
    const area = page.getByRole('group', { name: `${station} · Notes`, exact: true });
    await expect(area).toBeFocused();
    expect(await area.locator('.notes-readonly p').textContent()).toBe(note);
    expect(await area.locator('.notes-readonly p').evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  }
  await expect(page.getByTestId('change-count')).toHaveText(changes);
  await page.locator('.profile-form').evaluate(node => (node as HTMLElement).style.width = '520px');
  expect(await page.locator('.form-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.locator('.profile-form').screenshot({ path: testInfo.outputPath('station-notes-narrow-panel.png') });
});

test('selected parts keep readable contextual color in all themes, read-only mode and phone layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 950 });
  await page.goto('/');
  await expect(page.locator('[data-selection-summary="led"]')).toContainText('LEMLUX');
  await page.getByRole('button', { name: 'Load configured materials' }).click();
  await expect(page.locator('.print3d-material [data-material-badge]')).toHaveText('FDM Fiberlogy ASA');
  const selections = '[data-material-badge], .wago-badge';
  const contrast = async () => page.locator(selections).evaluateAll(nodes => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (value: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).map((value, index) => index === 3 ? value / 255 : value);
    };
    const over = (front: number[], back: number[]) => front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3]));
    const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
    }, 0);
    return nodes.filter(node => (node as HTMLElement).checkVisibility()).map(node => {
      const chain: Element[] = []; for (let parent: Element | null = node; parent; parent = parent.parentElement) chain.push(parent);
      let background = [255, 255, 255];
      for (const parent of chain.reverse()) background = over(rgba(getComputedStyle(parent).backgroundColor), background);
      const style = getComputedStyle(node), foreground = over(rgba(style.color), background);
      const a = luminance(foreground), b = luminance(background);
      return { text: node.textContent?.trim().slice(0, 90), contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
        opacity: chain.reduce((alpha, parent) => alpha * Number(getComputedStyle(parent).opacity), 1) };
    });
  });
  for (const theme of ['LightVim', 'DarkVim', 'HighContrast']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    const values = await contrast();
    expect(values.length).toBeGreaterThan(7);
    expect(values.filter(row => row.contrast < 4.5 || row.opacity < 1), `${theme}: selected text contrast/opacity`).toEqual([]);
    await page.locator('.section').filter({ has: page.locator('.section-title', { hasText: 'ASSEMBLING' }) })
      .screenshot({ path: test.info().outputPath(`selected-materials-${theme}.png`) });
  }
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  expect((await contrast()).filter(row => row.contrast < 4.5 || row.opacity < 1)).toEqual([]);
  await page.setViewportSize({ width: 360, height: 850 });
  await page.getByLabel('Theme', { exact: true }).selectOption('LightVim');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.locator('.section').filter({ has: page.locator('.section-title', { hasText: 'ASSEMBLING' }) })
    .screenshot({ path: test.info().outputPath('selected-materials-phone.png') });
});

test('partial legacy profile opens without edits, and bare thickness stays selected', async ({ page }) => {
  await page.goto('/');
  const face = page.locator('.face-material-entry');
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  await expect(face).toHaveCount(1);
  await expect(face.locator('[data-material-badge]')).toHaveText('PLEX 0F00/3mm');
  await expect(face.locator('.select-trigger, .thickness-select')).toHaveCount(0);
  await openEditor(face);
  await expect(face.locator('.thickness-select')).toHaveValue('3mm');
  await openEditor(back);
  await expect(page.getByLabel('BACK · Select thickness', { exact: true })).toHaveValue('2mm');
  await expect(page.getByLabel('Standalone thickness')).toHaveValue('3mm');
  await finishSelection(face);
  await finishSelection(back);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('change-count')).toHaveText('0');
  expect((await savedConfiguration(page)).CNC_FREZER.faceMaterials).toBeUndefined();
  await expect(page.getByTestId('standalone-thickness')).toHaveText('3');
});

test('saved model labels remain visible during catalog loading and after resolution without editing the profile', async ({ page }) => {
  let releaseCatalog!: () => void;
  const pendingCatalog = new Promise<void>(resolve => { releaseCatalog = resolve; });
  await page.unroute('**/api/materials**');
  await page.route('**/api/materials**', async route => {
    await pendingCatalog;
    await catalogResponse(route);
  });
  try {
    await page.goto('/');
    const led = page.locator('.assembly-item').filter({ has: page.getByLabel('LED', { exact: true }) });
    await expect(led.locator('[data-material-badge] [data-selection-fact="identity"]')).toHaveText('Lemlux LP-2835-120-24V LED strip 4000K');
    await expect(led.locator('.specification-summary')).toHaveCount(0);
    await expect(page.getByTestId('change-count')).toHaveText('0');
    releaseCatalog();
    await expect(led.locator('[data-material-badge] .selected-summary')).toHaveText('LEMLUX · 4000 K · 9.6 W/m');
    await expect(led.locator('[data-material-badge]')).toHaveAttribute('title', /Lemlux LP-2835-120-24V LED strip 4000K/);
    await expect(led.locator('.select-trigger, .value-category')).toHaveCount(0);
    await expect(page.locator('.face-material-entry [data-material-badge]')).toHaveText('PLEX 0F00/3mm');
    await expect(page.getByTestId('change-count')).toHaveText('0');
    expect((await savedConfiguration(page)).ASSEMBLING.ledModuleCategory).toBeUndefined();
  } finally {
    releaseCatalog();
  }
});

test('selected electronics stay compact while full specifications remain in catalog choices', async ({ page }) => {
  await page.goto('/');
  const led = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'LED', exact: true }) });
  const psu = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'PSU', exact: true }) });
  const cables = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'Main cable', exact: true }) });
  await expect(led.locator('[data-material-badge] .selected-summary')).toHaveText('LEMLUX · 4000 K · 9.6 W/m');
  await expect(led.locator('[data-material-badge] [data-selection-fact]')).toHaveCount(3);
  await expect(psu.locator('[data-material-badge] .selected-summary')).toHaveText('MEAN WELL · 102 W · LRS');
  await expect(psu.locator('[data-material-badge] [data-selection-fact]')).toHaveCount(3);
  await expect(psu.locator('[data-specification="powerPerMetre"]')).toHaveCount(0);
  await expect(cables.locator('[data-material-badge] .selected-summary')).toHaveText('3 × 0.75 mm² · 300/500 V · 2m');
  await expect(cables.locator('[data-material-badge] [data-selection-fact]')).toHaveCount(3);
  for (const item of [led, psu, cables]) {
    await expect(item.locator('[data-material-badge]')).toHaveCount(1);
    await expect(item.locator('.select-trigger, .specification-summary, .material-badge-lg')).toHaveCount(0);
  }
  await expect(page.getByLabel('Length from sign', { exact: true })).toHaveCount(0);
  await expect(page.locator('.face-material-entry .specification-summary')).toHaveCount(0);
  await expect(page.getByTestId('change-count')).toHaveText('0');

  await openEditor(led);
  await led.locator('.select-trigger').click();
  await expect(led.locator('.current-selection')).toContainText('Lemlux LP-2835-120-24V LED strip 4000K');
  await led.getByRole('button', { name: /LED strips/ }).click();
  const cob = led.getByRole('button', { name: /Lemlux COB-480-24V/ });
  await expect(cob.locator('[data-specification="ledType"]')).toContainText('COB');
  await expect(cob.locator('[data-specification="powerPerMetre"]')).toContainText('10 W/m');
  await expect(cob.locator('[data-specification="unit"]')).toHaveText('Stock unit: roll');
  const rgbw = led.getByRole('button', { name: /TEST SK6812 RGBW strip/ });
  await expect(rgbw.locator('[data-specification="maxPowerPerMetre"]')).toHaveText('Maximum power per metre: 32 W/m');
  await expect(rgbw.locator('[data-specification="whiteColorTemperature"]')).toHaveText('White channel temperature: 2800–3200 K');
  await expect(rgbw.locator('[data-specification="colorTemperature"]')).toHaveCount(0);
  await rgbw.click();
  await expect(led.locator('.select-trigger')).toHaveCount(0);
  await expect(led.locator('.edit-selection')).toBeFocused();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(led.locator('[data-material-badge]')).toHaveAttribute('title', /TEST SK6812 RGBW strip/);
  await expect(led.locator('[data-material-badge] [data-selection-fact="maxPowerPerMetre"]')).toContainText('max. 32 W/m');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(led.locator('.edit-selection, .select-trigger')).toHaveCount(0);
  await expect(led.locator('[data-material-badge] [data-selection-fact="whiteColorTemperature"]')).toContainText('White 2800–3200 K');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await openEditor(led);
  await led.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(led.locator('.specification-summary')).toHaveCount(0);
  await led.locator('.select-trigger').click();
  await led.getByRole('button', { name: 'Enter custom value', exact: true }).click();
  await led.getByRole('textbox', { name: 'Enter custom value', exact: true }).fill('Custom lamp named 24V');
  await finishSelection(led);
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(led.locator('[data-material-badge]')).toHaveText('Custom lamp named 24V');
  await openEditor(led);
  await expect(led.getByRole('textbox', { name: 'Enter custom value', exact: true })).toHaveValue('Custom lamp named 24V');
  await expect(led.locator('.specification-summary')).toHaveCount(0);
  expect((await savedConfiguration(page)).ASSEMBLING.ledModule).toBe('Custom lamp named 24V');
});

test('PSU type, frame options and template work with the keyboard and retain saved/read-only semantics', async ({ page }) => {
  await page.goto('/');
  const psuType = page.getByRole('radiogroup', { name: 'Power supply type', exact: true });
  const regular = psuType.getByRole('radio', { name: 'Regular', exact: true });
  const dimmable = psuType.getByRole('radio', { name: 'Dimmable', exact: true });
  await expect(regular).toBeVisible();
  await expect(regular).toBeChecked();
  await regular.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dimmable).toBeFocused();
  await expect(dimmable).toBeChecked();

  const waterholes = page.getByRole('checkbox', { name: 'Frame waterholes', exact: true });
  const mounting = page.getByRole('checkbox', { name: 'Frame mounting holes', exact: true });
  const template = page.getByRole('checkbox', { name: 'Template', exact: true });
  for (const checkbox of [waterholes, mounting, template]) {
    await expect(checkbox).toBeVisible();
    await checkbox.focus();
    await page.keyboard.press('Space');
  }
  expect((await savedConfiguration(page)).ASSEMBLING).toMatchObject({
    psuType: 'dimmable', frameWaterholes: false, frameMountingHoles: true, shablon: true
  });
  const edits = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(dimmable).toBeChecked();
  await expect(waterholes).not.toBeChecked();
  await expect(mounting).toBeChecked();
  await expect(template).toBeChecked();
  await expect(page.getByTestId('change-count')).toHaveText(edits);
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  for (const control of [regular, dimmable, waterholes, mounting, template]) await expect(control).toBeDisabled();
});

test('legacy assembly selections retain exact accessible identity without persisting a hydration edit', async ({ page }) => {
  await page.goto('/');
  for (const [section, label] of [
    ['LED', 'Lemlux LP-2835-120-24V LED strip 4000K'], ['PSU', 'Mean Well LRS-100-12 12V 102W'],
    ['Main cable', 'LAPP H05VV-F 3G0.75 white']
  ]) {
    const control = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: section, exact: true }) }).locator('[data-material-badge]');
    await expect(control).toHaveAttribute('title', new RegExp(label));
    await expect(control).toHaveAccessibleDescription(new RegExp(label));
  }
  const frame = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'FRAME', exact: true }) });
  await expect(frame.locator('[data-material-badge]')).toContainText('40x40x2');
  await expect(frame.locator('.thickness-select')).toHaveCount(0);
  await openEditor(frame);
  await expect(page.getByLabel('FRAME · Select thickness', { exact: true })).toHaveValue('2mm');
  await expect(page.getByLabel('FRAME SIZE', { exact: true })).toHaveValue('40x40x2');
  await expect(page.getByLabel('DIAMETER (mm)', { exact: true })).toHaveCount(0);
  await finishSelection(frame);
  await expect(page.getByTestId('change-count')).toHaveText('0');
  expect((await savedConfiguration(page)).ASSEMBLING.frameThickness).toBeUndefined();
  expect((await savedConfiguration(page)).ASSEMBLING.frameDimensions).toBe('40x40x2');
});

test('BACK, SIDES and FRAME use independent catalog thickness selectors and survive save/reopen', async ({ page }) => {
  await page.goto('/');
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  await openEditor(back);
  await back.locator('.select-trigger').click();
  await back.getByRole('button', { name: /Aluminum composite/ }).click();
  await back.getByRole('button', { name: /Aluminum composite white/ }).click();
  await back.locator('.thickness-select').selectOption('4mm');
  await finishSelection(back);

  const sides = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^SIDES$/ }) }).first();
  await sides.locator('.select-trigger').click();
  await sides.getByRole('button', { name: /Aluminum sheets/ }).click();
  await sides.getByRole('button', { name: /Aluminium sheet 1500/ }).click();
  await sides.locator('.thickness-select').selectOption('1.5mm');
  await finishSelection(sides);
  await expect(sides.locator('[data-material-badge]')).toHaveText('ALU /1.5mm');

  const frame = page.locator('.assembly-item').filter({ has: page.getByLabel('FRAME', { exact: true }) });
  await openEditor(frame);
  await frame.locator('.select-trigger').click();
  await frame.getByRole('button', { name: /Aluminum profiles/ }).click();
  await frame.getByRole('button', { name: /Aluminium tube/ }).click();
  await frame.locator('.thickness-select').selectOption('3mm');
  await finishSelection(frame);
  await expect(frame.locator('[data-material-badge]')).toContainText('40x40x3');

  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.backThickness).toBe('4mm');
  expect(saved.BENDER.sidesThickness).toBe('1.5mm');
  expect(saved.ASSEMBLING.frameThickness).toBe('3mm');
  expect(saved.ASSEMBLING.frameDimensions).toBe('40x40x3');
  const edits = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  for (const field of [back, sides, frame]) {
    await expect(field.locator('[data-material-badge]')).toHaveCount(1);
    await expect(field.locator('.thickness-select')).toHaveCount(0);
    await openEditor(field);
  }
  await expect(page.getByLabel('BACK · Select thickness', { exact: true })).toHaveValue('4mm');
  await expect(page.getByLabel('SIDES · Select thickness', { exact: true })).toHaveValue('1.5mm');
  await expect(page.getByLabel('FRAME · Select thickness', { exact: true })).toHaveValue('3mm');
  await expect(page.getByTestId('change-count')).toHaveText(edits);
});

test('BACK offers GS and sheet thicknesses while flatstock and profiles belong to FRAME', async ({ page }) => {
  await page.goto('/');
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  await openEditor(back);
  await back.locator('.select-trigger').click();
  await back.getByRole('button', { name: /Cast acrylic/ }).click();
  await back.getByRole('button', { name: /PLEXIGLAS GS Clear/ }).click();
  await back.locator('.thickness-select').selectOption('5mm');
  expect((await savedConfiguration(page)).CNC_FREZER).toMatchObject({ backCategory: 'ACRYLIC_GS', backThickness: '5mm' });

  await back.locator('.select-trigger').click();
  await back.getByRole('button', { name: /Aluminum sheets/ }).click();
  await expect(back.locator('.option')).toHaveCount(1);
  await expect(back.locator('.option')).not.toContainText('flat bar');
  await back.getByRole('button', { name: /Aluminium sheet 1500/ }).click();
  const standardThicknesses = ['0.5mm', '1mm', '1.5mm', '2mm', '3mm', '5mm', '8mm', '10mm', '15mm'];
  for (const thickness of standardThicknesses) await expect(back.locator(`option[value="${thickness}"]`)).toHaveCount(1);
  await back.locator('.thickness-select').selectOption('15mm');
  await finishSelection(back);
  await expect(back.locator('[data-material-badge]')).toHaveText('ALU /15mm');

  const frame = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'FRAME', exact: true }) });
  await openEditor(frame);
  await frame.locator('.select-trigger').click();
  await expect(frame.getByRole('button', { name: /Aluminum sheets/ })).toHaveCount(0);
  await expect(frame.getByRole('button', { name: /Aluminum profiles/ })).toBeVisible();
  await frame.getByRole('button', { name: /Aluminium flatstock/ }).click();
  await frame.getByRole('button', { name: /Aluminium flat bar 20x3/ }).click();
  await frame.locator('.thickness-select').selectOption('3mm');
  await finishSelection(frame);
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(back.locator('[data-material-badge]')).toHaveText('ALU /15mm');
  await openEditor(back);
  await openEditor(frame);
  await expect(back.locator('.thickness-select')).toHaveValue('15mm');
  await expect(frame.locator('.select-trigger .value-category')).toHaveText('Aluminium flatstock');
  await expect(frame.locator('.thickness-select')).toHaveValue('3mm');
  expect((await savedConfiguration(page)).CNC_FREZER.back).toBe('Aluminium sheet 1500 × 3000 mm');
});

test('main cable selection excludes internal wiring and uses the entered outgoing length, never the reel', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const cable = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'Main cable', exact: true }) });
  await openEditor(cable);
  await cable.locator('.select-trigger').click();
  await cable.getByRole('button', { name: /Cables and wires/ }).click();
  await expect(cable.locator('.option')).toHaveCount(2);
  await expect(cable.getByRole('button', { name: /control cable|silicone wire/ })).toHaveCount(0);
  await cable.getByRole('button', { name: /TEST H07RN-F/ }).click();
  await page.getByLabel('Length from sign', { exact: true }).fill('5.5 m');
  await finishSelection(cable);
  await expect(cable.locator('[data-material-badge] .selected-summary')).toHaveText('Ø 8.2–9.8 mm · 450/750 V · 5.5 m');
  await expect(cable.locator('[data-material-badge]')).not.toContainText('100');
  await expect(cable.locator('[data-material-badge] [data-selection-fact]')).toHaveCount(3);
  await expect(page.getByLabel('Length from sign', { exact: true })).toHaveCount(0);
  expect((await savedConfiguration(page)).ASSEMBLING.cablesLength).toBe('5.5 m');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(cable.locator('[data-material-badge] .selected-summary')).toHaveText('Ø 8.2–9.8 mm · 450/750 V · 5.5 m');
  await page.getByRole('checkbox', { name: 'Main cable', exact: true }).uncheck();
  await expect(cable.locator('[data-material-badge], .select-trigger')).toHaveCount(0);
  expect((await savedConfiguration(page)).ASSEMBLING.cablesLength).toBe('5.5 m');
  await page.getByRole('checkbox', { name: 'Main cable', exact: true }).check();
  await expect(cable.locator('[data-material-badge] .selected-summary')).toHaveText('Ø 8.2–9.8 mm · 450/750 V · 5.5 m');
  await cable.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('main-cable-compact-phone.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(cable.locator('.edit-selection, .select-trigger')).toHaveCount(0);
  await expect(page.getByLabel('Length from sign', { exact: true })).toHaveCount(0);
});

test('previously saved flatstock backs, profile sides and control cables remain readable without being offered as new choices', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load legacy material roles' }).click();
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  const sides = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^SIDES$/ }) }).first();
  const cable = page.locator('.assembly-item').filter({ has: page.getByRole('checkbox', { name: 'Main cable', exact: true }) });
  await expect(back.locator('[data-material-badge]')).toContainText(/flat bar/i);
  await expect(sides.locator('[data-material-badge]')).toContainText(/tube/i);
  await expect(cable.locator('[data-material-badge]')).toHaveAttribute('title', /TEST LIYCY/);
  const before = await savedConfiguration(page);
  for (const [field, search] of [[back, 'flat'], [sides, 'tube'], [cable, 'LIYCY']] as const) {
    await openEditor(field);
    await field.locator('.select-trigger').click();
    await field.getByRole('searchbox').fill(search);
    await expect(field.locator('.option')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await finishSelection(field);
  }
  expect(await savedConfiguration(page)).toEqual(before);
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('selecting a different LED model updates its compact summary, and 3D catalog material survives serialized reopen', async ({ page }) => {
  await page.goto('/');
  const led = page.locator('.assembly-item').filter({ has: page.getByLabel('LED', { exact: true }) });
  await openEditor(led);
  await led.locator('.select-trigger').click();
  await led.getByRole('button', { name: /LED strips/ }).click();
  await led.getByRole('button', { name: /COB-480-24V/ }).click();
  await expect(led.locator('[data-material-badge] .selected-summary')).toHaveText('LEMLUX · 3000 K · 10 W/m');
  await expect(led.locator('[data-material-badge]')).toHaveAttribute('title', /Lemlux COB-480-24V/);
  await expect(page.getByRole('checkbox', { name: '3D', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add FACE material', exact: true }).click();
  const printing = page.locator('.face-material-entry').last();
  await printing.locator('.select-trigger').click();
  await printing.getByRole('button', { name: /PETG filament/ }).click();
  await printing.getByRole('button', { name: /Spectrum PET-G/ }).click();
  await expect(printing.locator('.thickness-field')).toHaveCount(0);
  await finishSelection(printing);
  await expect(printing.locator('[data-material-badge]')).toHaveText('FDM Spectrum PET-G');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(printing.locator('.select-trigger, .specification-summary')).toHaveCount(0);
  await openEditor(printing);
  await expect(printing.locator('.select-trigger [data-specification="material"]')).toContainText('PET-G');
  await expect(printing.locator('.select-trigger [data-specification="diameter"]')).toContainText('1.75 mm');
  await expect(printing.locator('.select-trigger [data-specification="package"]')).toHaveText('Package contents: 1 spool · 1 kg');
  await finishSelection(printing);
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials[1].category).toBe('FDM_PETG');
  expect(saved.CNC_FREZER.faceMaterials[1].hex).toBe('#FFFFFF');
  expect(saved.ASSEMBLING.ledModuleShort).toBe('Lemlux COB-480-24V LED strip 3000K');
  expect(saved.ASSEMBLING.ledModuleCategory).toBe('LED_STRIP');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(led.locator('[data-material-badge]')).toHaveAttribute('title', /COB-480-24V/);
  await expect(led.locator('[data-material-badge] .selected-summary')).toHaveText('LEMLUX · 3000 K · 10 W/m');
  await expect(printing.locator('[data-material-badge]')).toHaveText('FDM Spectrum PET-G');
  await expect(printing.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(printing.locator('.edit-selection, .select-trigger')).toHaveCount(0);
  await expect(page.getByLabel('FRAME · Select thickness', { exact: true })).toHaveCount(0);
});

test('clearing saved materials removes stale swatches and thickness while retaining frame geometry and toggles', async ({ page }) => {
  await page.goto('/');
  const face = page.locator('.face-material-entry').first();
  const back = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /^BACK$/ }) }).first();
  const frame = page.locator('.assembly-item').filter({ has: page.getByLabel('FRAME', { exact: true }) });
  const led = page.locator('.assembly-item').filter({ has: page.getByLabel('LED', { exact: true }) });
  for (const field of [face, back, frame, led]) {
    await openEditor(field);
    await field.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(field.locator('.select-trigger')).toBeFocused();
    await expect(field.locator('[data-material-badge]')).toHaveCount(0);
    await expect(field.locator('.thickness-field')).toHaveCount(0);
  }
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials[0]).toMatchObject({ value: '', thickness: '', hex: '', category: '', shortName: '', thicknessOptions: [] });
  expect(saved.CNC_FREZER.backThickness).toBe('');
  expect(saved.ASSEMBLING.frameThickness).toBe('');
  expect(saved.ASSEMBLING.frameDimensions).toBe('40x40x2');
  expect(saved.ASSEMBLING.frame).toBe(true);
  expect(saved.ASSEMBLING.led).toBe(true);
  expect(saved.ASSEMBLING.ledModuleShort).toBe('');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  for (const field of [face, back, frame, led]) {
    await expect(field.locator('.select-trigger .placeholder')).toBeVisible();
    await expect(field.locator('[data-material-badge]')).toHaveCount(0);
  }
});

test('optional branded connectors retain the WAGO flag, survive reopen and respect inactive/read-only states', async ({ page }) => {
  await page.goto('/');
  const wago = page.getByRole('checkbox', { name: 'WAGO', exact: true });
  await expect(wago).toBeVisible();
  await wago.focus();
  await page.keyboard.press('Space');
  await expect(wago).toBeChecked();
  const connector = page.locator('.connector-material');
  await connector.locator('.select-trigger').click();
  await connector.getByRole('button', { name: /LED accessories/ }).click();
  await connector.getByRole('button', { name: /WAGO 221-413/ }).click();
  await expect(connector.locator('[data-material-badge]')).toHaveText('WAGO 221-413');
  await expect(connector.locator('.select-trigger')).toHaveCount(0);
  let saved = await savedConfiguration(page);
  expect(saved.ASSEMBLING).toMatchObject({ cablesWago: true, cablesConnector: 'WAGO 221-413 3-conductor connector', cablesConnectorCategory: 'LED_ACCESSORY' });
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(connector.locator('[data-material-badge]')).toHaveText('WAGO 221-413');
  await wago.uncheck();
  await expect(connector).toHaveCount(0);
  saved = await savedConfiguration(page);
  expect(saved.ASSEMBLING.cablesWago).toBe(false);
  expect(saved.ASSEMBLING.cablesConnector).toBe('WAGO 221-413 3-conductor connector');
  await wago.check();
  await openEditor(connector);
  await connector.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(wago).toBeChecked();
  expect((await savedConfiguration(page)).ASSEMBLING.cablesConnector).toBe('');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(wago).toBeChecked();
  await expect(connector.locator('.select-trigger .placeholder')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(wago).toBeDisabled();
  await expect(connector.locator('.select-trigger')).toBeDisabled();
  await expect(connector.locator('.clear-selection')).toHaveCount(0);
});

test('paint catalog identity, custom text and swatch survive reopen and clear together', async ({ page }) => {
  await page.goto('/');
  const paint = page.locator('.paint-item').filter({ has: page.getByLabel('SIDES', { exact: true }) });
  await paint.locator('.select-trigger').click();
  await paint.getByRole('button', { name: /Pantone colors/ }).click();
  await paint.getByRole('button', { name: 'Pantone 186 C', exact: true }).click();
  expect((await savedConfiguration(page)).PAINTING.sidesColor).toEqual({ system: 'Pantone', code: '186_C', hex: '#C8102E' });
  await expect(paint.locator('[data-material-badge]')).toHaveText('Pantone 186 C');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(paint.locator('[data-material-badge]')).toHaveText('Pantone 186 C');
  await openEditor(paint);
  await expect(paint.locator('.select-trigger .value-category')).toHaveText('Pantone colors');
  await paint.locator('.select-trigger').click();
  await paint.getByRole('button', { name: 'Enter custom value', exact: true }).click();
  await paint.getByRole('textbox', { name: 'Enter custom value', exact: true }).fill('Brand blue 1234 special finish');
  await paint.getByLabel('Custom material color').evaluate((element: HTMLInputElement) => {
    element.value = '#1234ab';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await finishSelection(paint);
  await expect(paint.locator('[data-material-badge]')).toHaveText('Brand blue 1234 special finish');
  await expect(paint.locator('[data-material-badge]')).toHaveCSS('background-color', 'rgb(18, 52, 171)');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(paint.locator('[data-material-badge]')).toHaveText('Brand blue 1234 special finish');
  await openEditor(paint);
  await expect(paint.getByRole('textbox', { name: 'Enter custom value', exact: true })).toHaveValue('Brand blue 1234 special finish');
  await expect(paint.getByLabel('Custom material color')).toHaveValue('#1234ab');
  await paint.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(paint.locator('[data-material-badge]')).toHaveCount(0);
  expect((await savedConfiguration(page)).PAINTING.sidesColor).toEqual({ system: '', code: '', hex: '' });
});

test('the last typed character and checkbox change are present in the saved profile', async ({ page }) => {
  await page.goto('/');
  await page.locator('.profile-name input').fill('Production profile revised');
  expect((await savedConfiguration(page)).profileName).toBe('Production profile revised');
  await page.locator('.section').first().getByLabel('LASER', { exact: true }).check();
  expect((await savedConfiguration(page)).CNC_FREZER.laser).toBe(true);
  await page.locator('.notes').first().fill('Final CNC instruction');
  expect((await savedConfiguration(page)).CNC_FREZER.notes).toBe('Final CNC instruction');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(page.locator('.profile-name input')).toHaveValue('Production profile revised');
  await expect(page.locator('.section').first().getByLabel('LASER', { exact: true })).toBeChecked();
  await expect(page.locator('.notes').first()).toHaveValue('Final CNC instruction');
});

test('category browsing, independent FACE rows, removal and serialized reload preserve selections', async ({ page }) => {
  await page.goto('/');
  const rows = page.locator('.face-material-entry');
  await openEditor(rows.first());
  await rows.first().locator('.select-trigger').click();
  await expect(rows.first().locator('.category-option')).toHaveCount(7);
  await expect(rows.first().locator('.option')).toHaveCount(0);
  await rows.first().getByRole('button', { name: /Cast acrylic/ }).click();
  await expect(rows.first().locator('.option')).toHaveCount(3);
  await rows.first().getByRole('button', { name: /PLEXIGLAS GS Clear/ }).click();
  await rows.first().locator('.thickness-select').selectOption('5mm');
  await finishSelection(rows.first());

  await page.getByRole('button', { name: 'Add FACE material', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('.select-trigger').click();
  await rows.nth(1).getByRole('button', { name: /Aluminum composite/ }).click();
  await rows.nth(1).getByRole('button', { name: /Aluminum composite white/ }).click();
  await rows.nth(1).locator('.thickness-select').selectOption('4mm');
  await expect(rows.first().locator('[data-material-badge]')).toHaveText('PLEX 0F00/5mm');
  await expect(rows.first().locator('.selection-editor')).toHaveCount(0);
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials.map((row: any) => [row.value, row.thickness])).toEqual([
    ['PLEXIGLAS GS Clear 0F00', '5mm'], ['Aluminum composite white 0A000', '4mm']
  ]);
  expect(saved.CNC_FREZER.face).toBe('PLEXIGLAS GS Clear 0F00');
  await finishSelection(rows.nth(1));

  const edits = await page.getByTestId('change-count').innerText();
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('[data-material-badge]')).toHaveText('PLEX 0F00/5mm');
  await expect(rows.nth(1).locator('[data-material-badge]')).toContainText('/4mm');
  await expect(page.getByTestId('change-count')).toHaveText(edits);
  await openEditor(rows.first());
  await expect(rows.first().locator('.thickness-select')).toHaveValue('5mm');
  await rows.first().getByRole('button', { name: 'Remove FACE material 1' }).click();
  await expect(rows).toHaveCount(1);
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('Aluminum composite white 0A000');
  // Editing belongs to the removed stable row ID, not the survivor's new index.
  await expect(rows.first().locator('.selection-editor')).toHaveCount(0);
  await expect(rows.first().locator('[data-material-badge]')).toContainText('/4mm');
  await openEditor(rows.first());
  await expect(rows.first().locator('.thickness-select')).toHaveValue('4mm');
  await page.getByRole('button', { name: 'Toggle read only' }).click();
  await expect(page.locator('.add-face')).toHaveCount(0);
  await expect(rows.first().locator('.edit-selection, .select-trigger, .thickness-select')).toHaveCount(0);
  await expect(rows.first().locator('[data-material-badge]')).toContainText('/4mm');
});

test('global search and keyboard dismissal keep the selected value intact', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  await openEditor(row);
  const trigger = row.locator('.select-trigger');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const search = row.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.fill('PLEXIGLAS_GS_LONG');
  await expect(row.locator('.option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await expect(row.locator('.option')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row.locator('.dropdown')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await row.locator('.category-option').last().focus();
  await page.keyboard.press('Tab');
  await expect(row.locator('.dropdown')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('heading', { name: 'Profile controls regression fixture' }).click();
  await expect(row.locator('.dropdown')).toHaveCount(0);
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('PLEXIGLAS_GS_0F00');
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('custom FACE text, color and manual thickness survive remount and continued typing', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  await openEditor(row);
  await row.locator('.select-trigger').click();
  await row.getByRole('button', { name: 'Enter custom value', exact: true }).click();
  await row.getByRole('textbox', { name: 'Enter custom value' }).fill('Custom ruby glass');
  await row.getByLabel('Custom material color').evaluate((element: HTMLInputElement) => {
    element.value = '#881144';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await row.getByRole('textbox', { name: /Select thickness/ }).fill('6.5');
  await expect(row.getByRole('textbox', { name: 'Enter custom value' })).toHaveValue('Custom ruby glass');
  await finishSelection(row);
  await expect(row.locator('[data-material-badge]')).toHaveText('Custom ruby glass/6.5mm');
  await page.getByRole('button', { name: 'Reload serialized profile' }).click();
  await expect(row.locator('[data-material-badge]')).toHaveText('Custom ruby glass/6.5mm');
  await openEditor(row);
  await expect(row.getByRole('textbox', { name: 'Enter custom value' })).toHaveValue('Custom ruby glass');
  await expect(row.getByLabel('Custom material color')).toHaveValue('#881144');
  await expect(row.getByRole('textbox', { name: /Select thickness/ })).toHaveValue('6.5');
  await row.getByRole('textbox', { name: 'Enter custom value' }).fill('Custom ruby glass revised');
  const saved = await savedConfiguration(page);
  expect(saved.CNC_FREZER.faceMaterials[0]).toMatchObject({ value: 'Custom ruby glass revised', hex: '#881144', thickness: '6.5mm' });
  await finishSelection(row);
  await expect(row.locator('[data-material-badge]')).toHaveText('Custom ruby glass revised/6.5mm');
});

test('catalog errors expose retry and do not discard the saved material', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/materials**', route => unavailable
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } }) : catalogResponse(route));
  await page.goto('/');
  const row = page.locator('.face-material-entry').first();
  await openEditor(row);
  await row.locator('.select-trigger').click();
  await expect(row.getByText('Could not load materials. Try again.')).toBeVisible();
  expect((await savedConfiguration(page)).CNC_FREZER.face).toBe('PLEXIGLAS_GS_0F00');
  unavailable = false;
  await row.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(row.locator('.category-option')).toHaveCount(7);
  await expect(page.getByTestId('change-count')).toHaveText('0');
});

test('failed thickness lookup provides manual entry and a working retry', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/material-thickness-options**', route => route.fulfill(unavailable
    ? { status: 503, json: { error: 'Unavailable' } }
    : { json: [{ thickness: 3, unit: 'mm' }, { thickness: 6.5, unit: 'mm' }] }));
  await page.goto('/');
  const field = page.getByRole('region', { name: 'Legacy thickness request' });
  await expect(field.getByText(/could not be loaded/)).toBeVisible();
  await field.getByLabel('Standalone thickness').fill('6.5');
  await expect(page.getByTestId('standalone-thickness')).toHaveText('6.5mm');
  unavailable = false;
  await field.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(field.locator('select')).toHaveValue('6.5mm');
  await expect(field.getByText(/could not be loaded/)).toHaveCount(0);
});

test('a late old thickness response cannot replace the new material choices', async ({ page }) => {
  const pending: Route[] = [];
  await page.route('**/api/material-thickness-options**', async route => {
    if (new URL(route.request().url()).searchParams.get('materialType') === 'ACRYLIC') {
      pending.push(route);
      return;
    }
    await route.fulfill({ json: [{ thickness: 5, unit: 'mm' }] });
  });
  await page.goto('/');
  const field = page.getByRole('region', { name: 'Legacy thickness request' });
  await expect(field.locator('select')).toBeDisabled();
  await field.getByRole('button', { name: 'Use PVC fallback' }).click();
  await expect(field.locator('select')).toBeEnabled();
  await expect(field.locator('option[value="5mm"]')).toHaveCount(1);
  for (const route of pending) await route.fulfill({ json: [{ thickness: 2, unit: 'mm' }] }).catch(() => {});
  await expect(field.locator('option[value="2mm"]')).toHaveCount(0);
  await expect(field.locator('select')).toHaveValue('3mm');
  await field.getByRole('button', { name: 'Use explicit empty options' }).click();
  await expect(field.getByRole('textbox')).toHaveValue('3');
  await expect(field.getByText(/No standard thicknesses/)).toBeVisible();
});

for (const scenario of [
  { width: 320, theme: 'LightVim', language: 'ru', category: /Литой акрил/ },
  { width: 768, theme: 'DarkVim', language: 'lv', category: /Liets akrils/ },
  { width: 1024, theme: 'LightVim', language: 'en', category: /Cast acrylic/ },
  { width: 1440, theme: 'HighContrast', language: 'en', category: /Cast acrylic/ }
]) {
  test(`profile and material menu fit ${scenario.width}px in ${scenario.theme}/${scenario.language}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: 1000 });
    await page.emulateMedia({ colorScheme: scenario.theme === 'LightVim' ? 'dark' : 'light' });
    await page.goto('/');
    await page.getByLabel('Theme', { exact: true }).selectOption(scenario.theme);
    await page.getByLabel('Language', { exact: true }).selectOption(scenario.language);
    const row = page.locator('.face-material-entry').first();
    await openEditor(row);
    await row.locator('.select-trigger').click();
    await row.getByRole('button', { name: scenario.category }).click();
    await expect(row.locator('.option')).toHaveCount(3);
    const widths = await page.evaluate(() => {
      const menu = document.querySelector('.face-material-entry .dropdown')!;
      const options = menu.querySelector('.options-list')!;
      return {
        document: document.documentElement.scrollWidth, viewport: window.innerWidth,
        menu: menu.getBoundingClientRect().width, options: options.scrollWidth,
        optionsClient: options.clientWidth
      };
    });
    await page.screenshot({ path: testInfo.outputPath(`profile-${scenario.width}-${scenario.theme}.png`), fullPage: true });
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.options).toBeLessThanOrEqual(widths.optionsClient + 1);
  });
}
