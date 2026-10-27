import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { gitAction, gitDetails, gitState, diffDocument, searchProject } from '../src/main/files'
import { importAttachments } from '../src/main/attachments'
import { Storage } from '../src/main/storage'
import { StudioService } from '../src/main/service'

test('project search returns literal UTF-8 lines, file references, bounded results and no private/link contents', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ghost-search-')), root = join(base, 'project')
  try {
    await mkdir(root); await mkdir(join(root, '.git')); await mkdir(join(root, 'src')); await mkdir(join(base, 'outside'))
    await writeFile(join(root, 'src', '中文.ts'), 'const marker = "hello 中文"\nsecond marker\n')
    await writeFile(join(root, '.git', 'config'), 'marker secret')
    await writeFile(join(root, 'binary'), Buffer.from([0, 109, 97, 114, 107, 101, 114]))
    await writeFile(join(base, 'outside', 'secret'), 'marker outside')
    await symlink(join(base, 'outside'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.deepEqual((await searchProject(root, 'marker')).hits.map(hit => [hit.path, hit.line]), [['src/中文.ts', 1], ['src/中文.ts', 2]])
    assert.equal((await searchProject(root, '中文', true)).hits[0].path, 'src/中文.ts')
    assert.equal((await searchProject(root, '[a-z]+')).hits.length, 0)
    await writeFile(join(root, 'many.txt'), 'marker\n'.repeat(250))
    const result = await searchProject(root, 'marker')
    assert.equal(result.hits.length, 200); assert.equal(result.truncated, true)
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('Git workflow stages literal filenames, unstages unborn repositories, commits, switches and restores', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ghost-actions-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' }).toString()
  try {
    git('init'); git('config', 'core.autocrlf', 'false'); git('config', 'user.name', 'Ghost Test'); git('config', 'user.email', 'ghost@example.invalid')
    const path = '[a].ts'
    await writeFile(join(root, path), 'original\n'); await writeFile(join(root, 'a.ts'), 'untouched\n')
    await gitAction(root, { action: 'stage', path })
    assert.equal((await gitState(root)).entries.find(e => e.path === 'a.ts')?.status, '??')
    await gitAction(root, { action: 'unstage', path })
    assert.equal((await gitState(root)).entries.find(e => e.path === path)?.status, '??')
    await gitAction(root, { action: 'stage', path }); await gitAction(root, { action: 'stage', path: 'a.ts' })
    await gitAction(root, { action: 'commit', message: 'first commit' })
    assert.equal((await gitDetails(root)).commits[0].subject, 'first commit')
    const branch = (await gitState(root)).branch
    await gitAction(root, { action: 'branch', name: 'codex/test', create: true })
    assert.equal((await gitState(root)).branch, 'codex/test')
    await writeFile(join(root, path), 'staged\n'); await gitAction(root, { action: 'stage', path })
    await writeFile(join(root, path), 'working\n')
    assert.equal((await diffDocument(root, path, false)).original, 'staged\n')
    await gitAction(root, { action: 'restore', path })
    assert.equal(await readFile(join(root, path), 'utf8'), 'staged\n')
    await gitAction(root, { action: 'unstage', path }); await gitAction(root, { action: 'restore', path })
    await gitAction(root, { action: 'branch', name: branch, create: false })
    await assert.rejects(gitAction(root, { action: 'stage', path: '../outside' }), /无效/)
    await assert.rejects(gitAction(root, { action: 'stage', path: '.git/config' }), /无效/)
    await mkdir(join(root, 'nested'))
    await assert.rejects(gitAction(join(root, 'nested'), { action: 'commit', message: 'outside' }), /根目录/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('attachment imports authorize selected files and clipboard images, rejecting excessive or invalid data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ghost-attachments-')), authorized = new Set<string>()
  try {
    await writeFile(join(root, 'notes.md'), 'notes')
    const file = (await importAttachments(root, [{ path: join(root, 'notes.md'), name: '' }], authorized))[0]
    assert.equal(file.type, 'file'); assert.ok(authorized.has(file.path))
    const image = (await importAttachments(root, [{ name: 'paste.png', bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }], authorized))[0]
    assert.equal(image.type, 'image'); assert.ok(image.preview?.startsWith('data:image/png;base64,'))
    await assert.rejects(importAttachments(root, [{ name: 'malicious.exe', bytes: new Uint8Array([77, 90]) }], authorized), /PNG/)
    await assert.rejects(importAttachments(root, Array(21).fill({ path: file.path }), authorized), /20/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('parallel threads isolate duplicate starts, approval, failure, interruption and late terminal events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ghost-parallel-')), storage = new Storage(root), service = new StudioService(storage)
  let count = 0
  const calls: { method: string; params: any }[] = []
  service.client = { connected: true, request: async (method: string, params: any) => {
    calls.push({ method, params })
    if (method === 'thread/start') return { thread: { id: `thread-${++count}` } }
    if (method === 'turn/start') return { turn: { id: `turn-${params.threadId}` } }
    return {}
  }, respond() {}, removeAllListeners() {}, stop() {} } as any
  const notify = (method: string, params: any) => (service as any).notification(method, params)
  try {
    const first = await service.createSession(null), second = await service.createSession(null)
    const one = service.send(first.id, 'one')
    await assert.rejects(service.send(first.id, 'duplicate'), /已有任务/)
    await Promise.all([one, service.send(second.id, 'two')])
    for (const session of [first, second]) notify('turn/started', { threadId: session.id, turn: { id: `turn-${session.id}` } })
    assert.ok(service.isRunning(first.id)); assert.ok(service.isRunning(second.id))
    service.attachmentPaths.add(join(root, 'notes.md'))
    const attachment = { id: 'attachment', name: 'notes.md', path: join(root, 'notes.md'), type: 'file' as const }
    await service.followup(second.id, 'followup', false, [attachment])
    assert.equal(calls.find(c => c.method === 'turn/steer')?.params.expectedTurnId, `turn-${second.id}`)
    assert.deepEqual(calls.find(c => c.method === 'turn/steer')?.params.input[1], { type: 'mention', name: 'notes.md', path: attachment.path })
    await service.followup(first.id, 'queued', true, [attachment])
    assert.equal(calls.find(c => c.method === 'thread/queue/add')?.params.threadId, first.id)
    await assert.rejects(service.followup(first.id, 'unauthorized', true, [{ ...attachment, path: join(root, 'private') }]), /授权/)
    notify('item/commandExecution/outputDelta', { threadId: second.id, itemId: 'command', delta: 'live output', turnId: `turn-${second.id}` })
    assert.ok((await service.history(second.id)).some(item => item.output === 'live output'))
    ;(service as any).serverRequest({ id: 1, method: 'item/fileChange/requestApproval', params: { threadId: first.id } })
    assert.equal(service.runtime.tasks?.[first.id].activity, 'approval'); assert.equal(service.runtime.tasks?.[second.id].activity, 'running')
    await service.interrupt(second.id)
    assert.deepEqual(calls.find(c => c.method === 'turn/interrupt')?.params, { threadId: second.id, turnId: `turn-${second.id}` })
    notify('turn/completed', { threadId: second.id, turn: { id: `turn-${second.id}`, status: 'interrupted' } })
    assert.equal(service.approvals.length, 1); assert.equal(service.runtime.activity, 'approval')
    notify('turn/completed', { threadId: first.id, turn: { id: 'old-turn', status: 'completed' } })
    assert.ok(service.isRunning(first.id))
    await service.decide(1, 'decline')
    notify('turn/completed', { threadId: first.id, turn: { id: `turn-${first.id}`, status: 'completed' } })
    assert.equal(service.isRunning(), false)
    await service.send(second.id, 'retry')
    notify('turn/started', { threadId: second.id, turn: { id: 'new-turn' } })
    notify('turn/completed', { threadId: second.id, turn: { id: `turn-${second.id}`, status: 'completed' } })
    assert.ok(service.isRunning(second.id)); assert.equal(service.runtime.tasks?.[first.id].activity, 'completed')
  } finally { service.close(); await rm(root, { recursive: true, force: true }) }
})
