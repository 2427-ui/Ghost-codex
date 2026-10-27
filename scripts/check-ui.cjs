const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const defaultPersona = require('../src/shared/persona/default.json').text;

const root = path.resolve('out/renderer');
const output = path.resolve('output/ui-c3');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.png':'image/png', '.mp4':'video/mp4' };
const server = http.createServer(async (req, res) => {
  try {
    const requested = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!requested.startsWith(root + path.sep) && requested !== root) { res.writeHead(403).end(); return; }
    const file = requested === root ? path.join(root, 'index.html') : requested;
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    const data=await fs.readFile(file);
    if(req.headers.range) {
      const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if(!match){res.writeHead(416).end();return}
      const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),data.length-1):data.length-1;
      if(start>end||start>=data.length){res.writeHead(416,{'content-range':`bytes */${data.length}`}).end();return}
      res.writeHead(206,{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${data.length}`,'content-length':end-start+1});
      res.end(data.subarray(start,end+1));
    } else {res.setHeader('content-length',data.length);res.end(data)}
  } catch { res.writeHead(404).end(); }
});

const fixture = require('./ui-fixture.cjs');

(async()=>{
  await fs.mkdir(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1440,height:940},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(fixture,{fontSize:18,persona:defaultPersona});
    await page.goto(url);
    await expect(page.getByRole('heading',{name:'GHOST.'})).toBeVisible();
    await page.screenshot({path:path.join(output,'home-1440.png')});
    await page.locator('.quick-actions').screenshot({path:path.join(output,'glass-detail.png')});
    await page.locator('.hero .ghost-stage').screenshot({path:path.join(output,'ghost-detail.png')});
    await page.setViewportSize({width:1366,height:768});
    await page.screenshot({path:path.join(output,'home-1366.png')});
    const appearance=await page.locator('.app-shell').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,scheme:getComputedStyle(document.documentElement).colorScheme,overflow:document.documentElement.scrollWidth>innerWidth}));
    expect(appearance.background).toBe('rgb(255, 255, 255)');
    expect(appearance.scheme).toBe('light'); expect(appearance.overflow).toBe(false);
    await page.getByRole('button',{name:/探索项目/}).click();
    await expect(page.getByLabel('发送给 Ghost 的任务')).not.toBeEmpty();
    await expect(page.getByRole('button',{name:'发送任务',exact:true})).toBeEnabled();
    await page.getByLabel('发送给 Ghost 的任务').fill('');
    await page.getByRole('button',{name:'继续完善 Studio',exact:true}).click();
    await expect(page.locator('.markdown table')).toBeVisible();
    await page.getByRole('button',{name:'添加附件',exact:true}).click();
    await expect(page.locator('.composer-attachments')).toContainText('notes.md');
    await page.screenshot({path:path.join(output,'conversation.png')});
    await page.getByRole('button',{name:'移除附件 notes.md'}).click();
    await page.getByRole('button',{name:'打开项目文件'}).click();
    await page.getByRole('button',{name:'hello.ts',exact:true}).click();
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await page.screenshot({path:path.join(output,'workspace.png')});
    await page.getByRole('button',{name:'打开项目文件'}).click();
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('dialog',{name:'设置'})).toBeVisible();
    await page.screenshot({path:path.join(output,'settings.png')});
    await page.getByRole('button',{name:'界面与动效',exact:true}).click();
    await expect(page.locator('.switch-row').filter({has:page.getByRole('checkbox',{name:'启动动画',exact:true})})).toContainText('2.75 秒');
    await expect(page.getByRole('checkbox',{name:'启动动画',exact:true})).toBeChecked();
    await page.getByRole('checkbox',{name:'启动动画',exact:true}).uncheck();
    await expect(page.getByRole('checkbox',{name:'启动动画',exact:true})).not.toBeChecked();
    await expect(page.locator('#font-size')).toHaveValue('18');
    await page.locator('#font-size').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#font-size')).toHaveValue('20');
    await page.getByRole('button',{name:'恢复默认界面',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:'启动动画',exact:true})).toBeChecked();
    await expect(page.locator('#font-size')).toHaveValue('18');
    await page.screenshot({path:path.join(output,'appearance.png')});
    await page.getByRole('button',{name:'关闭设置'}).click();
    await page.getByRole('button',{name:'打开 Codex 功能中心'}).click();
    await expect(page.getByRole('dialog',{name:'Codex 功能中心'})).toBeVisible();
    await page.screenshot({path:path.join(output,'capabilities.png')});
    await page.locator('.capability-groups').getByRole('button',{name:'终端',exact:true}).click();
    await expect(page.locator('.xterm-screen')).toBeVisible();
    await page.screenshot({path:path.join(output,'terminal.png')});
    await page.getByRole('button',{name:'关闭功能中心'}).click();
    await page.getByRole('button',{name:'新建会话',exact:false}).click();
    await page.getByLabel('发送给 Ghost 的任务').fill('你好，Ghost');
    await page.getByRole('button',{name:'发送任务',exact:true}).click();
    await expect(page.locator('.messages')).toContainText('已收到');
    await page.evaluate(()=>{
      const {state,emit}=window.__fixture;
      state.approvals=[{id:'approval-1',method:'item/commandExecution/requestApproval',threadId:'thread-2',command:'npm run build',reason:'准备验证项目构建。',availableDecisions:['accept','acceptForSession']}];
      emit({type:'approvals',approvals:state.approvals});
    });
    await expect(page.getByRole('region',{name:'操作审批'})).toBeVisible();
    await page.screenshot({path:path.join(output,'approval.png')});
    await page.getByRole('button',{name:'新建会话',exact:false}).click();
    await page.evaluate(()=>{
      const {state,emit}=window.__fixture;state.settings.motion='full';emit({type:'data'});
    });
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-motion','full');
    await page.mouse.move(20,20);
    await expect.poll(()=>page.locator('.hero .ghost-stage').evaluate(el=>el.style.getPropertyValue('--eye-x'))).toBe('-4px');
    await page.locator('.quick-actions button').first().hover();
    await expect.poll(()=>page.locator('.quick-actions button').first().evaluate(el=>el.style.getPropertyValue('--glass-x'))).not.toBe('');
    for(const activity of ['running','approval','completed','interrupted','error']) {
      await page.evaluate(activity=>{const {state,emit}=window.__fixture;state.runtime.activity=activity;emit({type:'runtime',runtime:{...state.runtime}})},activity);
      await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-activity',activity);
      if(activity==='completed') {
        await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-feedback','complete');
        await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-feedback','none');
      }
      if(activity==='error'||activity==='interrupted') expect(await page.locator('.hero .ghost-eye').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    }
    await page.evaluate(()=>{const {state,emit}=window.__fixture;emit({type:'visibility',visible:false});state.runtime.activity='running';emit({type:'runtime',runtime:{...state.runtime}})});
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-paused','true');
    await page.evaluate(()=>{const {state,emit}=window.__fixture;state.runtime.activity='completed';emit({type:'runtime',runtime:{...state.runtime}})});
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-feedback','none');
    await page.evaluate(()=>window.__fixture.emit({type:'visibility',visible:true}));
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-paused','false');
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-feedback','none');
    await page.emulateMedia({reducedMotion:'reduce'});
    expect(await page.locator('.quick-actions button').first().evaluate(el=>el.style.getPropertyValue('--glass-x'))).toBe('');
    expect(await page.locator('.hero .ghost-eye').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    const mini=await browser.newPage({viewport:{width:400,height:620},deviceScaleFactor:1});
    mini.on('pageerror',error=>errors.push(error.message));
    await mini.addInitScript(fixture,{fontSize:18,persona:defaultPersona}); await mini.goto(url+'/?mini=1');
    await expect(mini.getByRole('button',{name:'恢复 Ghost 工作台'})).toBeVisible();
    await mini.screenshot({path:path.join(output,'pet.png'),omitBackground:true});
    await mini.getByRole('button',{name:'展开桌宠对话'}).click();
    await expect(mini.getByRole('dialog',{name:'与 Ghost 对话'})).toBeVisible();
    await mini.screenshot({path:path.join(output,'pet-chat.png'),omitBackground:true});
    const petLayout=await mini.locator('.pet-chat').boundingBox();
    expect(petLayout.x+petLayout.width).toBeLessThanOrEqual(400);
    const startupChecks=[];
    async function startupPage(options={}) {
      const next=await browser.newPage({viewport:{width:1440,height:940},deviceScaleFactor:options.scale||1});
      next.on('pageerror',error=>errors.push(error.message));
      await next.addInitScript(fixture,{fontSize:18,persona:defaultPersona,motion:'full',...options});
      return next;
    }
    const startup=await startupPage();
    await startup.goto(url);
    await expect(startup.getByRole('dialog',{name:'Ghost 启动动画'})).toBeVisible();
    await expect(startup.locator('.app-shell')).toHaveAttribute('inert','');
    const openingStarted=Date.now();
    await expect(startup.locator('video')).toHaveCount(0);
    await startup.waitForFunction(()=>parseFloat(document.querySelector('.startup-overlay')?.style.getPropertyValue('--startup-progress'))>.32);
    await startup.waitForFunction(()=>document.querySelector('.startup-overlay')?.getAttribute('data-phase')==='regard');
    await startup.screenshot({path:path.join(output,'startup-eye.png')});
    await expect(startup.locator('.startup-overlay')).toHaveCount(0,{timeout:5000});
    expect(Date.now()-openingStarted).toBeGreaterThan(2000);
    expect(Date.now()-openingStarted).toBeLessThan(5000);
    await expect(startup.locator('.app-shell')).not.toHaveAttribute('inert','');
    await startup.evaluate(()=>window.__fixture.emit({type:'data'}));
    await expect(startup.locator('.startup-overlay')).toHaveCount(0);
    await startup.reload();
    await expect(startup.getByRole('heading',{name:'GHOST.'})).toBeVisible();
    await expect(startup.locator('.startup-overlay')).toHaveCount(0);
    startupChecks.push('code-only mechanical eye, no video, 2.75s completion, background initialization, no replay on data/reload');
    await startup.close();
    for(const method of ['button','Escape']) {
      const next=await startupPage();await next.goto(url);
      await expect(next.locator('.startup-overlay')).toBeVisible();
      if(method==='button')await next.getByRole('button',{name:/跳过/}).click();else await next.keyboard.press('Escape');
      await expect(next.locator('.startup-overlay')).toHaveCount(0);
      await expect(next.getByLabel('发送给 Ghost 的任务')).toBeEditable();await next.close();
    }
    startupChecks.push('skip button and Escape');
    for(const options of [{startupAnimation:false},{motion:'off'},{motion:'reduced'},{reduced:true}]) {
      const next=await startupPage(options);if(options.reduced)await next.emulateMedia({reducedMotion:'reduce'});
      await next.goto(url);await expect(next.getByRole('heading',{name:'GHOST.'})).toBeVisible();
      await expect(next.locator('.startup-overlay')).toHaveCount(0,{timeout:1500});await next.close();
    }
    startupChecks.push('disabled, static and both reduced motion preferences');
    const stalled=await startupPage();
    await stalled.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.cancelAnimationFrame=()=>{}});
    await stalled.goto(url);
    await expect(stalled.locator('.startup-overlay')).toHaveCount(0,{timeout:5000});await stalled.close();
    startupChecks.push('stalled animation frame cannot trap the workspace');
    for(const scale of [1.25,1.5]) {
      const next=await startupPage({motion:'off',connection:'disconnected',scale});await next.goto(url);
      await expect(next.locator('.hero .coordinate-right')).toHaveText('OFFLINE');
      expect(await next.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      const inputBox=await next.locator('.composer-card').boundingBox();expect(inputBox.y+inputBox.height).toBeLessThan(940);
      await next.screenshot({path:path.join(output,`home-scale-${scale}.png`)});await next.close();
    }
    startupChecks.push('offline status and 125/150% pixel density');
    expect(errors).toEqual([]);
    const report={source:'Production renderer in Chrome, deterministic IPC fixture; no account calls',appearance,errors,startupChecks,checks:['two home sizes','chat markdown and attachment','send','Monaco editor','settings','capabilities','terminal','approval','pointer tracking','all activity states','reduced motion','pet conversation'],screenshots:await fs.readdir(output)};
    await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
