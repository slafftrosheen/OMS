import { test, expect, type Locator, type Page } from '@playwright/test';
import { CANVAS_VIDEO_BYTES } from '../ui/canvas-video-fixture';

const boardId = '152f8b54-b90a-438a-8427-71a96299b7b3';
const assetId = 'a9796329-77f6-435b-8b89-3e4dabd137c7';

async function mountCanvas(page: Page) {
  const saved: any[] = [];
  const board: any = { id:boardId,title:'Media study',revision:0,created_at:'2026-10-22T12:00:00Z',updated_at:'2026-10-22T12:00:00Z',payload:{version:1,snapshot:null} };
  let uploaded: any = null;
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    const path = url.pathname; const method = request.method();
    const reply = (value: unknown, status = 200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if (path === '/api/toolkit/models') return reply({models:[{id:'openrouter/free',label:'Free router',isDefault:true}],web:{searxng:true},media:{}});
    if (path === '/api/ai/canvas') return reply({items:[board]});
    if (path === `/api/ai/canvas/${boardId}`) {
      if (method === 'PATCH') { const body = request.postDataJSON(); board.payload = body.payload; board.revision++; saved.push(body); }
      return reply({canvas:board});
    }
    if (path === `/api/toolkit/conversations/${boardId}`) return reply({messages:[],proposals:[],legacyThreads:{}});
    if (path === `/api/toolkit/assets/${boardId}/library`) return reply({files:uploaded ? [uploaded] : []});
    if (path === `/api/toolkit/assets/${boardId}`) {
      if (method === 'POST') {
        uploaded = {id:assetId,fileName:'clip.mp4',mime:'video/mp4',bytes:CANVAS_VIDEO_BYTES.length,url:`/api/toolkit/assets/${boardId}/${assetId}`};
        return reply(uploaded,201);
      }
      return reply({ready:true});
    }
    if (path === `/api/toolkit/assets/${boardId}/${assetId}`) return route.fulfill({status:200,contentType:'video/mp4',body:CANVAS_VIDEO_BYTES});
    if (path === '/api/toolkit/link-preview') {
      const body = request.postDataJSON();
      return reply({url:body.url,title:body.url.includes('youtu') ? 'Workshop film' : 'Reference article',description:'Useful production reference',siteName:body.url.includes('youtu') ? 'YouTube' : 'Example',previewAvailable:true});
    }
    return reply({error:`Unmocked request ${path}`},404);
  });
  await page.goto('/canvas-media.html');
  await expect(page.getByTestId('canvas-dock')).toBeVisible({timeout:45_000});
  await expect(page.getByRole('button',{name:'Select / move',exact:true})).toBeEnabled({timeout:45_000});
  return {saved,board};
}

async function insertLink(page: Page, url: string) {
  await page.getByRole('button',{name:'Insert',exact:true}).click();
  await page.getByLabel('Website or media link').fill(url);
  await page.getByRole('button',{name:'Add link',exact:true}).click();
}

async function waitForCanvasPaint(page: Page, content: Locator) {
  await expect(content).toBeInViewport();
  // tldraw positions its HTML shapes on animation frames. Capture after a
  // completed paint, rather than treating a visible DOM box as painted pixels.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => content.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return !!hit && !!element.closest('.tl-shape')?.contains(hit);
  })).toBe(true);
}

test('canvas has one compact tool selector and native drawing remains operational', async ({page}) => {
  const {saved} = await mountCanvas(page);
  await expect(page.getByRole('toolbar',{name:'Canvas tools'})).toHaveCount(1);
  await expect(page.locator('.node-toolbar')).toHaveCount(0);
  await expect(page.locator('.tlui-toolbar')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Freehand drawing',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Hide assistant',exact:true}).click();
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await page.getByRole('button',{name:'Freehand drawing',exact:true}).click();
  await expect(page.getByRole('button',{name:'Freehand drawing',exact:true})).toHaveAttribute('aria-pressed','true');
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not rendered');
  await page.mouse.move(canvas.x + 100, canvas.y + 140); await page.mouse.down();
  await page.mouse.move(canvas.x + 230, canvas.y + 210,{steps:8}); await page.mouse.up();
  await expect.poll(() => JSON.stringify(saved)).toContain('"type":"draw"');
  await page.getByRole('button',{name:'More tools',exact:true}).click();
  await page.getByRole('button',{name:'Rectangle',exact:true}).click();
  await page.mouse.move(canvas.x + 300, canvas.y + 120); await page.mouse.down();
  await page.mouse.move(canvas.x + 420, canvas.y + 210,{steps:5}); await page.mouse.up();
  await expect.poll(() => JSON.stringify(saved)).toContain('"type":"geo"');
});

