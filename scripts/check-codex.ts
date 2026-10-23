import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CodexClient, findCodex, codexVersion } from '../src/main/codex'

let client: CodexClient | null = null
let threadId: string | null = null
async function connected() { const executable = await findCodex(); console.log('CLI:', await codexVersion(executable)); const next = new CodexClient(executable); next.on('request', request => next.reject(request.id, 'Smoke test does not authorize tools.')); await next.start(); return next }
function awaitTurn(target: CodexClient, id: string, expectInterrupted = false): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => { cleanup(); reject(new Error('等待真实任务完成超时')) }, 120000)
    timer.unref()
    const cleanup = () => { clearTimeout(timer); target.off('notification', listener); target.off('disconnected', disconnected) }
    const disconnected = (message: string) => { cleanup(); reject(new Error(message)) }
    const listener = ({ method, params }: any) => {
      if (params.threadId !== id) return
      if (method === 'item/agentMessage/delta') text += params.delta
      if (method === 'turn/completed') {
        cleanup()
        if (params.turn.status === (expectInterrupted ? 'interrupted' : 'completed')) resolve(text)
        else reject(new Error(params.turn.error?.message || `任务状态：${params.turn.status}`))
      }
    }
    target.on('notification', listener); target.on('disconnected', disconnected)
  })
}
try {
  client = await connected()
  const account = await client.request('account/read', { refreshToken: false })
  console.log('认证:', account.account?.type || '未登录')
  const models = await client.request('model/list', { limit: 100 })
  console.log('模型数:', models.data?.length || 0)
  if (process.argv.includes('--live')) {
    if (!account.account) throw new Error('请先使用 ChatGPT 登录 Codex。')
    const cwd = resolve('.ghost-dev/smoke-project'); await mkdir(cwd, { recursive: true })
    const model = models.data.find((m: any) => m.isDefault) || models.data[0]
    const thread = await client.request('thread/start', { cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user', model: model.model, developerInstructions: 'You are Ghost. Follow the user request precisely.' })
    threadId = thread.thread.id
    let completion = awaitTurn(client, threadId!)
    await client.request('turn/start', { threadId, input: [{ type: 'text', text: '只回复 GHOST_OK，不要调用任何工具。', text_elements: [] }] })
    const first = await completion
    if (!first.includes('GHOST_OK')) throw new Error('真实推理未返回预期标记。')
    console.log('PASS: 真实流式回复')
    client.removeAllListeners(); client.stop()
    client = await connected()
    await client.request('thread/resume', { threadId, excludeTurns: true, cwd, sandbox: 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user' })
    const history = await client.request('thread/items/list', { threadId, limit: 100 })
    if (!history.data?.some((entry: any) => entry.item.text?.includes('GHOST_OK'))) throw new Error('重连后的历史记录缺失。')
    completion = awaitTurn(client, threadId!)
    await client.request('turn/start', { threadId, input: [{ type: 'text', text: '只回复 GHOST_RESUMED，不要调用任何工具。', text_elements: [] }] })
    if (!(await completion).includes('GHOST_RESUMED')) throw new Error('恢复后的连续对话失败。')
    console.log('PASS: 重启 App Server、分页历史、连续对话')
    completion = awaitTurn(client, threadId!, true)
    completion.catch(() => {})
    const liveTurn = new Promise<string>(resolve => {
      const listener = ({ method, params }: any) => {
        if (method === 'turn/started' && params.threadId === threadId) { client!.off('notification', listener); resolve(params.turn.id) }
      }
      client!.on('notification', listener)
    })
    await client.request('turn/start', { threadId, input: [{ type: 'text', text: '逐行输出从1到500的数字。不要使用工具。', text_elements: [] }] })
    const turnId = await liveTurn
    await client.request('turn/interrupt', { threadId, turnId })
    await completion
    console.log('PASS: 取消任务')
    await client.request('thread/archive', { threadId })
  }
  console.log('Codex 接入检查通过。')
} catch (error) { console.error((error as Error).message); process.exitCode = 1 }
finally { client?.removeAllListeners(); client?.stop() }
