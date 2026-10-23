import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Storage } from '../src/main/storage'
import { StudioService } from '../src/main/service'
import { CodexClient, findCodex } from '../src/main/codex'

const directory = resolve('.ghost-dev/shared-' + Date.now())
await mkdir(directory, { recursive: true })
const studio = new StudioService(new Storage(join(directory, 'studio')))
let other: CodexClient | null = null
let fixture: string | null = null
const created: string[] = []
function completed(service: StudioService) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('共享会话任务超时')) }, 120000)
    const cleanup = () => { clearTimeout(timer); service.off('event', listener) }
    const listener = (event: any) => {
      if (event.type !== 'notification' || event.method !== 'turn/completed') return
      cleanup()
      event.params.turn.status === 'completed' ? resolve() : reject(new Error('任务未完成'))
    }
    service.on('event', listener)
  })
}
try {
  await studio.connect()
  assert.equal(studio.historySync.state, 'ready', studio.historySync.error || '')
  const sessions = studio.storage.sessions()
  console.log(JSON.stringify({ shared: sessions.length, ordinary: sessions.filter(s => !s.projectId).length, archived: sessions.filter(s => s.archived).length, projects: studio.storage.projects().length }))
  // No user conversation is resumed or modified by this check.
  if (process.argv.includes('--live')) {
    other = new CodexClient(await findCodex())
    await other.start()
    const cwd = join(directory, 'external-fixture'); await mkdir(cwd)
    const { thread } = await other.request('thread/start', { cwd, ephemeral: false, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' })
    fixture = thread.id
    created.push(thread.id)
    await other.request('thread/name/set', { threadId: fixture, name: 'Ghost shared-history verification' })
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('外部会话超时')), 120000)
      other!.on('notification', ({ method, params }) => { if (method === 'turn/completed' && params.threadId === fixture) { clearTimeout(timer); params.turn.status === 'completed' ? resolve() : reject(new Error('外部任务失败')) } })
    })
    await other.request('turn/start', { threadId: fixture, input: [{ type: 'text', text: '只回复 SHARED_EXTERNAL_OK，不调用任何工具。', text_elements: [] }] })
    await finished
    other.stop(); other = null
    await studio.syncHistory()
    assert.ok(studio.storage.session(fixture!).id)
    assert.ok((await studio.history(fixture!)).some(item => item.text.includes('SHARED_EXTERNAL_OK')))
    console.log('PASS: 外部客户端创建 → Studio 同步和只读打开')
    const done = completed(studio); done.catch(() => {})
    await studio.send(fixture!, '只回复 SHARED_STUDIO_OK，不调用任何工具。')
    await done
    other = new CodexClient(await findCodex()); await other.start()
    const page = await other.request('thread/items/list', { threadId: fixture, limit: 100 })
    assert.ok(page.data.some((entry: any) => entry.item.text?.includes('SHARED_STUDIO_OK')))
    console.log('PASS: Studio 接续同一 ID → 外部客户端能读到新增回复')
    const chat = await studio.createSession(null); fixture = chat.id
    created.push(chat.id)
    const doneChat = completed(studio); doneChat.catch(() => {})
    await studio.send(chat.id, '只回复 PROJECTLESS_OK，不调用任何工具。'); await doneChat
    await studio.syncHistory()
    assert.equal(studio.storage.session(chat.id).projectId, null)
    assert.ok((await studio.history(chat.id)).some(item => item.text.includes('PROJECTLESS_OK')))
    console.log('PASS: 普通聊天无需项目，完成后同步仍为普通聊天')
  }
} finally {
  for (const threadId of created) await (other?.connected ? other : studio.client)?.request('thread/archive', { threadId }).catch(() => {})
  other?.removeAllListeners(); other?.stop(); studio.close()
}
