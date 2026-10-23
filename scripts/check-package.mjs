import { _electron as electron } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const env = { ...process.env, GHOST_TEST: '1', GHOST_HOME: resolve('.ghost-dev/package-check-' + Date.now()), GHOST_TEST_PROJECT: resolve('.ghost-dev/package-fixture') }
delete env.ELECTRON_RUN_AS_NODE
await mkdir(env.GHOST_TEST_PROJECT, { recursive: true })
await mkdir(resolve('.ghost-dev/screenshots'), { recursive: true })
await writeFile(resolve(env.GHOST_TEST_PROJECT, 'example.ts'), 'export const assistant = "Ghost";\n')
const app = await electron.launch({ executablePath: resolve('dist/win-unpacked/GhostStudio.exe'), env })
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: 'GHOST.' }).waitFor()
  if ((await page.evaluate(() => window.ghost.snapshot())).settings.lastProjectId !== null) throw new Error('Fresh packaged app must allow ordinary chat')
  const defaults = (await page.evaluate(() => window.ghost.snapshot())).settings
  const persona = JSON.parse(await readFile(new URL('../src/shared/persona/default.json', import.meta.url), 'utf8')).text
  if (defaults.fontSize !== 18 || defaults.persona !== persona) throw new Error('Packaged default font/persona mismatch')
  await page.locator('.projects-list').getByRole('button', { name: '测试项目', exact: true }).click()
  await page.getByRole('button', { name: '打开项目文件' }).click()
  await page.getByRole('button', { name: 'example.ts', exact: true }).click()
  await page.locator('.monaco-editor').waitFor()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('mini=1')).setContentSize(1366, 768))
  await page.screenshot({ path: '.ghost-dev/screenshots/packaged.png' })
  const info = await app.evaluate(({ app, BrowserWindow }) => ({ version: app.getVersion(), packaged: app.isPackaged, contextIsolation: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().contextIsolation, sandbox: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox }))
  if (info.version !== manifest.version) throw new Error('Packaged app version mismatch')
  if (!info.packaged || !info.contextIsolation || !info.sandbox) throw new Error('Packaged security settings are incorrect')
  if (await page.evaluate(() => typeof window.require) !== 'undefined') throw new Error('Node.js leaked to renderer')
  await page.getByRole('button', { name: '打开 Codex 功能中心' }).click()
  await page.getByRole('dialog', { name: 'Codex 功能中心' }).waitFor()
  await page.getByRole('button', { name: '关闭功能中心' }).click()
  if (errors.length) throw new Error(errors.join('\n'))
  await page.getByRole('button', { name: '迷你悬浮窗', exact: true }).click()
  const pet = app.windows().find(window => window.url().includes('mini=1'))
  await pet.locator('.pet-companion').waitFor()
  const alpha = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('mini=1'))
    return (await window.webContents.capturePage()).toBitmap()[3]
  })
  if (alpha !== 0) throw new Error('Packaged pet background is not transparent')
  await pet.getByRole('button', { name: '展开桌宠对话' }).click()
  await pet.getByLabel('桌宠消息输入').waitFor()
  await pet.getByRole('button', { name: '收起桌宠对话' }).click()
  await pet.getByRole('button', { name: '恢复 Ghost 工作台' }).click()
  await page.locator('.app-shell').waitFor()
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS: packaged executable, preload, local Monaco, sandbox, transparent pet, chat bubble, restore')
} finally { await app.close() }
