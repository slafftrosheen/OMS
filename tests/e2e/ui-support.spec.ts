import { test, expect, type Page } from '@playwright/test';

async function mount(page: Page, mode: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdn.jsdelivr.net/npm/jsqr@*/**', route => route.fulfill({contentType:'application/javascript',body:'window.jsQR = () => null;'}));
  await page.goto(`/ui-support.html?case=${mode}`);
  await expect(page.getByRole('heading', {name:'UI support stability fixture'})).toBeVisible();
  return errors;
}

test('native modal stack contains focus, respects busy dismissal and restores focus after teardown', async ({page}) => {
  const errors = await mount(page, 'modals');
  const originalOverflow = await page.evaluate(() => document.body.style.overflow);
  const trigger = page.getByRole('button',{name:'Open parent dialog',exact:true});
  await trigger.click();
  const parent = page.getByRole('dialog',{name:'Parent dialog',exact:true});
  await expect(parent).toBeVisible();
  expect(await parent.evaluate(node => node.matches(':modal'))).toBe(true);
  await parent.getByLabel('Parent draft').fill('Unsaved parent draft');
  await parent.getByLabel('Busy',{exact:true}).check();
  await page.keyboard.press('Escape');
  await page.mouse.click(3,3);
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel('Parent draft')).toHaveValue('Unsaved parent draft');
  await parent.getByLabel('Busy',{exact:true}).uncheck();
  const childTrigger = parent.getByRole('button',{name:'Open child dialog',exact:true});
  await childTrigger.click();
  const child = page.getByRole('dialog',{name:'Child dialog',exact:true});
  await expect(child).toBeVisible();
  await child.getByRole('button',{name:'Last child control'}).focus();
  await page.keyboard.press('Tab');
  await expect(child.getByRole('button',{name:'Close dialog',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(child.getByRole('button',{name:'Last child control'})).toBeFocused();
  for (let index=0;index<5;index++) {
    await page.keyboard.press('Tab');
    expect(await child.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(child).toHaveCount(0);
  await expect(childTrigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(parent).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
  const deferred = page.getByRole('button',{name:'Cancel deferred dialog'});
  await deferred.click();
  await expect(page.getByTestId('cancelled-mounts')).toHaveText('1');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(deferred).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
  const panelTrigger = page.getByRole('button',{name:'Open panel dialog'});
  await panelTrigger.click();
  await expect(page.getByRole('dialog',{name:'Panel dialog',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panelTrigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('comparison, skeleton and late accordion inputs update without discarding explicit choices', async ({page}) => {
  const errors = await mount(page,'reactivity');
  const skeleton = page.getByTestId('skeleton').locator('span');
  await expect(skeleton).toHaveCSS('width','120px');
  await expect(page.getByText('to: 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Update inputs'}).click();
  await expect(skeleton).toHaveCSS('width','64px');
  await expect(skeleton).toHaveCSS('height','64px');
  await expect(skeleton).toHaveCSS('border-radius','50%');
  await expect(page.getByText('to: 4',{exact:true})).toBeVisible();
  const first = page.getByRole('button',{name:'First section',exact:true});
  await expect(first).toHaveAttribute('aria-expanded','true');
  await first.click();
  await page.getByRole('button',{name:'Refresh sections'}).click();
  await expect(page.getByRole('button',{name:'First section refreshed',exact:true})).toHaveAttribute('aria-expanded','false');
  const file = page.getByRole('button',{name:'Artwork.pdf',exact:true});
  await file.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('preview-revision')).toHaveText('revision-one');
  await expect(file).toHaveAttribute('aria-pressed','true');
  await page.getByLabel('First field',{exact:true}).fill('First value');
  await page.getByLabel('Second field',{exact:true}).fill('Second value');
  await expect(page.getByLabel('First field',{exact:true})).toHaveValue('First value');
  expect(errors).toEqual([]);
});

test('global search uses the current API and discards stale query and account responses', async ({page}) => {
  const queries: string[] = [], releases = new Map<string,()=>void>();
  let obsoleteCalls = 0;
  await page.route('**/api/search/suggestions*', route => { obsoleteCalls++; return route.fulfill({json:{}}); });
  await page.route('**/api/search?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q')!;
    queries.push(query);
    if (query === 'older' || query === 'private') await new Promise<void>(resolve => releases.set(query,resolve));
    try { await route.fulfill({json:{results:[{id:query,type:'order',title:`${query} order`,subtitle:'Current API description',href:`/orders/${query}`}],query,count:1}}); } catch { /* The client aborted this deliberately held request. */ }
  });
  const errors = await mount(page,'search');
  await page.getByRole('button',{name:'Open global search'}).click();
  let input = page.getByRole('textbox',{name:'Search orders',exact:true});
  await expect(input).toBeFocused();
  await input.fill('older');
  await expect.poll(() => queries.includes('older')).toBe(true);
  await input.fill('latest');
  await expect(page.getByRole('button',{name:/latest order/})).toBeVisible();
  releases.get('older')!();
  await expect(page.getByRole('button',{name:/older order/})).toHaveCount(0);
  await input.press('ArrowDown'); await input.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Open global search'}).click();
  input = page.getByRole('textbox',{name:'Search orders',exact:true});
  await input.fill('private');
  await expect.poll(() => queries.includes('private')).toBe(true);
  await page.evaluate(() => (window as any).__supportSetAccount('account-two'));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  releases.get('private')!();
  await page.getByRole('button',{name:'Open global search'}).click();
  await expect(page.getByRole('textbox',{name:'Search orders',exact:true})).toHaveValue('');
  await expect(page.getByRole('button',{name:/private order/})).toHaveCount(0);
  expect(obsoleteCalls).toBe(0);
  expect(errors).toEqual([]);
});

