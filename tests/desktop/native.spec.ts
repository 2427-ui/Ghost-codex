import { test, expect, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdir, copyFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
test('native host terminal accepts input, resizes, exits; image attachment uses an authorized picker', async () => {
  const project = resolve('.ghost-dev/native-terminal-fixture'); await mkdir(project, { recursive: true })
  const picture = join(project, 'ghost.png'); await copyFile(resolve('resources/ghost.png'), picture)
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), GHOST_HOME: resolve('.ghost-dev/native-e2e-' + Date.now()), GHOST_TEST: '1', GHOST_TEST_PROJECT: project }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: require('electron'), args: ['.'], env })
  try {
    const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await page.getByRole('heading', { name: 'GHOST.' }).waitFor()
    await page.evaluate(() => window.ghost.connect())
    await page.locator('.projects-list').getByRole('button', { name: '测试项目', exact: true }).click()
    await app.evaluate(({ dialog }, picture) => { dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picture] })) as any }, picture)
    await page.getByRole('button', { name: '添加附件', exact: true }).click()
    await expect(page.locator('.composer-attachments img')).toBeVisible()
    await page.getByRole('button', { name: '移除附件 ghost.png' }).click()
    await expect(page.locator('.composer-attachments')).toHaveCount(0)
    await page.getByRole('button', { name: '打开 Codex 功能中心' }).click()
    const center = page.getByRole('dialog', { name: 'Codex 功能中心' })
    await center.locator('.capability-groups').getByRole('button', { name: '终端', exact: true }).click()
    await center.getByLabel('终端执行方式').selectOption('host')
    page.once('dialog', d => d.accept())
    await center.getByRole('button', { name: '启动终端', exact: true }).click()
    await expect(center.locator('.xterm-screen')).toContainText('native-terminal-fixture>', { timeout: 30000 })
    await center.locator('.xterm-screen').click()
    await page.keyboard.type("Write-Output 'GHOST_PTY_INPUT_OK'"); await page.keyboard.press('Enter')
    await expect.poll(async () => ((await center.locator('.xterm-screen').textContent()) || '').split('GHOST_PTY_INPUT_OK').length - 1, { timeout: 30000 }).toBeGreaterThanOrEqual(2)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('mini=1'))!.setContentSize(1366, 768))
    await center.getByRole('button', { name: '停止', exact: true }).click()
    await expect(center.getByRole('button', { name: '启动终端', exact: true })).toBeEnabled({ timeout: 30000 })
    await page.screenshot({ path: '.ghost-dev/screenshots/host-terminal.png' })
    expect(errors).toEqual([])
  } finally { await app.close() }
})
