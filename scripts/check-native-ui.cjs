const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
(async()=>{
  const output=path.resolve('output/ui-c3');
  await fs.mkdir(output,{recursive:true});
  const project=path.resolve('.ghost-dev/c3-native-fixture');
  await fs.mkdir(project,{recursive:true});
  await fs.writeFile(path.join(project,'hello.ts'),'export const theme = "silver"\n');
  const env={...process.env,GHOST_TEST:'1',GHOST_HOME:path.resolve('.ghost-dev/c3-native-'+Date.now()),GHOST_TEST_PROJECT:project};
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged=process.env.GHOST_UI_EXECUTABLE || (process.argv.includes('--packaged') ? path.resolve('dist/win-unpacked/GhostStudio.exe') : undefined);
  const app=await electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:['.'],env});
  const shotPrefix=packaged?'packaged':'native';
  const errors=[];
  try {
    const page=await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
    await expect(page.getByRole('dialog',{name:'Ghost 启动动画'})).toBeVisible();
    await expect(page.locator('.startup-overlay')).toHaveAttribute('data-mode','full');
    await expect(page.locator('video')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading',{name:'GHOST.'})).toBeVisible();
    const defaults=await page.evaluate(()=>window.ghost.snapshot());
    expect(defaults.settings.fontSize).toBe(18);
    expect(defaults.settings.startupAnimation).toBe(true);
    expect(defaults.settings.persona).toBe(require('../src/shared/persona/default.json').text);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.webContents.getURL().includes('mini=1')?w.hide():w.showInactive()));
    await page.evaluate(()=>window.ghost.settings({motion:'off'}));
    await page.reload();
    await page.getByRole('button',{name:'测试项目',exact:true}).click();
    await expect(page.locator('.hero .coordinate-right')).toHaveText('OFFLINE');
    await page.screenshot({path:path.join(output,shotPrefix+'-home.png')});
    const palette=await page.locator('.app-shell').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,glass:getComputedStyle(document.querySelector('.composer-card')).backdropFilter}));
    expect(palette.background).toBe('rgb(255, 255, 255)');
    expect(palette.glass).toContain('blur');
    await page.keyboard.press('Control+,');
    await expect(page.getByRole('dialog',{name:'设置'})).toBeVisible();
    await page.screenshot({path:path.join(output,shotPrefix+'-settings.png')});
    await page.getByRole('button',{name:'关闭设置'}).click();
    await page.getByRole('button',{name:'迷你悬浮窗'}).click();
    const mini=app.windows().find(w=>w.url().includes('mini=1'));
    if(!mini)throw Error('Missing mini window');
    mini.on('pageerror',e=>errors.push(e.message));
    await expect(mini.getByRole('button',{name:'恢复 Ghost 工作台'})).toBeVisible();
    await mini.screenshot({path:path.join(output,shotPrefix+'-pet.png'),omitBackground:true});
    await mini.getByRole('button',{name:'展开桌宠对话'}).click();
    await expect(mini.getByRole('dialog',{name:'与 Ghost 对话'})).toBeVisible();
    await mini.screenshot({path:path.join(output,shotPrefix+'-pet-chat.png'),omitBackground:true});
    await mini.getByRole('button',{name:'打开完整工作台',exact:true}).click();
    await expect(page.getByRole('heading',{name:'GHOST.'})).toBeVisible();
    await expect(page.locator('.startup-overlay')).toHaveCount(0);
    await page.evaluate(()=>window.ghost.settings({motion:'full',startupAnimation:false}));
    await page.reload();
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.startup-overlay')).toHaveCount(0);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).hide());
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-paused','true');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).show());
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-paused','false');
    await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-feedback','none');
    for(const factor of [1.25,1.5]) {
      await app.evaluate(({BrowserWindow},factor)=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).webContents.setZoomFactor(factor),factor);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await expect(page.locator('.app-shell')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      expect(await page.locator('.composer-card').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
      // Native capture avoids the CDP screenshot viewport being scaled twice after setZoomFactor.
      const capture=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).webContents.capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(output,`${shotPrefix}-zoom-${factor}.png`),Buffer.from(capture,'base64'));
    }
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).webContents.setZoomFactor(1));
    const displayScales=[];
    for(const factor of [1.25,1.5]) {
      const scaled=await electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:['.']),`--force-device-scale-factor=${factor}`],env:{...env,GHOST_HOME:path.resolve(`.ghost-dev/c3-scale-${factor}-${Date.now()}`)}});
      try {
        const window=await scaled.firstWindow();window.on('pageerror',error=>errors.push(error.message));
        await expect(window.getByRole('heading',{name:'GHOST.'})).toBeVisible();
        await window.waitForFunction(()=>document.querySelector('.startup-overlay')?.dataset.phase==='regard');
        await expect(window.locator('video')).toHaveCount(0);
        await expect(window.locator('.startup-overlay')).toHaveCount(0,{timeout:5000});
        const geometry=await window.evaluate(()=>({ratio:devicePixelRatio,width:innerWidth,height:innerHeight,inputBottom:document.querySelector('.composer-card').getBoundingClientRect().bottom,toolbarRight:document.querySelector('.titlebar-actions').getBoundingClientRect().right}));
        expect(geometry.ratio).toBeCloseTo(factor);
        expect(geometry.inputBottom).toBeLessThanOrEqual(geometry.height);
        expect(geometry.toolbarRight).toBeLessThanOrEqual(geometry.width+1);
        const capture=await scaled.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1')).webContents.capturePage()).toPNG().toString('base64'));
        await fs.writeFile(path.join(output,`${shotPrefix}-display-${factor}.png`),Buffer.from(capture,'base64'));
        displayScales.push(geometry);
      } finally {await scaled.close()}
    }
    expect(errors).toEqual([]);
    const report={runtime:packaged?'Packaged GhostStudio.exe':'Native Electron',accountCalls:false,palette,displayScales,errors,checks:['startup Escape and preference persistence','offline coordinate','home','settings','collapse to pet','expand pet conversation','restore without replay','hide pauses decoration','125/150% content zoom and native display scale']};
    await fs.writeFile(path.join(output,shotPrefix+'-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
