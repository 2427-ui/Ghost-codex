import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, screen, session as electronSession } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath, stat, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { StudioService } from './service'
import { Storage } from './storage'
import { tree, readDocument, saveDocument, gitState, diffDocument } from './files'
import type { Settings, FileDocument, InputAttachment, SendOptions } from '../shared/types'
import { PET_SIZE, collapsedPetBounds, fitPetBounds, resizedPetBounds } from './pet-window'

const here = dirname(fileURLToPath(import.meta.url))
const testMode = process.env.GHOST_TEST === '1'
if (process.env.GHOST_HOME) app.setPath('userData', process.env.GHOST_HOME)
let main: BrowserWindow | null = null
let mini: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let editorDirty = false
let closed = false
let service: StudioService
let store: Storage
let windowSave: ReturnType<typeof setTimeout> | undefined
let miniDrag: { pointer: Electron.Point; bounds: Electron.Rectangle } | null = null
let petSending = false

const windows = () => [main, mini].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
function showMain() { mini?.hide(); main?.show(); main?.focus() }
function showMini() {
  if (mini) {
    mini.setIgnoreMouseEvents(false)
    mini.setBounds(resizedPetBounds(mini.getBounds(), false, screen.getDisplayMatching(mini.getBounds()).workArea))
    mini.webContents.send('ghost:pet-collapse')
  }
  main?.hide(); mini?.showInactive()
}
function validBounds(saved: Electron.Rectangle | null, width: number, height: number) {
  const area = screen.getPrimaryDisplay().workArea
  if (saved && screen.getAllDisplays().some(d => saved.x + saved.width > d.workArea.x + 30 && saved.x < d.workArea.x + d.workArea.width - 30 && saved.y >= d.workArea.y && saved.y < d.workArea.y + d.workArea.height - 30)) return saved
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }
}
async function createWindow(isMini: boolean) {
  let bounds = validBounds(store.get(isMini ? 'miniBounds' : 'mainBounds', null), isMini ? PET_SIZE.width : 1440, isMini ? PET_SIZE.height : 940)
  if (isMini) bounds = fitPetBounds(collapsedPetBounds(bounds), screen.getDisplayMatching(bounds).workArea)
  const window = new BrowserWindow({ ...bounds, minWidth: isMini ? PET_SIZE.width : 1000, minHeight: isMini ? PET_SIZE.height : 680, show: false, frame: false, transparent: isMini, hasShadow: !isMini, backgroundColor: isMini ? '#00000000' : '#ffffff', icon: join(here, '../../resources/ghost.ico'), title: 'Ghost Studio', autoHideMenuBar: true, resizable: !isMini, alwaysOnTop: isMini, skipTaskbar: isMini, webPreferences: { preload: join(here, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {}); return { action: 'deny' } })
  window.webContents.on('will-navigate', event => event.preventDefault())
  const persist = () => {
    clearTimeout(windowSave)
    windowSave = setTimeout(() => {
      if (!window.isDestroyed() && !window.isMinimized() && !window.isMaximized()) store.set(isMini ? 'miniBounds' : 'mainBounds', isMini ? collapsedPetBounds(window.getBounds()) : window.getBounds())
    }, 350)
  }
  window.on('move', persist); window.on('resize', persist)
  window.on('close', event => { if (!quitting && !testMode) { event.preventDefault(); showMini() } })
  if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) await window.loadURL(process.env.ELECTRON_RENDERER_URL + (isMini ? '/?mini=1' : '/'))
  else await window.loadFile(join(here, '../renderer/index.html'), { query: isMini ? { mini: '1' } : {} })
  return window
}