test('canvas links, embedded video and uploaded clips persist then native text remains usable', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  const {saved} = await mountCanvas(page);
  await page.getByRole('button',{name:'Hide assistant',exact:true}).click();
  await page.getByRole('button',{name:'Projects',exact:true}).click();
  await insertLink(page,'https://example.com/article');
  await expect(page.getByText('Reference article',{exact:true}).last()).toBeVisible();
  await expect(page.getByRole('link',{name:/Open original.*example\.com/})).toHaveAttribute('href','https://example.com/article');
  await insertLink(page,'https://youtu.be/dQw4w9WgXcQ');
  await expect(page.getByRole('button',{name:'Play video',exact:true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({status:200,contentType:'text/html',body:'<p>Embedded player fixture</p>'}));
  await page.getByRole('button',{name:'Play video',exact:true}).click();
  await expect(page.locator('iframe')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  await page.getByLabel('Choose images, PDFs, video or audio').setInputFiles({name:'clip.mp4',mimeType:'video/mp4',buffer:CANVAS_VIDEO_BYTES});
  await expect(page.locator('video')).toHaveAttribute('src',`/api/toolkit/assets/${boardId}/${assetId}`);
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).readyState), {timeout:15_000}).toBeGreaterThanOrEqual(1);
  await page.locator('video').evaluate(async element => { const video = element as HTMLVideoElement; video.muted = true; await video.play(); });
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await page.locator('video').evaluate(video => (video as HTMLVideoElement).pause());
  await waitForCanvasPaint(page,page.locator('video'));
  await page.screenshot({path:'/tmp/oms-canvas-media-playing.png'});
  await expect.poll(() => JSON.stringify(saved)).toContain('"kind":"video"');
  await page.getByRole('button',{name:'Canvas text',exact:true}).click();
  const canvas = await page.getByTestId('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas not rendered');
  await page.mouse.click(canvas.x + 80,canvas.y + 120);
  await page.keyboard.type('After media'); await page.keyboard.press('Escape');
  await expect.poll(() => JSON.stringify(saved)).toContain('After media');
  await page.reload();
  await expect(page.locator('video')).toHaveAttribute('src',`/api/toolkit/assets/${boardId}/${assetId}`,{timeout:45_000});
});

test('canvas pasted URLs use the same preview flow and never create duplicate native bookmarks', async ({page}) => {
  const {saved} = await mountCanvas(page);
  await page.getByTestId('canvas').click({position:{x:100,y:150}});
  await page.getByTestId('canvas').evaluate(element => {
    const clipboard = new DataTransfer(); clipboard.setData('text/plain','https://example.com/pasted');
    element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
  });
  await expect.poll(() => JSON.stringify(saved)).toContain('https://example.com/pasted');
  expect(JSON.stringify(saved)).not.toContain('"type":"bookmark"');
});

