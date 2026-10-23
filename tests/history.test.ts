import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage } from '../src/main/storage'
import { StudioService } from '../src/main/service'
import { HISTORY_SOURCES, importThread, readNativeRegistry } from '../src/main/history'

test('native project aliases and explicit ordinary chats take precedence over cwd', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-native-'))
  const storage = new Storage(directory)
  try {
    await writeFile(join(directory, '.codex-global-state.json'), JSON.stringify({
      'local-projects': { legacy: { name: '原生项目', rootPaths: [directory], updatedAt: 1 } },
      'app-server-project-id-by-legacy-project-id-by-host': { local: { legacy: 'canonical' } },
      'projectless-thread-ids': ['chat'], 'thread-project-assignments': { assigned: { projectKind: 'local', projectId: 'legacy' } }
    }))
    const registry = await readNativeRegistry(storage, directory)
    const project = storage.projects()[0]
    assert.equal(project.name, '原生项目')
    assert.equal(importThread(storage, { id: 'chat', cwd: directory }, false, registry)?.projectId, null)
    assert.equal(importThread(storage, { id: 'chat', cwd: directory, projectId: 'canonical' }, false, registry)?.projectId, project.id)
    assert.equal(importThread(storage, { id: 'assigned', cwd: join(directory, 'worktree') }, false, registry)?.projectId, project.id)
    assert.equal(importThread(storage, { id: 'canonical', cwd: directory, projectId: 'canonical' }, true, registry)?.archived, true)
    assert.equal(importThread(storage, { id: 'ephemeral', ephemeral: true }, false, registry), null)
  } finally { storage.close(); await rm(directory, { recursive: true, force: true }) }
})

test('sync covers all sources, all pages and archives; reading does not resume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-history-'))
  const service = new StudioService(new Storage(directory))
  const calls: { method: string; params: any }[] = []
  service.client = { connected: true, removeAllListeners() {}, stop() {}, request: async (method: string, params: any) => {
    calls.push({ method, params })
    if (method === 'thread/list') return { data: [{ id: params.archived ? 'archive' : params.cursor ? 'page2' : 'page1', name: '共享历史' }], nextCursor: !params.archived && !params.cursor ? 'next' : null }
    if (method === 'thread/items/list') return { data: [{ item: { id: 'u', type: 'userMessage', content: [{ type: 'text', text: '历史' }] } }] }
    return {}
  } } as any
  try {
    service.storage.putSession({ id: 'removed', title: '已被原端删除', projectId: null, updatedAt: 1 })
    await service.syncHistory()
    assert.equal(service.historySync.count, 3)
    assert.deepEqual(calls.filter(c => c.method === 'thread/list').map(c => [c.params.archived, c.params.cursor]), [[false, undefined], [false, 'next'], [true, undefined]])
    assert.deepEqual(calls.find(c => c.method === 'thread/list')?.params.sourceKinds, HISTORY_SOURCES)
    assert.equal((await service.history('page1'))[0].text, '历史')
    assert.equal(calls.some(c => c.method === 'thread/resume'), false)
    assert.equal(service.storage.session('archive').archived, true)
    assert.throws(() => service.storage.session('removed'), /不存在/)
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})

test('ordinary chat starts without project, uses internal cwd and read-only policy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-chat-'))
  const service = new StudioService(new Storage(directory))
  const calls: { method: string; params: any }[] = []
  service.client = { connected: true, removeAllListeners() {}, stop() {}, request: async (method: string, params: any) => { calls.push({ method, params }); return method === 'thread/start' ? { thread: { id: 'chat' } } : {} } } as any
  try {
    const chat = await service.createSession(null)
    assert.equal(chat.projectId, null)
    assert.ok(chat.cwd?.startsWith(join(directory, 'chat-workspaces')))
    await service.send(chat.id, '你好')
    assert.equal(calls[0].params.sandbox, 'read-only')
    assert.deepEqual(calls.find(c => c.method === 'turn/start')?.params.sandboxPolicy, { type: 'readOnly', networkAccess: false })
    assert.ok(calls.some(c => c.method === 'thread/name/set'))
    assert.equal(service.storage.projects().length, 0)
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})
