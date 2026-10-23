import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CAPABILITIES, defaultParams, redact } from '../src/shared/capabilities'
import { validateCapability, validateFileParams } from '../src/main/capability-service'
import { Storage } from '../src/main/storage'
import { StudioService } from '../src/main/service'

test('every allowed protocol method has a compiled validator and editable generated defaults', () => {
  assert.equal(CAPABILITIES.length, 172)
  const failed: string[] = []
  for (const c of CAPABILITIES.filter(c => !c.unavailable)) {
    try { validateCapability(c.method, defaultParams(c.schema, { threadId: 'test', name: 'test', cwd: process.cwd() })) }
    catch (e) { if (!String(e).includes('参数不符合')) failed.push(`${c.method}: ${e}`) }
  }
  assert.deepEqual(failed, [])
  assert.throws(() => validateCapability('unknown/method', {}), /未允许/)
  assert.throws(() => validateCapability('thread/name/set', { threadId: 123, name: 'x' }), /参数不符合/)
  assert.throws(() => validateCapability('initialize', {}), /握手/)
  assert.deepEqual(redact({ accessToken: 'secret', config: { api_key: 'hidden' }, tokenBudget: 100 }), { accessToken: '[已隐藏]', config: { api_key: '[已隐藏]' }, tokenBudget: 100 })
})

test('file capability cannot escape the project or access private directories, including new paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-cap-files-'))
  const service = new StudioService(new Storage(join(directory, 'data')))
  try {
    await mkdir(join(directory, 'project')); service.storage.addProject(join(directory, 'project'), 'project')
    await validateFileParams(service, 'fs/writeFile', { path: join(directory, 'project', 'new.txt') })
    await assert.rejects(validateFileParams(service, 'fs/writeFile', { path: join(directory, 'escape.txt') }), /限于已打开项目/)
    await assert.rejects(validateFileParams(service, 'fs/createDirectory', { path: join(directory, 'project', '.codex') }), /限于已打开项目/)
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})

test('new permission approvals grant only the requested profile and support session scope', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-permissions-'))
  const service = new StudioService(new Storage(directory)), responses: any[] = []
  service.client = { connected: true, respond: (_id: any, value: any) => responses.push(value), removeAllListeners() {}, stop() {} } as any
  try {
    ;(service as any).serverRequest({ id: 1, method: 'item/permissions/requestApproval', params: { threadId: 't', permissions: { network: { enabled: true }, fileSystem: null } } })
    await service.decide(1, { grant: true, scope: 'session', permissions: { arbitrary: true } })
    assert.deepEqual(responses[0], { permissions: { network: { enabled: true } }, scope: 'session' })
    ;(service as any).serverRequest({ id: 2, method: 'mcpServer/elicitation/request', params: { threadId: 't', mode: 'form' } })
    await service.decide(2, { action: 'accept', content: { answer: 'yes' } })
    assert.deepEqual(responses[1], { action: 'accept', content: { answer: 'yes' }, _meta: null })
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})

test('review completion and compaction use their native terminal events, ignoring stale turns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-review-state-'))
  const service = new StudioService(new Storage(directory))
  try {
    service.beginActivity('thread', '代码审查')
    ;(service as any).notification('turn/started', { threadId: 'thread', turn: { id: 'live' } })
    ;(service as any).notification('turn/completed', { threadId: 'thread', turn: { id: 'older', status: 'interrupted' } })
    assert.equal(service.runtime.activity, 'running')
    ;(service as any).notification('item/completed', { threadId: 'thread', item: { id: 'review', type: 'exitedReviewMode' } })
    assert.equal(service.runtime.activity, 'completed')
    ;(service as any).notification('turn/completed', { threadId: 'thread', turn: { id: 'older', status: 'interrupted' } })
    assert.equal(service.runtime.activity, 'completed')
    service.beginActivity('thread', '压缩上下文')
    ;(service as any).notification('thread/compacted', { threadId: 'thread' })
    assert.equal(service.runtime.activity, 'completed')
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})
