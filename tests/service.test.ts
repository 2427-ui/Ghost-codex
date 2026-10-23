import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StudioService } from '../src/main/service'
import { Storage } from '../src/main/storage'

test('first turn uses the fresh thread; persona changes apply on next turn; approvals expire', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-service-'))
  const storage = new Storage(directory), service = new StudioService(storage)
  const calls: { method: string; params: any }[] = [], responses: any[] = []
  service.client = {
    connected: true,
    request: async (method: string, params: any) => { calls.push({ method, params }); return method === 'thread/start' ? { thread: { id: 'new-thread' } } : method === 'turn/start' ? { turn: { id: 'turn-1' } } : {} },
    respond: (id: unknown, result: unknown) => responses.push({ id, result }), removeAllListeners() {}, stop() {}
  } as any
  try {
    const project = storage.addProject(directory, 'test')
    const session = await service.createSession(project.id)
    assert.deepEqual(await service.history(session.id), [])
    await service.send(session.id, 'first turn')
    assert.equal(calls.filter(c => c.method === 'thread/resume').length, 0, 'fresh threads have no rollout to resume')
    const payload = calls.find(c => c.method === 'turn/start')!.params
    assert.deepEqual(payload.sandboxPolicy, { type: 'workspaceWrite', writableRoots: [directory], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true })
    ;(service as any).notification('turn/started', { threadId: session.id, turn: { id: 'turn-1' } })
    ;(service as any).serverRequest({ id: 10, method: 'item/commandExecution/requestApproval', params: { threadId: session.id, turnId: 'turn-1', command: 'test', availableDecisions: ['accept', 'decline'] } })
    assert.equal(service.runtime.activity, 'approval')
    await service.decide(10, 'decline')
    assert.deepEqual(responses[0], { id: 10, result: { decision: 'decline' } })
    await assert.rejects(service.decide(10, 'accept'), /已结束/)
    ;(service as any).notification('turn/completed', { threadId: session.id, turn: { id: 'turn-1', status: 'completed' } })
    storage.updateSettings({ persona: '新的自定义人设' })
    await service.send(session.id, 'next turn')
    assert.equal(calls.find(c => c.method === 'thread/resume')?.params.developerInstructions, '新的自定义人设')
    ;(service as any).serverRequest({ id: 11, method: 'item/fileChange/requestApproval', params: { threadId: session.id, turnId: 'turn-1' } })
    ;(service as any).notification('turn/completed', { threadId: session.id, turn: { id: 'turn-1', status: 'interrupted' } })
    assert.equal(service.approvals.length, 0)
    assert.equal(service.runtime.activity, 'interrupted')
  } finally { service.close(); await rm(directory, { recursive: true, force: true }) }
})