function validateSettings(patch: Partial<Settings>) {
  const validators: Record<string, (value: unknown) => boolean> = {
    codexPath: v => typeof v === 'string' && v.length < 2000,
    persona: v => typeof v === 'string' && v.length <= 12000,
    model: v => typeof v === 'string' && v.length < 200,
    effort: v => ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'none'].includes(String(v)),
    permission: v => v === 'workspace-write' || v === 'read-only',
    mode: v => v === 'default' || v === 'plan',
    motion: v => v === 'full' || v === 'reduced' || v === 'off',
    fontSize: v => typeof v === 'number' && v >= 12 && v <= 20,
    sidebarWidth: v => typeof v === 'number' && v >= 200 && v <= 360,
    detailWidth: v => typeof v === 'number' && v >= 360 && v <= 1200,
    personaEnabled: v => typeof v === 'boolean', mascotVisible: v => typeof v === 'boolean',
    lastProjectId: v => v === null || typeof v === 'string' && !!store.projects().find(p => p.id === v),
    lastSessionId: v => v === null || typeof v === 'string' && !!store.sessions().find(s => s.id === v)
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('无效设置。')
  for (const [key, value] of Object.entries(patch)) if (!validators[key]?.(value)) throw new Error(`无效设置：${key}`)
  return patch
}
function registerIpc() {
  const handle = (name: string, fn: (...args: any[]) => unknown) => ipcMain.handle(`ghost:${name}`, async (event, ...args) => {
    if (!windows().some(window => window.webContents === event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('不受信任的 IPC 来源。')
    return fn(...args)
  })
  const projectPath = (id: string) => { if (typeof id !== 'string') throw new Error('无效项目。'); return store.project(id).path }
  handle('snapshot', () => service.snapshot())
  handle('settings', (patch: Partial<Settings>) => service.settings(validateSettings(patch)))
  handle('chooseCodex', async () => {
    const result = await dialog.showOpenDialog(main!, { title: '选择 Codex 可执行文件', properties: ['openFile'], filters: [{ name: 'Codex', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] })
    return result.canceled ? null : result.filePaths[0]
  })
  handle('connect', () => service.connect())
  handle('login', async () => {
    const result = await service.login()
    if (result.authUrl) {
      const url = new URL(result.authUrl)
      if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Codex 返回了非预期的登录地址。')
      await shell.openExternal(result.authUrl)
    }
    return { loginId: result.loginId }
  })
  handle('cancelLogin', () => service.cancelLogin())
  handle('refreshAccount', () => service.refreshAccount())
  handle('addProject', async () => {
    const result = await dialog.showOpenDialog(main!, { title: '打开本地项目', properties: ['openDirectory'] })
    if (result.canceled) return null
    const path = await realpath(result.filePaths[0])
    if (!(await stat(path)).isDirectory()) throw new Error('请选择目录。')
    const project = store.addProject(path, path.split(/[\\/]/).filter(Boolean).at(-1) || path)
    if (service.client?.connected && !project.nativeId) {
      try {
        const response = await service.capability('project/create', { name: project.name, roots: [{ path }], idempotencyKey: project.id })
        if (response.project?.id) store.bindProject(project.id, response.project.id)
      } catch { /* local project remains usable with an older backend */ }
    }
    service.settings({ lastProjectId: project.id })
    return project
  })
  handle('createSession', (id: string | null) => service.createSession(id))
  handle('syncHistory', () => service.syncHistory())
  handle('history', (id: string) => service.history(id))
  handle('send', (id: string, text: string, options?: SendOptions) => service.send(id, text, options))
  handle('capability', (method: string, params?: Record<string, any>) => service.capability(method, params))
  handle('chooseAttachments', async () => {
    const result = await dialog.showOpenDialog(main!, { title: '添加图片、音频或项目文件', properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    if (result.filePaths.length > 20) throw new Error('每次最多添加 20 个附件。')
    const files: InputAttachment[] = []
    for (const chosen of result.filePaths) {
      const path = await realpath(chosen), info = await stat(path)
      if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('附件须为不超过 20 MB 的文件。')
      const name = path.split(/[\\/]/).at(-1) || path
      const extension = name.split('.').at(-1)?.toLowerCase() || ''
      const type = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension) ? 'image' : ['wav', 'mp3', 'm4a', 'ogg', 'flac'].includes(extension) ? 'audio' : 'file'
      const preview = type === 'image' ? `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${(await readFile(path)).toString('base64')}` : undefined
      service.attachmentPaths.add(path)
      files.push({ id: randomUUID(), path, name, type, preview })
    }
    return files
  })
  handle('interrupt', () => service.interrupt())
  handle('decide', (id: string | number, decision: string | Record<string, unknown>) => service.decide(id, decision))
  handle('tree', (id: string, path: string) => tree(projectPath(id), path))
  handle('read', (id: string, path: string) => readDocument(projectPath(id), path))
  handle('save', (id: string, doc: FileDocument) => saveDocument(projectPath(id), doc))
  handle('git', (id: string) => gitState(projectPath(id)))
  handle('diff', (id: string, path: string, staged: boolean) => diffDocument(projectPath(id), path, staged === true))
  handle('draft', (id: string, text?: string) => {
    store.session(id)
    if (text !== undefined) { if (typeof text !== 'string' || text.length > 100000) throw new Error('草稿过长。'); store.set(`draft:${id}`, text) }
    return store.get(`draft:${id}`, '')
  })
  handle('editorDirty', (value: boolean) => { if (typeof value !== 'boolean') throw new Error('无效编辑状态。'); editorDirty = value })
  handle('petLayout', (expanded: boolean) => {
    if (typeof expanded !== 'boolean' || !mini) throw new Error('无效桌宠布局。')
    mini.setIgnoreMouseEvents(false)
    mini.setBounds(resizedPetBounds(mini.getBounds(), expanded, screen.getDisplayMatching(mini.getBounds()).workArea))
    if (expanded) mini.focus()
  })
  handle('petInteractive', (interactive: boolean) => {
    if (typeof interactive !== 'boolean') throw new Error('无效桌宠交互。')
    mini?.setIgnoreMouseEvents(!interactive, { forward: true })
  })
  handle('petDrag', (phase: string) => {
    if (!mini) return
    if (phase === 'start') miniDrag = { pointer: screen.getCursorScreenPoint(), bounds: mini.getBounds() }
    else if (phase === 'move' && miniDrag) {
      const pointer = screen.getCursorScreenPoint()
      const next = { ...miniDrag.bounds, x: miniDrag.bounds.x + pointer.x - miniDrag.pointer.x, y: miniDrag.bounds.y + pointer.y - miniDrag.pointer.y }
      mini.setBounds(fitPetBounds(next, screen.getDisplayNearestPoint(pointer).workArea))
    } else if (phase === 'end') { miniDrag = null; store.set('miniBounds', collapsedPetBounds(mini.getBounds())) }
    else if (phase !== 'move') throw new Error('无效拖动状态。')
  })
  handle('petSend', async (text: string) => {
    if (petSending || ['running', 'approval'].includes(service.runtime.activity)) throw new Error('请先等待当前任务结束，或停止任务。')
    if (typeof text !== 'string' || !text.trim() || text.length > 100000) throw new Error('请输入不超过 100,000 字符的消息。')
    const settings = store.settings()
    const project = settings.lastProjectId ? store.project(settings.lastProjectId) : null
    petSending = true
    try {
      let id = settings.lastSessionId
      if (!id || store.session(id).projectId !== (project?.id || null)) {
        id = (await service.createSession(project?.id || null)).id
        service.settings({ lastSessionId: id })
      }
      await service.send(id, text)
    } finally { petSending = false }
  })
  handle('window', async (action: string) => {
    switch (action) {
      case 'minimize': main?.minimize(); break
      case 'maximize': main?.isMaximized() ? main.unmaximize() : main?.maximize(); break
      case 'restore': showMain(); break
      case 'mini': case 'close': showMini(); break
      case 'quit': await quit(); break
      default: throw new Error('无效窗口操作。')
    }
  })
  handle('openExternal', async (value: string) => {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('只允许打开 HTTP 或 HTTPS 链接。')
    await shell.openExternal(url.href)
  })
}
async function quit() {
  if ((editorDirty || ['running', 'approval'].includes(service.runtime.activity)) && !testMode) {
    const { response } = await dialog.showMessageBox(main!, { type: 'question', title: '退出 Ghost Studio', message: [editorDirty ? '编辑器中有尚未保存的内容。' : '', ['running', 'approval'].includes(service.runtime.activity) ? '当前任务仍在运行，退出会中断任务。' : ''].filter(Boolean).join('\n'), buttons: ['继续工作', '退出'], defaultId: 0, cancelId: 0 })
    if (response !== 1) return
  }
  quitting = true
  app.quit()
}
app.whenReady().then(async () => {
  app.setAppUserModelId('studio.ghost.desktop')
  if (app.isPackaged) electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"] } }))
  electronSession.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  store = new Storage(app.getPath('userData'))
  if (testMode && process.env.GHOST_TEST_PROJECT) store.addProject(await realpath(process.env.GHOST_TEST_PROJECT), '测试项目')
  service = new StudioService(store)
  registerIpc()
  main = await createWindow(false)
  mini = await createWindow(true)
  main.show()
  service.on('event', event => { for (const window of windows()) window.webContents.send('ghost:event', event) })
  // Use the C3 vector's raster export; native tray icons do not support SVG.
  const icon = nativeImage.createFromPath(join(here, '../../resources/ghost.png'))
  if (!icon.isEmpty()) {
    tray = new Tray(icon.resize({ width: 20, height: 20 }))
    tray.setToolTip('Ghost Studio')
    tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开 Ghost Studio', click: showMain }, { label: '迷你悬浮窗', click: showMini }, { type: 'separator' }, { label: '退出', click: () => { void quit() } }]))
    tray.on('click', showMain)
  }
  screen.on('display-removed', () => {
    if (mini) mini.setBounds(fitPetBounds(mini.getBounds(), screen.getPrimaryDisplay().workArea))
    if (main) main.setBounds(validBounds(main.getBounds(), 1440, 940))
  })
  if (!testMode) service.connect().catch(() => {})
}).catch(error => { dialog.showErrorBox('Ghost Studio 启动失败', error.message); app.exit(1) })
app.on('activate', showMain)
app.on('window-all-closed', () => { if (testMode) app.quit() })
app.on('before-quit', () => { quitting = true; clearTimeout(windowSave); tray?.destroy() })
app.on('will-quit', () => { if (!closed) { closed = true; service?.close() } })
