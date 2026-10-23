import { resolve } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { StudioService } from '../src/main/service'
import { Storage } from '../src/main/storage'
import { CAPABILITIES } from '../src/shared/capabilities'
const directory = resolve('.ghost-dev/capabilities-' + Date.now())
const service = new StudioService(new Storage(directory))
const results: any[] = []
const fixtures: string[] = []
const reads: [string, any][] = [ ['project/list', { limit: 5 }], ['skills/list', { cwds: [process.cwd()], forceReload: false }], ['hooks/list', { cwds: [process.cwd()] }], ['collaborationMode/list', {}], ['mcpServerStatus/list', { limit: 5 }], ['plugin/installed', {}], ['plugin/list', {}], ['app/list', { limit: 5 }], ['experimentalFeature/list', { limit: 5 }], ['permissionProfile/list', {}], ['windowsSandbox/readiness', {}], ['configRequirements/read', {}], ['config/read', { includeLayers: false }], ['account/usage/read', {}], ['threadSection/list', {}], ['remoteControl/status/read', {}], ['memory/status', {}] ]
try {
  await service.connect()
  for (const [method, params] of process.argv.includes('--tasks-only') ? [] : reads) {
    try { const result = await service.capability(method, params); results.push({ method, available: true, entries: result?.data?.length ?? null }); console.log('PASS:', method) }
    catch (e) { results.push({ method, available: false, reason: (e as Error).message, connectionError: service.runtime.error }); console.log('UNAVAILABLE:', method, (e as Error).message.slice(0, 180), service.runtime.error || ''); if (service.runtime.connection !== 'connected') await service.connect() }
  }
  if (process.argv.includes('--live')) {
    const session = await service.createSession(null)
    fixtures.push(session.id)
    const completion = (review = false) => new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { service.off('event', listener); reject(new Error('任务超时')) }, 90000); const listener = (event: any) => { if (event.type === 'notification' && (review ? event.method === 'item/completed' && event.params.item?.type === 'exitedReviewMode' : event.method === 'turn/completed')) { clearTimeout(timer); service.off('event', listener); review || event.params.turn?.status === 'completed' ? resolve() : reject(new Error(event.params.turn.error?.message || `任务失败：${event.params.turn.status}`)) } }; service.on('event', listener) })
    let done = completion(); done.catch(() => {})
    await service.send(session.id, '只回复 GHOST_CAPABILITIES_OK，不调用任何工具。', { mode: 'plan' }); await done
    await service.capability('thread/goal/set', { threadId: session.id, objective: 'Ghost goal interface verification', origin: 'user' })
    if (!(await service.capability('thread/goal/get', { threadId: session.id })).goal) throw new Error('任务目标读取失败')
    await service.capability('thread/goal/clear', { threadId: session.id })
    const queued = await service.capability('thread/queue/add', { threadId: session.id, input: [{ type: 'text', text: 'Fixture queue, do not execute', text_elements: [] }], clientUserMessageId: crypto.randomUUID() })
    await service.capability('thread/queue/list', { threadId: session.id })
    await service.capability('thread/queue/delete', { threadId: session.id, queuedSubmissionId: queued.queuedSubmission.id })
    console.log('PASS: 任务目标与原生队列增删读取')
    done = completion(true); done.catch(() => {})
    await service.capability('review/start', { threadId: session.id, target: { type: 'custom', instructions: '只回复 GHOST_REVIEW_OK，不调用任何工具。这是界面接入测试。' }, delivery: 'inline' }); await done
    console.log('PASS: 原生 review/start 与审查完成事件')
    await service.capability('thread/name/set', { threadId: session.id, name: 'Ghost capabilities fixture' })
    const fork = await service.capability('thread/fork', { threadId: session.id, excludeTurns: true })
    fixtures.push(fork.thread.id)
    await service.capability('thread/archive', { threadId: fork.thread.id })
    await service.capability('thread/unarchive', { threadId: fork.thread.id })
    await service.capability('thread/archive', { threadId: fork.thread.id })
    await service.capability('thread/archive', { threadId: session.id })
    console.log('PASS: Plan 真实任务、重命名、分叉、归档和恢复')
  }
  await mkdir(resolve('.ghost-dev'), { recursive: true })
  await writeFile(resolve('.ghost-dev/capability-probe.json'), JSON.stringify({ version: service.runtime.version, protocolMethods: CAPABILITIES.length, results }, null, 2))
} finally { for (const threadId of fixtures) await service.client?.request('thread/archive', { threadId }).catch(() => {}); service.close() }