for (const width of [320,1440]) {
  test(`canvas toolbar fits ${width}px and remains readable in three themes`, async ({page}) => {
    test.setTimeout(120_000);
    await page.setViewportSize({width,height:1000});
    await mountCanvas(page);
    await insertLink(page,'https://example.com/reference');
    await expect(page.getByRole('link',{name:/Open original.*example\.com/})).toBeVisible();
    await page.getByRole('button',{name:'More tools',exact:true}).click();
    await page.getByRole('button',{name:'Fit',exact:true}).click();
    for (const theme of ['LightVim','DarkVim','HighContrastVim']) {
      await page.getByLabel('Theme',{exact:true}).selectOption(theme);
      await expect(page.locator('.tl-container')).toHaveClass(theme === 'LightVim' ? /tl-theme__light/ : /tl-theme__dark/);
      const dock = page.getByTestId('canvas-dock');
      await dock.scrollIntoViewIfNeeded();
      const bounds = await dock.boundingBox();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      await waitForCanvasPaint(page,page.getByRole('link',{name:/Open original.*example\.com/}));
      // Capture the actual viewport: Chromium full-page capture can omit
      // composited tldraw layers even while hit-testing remains correct.
      await page.screenshot({path:`/tmp/oms-canvas-preview-${width}-${theme}.png`});
      await page.getByRole('button',{name:'Insert',exact:true}).click();
      const panel = page.getByRole('dialog',{name:'Insert',exact:true});
      await expect(panel).toBeVisible();
      const panelBounds = await panel.boundingBox();
      expect(panelBounds?.x).toBeGreaterThanOrEqual(0);
      expect((panelBounds?.x ?? 0) + (panelBounds?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({path:`/tmp/oms-canvas-${width}-${theme}.png`});
      await page.getByRole('button',{name:'Close tools',exact:true}).click();
    }
    await page.getByLabel('Language',{exact:true}).selectOption('ru');
    await expect(page.getByRole('toolbar',{name:'Инструменты холста'})).toBeVisible();
    await page.getByLabel('Language',{exact:true}).selectOption('lv');
    await expect(page.getByRole('toolbar',{name:'Audekla rīki'})).toBeVisible();
  });
}

test('canvas OpenRouter edits native shapes atomically, reads real drawing pixels, and undoes the complete set', async ({page}) => {
  test.setTimeout(150_000);
  const {saved} = await mountCanvas(page);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  let requestCount=0; let visualRequest:any=null;
  await page.route('**/api/toolkit/brainstorm',async route=>{
    const body=route.request().postDataJSON(); requestCount++;
    const rectangles=body.scene.shapes.filter((shape:any)=>shape.type==='geo');
    const actions=requestCount===1 ? [
      {kind:'create',shape:{type:'geo',x:100,y:100,props:{geo:'rectangle',w:200,h:120,text:'Start',color:'black',fill:'solid'}},reason:'First step'},
      {kind:'create',shape:{type:'geo',x:440,y:100,props:{geo:'rectangle',w:200,h:120,text:'Finish',color:'black'}},reason:'Second step'},
      {kind:'create',shape:{type:'text',x:100,y:30,props:{text:'Workshop flow',font:'sans',size:'l'}},reason:'Heading'}
    ] : [
      {kind:'update',target:rectangles[0].id,patch:{props:{text:'Ready',color:'violet'}},reason:'Clarify start'},
      {kind:'move',targets:[rectangles[1].id],dx:100,dy:40,reason:'Make room'},
      {kind:'resize',target:rectangles[1].id,width:300,height:160,reason:'Improve layout'},
      {kind:'connect',from:rectangles[0].id,to:rectangles[1].id,label:'Next',reason:'Show flow'},
      {kind:'group',targets:rectangles.map((shape:any)=>shape.id),reason:'Keep the steps together'}
    ];
    if(requestCount===2) visualRequest=body;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reply:'Review the proposed drawing changes.',cards:[],actions,
      model:'fixture/vision',scene:{visibleShapes:body.scene.shapes.length,totalShapes:body.scene.totalShapes,truncated:false},
      vision:{requested:body.includeImages,included:0,skipped:0,drawing:!!body.drawing,drawingShapes:body.drawing?.shapeIds.length??0,drawingOmitted:0}})});
  });
  const records=()=>Object.values(saved.at(-1)?.payload?.snapshot?.document?.store??{}).filter((record:any)=>record.typeName==='shape') as any[];
  await page.locator('#toolkit-prompt').fill('Create a two-step workshop diagram and a heading');
  await page.locator('#toolkit-prompt').press('Enter');
  await page.getByRole('button',{name:'Apply all edits',exact:true}).click();
  await expect.poll(()=>records().length).toBe(3);
  await expect(page.getByText('Canvas changes applied. Undo is available.',{exact:true})).toBeVisible();
  const originals=records().map(shape=>({id:shape.id,type:shape.type,x:shape.x,y:shape.y,props:shape.props}));
  await page.locator('.canvas-image-option input').check();
  await page.locator('#toolkit-prompt').fill('Inspect the drawing, clarify the labels, connect the steps and group them');
  await page.locator('#toolkit-prompt').press('Enter');
  await expect(page.getByRole('button',{name:'Apply all edits',exact:true})).toBeVisible({timeout:30_000});
  expect(visualRequest?.scene.shapes).toHaveLength(3);
  expect(visualRequest?.drawing?.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(visualRequest.drawing.shapeIds).toHaveLength(3);
  expect(visualRequest.drawing.width).toBeLessThanOrEqual(1600);
  expect(visualRequest.drawing.height).toBeLessThanOrEqual(1600);
  await page.getByRole('button',{name:'Apply all edits',exact:true}).click();
  await expect.poll(()=>records().some(shape=>shape.type==='group')).toBe(true);
  expect(records().find(shape=>shape.type==='arrow')?.props.text).toBe('Next');
  expect(records().find(shape=>shape.type==='geo'&&shape.props.text==='Ready')?.props.color).toBe('violet');
  expect(records().find(shape=>shape.type==='geo'&&shape.props.text==='Finish')?.props.w).toBe(300);
  await page.getByRole('button',{name:'More tools',exact:true}).click();
  await page.getByRole('button',{name:'Undo last canvas edit',exact:true}).click();
  await expect.poll(()=>records().filter(shape=>shape.type==='group'||shape.type==='arrow').length).toBe(0);
  expect(records().map(shape=>({id:shape.id,type:shape.type,x:shape.x,y:shape.y,props:shape.props}))).toEqual(originals);
  expect(errors).toEqual([]);
});
