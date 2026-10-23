const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const defaultPersona = require('../src/shared/persona/default.json').text;

const root = path.resolve('out/renderer');
const output = path.resolve('output/ui-c3');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.png':'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const requested = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!requested.startsWith(root + path.sep) && requested !== root) { res.writeHead(403).end(); return; }
    const file = requested === root ? path.join(root, 'index.html') : requested;
    res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

function fixture(defaults) {
  const listeners = new Set();
  const drafts = {};
  const history = [
    { id:'user-1', type:'userMessage', text:'帮我看看下一步怎样完善这个项目。' },
    { id:'agent-1', type:'agentMessage', text:'界面已经切换到 **C3 白色玻璃风格**。\n\n### 接下来可以做什么\n\n- 探索项目结构与主要入口\n- 规划下一步开发任务\n- 检查当前代码变更\n\n```ts\nexport const studio = { theme: "silver", ready: true }\n```\n\n| 区域 | 当前状态 |\n| --- | --- |\n| 工作台 | 已就绪 |\n| Ghost | 等待你的指令 |' },
    { id:'tool-1', type:'commandExecution', text:'', command:'npm run build', output:'Typecheck passed. Build completed.', status:'completed' }
  ];
  const state = {
    projects:[{id:'project-1',name:'测试项目',path:'C:/Projects/Studio',updatedAt:1}],
    sessions:[{id:'thread-1',projectId:'project-1',title:'继续完善 Studio',updatedAt:1}],
    approvals:[], historySync:{state:'ready',updatedAt:1,count:1,error:null},
    settings:{codexPath:'',personaEnabled:true,persona:defaults.persona,model:'fixture-model',effort:'medium',mode:'default',permission:'workspace-write',motion:'off',mascotVisible:true,fontSize:defaults.fontSize,sidebarWidth:244,detailWidth:520,lastProjectId:'project-1',lastSessionId:null},
    runtime:{connection:'connected',executable:'codex',version:'Preview',account:{type:'chatgpt',email:'studio@example.com',planType:'Plus'},models:[{id:'fixture-model',model:'fixture-model',displayName:'Studio Model',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:''}]}],limits:null,activity:'idle',activeThreadId:null,activeTurnId:null,task:'',error:null}
  };
  const emit = event => listeners.forEach(callback => callback(event));
  window.__fixture = { state, emit };
  window.ghost = {
    snapshot:async()=>structuredClone(state), subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback)},
    settings:async patch=>{Object.assign(state.settings,patch);return structuredClone(state.settings)},
    history:async()=>structuredClone(history), draft:async(id,text)=>{if(text!==undefined)drafts[id]=text;return drafts[id]||''},
    editorDirty:async()=>{}, syncHistory:async()=>{}, window:async()=>{}, openExternal:async()=>{},
    capability:async()=>({data:[]}), tree:async()=>[{name:'hello.ts',path:'hello.ts',directory:false}],
    read:async(id,file)=>({path:file,content:'// Ghost Studio\nexport const theme = "silver"\nexport function greet() {\n  return "Hello, Ghost"\n}\n',version:'1'}),
    git:async()=>({isRepo:true,branch:'main',entries:[]}),
    chooseAttachments:async()=>[{id:'file-1',name:'notes.md',path:'C:/Projects/Studio/notes.md',type:'file'}],
    createSession:async projectId=>{const s={id:'thread-2',projectId,title:'新的想法',updatedAt:2};state.sessions.unshift(s);return s},
    send:async(id,text)=>{state.settings.lastSessionId=id;setTimeout(()=>{emit({type:'data'});emit({type:'notification',method:'item/completed',params:{threadId:id,item:{id:'sent-user',type:'userMessage',content:[{type:'text',text}]}}});emit({type:'notification',method:'item/completed',params:{threadId:id,item:{id:'sent-agent',type:'agentMessage',text:'已收到，我们可以继续。'}}});},20)},
    petLayout:async()=>{},petInteractive:async()=>{},petDrag:async()=>{},petSend:async()=>{},interrupt:async()=>{}
  };
}

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
    await expect(page.locator('#font-size')).toHaveValue('18');
    await page.locator('#font-size').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#font-size')).toHaveValue('20');
    await page.getByRole('button',{name:'恢复默认界面',exact:true}).click();
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
    for(const activity of ['running','approval','completed','interrupted','error']) {
      await page.evaluate(activity=>{const {state,emit}=window.__fixture;state.runtime.activity=activity;emit({type:'runtime',runtime:{...state.runtime}})},activity);
      await expect(page.locator('.hero .ghost-stage')).toHaveAttribute('data-activity',activity);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    expect(await page.locator('.hero .ghost-eye').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    const mini=await browser.newPage({viewport:{width:400,height:620},deviceScaleFactor:1});
    mini.on('pageerror',error=>errors.push(error.message));
    await mini.addInitScript(fixture,{fontSize:18,persona:defaultPersona}); await mini.goto(url+'/?mini=1');
    await expect(mini.getByRole('button',{name:'恢复 Ghost 工作台'})).toBeVisible();
    await mini.screenshot({path:path.join(output,'pet.png'),omitBackground:true});
    await mini.getByRole('button',{name:'展开桌宠对话'}).click();
    await expect(mini.getByRole('dialog',{name:'与 Ghost 对话'})).toBeVisible();
    await mini.screenshot({path:path.join(output,'pet-chat.png'),omitBackground:true});
    expect(errors).toEqual([]);
    const report={source:'Production renderer in Chrome, deterministic IPC fixture; no account calls',appearance,errors,checks:['two home sizes','chat markdown and attachment','send','Monaco editor','settings','capabilities','terminal','approval','pointer tracking','all activity states','reduced motion','pet conversation'],screenshots:await fs.readdir(output)};
    await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
