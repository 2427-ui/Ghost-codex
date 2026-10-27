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
    settings:{codexPath:'',personaEnabled:true,persona:defaults.persona,model:'fixture-model',effort:'medium',mode:'default',permission:'workspace-write',motion:defaults.motion||'off',startupAnimation:defaults.startupAnimation!==false,mascotVisible:true,fontSize:defaults.fontSize,sidebarWidth:244,detailWidth:520,lastProjectId:'project-1',lastSessionId:null},
    runtime:{connection:defaults.connection||'connected',executable:'codex',version:'Preview',account:{type:'chatgpt',email:'studio@example.com',planType:'Plus'},models:[{id:'fixture-model',model:'fixture-model',displayName:'Studio Model',isDefault:true,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:''}]}],limits:null,activity:'idle',activeThreadId:null,activeTurnId:null,task:'',error:null}
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
    gitDetails:async()=>({branches:['main'],commits:[],remote:'',pullRequest:null}), gitAction:async()=>'',
    search:async(id,query,filenames)=>({hits:query && ('hello.ts'.includes(query) || !filenames && 'silver'.includes(query)) ? [{path:'hello.ts',line:2,text:'export const theme = "silver"'}]:[],truncated:false}),
    reference:async(id,file)=>({id:'reference-'+file,name:file,path:'C:/Projects/Studio/'+file,type:'file'}),
    importAttachments:async files=>files.map((file,index)=>({id:'import-'+index,name:file.name,path:file.path||'clipboard/'+file.name,type:file.bytes?'image':'file',preview:file.bytes?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=':undefined})),
    diff:async(id,file)=>({path:file,original:'before',modified:'after'}),
    chooseAttachments:async()=>[{id:'file-1',name:'notes.md',path:'C:/Projects/Studio/notes.md',type:'file'}],
    createSession:async projectId=>{const s={id:'thread-2',projectId,title:'新的想法',updatedAt:2};state.sessions.unshift(s);return s},
    send:async(id,text)=>{state.settings.lastSessionId=id;setTimeout(()=>{emit({type:'data'});emit({type:'notification',method:'item/completed',params:{threadId:id,item:{id:'sent-user',type:'userMessage',content:[{type:'text',text}]}}});emit({type:'notification',method:'item/completed',params:{threadId:id,item:{id:'sent-agent',type:'agentMessage',text:'已收到，我们可以继续。'}}});},20)},
    petLayout:async()=>{},petInteractive:async()=>{},petDrag:async()=>{},petSend:async()=>{},interrupt:async()=>{}
  };
}

module.exports = fixture;
