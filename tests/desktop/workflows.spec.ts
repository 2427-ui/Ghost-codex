import { test, expect, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
test('offline native workflows: draft, slash, file mention, paste/drop, search, review quote and real Git operations', async () => {
  const directory = resolve('.ghost-dev/workflows-' + Date.now()), project = join(directory, 'project')
  await mkdir(project, { recursive: true }); await mkdir(resolve('output/workflows'), { recursive: true })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: project, windowsHide: true, stdio: 'pipe' }).toString()
  git('init'); git('config', 'core.autocrlf', 'false'); git('config', 'user.name', 'Ghost Test'); git('config', 'user.email', 'ghost@example.invalid')
  await writeFile(join(project, 'hello.ts'), 'export const greeting = "hello original"\n')
  git('add', '.'); git('commit', '-m', 'initial')
  await writeFile(join(project, 'hello.ts'), 'export const greeting = "search marker"\n')
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), GHOST_TEST: '1', GHOST_HOME: join(directory, 'data'), GHOST_TEST_PROJECT: project }
  delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.env.GHOST_WORKFLOWS_EXECUTABLE
  const app = await electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : ['.'], env })
  try {
    const page = await app.firstWindow(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await expect(page.getByRole('dialog', { name: 'Ghost 启动动画' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.locator('.projects-list').getByRole('button', { name: '测试项目', exact: true }).click()
    const composer = page.getByRole('textbox', { name: '发送给 Ghost 的任务' })
    await composer.fill('new project draft')
    await page.getByRole('button', { name: '普通聊天' }).click()
    await composer.fill('ordinary chat draft')
    await page.locator('.projects-list').getByRole('button', { name: '测试项目', exact: true }).click()
    await expect(composer).toHaveValue('new project draft')
    await page.reload()
    await expect(composer).toHaveValue('new project draft')
    await composer.fill('/plan'); await page.keyboard.press('Enter')
    await expect(page.getByLabel('工作模式')).toHaveValue('plan')
    await composer.fill('@hello')
    await expect(page.getByRole('option', { name: 'hello.ts 引用项目文件' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('.composer-attachments')).toContainText('hello.ts')
    await page.getByRole('button', { name: '移除附件 hello.ts' }).click()

    const image = Array.from(await readFile(resolve('resources/ghost.png')))
    for (const kind of ['paste', 'drop']) {
      await composer.evaluate((element, args) => {
        const transfer = new DataTransfer()
        transfer.items.add(new File([new Uint8Array(args.image)], 'pasted.png', { type: 'image/png' }))
        element.dispatchEvent(args.kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }) : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
      }, { image, kind })
      await expect(page.locator('.composer-attachments img')).toBeVisible()
      await page.locator('.composer-attachments button').click()
    }

    await page.getByRole('button', { name: '打开项目文件' }).click()
    await page.getByLabel('项目全文搜索').fill('search marker')
    await page.locator('.search-hit').click()
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await page.getByRole('button', { name: '引用选区', exact: false }).click()
    await expect(composer).toHaveValue(/hello.ts:1/)
    await page.getByRole('button', { name: '引用文件', exact: true }).click()
    await expect(page.locator('.composer-attachments')).toContainText('hello.ts')

    await page.getByRole('button', { name: '查看代码变更' }).click()
    await page.getByRole('button', { name: '暂存', exact: true }).click()
    await page.getByLabel('差异范围').selectOption('index')
    await expect(page.getByRole('button', { name: '取消暂存', exact: true })).toBeVisible()
    await page.locator('.git-change-row button').first().click()
    await expect(page.locator('.monaco-diff-editor')).toBeVisible()
    await page.getByLabel('逐行审查反馈').fill('此行需要处理空值')
    await page.getByRole('button', { name: '加入反馈', exact: true }).click()
    await expect(composer).toHaveValue(/审查反馈：此行需要处理空值/)
    await page.screenshot({ path: 'output/workflows/diff-feedback.png' })
    await page.getByRole('button', { name: '取消暂存', exact: true }).click()
    await page.getByLabel('差异范围').selectOption('working')
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = (async () => ({ response: 0 })) as any })
    await page.getByRole('button', { name: '恢复', exact: true }).click()
    await expect(page.locator('.error-banner')).toContainText('已取消')
    expect(await readFile(join(project, 'hello.ts'), 'utf8')).toContain('search marker')
    await page.getByRole('button', { name: '关闭错误提示' }).click()
    await page.getByRole('button', { name: '暂存', exact: true }).click()
    await page.getByLabel('提交说明').fill('workflow commit')
    await page.getByRole('button', { name: '提交暂存内容' }).click()
    await expect.poll(() => git('log', '-1', '--format=%s').trim()).toBe('workflow commit')
    await page.getByRole('button', { name: '分支与历史', exact: true }).click()
    await page.getByLabel('新分支名称').fill('codex/workflow')
    await page.getByRole('button', { name: '创建并切换', exact: true }).click()
    await expect.poll(() => git('branch', '--show-current').trim()).toBe('codex/workflow')
    await page.getByRole('button', { name: '审查', exact: true }).click()
    await page.getByLabel('审查范围').selectOption('baseBranch')
    await page.getByLabel('审查目标').fill('main')
    await expect(page.getByRole('button', { name: '启动代码审查' })).toBeEnabled()
    await page.screenshot({ path: 'output/workflows/native-workflows.png' })
    expect(errors).toEqual([])
  } finally { await app.close() }
})