test('closing the QR scanner releases late camera permission and reopening makes one fresh request', async ({page}) => {
  await page.addInitScript(() => {
    const state = {calls:0,stops:0,resolve:null as null | (()=>void)};
    (window as any).__camera = state;
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{
      state.calls++; return new Promise(resolve => { state.resolve=()=>resolve({getTracks:()=>[{stop:()=>state.stops++}]}); });
    }}});
  });
  const errors = await mount(page,'qr');
  for(let index=1;index<=2;index++) {
    await page.getByRole('button',{name:'Open scanner'}).click();
    await expect.poll(() => page.evaluate(() => (window as any).__camera.calls)).toBe(index);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => (window as any).__camera.resolve());
    await expect.poll(() => page.evaluate(() => (window as any).__camera.stops)).toBe(index);
  }
  expect(await page.evaluate(() => (window as any).__camera.calls)).toBe(2);
  expect(errors).toEqual([]);
});

test('PDF annotations preserve legacy notes and isolate page and revision drafts', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('rf_pdf_notes_fixture-order_current',JSON.stringify([{id:'legacy',x:.4,y:.5,text:'Legacy first page'}]));
    localStorage.setItem('rf_pdf_notes_fixture-order_current_rects','corrupt JSON');
  });
  const errors = await mount(page,'annotations');
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveValue('Legacy first page');
  await page.getByRole('textbox',{name:'PDF note'}).fill('Edited first page');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rf_pdf_notes_fixture-order_current')!)[0].text)).toBe('Edited first page');
  await page.getByRole('button',{name:'Switch annotation page'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveCount(0);
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toBeFocused();
  await page.getByRole('textbox',{name:'PDF note'}).fill('Second page draft');
  await page.getByRole('button',{name:'Add rectangle',exact:true}).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rect')).toHaveCount(1);
  await page.getByRole('button',{name:'Switch annotation revision'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveCount(0);
  await page.getByRole('button',{name:'Switch annotation revision'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveValue('Second page draft');
  await expect(page.locator('.rect')).toHaveCount(1);
  await page.getByRole('button',{name:'Switch annotation page'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveValue('Edited first page');
  expect(errors).toEqual([]);
});

test('viewing and switching pages never truncates oversized legacy PDF annotations', async ({page}) => {
  const notes = Array.from({length:205}, (_, index) => ({id:`legacy-${index}`,x:.4,y:.5,
    text:index === 0 ? `${'Legacy content '.repeat(800)}END` : `Note ${index}`}));
  const rectangles = Array.from({length:203}, (_, index) => ({id:`legacy-rectangle-${index}`,x:.2,y:.3,w:.4,h:.5}));
  await page.addInitScript(({notes,rectangles}) => {
    localStorage.setItem('rf_pdf_notes_fixture-order_current',JSON.stringify(notes));
    localStorage.setItem('rf_pdf_notes_fixture-order_current_rects',JSON.stringify(rectangles));
  },{notes,rectangles});
  const errors = await mount(page,'annotations');
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveCount(notes.length);
  await expect(page.getByRole('textbox',{name:'PDF note'}).first()).toHaveValue(notes[0].text);
  await expect(page.getByRole('button',{name:'Add note',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Add rectangle',exact:true})).toBeDisabled();
  const stored = () => page.evaluate(() => ({
    notes:JSON.parse(localStorage.getItem('rf_pdf_notes_fixture-order_current')!),
    rectangles:JSON.parse(localStorage.getItem('rf_pdf_notes_fixture-order_current_rects')!)
  }));
  expect(await stored()).toEqual({notes,rectangles});
  await page.getByRole('button',{name:'Switch annotation page'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveCount(0);
  await page.getByRole('button',{name:'Switch annotation page'}).click();
  await expect(page.getByRole('textbox',{name:'PDF note'})).toHaveCount(notes.length);
  await expect(page.getByRole('textbox',{name:'PDF note'}).first()).toHaveValue(notes[0].text);
  expect(await stored()).toEqual({notes,rectangles});
  expect(errors).toEqual([]);
});

function tinyPdf(colors: string[]) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${colors.map((_,index)=>`${3+index*2} 0 R`).join(' ')}] /Count ${colors.length} >>`
  ];
  for(let index=0;index<colors.length;index++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 320] /Resources << >> /Contents ${4+index*2} 0 R >>`);
    const stream=`q ${colors[index]} rg 0 0 240 320 re f Q\n`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  let data='%PDF-1.4\n', offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(data));data+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(data);
  data+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

test('actual PDF viewer renders pages, serializes zoom painting and replaces the source', async ({page}) => {
  await page.route('**/fixture-document.pdf?*', route => route.fulfill({contentType:'application/pdf',body:tinyPdf(
    new URL(route.request().url()).searchParams.get('version')==='first' ? ['1 0 0','0 0 1'] : ['0 1 0'])}));
  const errors = await mount(page,'pdf');
  const canvas = page.locator('canvas.viewer');
  const color = () => canvas.evaluate((element:HTMLCanvasElement) => {
    if(!element.width || !element.height) return [];
    return Array.from(element.getContext('2d')!.getImageData(Math.floor(element.width/2),Math.floor(element.height/2),1,1).data).slice(0,3);
  });
  await expect(page.getByText('Page 1 / 2',{exact:true})).toBeVisible();
  await expect.poll(color).toEqual([255,0,0]);
  const initialWidth = await canvas.evaluate((element:HTMLCanvasElement)=>element.width);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await expect.poll(()=>canvas.evaluate((element:HTMLCanvasElement)=>element.width)).toBeLessThan(initialWidth);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(color).toEqual([255,0,0]);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Page 2 / 2',{exact:true})).toBeVisible();
  await expect.poll(color).toEqual([0,0,255]);
  await page.getByRole('button',{name:'Replace PDF source'}).click();
  await expect(page.getByText('Page 1 / 1',{exact:true})).toBeVisible();
  await expect.poll(color).toEqual([0,255,0]);
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Prev',exact:true})).toBeDisabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('PDF annotation interaction follows successful painting through delayed, late and failed page requests', async ({page}) => {
  await page.addInitScript(() => {
    const state = {held:0,replies:0,failPaint:false,release:null as null | (()=>void)};
    (window as any).__pdfDelay = state;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(this:Worker,message:any,transfer?:any) {
      if(message?.action === 'GetPage' && message.data?.pageIndex === 1 && !state.held) {
        state.held++;
        const worker = this;
        const reply = (event:MessageEvent) => {
          if(event.data?.callbackId === message.callbackId && event.data?.sourceName === message.targetName) {
            state.replies++; worker.removeEventListener('message',reply);
          }
        };
        worker.addEventListener('message',reply);
        state.release = () => send.call(worker,message,transfer ?? []);
        return;
      }
      send.call(this,message,transfer ?? []);
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function(this:HTMLCanvasElement,...args:any[]) {
      if(state.failPaint && this.classList.contains('viewer')) throw new Error('Controlled paint failure');
      return (getContext as any).apply(this,args);
    };
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if(key.startsWith('rf_pdf_notes_')) throw new DOMException('Storage unavailable','QuotaExceededError');
      return save.call(this,key,value);
    };
  });
  await page.route('**/fixture-document.pdf?*',route=>route.fulfill({contentType:'application/pdf',body:tinyPdf(['1 0 0','0 0 1'])}));
  const errors = await mount(page,'pdf');
  const layer = page.locator('.pdf-annotations');
  await expect(layer).toBeVisible();
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  const note = layer.locator('textarea');
  await note.fill('Draft without storage');
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await expect(layer).toBeVisible();
  await expect(note).toHaveValue('Draft without storage');
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__pdfDelay.held)).toBe(1);
  await expect(layer).toBeHidden();
  await expect(layer).toHaveAttribute('inert');
  await expect(note).toHaveValue('Draft without storage');
  await page.getByRole('button',{name:'Prev',exact:true}).click();
  await expect(layer).toBeVisible();
  await page.evaluate(()=>(window as any).__pdfDelay.release());
  await expect.poll(()=>page.evaluate(()=>(window as any).__pdfDelay.replies)).toBe(1);
  await expect(page.getByText('Page 1 / 2',{exact:true})).toBeVisible();
  await expect(note).toHaveValue('Draft without storage');
  await page.evaluate(()=>(window as any).__pdfDelay.failPaint=true);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(layer).toBeHidden();
  await expect(layer).toHaveAttribute('inert');
  await page.evaluate(()=>(window as any).__pdfDelay.failPaint=false);
  await page.getByRole('button',{name:'Prev',exact:true}).click();
  await expect(layer).toBeVisible();
  await expect(note).toHaveValue('Draft without storage');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('export respects disabled templates and empty column selection and cancels its delayed download on close', async ({page}) => {
  const bodies: any[] = [];
  await page.addInitScript(()=>{(window as any).__downloads=[];window.open=((url:string)=>{(window as any).__downloads.push(url);return null;}) as any;});
  await page.route('**/api/export/templates?*',route=>route.fulfill({json:{data:[{id:'template-one',name:'Saved CSV',format:'csv',columns:['title']}]}}));
  await page.route('**/api/export',route=>{
    bodies.push(route.request().postDataJSON());
    return route.fulfill({json:{data:{downloadUrl:'/fixture-export.csv',fileName:'fixture.csv',fileSize:32,recordsCount:1,processingTime:2}}});
  });
  const errors = await mount(page,'export');
  await page.getByRole('button',{name:'Open export'}).click();
  const dialog=page.getByRole('dialog',{name:'Export orders',exact:true});
  await dialog.getByLabel('Use template',{exact:true}).check();
  await dialog.getByRole('button',{name:/Saved CSV/}).click();
  await dialog.getByLabel('Use template',{exact:true}).uncheck();
  const columns=dialog.locator('.column-list input');
  for(const column of await columns.all()) await column.uncheck();
  await expect(dialog.getByRole('button',{name:'Export CSV',exact:true})).toBeDisabled();
  await dialog.getByLabel('title',{exact:true}).check();
  await dialog.getByRole('button',{name:'Export CSV',exact:true}).click();
  await expect(dialog.getByText('Export Complete!',{exact:true})).toBeVisible();
  expect(bodies[0].templateId).toBeNull();
  expect(bodies[0].columns).toEqual(['title']);
  await dialog.getByRole('button',{name:'Close',exact:true}).first().click();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(()=>(window as any).__downloads)).toEqual([]);
  expect(errors).toEqual([]);
});

test('attachment gallery makes one initial request, indexes only images and rejects a previous order response', async ({page},testInfo) => {
  const requests: string[] = []; let release:()=>void=()=>{};
  const attachment=(id:string,type='image/png')=>({id,file_name:`${id}.png`,file_type:type,url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>',uploaded_at:'2026-10-22T12:00:00Z'});
  await page.route('**/api/station-attachments?*',async route=>{
    const url=new URL(route.request().url());requests.push(url.search);
    if(url.searchParams.get('type')==='photo' && url.searchParams.get('orderId')==='first-order') await new Promise<void>(resolve=>{release=resolve;});
    try { await route.fulfill({json:{data:url.searchParams.get('orderId')==='second-order' ? [attachment('second-order-image')] : [attachment('document','application/pdf'),attachment('first-image'),attachment('last-image')]}}); } catch { /* A context switch aborts the held request. */ }
  });
  const errors = await mount(page,'attachments');
  await page.getByRole('button',{name:'View first-image.png',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'first-image.png',exact:true});
  await expect(preview.getByRole('button',{name:'Previous image'})).toBeDisabled();
  const nextImage=preview.getByRole('button',{name:'Next image'});
  const download=preview.getByRole('link',{name:'Download',exact:true});
  for(const width of [1280,320]) {
    await page.setViewportSize({width,height:900});
    for(const control of [nextImage,download]) {
      await expect.poll(()=>control.evaluate(element=>{
        const box=element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
      })).toBe(true);
    }
    const buttonBox=await nextImage.boundingBox(), infoBox=await preview.locator('.lightbox-info').boundingBox();
    expect(buttonBox!.y+buttonBox!.height).toBeLessThanOrEqual(infoBox!.y);
    await page.screenshot({path:testInfo.outputPath(`attachment-preview-${width}.png`),fullPage:true});
  }
  await download.focus();
  await expect(download).toBeFocused();
  await preview.getByRole('button',{name:'Next image'}).click();
  await expect(page.getByRole('dialog',{name:'last-image.png',exact:true}).getByRole('button',{name:'Next image'})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests.length).toBe(1);
  await page.getByRole('button',{name:'Photos',exact:true}).click();
  await expect.poll(()=>requests.length).toBe(2);
  await page.getByRole('button',{name:'Switch attachment order'}).click();
  await expect.poll(()=>requests.length).toBe(3);
  await expect(page.getByRole('button',{name:'View second-order-image.png',exact:true})).toBeVisible();
  release();
  await expect(page.getByRole('button',{name:'View first-image.png',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('user menu keyboard navigation and nonmodal chat focus stay usable at phone width', async ({page}) => {
  await page.setViewportSize({width:320,height:850});
  const errors = await mount(page,'menus');
  const trigger=page.getByRole('button',{name:'User menu — account-one',exact:true});
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem',{name:'My cabinet',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem',{name:'Settings',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem',{name:'Sign out',exact:true})).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem',{name:'My cabinet',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const chatTrigger=page.getByRole('button',{name:'Open chat',exact:true});
  await chatTrigger.click();
  const chat=page.getByRole('dialog',{name:'Team chat',exact:true});
  await expect(chat.getByRole('textbox',{name:'Message',exact:true})).toBeFocused();
  await expect(chat.getByText('Production update',{exact:true})).toBeVisible();
  await expect(chat).not.toHaveAttribute('aria-modal','true');
  expect(await chat.evaluate(node=>node.getBoundingClientRect().width)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: test.info().outputPath('topbar-phone.png'), fullPage: true });
  await page.keyboard.press('Escape'); await expect(chatTrigger).toBeFocused();
  await expect(chat).toHaveCount(0);
  expect(errors).toEqual([]);
});
