import { EventEmitter } from 'node:events'
import { CodexClient, codexVersion, findCodex } from './codex'
import { Storage } from './storage'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { HISTORY_SOURCES, importThread, readNativeRegistry } from './history'
import { executeCapability } from './capability-service'
import type { Approval, HistorySync, Item, Runtime, SendOptions, Session, Settings, StudioEvent, ThreadTask, InputAttachment } from '../shared/types'

export function normalizeItem(item: any, turnId?: string): Item {
  return {
    id: String(item.id), type: item.type, turnId,
    text: item.type === 'userMessage' ? (item.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : item.text || (item.type === 'reasoning' ? (item.summary || []).join('\n') : ''),
    status: item.status, phase: item.phase, command: item.command,
    output: item.aggregatedOutput || '', files: item.changes?.map((c: any) => c.path), raw: item
  }
}
export class StudioService extends EventEmitter {
  client: CodexClient | null = null
  approvals: Approval[] = []
  runtime: Runtime = { connection: 'disconnected', executable: '', version: '', account: null, models: [], limits: null, activity: 'idle', activeThreadId: null, activeTurnId: null, task: '', error: null }
  private connecting: Promise<void> | null = null
  private starting = new Set<string>()
  private resuming = new Set<string>()
  private sessionOptions = new Map<string, string>()
  private freshThreads = new Set<string>()
  private items = new Map<string, Map<string, Item>>()
  private loginId: string | null = null
  readonly attachmentPaths = new Set<string>()
  private syncing: Promise<void> | null = null
  historySync: HistorySync = { state: 'idle', updatedAt: null, count: 0, error: null }
  constructor(readonly storage: Storage) { super() }
  private emitEvent(event: StudioEvent) { this.emit('event', event) }
  private update(patch: Partial<Runtime>) { this.runtime = { ...this.runtime, ...patch }; this.emitEvent({ type: 'runtime', runtime: this.runtime }) }
  isRunning(id?: string) { return id ? this.starting.has(id) || ['running', 'approval'].includes(this.runtime.tasks?.[id]?.activity || '') : this.starting.size > 0 || Object.values(this.runtime.tasks || {}).some(t => ['running', 'approval'].includes(t.activity)) }
  private updateTask(id: string, patch: Partial<ThreadTask>) {
    const tasks = { ...this.runtime.tasks, [id]: { activity: 'idle' as const, activeTurnId: null, task: '', error: null, ...this.runtime.tasks?.[id], ...patch } }
    const active = Object.entries(tasks).find(([, task]) => ['running', 'approval'].includes(task.activity)) || [id, tasks[id]] as const
    this.update({ tasks, activeThreadId: active[0], ...active[1] })
  }
  snapshot() { return { settings: this.storage.settings(), projects: this.storage.projects(), sessions: this.storage.sessions(), runtime: this.runtime, approvals: this.approvals, historySync: this.historySync } }
  connect() {
    if (this.connecting) return this.connecting
    if (this.isRunning() || this.runtime.activity === 'running' || this.runtime.activity === 'approval') throw new Error('请先停止当前任务，再重新连接。')
    this.connecting = this.openConnection().finally(() => { this.connecting = null })
    return this.connecting
  }
  private async openConnection() {
    this.client?.removeAllListeners()
    this.client?.stop()
    this.client = null
    this.resuming.clear()
    this.sessionOptions.clear()
    this.freshThreads.clear()
    this.items.clear()
    this.starting.clear()
    this.update({ tasks: {} })
    this.approvals = []
    this.emitEvent({ type: 'approvals', approvals: [] })
    this.update({ connection: 'connecting', error: null, activeThreadId: null, activeTurnId: null, activity: 'idle' })
    try {
      const executable = await findCodex(this.storage.settings().codexPath)
      const version = await codexVersion(executable)
      const client = new CodexClient(executable)
      this.client = client
      client.on('notification', message => this.notification(message.method, message.params || {}))
      client.on('request', message => this.serverRequest(message))
      client.on('disconnected', error => {
        this.approvals = []
        this.resuming.clear()
        this.emitEvent({ type: 'approvals', approvals: [] })
        const tasks = Object.fromEntries(Object.entries(this.runtime.tasks || {}).map(([id, task]) => [id, { ...task, activity: 'error' as const, activeTurnId: null, error }]))
        this.starting.clear()
        this.update({ tasks, connection: 'disconnected', activity: 'error', activeTurnId: null, activeThreadId: null, error })
      })
      await client.start()
      this.update({ connection: 'connected', executable, version })
      await this.refreshAccount()
      const response = await client.request('model/list', { limit: 100 })
      this.update({ models: (response.data || []).filter((m: any) => !m.hidden) })
      await this.syncHistory()
    } catch (error) {
      this.client?.removeAllListeners(); this.client?.stop(); this.client = null
      this.update({ connection: 'disconnected', activity: 'error', error: (error as Error).message })
      throw error
    }
  }
  private requireClient() {
    if (!this.client?.connected) throw new Error('请先连接 Codex。')
    return this.client
  }
  async refreshAccount() {
    const client = this.requireClient()
    const { account } = await client.request('account/read', { refreshToken: false })
    let limits = null
    if (account?.type === 'chatgpt') {
      try { const r = await client.request('account/rateLimits/read', {}, 15000); limits = r.rateLimitsByLimitId?.codex || r.rateLimits } catch { /* quota may be unavailable */ }
    }
    this.update({ account, limits })
  }
  async login() {
    const response = await this.requireClient().request('account/login/start', { type: 'chatgpt' })
    this.loginId = response.loginId || null
    return { loginId: response.loginId, authUrl: response.authUrl }
  }
  async cancelLogin() {
    if (this.loginId) await this.requireClient().request('account/login/cancel', { loginId: this.loginId })
    this.loginId = null
  }
  syncHistory() {
    if (this.syncing) return this.syncing
    this.syncing = this.importHistory().finally(() => { this.syncing = null })
    return this.syncing
  }
  private async importHistory() {
    const client = this.requireClient()
    this.historySync = { ...this.historySync, state: 'syncing', error: null }
    this.emitEvent({ type: 'data' })
    try {
      const registry = await readNativeRegistry(this.storage)
      try {
        let projectCursor: string | undefined
        do {
          const page = await client.request('project/list', { limit: 100, ...(projectCursor ? { cursor: projectCursor } : {}) })
          for (const native of page.data || []) {
            if (!native.roots?.[0]?.path) continue
            const project = this.storage.addProject(native.roots[0].path, native.name, Number(native.updatedAt) * 1000 || 0, true)
            this.storage.bindProject(project.id, native.id); registry.projects.set(native.id, project.id)
          }
          projectCursor = page.nextCursor || undefined
        } while (projectCursor)
      } catch { /* older versions retain the desktop/cwd compatibility adapter */ }
      let count = 0
      const visibleIds = new Set(this.freshThreads)
      for (const id of Object.keys(this.runtime.tasks || {})) if (this.isRunning(id)) visibleIds.add(id)
      for (const archived of [false, true]) {
        let cursor: string | undefined
        const visited = new Set<string>()
        do {
          const page = await client.request('thread/list', { limit: 100, archived, sourceKinds: HISTORY_SOURCES, modelProviders: [], sortKey: 'updated_at', sortDirection: 'desc', useStateDbOnly: false, ...(cursor ? { cursor } : {}) })
          for (const thread of page.data || []) if (importThread(this.storage, thread, archived, registry)) { count++; visibleIds.add(thread.id) }
          cursor = page.nextCursor || undefined
          if (cursor && visited.has(cursor)) throw new Error('历史分页游标重复，请重新同步。')
          if (cursor) visited.add(cursor)
        } while (cursor)
      }
      // Only reconcile after both complete lists succeeded. Preserve fresh or live threads,
      // whose rollout may not have been indexed when the snapshot started.
      for (const id of this.freshThreads) visibleIds.add(id)
      for (const id of Object.keys(this.runtime.tasks || {})) if (this.isRunning(id)) visibleIds.add(id)
      this.storage.reconcileSessions(visibleIds)
      this.historySync = { state: 'ready', updatedAt: Date.now(), count, error: null }
    } catch (error) {
      // A history-index failure must not disconnect an otherwise usable backend.
      this.historySync = { ...this.historySync, state: 'error', error: (error as Error).message }
    }
    this.emitEvent({ type: 'data' })
  }
  private options(projectId: string | null, cwd?: string) {
    const settings = this.storage.settings()
    return { cwd: cwd || (projectId ? this.storage.project(projectId).path : undefined), sandbox: projectId ? settings.permission : 'read-only', approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: [settings.personaEnabled ? settings.persona : '', !projectId ? '当前为普通聊天，没有授权任何项目目录。默认直接回答问题；没有明确任务时不要探索本地文件或执行命令。' : ''].filter(Boolean).join('\n') }
  }
  capability(method: string, params?: Record<string, any>) { return executeCapability(this, method, params) }
  beginActivity(threadId: string, task: string) { this.updateTask(threadId, { activity: 'running', activeTurnId: null, task, error: null }) }
  finishActivity(threadId = this.runtime.activeThreadId) { if (threadId) this.updateTask(threadId, { activity: 'completed', activeTurnId: null }) }
  failActivity(error: string, threadId = this.runtime.activeThreadId) { if (threadId) this.updateTask(threadId, { activity: 'error', activeTurnId: null, error }) }
  async trackThread(thread: any, fresh = false) {
    const registry = await readNativeRegistry(this.storage)
    for (const p of this.storage.projects()) if (p.nativeId) registry.projects.set(p.nativeId, p.id)
    const session = importThread(this.storage, thread, false, registry) || { id: thread.id, projectId: null, cwd: thread.cwd, title: thread.name || '临时会话', updatedAt: Date.now() }
    this.storage.putSession(session); this.resuming.add(session.id)
    if (fresh) this.freshThreads.add(session.id)
    this.sessionOptions.set(session.id, JSON.stringify(this.options(session.projectId, session.cwd)))
    this.emitEvent({ type: 'data' }); return session
  }
  async prepareThread(id: string) {
    if (this.resuming.has(id)) return
    const session = this.storage.sessions().find(s => s.id === id)
    const { thread } = await this.requireClient().request('thread/resume', { threadId: id, excludeTurns: true, ...(session ? this.options(session.projectId, session.cwd) : {}) })
    if (thread) await this.trackThread(thread)
    this.resuming.add(id)
  }
  async createSession(projectId: string | null): Promise<Session> {
    const client = this.requireClient()
    const settings = this.storage.settings()
    if (projectId !== null && typeof projectId !== 'string') throw new Error('无效项目。')
    const cwd = projectId ? this.storage.project(projectId).path : join(this.storage.directory, 'chat-workspaces', randomUUID())
    if (!projectId) await mkdir(cwd, { recursive: true })
    const nativeId = projectId ? this.storage.project(projectId).nativeId : null
    const { thread } = await client.request('thread/start', { ...this.options(projectId, cwd), ...(nativeId ? { projectId: nativeId } : {}), ...(settings.model ? { model: settings.model } : {}), ephemeral: false })
    const session: Session = { id: thread.id, projectId, title: '新的会话', updatedAt: Date.now(), cwd, originator: 'ghost_studio', archived: false }
    this.storage.putSession(session)
    this.resuming.add(session.id)
    this.freshThreads.add(session.id)
    this.sessionOptions.set(session.id, JSON.stringify(this.options(projectId, cwd)))
    this.items.set(session.id, new Map())
    this.emitEvent({ type: 'data' })
    return session
  }
  async history(sessionId: string): Promise<Item[]> {
    this.storage.session(sessionId)
    const client = this.requireClient()
    if (this.freshThreads.has(sessionId)) return [...(this.items.get(sessionId)?.values() || [])]
    // Reading another client's conversation must never resume it or change its settings.
    // Paginate through persisted items. Never fabricate history from cached UI messages.
    const records: Item[] = []
    let cursor: string | undefined
    do {
      const page = await client.request('thread/items/list', { threadId: sessionId, limit: 100, sortDirection: 'asc', ...(cursor ? { cursor } : {}) })
      records.push(...(page.data || []).map((entry: any) => normalizeItem(entry.item, entry.turnId)))
      cursor = page.nextCursor || undefined
    } while (cursor)
    const merged = new Map(records.map(item => [item.id, item]))
    if (this.isRunning(sessionId)) {
      for (const [id, item] of this.items.get(sessionId) || []) if (!merged.has(id) || item.status === 'inProgress') merged.set(id, item)
    }
    this.items.set(sessionId, merged)
    return [...merged.values()]
  }
  async send(sessionId: string, text: string, options: SendOptions = {}) {
    if (typeof text !== 'string' || (!text.trim() && !options.attachments?.length) || text.length > 100000) throw new Error('请输入不超过 100,000 字符的任务。')
    if (this.isRunning(sessionId)) throw new Error('这个会话已有任务正在执行，请等待完成或停止。')
    const session = this.storage.session(sessionId)
    const client = this.requireClient()
    this.starting.add(sessionId)
    try {
      // Resuming also applies the current editable persona to subsequent turns.
      if (session.archived) throw new Error('这是归档会话。请先在原生 Codex 中取消归档并同步，再继续对话。')
      if (!this.freshThreads.has(sessionId)) {
        const { thread } = await client.request('thread/read', { threadId: sessionId, includeTurns: false })
        if (thread?.status?.type === 'active') throw new Error('这个会话仍在执行任务，请完成后再继续。')
      }
      const threadOptions = this.options(session.projectId, session.cwd)
      if (!this.resuming.has(sessionId) || this.sessionOptions.get(sessionId) !== JSON.stringify(threadOptions)) {
        await client.request('thread/resume', { threadId: sessionId, excludeTurns: true, ...threadOptions })
        this.resuming.add(sessionId)
        this.sessionOptions.set(sessionId, JSON.stringify(threadOptions))
      }
      this.beginActivity(sessionId, text.slice(0, 120))
      const settings = this.storage.settings()
      const input = this.buildInput(text, options.attachments)
      const model = settings.model || this.runtime.models.find(m => m.isDefault)?.model || this.runtime.models[0]?.model
      await client.request('turn/start', { threadId: sessionId, input, ...(settings.model ? { model: settings.model } : {}), ...(model ? { collaborationMode: { mode: options.mode || settings.mode || 'default', settings: { model, reasoning_effort: settings.effort, developer_instructions: null } } } : {}), effort: settings.effort, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: !session.projectId || settings.permission === 'read-only' ? { type: 'readOnly', networkAccess: false } : { type: 'workspaceWrite', writableRoots: [session.cwd || this.storage.project(session.projectId).path], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } })
      // The response can precede turn/started. Only enable interruption once the server confirms the live turn.
      const title = session.title === '新的会话' ? text.replace(/\s+/g, ' ').slice(0, 36) : session.title
      this.storage.putSession({ ...session, title, updatedAt: Date.now() })
      if (session.title === '新的会话') await client.request('thread/name/set', { threadId: sessionId, name: title }).catch(() => {})
      this.storage.set(`draft:${sessionId}`, '')
      this.emitEvent({ type: 'data' })
    } catch (error) { this.failActivity((error as Error).message, sessionId); throw error }
    finally { this.starting.delete(sessionId) }
  }
  private buildInput(text: string, attachments: InputAttachment[] = []) {
    if (typeof text !== 'string' || text.length > 100000 || !Array.isArray(attachments) || (!text.trim() && !attachments.length)) throw new Error('请输入有效的任务内容。')
    if (attachments.length > 20) throw new Error('每次最多添加 20 个附件。')
    const input: any[] = text.trim() ? [{ type: 'text', text, text_elements: [] }] : []
    for (const file of attachments) {
      if (!file || !['image', 'audio', 'file', 'skill'].includes(file.type) || typeof file.path !== 'string' || typeof file.name !== 'string') throw new Error('无效附件。')
      if (file.type !== 'skill' && !this.attachmentPaths.has(file.path)) throw new Error('请通过附件选择器或拖放授权文件。')
      input.push(file.type === 'image' ? { type: 'localImage', path: file.path } : file.type === 'audio' ? { type: 'localAudio', path: file.path } : { type: file.type === 'skill' ? 'skill' : 'mention', name: file.name, path: file.path })
    }
    return input
  }
  async followup(sessionId: string, text: string, queue: boolean, attachments: InputAttachment[] = []) {
    this.storage.session(sessionId)
    const input = this.buildInput(text, attachments)
    if (queue) await this.capability('thread/queue/add', { threadId: sessionId, input, clientUserMessageId: randomUUID() })
    else {
      const expectedTurnId = this.runtime.tasks?.[sessionId]?.activeTurnId
      if (!expectedTurnId || !this.isRunning(sessionId)) throw new Error('当前会话没有可补充指令的任务。')
      await this.capability('turn/steer', { threadId: sessionId, expectedTurnId, input })
    }
    this.storage.set(`draft:${sessionId}`, '')
  }
  async interrupt(threadId = this.runtime.activeThreadId || undefined) {
    const activeThreadId = threadId, activeTurnId = threadId ? this.runtime.tasks?.[threadId]?.activeTurnId : null
    if (!activeThreadId || !activeTurnId) throw new Error('任务尚未启动完成，请稍后再停止。')
    await this.requireClient().request('turn/interrupt', { threadId: activeThreadId, turnId: activeTurnId })
  }
  private serverRequest(message: any) {
    if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput', 'item/permissions/requestApproval', 'mcpServer/elicitation/request', 'item/tool/call', 'applyPatchApproval', 'execCommandApproval'].includes(message.method)) {
      this.approvals.push({ id: message.id, method: message.method, ...message.params })
      const id = message.params.threadId || this.runtime.activeThreadId
      if (id) this.updateTask(id, { activity: 'approval' })
      this.emitEvent({ type: 'approvals', approvals: this.approvals })
    } else this.client?.reject(message.id, `Ghost Studio 不支持该交互：${message.method}`)
  }
  async decide(id: string | number, decision: string | Record<string, unknown>) {
    const approval = this.approvals.find(a => a.id === id)
    if (!approval) throw new Error('该请求已结束，请刷新当前会话。')
    const client = this.requireClient()
    if (approval.method === 'item/tool/requestUserInput') {
      if (typeof decision !== 'object' || !decision.answers) throw new Error('请回答问题。')
      client.respond(id, decision)
    } else if (approval.method === 'item/permissions/requestApproval') {
      const grant = typeof decision === 'object' && decision.grant === true
      const requested = Object.fromEntries(Object.entries(approval.permissions || {}).filter(([, value]) => value !== null))
      client.respond(id, { permissions: grant ? requested : {}, scope: typeof decision === 'object' && decision.scope === 'session' ? 'session' : 'turn' })
    } else if (approval.method === 'mcpServer/elicitation/request') {
      if (typeof decision !== 'object' || !['accept', 'decline', 'cancel'].includes(String(decision.action))) throw new Error('无效的 MCP 回答。')
      client.respond(id, { action: decision.action, content: decision.content || null, _meta: null })
    } else if (approval.method === 'item/tool/call') {
      if (typeof decision !== 'object' || typeof decision.success !== 'boolean') throw new Error('请提供工具结果。')
      client.respond(id, decision)
    } else if (approval.method === 'applyPatchApproval' || approval.method === 'execCommandApproval') {
      if (!['approved', 'approved_for_session', 'denied', 'abort'].includes(String(decision))) throw new Error('无效的旧版审批结果。')
      client.respond(id, { decision })
    } else {
      const selected = typeof decision === 'object' ? decision.decision : decision
      if (typeof selected === 'object') {
        if (!approval.availableDecisions?.some(d => JSON.stringify(d) === JSON.stringify(selected))) throw new Error('该规则不适用于此请求。')
      } else if (typeof selected !== 'string' || !['accept', 'decline', 'cancel', 'acceptForSession'].includes(selected)) throw new Error('无效的审批决定。')
      if (approval.availableDecisions?.length && !approval.availableDecisions.some(d => JSON.stringify(d) === JSON.stringify(selected))) throw new Error('该决定不适用于此请求。')
      client.respond(id, { decision: selected })
    }
    this.approvals = this.approvals.filter(a => a.id !== id)
    this.emitEvent({ type: 'approvals', approvals: this.approvals })
    this.updateTask(approval.threadId, { activity: this.approvals.some(a => a.threadId === approval.threadId) ? 'approval' : 'running' })
  }
  private notification(method: string, params: Record<string, any>) {
    const { threadId, turnId, item } = params
    if (method === 'turn/started' && threadId) this.freshThreads.delete(threadId)
    if (method === 'account/login/completed' && params.success) { this.loginId = null; this.refreshAccount().catch(() => {}) }
    if (method === 'account/updated') this.refreshAccount().catch(() => {})
    if (method === 'account/rateLimits/updated') this.update({ limits: params.rateLimits })
    if (method === 'turn/started' && this.runtime.tasks?.[threadId]) this.updateTask(threadId, { activity: 'running', activeTurnId: params.turn.id })
    const task = this.runtime.tasks?.[threadId]
    if (method === 'turn/completed' && task?.activeTurnId && task.activity !== 'completed' && params.turn.id === task.activeTurnId) {
      this.approvals = this.approvals.filter(a => a.threadId !== threadId)
      this.emitEvent({ type: 'approvals', approvals: this.approvals })
      this.updateTask(threadId, { activity: params.turn.status === 'completed' ? 'completed' : params.turn.status === 'interrupted' ? 'interrupted' : 'error', activeTurnId: null, error: params.turn.error?.message || null })
    }
    if (method === 'serverRequest/resolved') {
      const resolved = this.approvals.find(a => a.id === params.requestId)
      this.approvals = this.approvals.filter(a => a.id !== params.requestId)
      this.emitEvent({ type: 'approvals', approvals: this.approvals })
      if (resolved && !this.approvals.some(a => a.threadId === resolved.threadId) && this.isRunning(resolved.threadId)) this.updateTask(resolved.threadId, { activity: 'running' })
    }
    if (threadId && (method === 'item/started' || method === 'item/completed') && item) {
      if (!this.items.has(threadId)) this.items.set(threadId, new Map())
      this.items.get(threadId)!.set(item.id, normalizeItem(item, turnId))
      if (method === 'item/completed' && item.type === 'exitedReviewMode' && this.isRunning(threadId) && (!turnId || turnId === task?.activeTurnId)) this.finishActivity(threadId)
    }
    if (method === 'thread/compacted' && this.isRunning(threadId)) this.finishActivity(threadId)
    if (threadId && ['item/agentMessage/delta', 'item/commandExecution/outputDelta', 'item/reasoning/summaryTextDelta'].includes(method)) {
      if (!this.items.has(threadId)) this.items.set(threadId, new Map())
      const items = this.items.get(threadId)!
      const type = method.includes('commandExecution') ? 'commandExecution' : method.includes('reasoning') ? 'reasoning' : 'agentMessage'
      const existing: Item = items.get(params.itemId) || { id: params.itemId, type, text: '', turnId }
      items.set(params.itemId, { ...existing, ...(type === 'commandExecution' ? { output: (existing.output || '') + params.delta } : { text: existing.text + params.delta }), status: 'inProgress' })
    }
    this.emitEvent({ type: 'notification', method, params })
  }
  settings(patch: Partial<Settings>) {
    const next = this.storage.updateSettings(patch)
    this.emitEvent({ type: 'data' })
    return next
  }
  close() { this.client?.removeAllListeners(); this.client?.stop(); this.storage.close() }
}
