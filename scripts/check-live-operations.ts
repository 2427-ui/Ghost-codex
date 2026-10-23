import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { StudioService } from '../src/main/service'
import { Storage } from '../src/main/storage'
if (!process.argv.includes('--live')) throw new Error('This check starts real model tasks. Run with --live to opt in.')
const service = new StudioService(new Storage(resolve('.ghost-dev/live-operations-' + Date.now())))
let threadId: string | null = null
function event(method: string): Promise<any> {
  return new Promise((resolve, reject) => { const timer = setTimeout(() => { service.off('event', listener); reject(new Error(`等待 ${method} 超时`)) }, 90000); const listener = (e: any) => { if (e.type === 'notification' && e.method === method && e.params.threadId === threadId) { clearTimeout(timer); service.off('event', listener); resolve(e.params) } }; service.on('event', listener) })
}
try {
  await service.connect(); const session = await service.createSession(null); threadId = session.id
  const started = event('turn/started'), done = event('turn/completed'); started.catch(() => {}); done.catch(() => {})
  await service.send(session.id, '从 1 到 1000 逐行输出数字，不使用工具。', { mode: 'default' })
  const active = await started
  await service.capability('turn/steer', { threadId, expectedTurnId: active.turn.id, input: [{ type: 'text', text: '停止输出数字，只回复 GHOST_STEER_OK，不使用工具。', text_elements: [] }] })
  assert.equal((await done).turn.status, 'completed')
  console.log('PASS: 执行中追加指令与完成事件')
  const queuedDone = event('turn/completed'); queuedDone.catch(() => {})
  const queue = await service.capability('thread/queue/add', { threadId, input: [{ type: 'text', text: '只回复 GHOST_QUEUE_OK，不使用工具。', text_elements: [] }], clientUserMessageId: crypto.randomUUID() })
  try { await service.capability('thread/queue/start', { threadId, queuedSubmissionId: queue.queuedSubmission.id }) }
  catch (e) { if (!/queued submission not found|请先等待|原生队列取走/.test((e as Error).message)) throw e }
  assert.equal((await queuedDone).turn.status, 'completed')
  assert.ok((await service.history(session.id)).some(i => i.text.includes('GHOST_QUEUE_OK')))
  console.log('PASS: 原生队列执行真实任务（包含自动取走消息的情况）')
} finally { if (threadId) await service.client?.request('thread/archive', { threadId }).catch(() => {}); service.close() }

