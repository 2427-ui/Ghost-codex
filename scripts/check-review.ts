import { resolve } from 'node:path'
import { StudioService } from '../src/main/service'
import { Storage } from '../src/main/storage'
if (!process.argv.includes('--live')) throw new Error('This check starts real model tasks. Run with --live to opt in.')
const service = new StudioService(new Storage(resolve('.ghost-dev/review-' + Date.now())))
let id: string | null = null
try {
  await service.connect(); const s = await service.createSession(null); id = s.id
  service.on('event', (e: any) => { if (e.type === 'notification' && ['turn/started', 'turn/completed'].includes(e.method)) console.log(e.method, e.params.turn?.id, e.params.turn?.status, e.params.turn?.error?.message || '') })
  const wait = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('review timeout')), 60000); service.on('event', (e: any) => { if (e.type === 'notification' && e.method === 'item/completed' && e.params.item?.type === 'exitedReviewMode') { clearTimeout(timer); resolve() } }) })
  wait.catch(() => {})
  const response = await service.capability('review/start', { threadId: s.id, target: { type: 'custom', instructions: '仅确认代码审查接口工作正常，不使用工具。' }, delivery: 'inline' })
  console.log('review response:', response.turn?.id, response.reviewThreadId)
  await wait
  console.log('PASS: exitedReviewMode')
} finally { if (id) await service.client?.request('thread/archive', { threadId: id }).catch(() => {}); service.close() }
