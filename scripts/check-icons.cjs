const { _electron:electron, expect }=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const asar=require('@electron/asar');
const {execFileSync}=require('node:child_process');
(async()=>{
  await fs.mkdir('output/ui-c3',{recursive:true});
  const ico=await fs.readFile('resources/ghost.ico');
  const png=await fs.readFile('resources/ghost.png');
  const exe=await fs.readFile('dist/win-unpacked/GhostStudio.exe');
  const entries=[];
  for(let i=0;i<ico.readUInt16LE(4);i++) {
    const offset=6+16*i;
    const size=ico[offset]||256;
    const length=ico.readUInt32LE(offset+8);
    const start=ico.readUInt32LE(offset+12);
    const image=ico.subarray(start,start+length);
    expect(image.readUInt32BE(16)).toBe(size);
    expect(image.readUInt32BE(20)).toBe(size);
    expect(exe.includes(image)).toBe(true);
    entries.push(size);
  }
  expect(entries).toEqual([16,20,24,32,40,48,64,128,256]);
  const archive=path.resolve('dist/win-unpacked/resources/app.asar');
  expect(asar.extractFile(archive,'resources/ghost.ico').equals(ico)).toBe(true);
  expect(asar.extractFile(archive,'resources/ghost.png').equals(png)).toBe(true);
  const env={...process.env,GHOST_TEST:'1',GHOST_HOME:path.resolve('.ghost-dev/c3-icon-'+Date.now())};
  delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:path.resolve('dist/win-unpacked/GhostStudio.exe'),env});
  try {
    const page=await app.firstWindow();
    await expect(page.getByRole('heading',{name:'GHOST.'})).toBeVisible();
    const native=await app.evaluate(async({BrowserWindow,app})=>{
      const main=BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('mini=1'));
      const shellIcon=await app.getFileIcon(app.getPath('exe'),{size:'normal'});
      const pixels=shellIcon.toBitmap();let colored=0,visible=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){visible++;if(Math.abs(pixels[i]-pixels[i+1])>2||Math.abs(pixels[i+1]-pixels[i+2])>2)colored++;}
      return {handle:main.getNativeWindowHandle().readBigUInt64LE().toString(),shellIcon:{size:shellIcon.getSize(),coloredPixels:colored,visiblePixels:visible},shellPng:shellIcon.toPNG().toString('base64')};
    });
    const destination=path.resolve('output/ui-c3/taskbar-window-icon.png');
    const nativeIcons=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File',path.resolve('scripts/windows/read-window-icon.ps1'),'-WindowHandle',native.handle,'-OutputFile',destination,'-ExecutablePath',path.resolve('dist/win-unpacked/GhostStudio.exe')],{encoding:'utf8',windowsHide:true}).trim());
    await fs.writeFile('output/ui-c3/taskbar-exe-icon.png',Buffer.from(native.shellPng,'base64'));
    const report={icoSizes:entries,exeContainsAllSizes:true,packagedResourcesMatch:true,windowIcon:nativeIcons.WindowIcon,exeAssociatedIcon:nativeIcons.ExeIcon,electronFileIconLookup:{...native.shellIcon,note:'Returns a generic executable icon here; native WM_GETICON and Windows associated-icon extraction above verify the actual taskbar and EXE artwork.'}};
    await fs.writeFile('output/ui-c3/icon-verification.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    for(const icon of [nativeIcons.WindowIcon,nativeIcons.ExeIcon]) {
      expect(icon.VisiblePixels).toBeGreaterThan(0);expect(icon.ColoredPixels).toBe(0);
    }
  } finally {await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
