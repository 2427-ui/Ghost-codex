import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Plus, FolderOpen, MessageSquare, Settings2, PanelLeftClose, PanelLeftOpen, PanelRightOpen, GitBranch, ArrowUp, Square, Minus, Maximize2, X, ChevronDown, ChevronRight, Check, CircleAlert, Terminal, FileCode2, Search, ArrowUpRight, Sparkles, Shield, LoaderCircle, Monitor, MoreHorizontal, Copy, Ghost as GhostIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Ghost } from './components/Ghost'
import { Pet } from './components/Pet'
import { SettingsPanel } from './components/SettingsPanel'
import { ApprovalCard } from './components/ApprovalCard'
import type { Activity, InputAttachment, Item, Project, Session, Settings, Snapshot, StudioEvent } from '../../shared/types'
import { CapabilityPanel } from './components/CapabilityPanel'

const DetailPanel = lazy(() => import('./components/DetailPanel').then(m => ({ default: m.DetailPanel })))
const activityLabels: Record<Activity, string> = { idle: '等待你的指令', running: '正在执行任务', approval: '等待你的确认', completed: '任务已完成', interrupted: '任务已停止', error: '需要检查连接' }
const initialSnapshot: Snapshot = { projects: [], sessions: [], approvals: [], settings: {} as Settings, historySync: { state: 'idle', updatedAt: null, count: 0, error: null }, runtime: { connection: 'connecting', executable: '', version: '', account: null, models: [], limits: null, activity: 'idle', activeThreadId: null, activeTurnId: null, task: '', error: null } }
function fromWire(item: any, turnId?: string): Item { return { id: item.id, type: item.type, turnId, text: item.type === 'userMessage' ? (item.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : item.text || (item.summary || []).join('\n'), status: item.status, phase: item.phase, command: item.command, output: item.aggregatedOutput || '', files: item.changes?.map((change: any) => change.path) } }
const emptyProjectText = '直接普通聊天，或选择本地项目进行开发。'

function StudioApp() {
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot)
  const [ready, setReady] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<'files' | 'git'>('files')
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [capabilityMethod, setCapabilityMethod] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<InputAttachment[]>([])
  const [plan, setPlan] = useState<{ step: string; status: string }[]>([])
  const [usage, setUsage] = useState<any>(null)
  const [historyScope, setHistoryScope] = useState<'all' | 'chat' | 'project'>('all')
  const [archived, setArchived] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(100)
  const messageEnd = useRef<HTMLDivElement>(null)
  const scrollContainer = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const onError = useCallback((value: unknown) => setError(value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : String(value)), [])
  const { settings, runtime } = snapshot
  const project = snapshot.projects.find(p => p.id === selectedProject)
  const session = snapshot.sessions.find(s => s.id === selectedSession)
  const running = runtime.activity === 'running' || runtime.activity === 'approval'
  const currentActivity = selectedSession && runtime.activeThreadId !== selectedSession ? 'idle' : runtime.activity
  const approvals = snapshot.approvals.filter(a => a.threadId === selectedSession)
  const model = runtime.models.find(m => m.model === settings.model) || runtime.models.find(m => m.isDefault) || runtime.models[0]
  useEffect(() => { window.ghost.editorDirty(detailsDirty).catch(onError) }, [detailsDirty])

  const reload = useCallback(async () => {
    const next = await window.ghost.snapshot(); setSnapshot(next)
    if (next.historySync.state === 'ready' && selectedRef.current && !next.sessions.some(s => s.id === selectedRef.current)) {
      selectedRef.current = null; setSelectedSession(null); setItems([]); draftRef.current = ''; setDraft('')
    }
    return next
  }, [])
  const onSaveSettings = useCallback(async (patch: Partial<Settings>) => { const next = await window.ghost.settings(patch); setSnapshot(s => ({ ...s, settings: next })); return next }, [])
  const persistDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    if (selectedRef.current) await window.ghost.draft(selectedRef.current, draftRef.current)
  }, [])
  async function tuckAway() { try { await persistDraft(); await window.ghost.window('mini') } catch (value) { onError(value) } }
  const changeDraft = useCallback((text: string) => {
    draftRef.current = text; setDraft(text)
    if (draftTimer.current) clearTimeout(draftTimer.current)
    const id = selectedRef.current
    if (id) draftTimer.current = setTimeout(() => { window.ghost.draft(id, text).catch(onError) }, 400)
  }, [])

  useEffect(() => {
    let active = true
    const unsubscribe = window.ghost.subscribe((event: StudioEvent) => {
      if (!active) return
      if (event.type === 'runtime') setSnapshot(s => ({ ...s, runtime: event.runtime }))
      if (event.type === 'approvals') setSnapshot(s => ({ ...s, approvals: event.approvals }))
      if (event.type === 'data') reload().catch(onError)
      if (event.type !== 'notification') return
      const p = event.params
      if (event.method === 'turn/completed') setRefresh(n => n + 1)
      if (event.method === 'account/login/completed' && !p.success) onError(p.error || '登录未完成。')
      if (p.threadId !== selectedRef.current) return
      if (event.method === 'turn/plan/updated') setPlan(p.plan || [])
      if (event.method === 'thread/tokenUsage/updated') setUsage(p.tokenUsage)
      if ((event.method === 'item/started' || event.method === 'item/completed') && p.item) {
        const next = { ...fromWire(p.item, p.turnId), raw: p.item }
        setItems(previous => previous.some(item => item.id === next.id) ? previous.map(item => item.id === next.id ? next : item) : [...previous, next])
      }
      if (event.method === 'item/agentMessage/delta' || event.method === 'item/commandExecution/outputDelta' || event.method === 'item/reasoning/summaryTextDelta') {
        setItems(previous => {
          const existing = previous.find(item => item.id === p.itemId)
          const type = event.method.includes('agentMessage') ? 'agentMessage' : event.method.includes('commandExecution') ? 'commandExecution' : 'reasoning'
          const next: Item = { ...(existing || { id: p.itemId, type, text: '', turnId: p.turnId }), status: 'inProgress' }
          if (type === 'commandExecution') next.output = (next.output || '') + p.delta
          else next.text += p.delta
          return existing ? previous.map(item => item.id === next.id ? next : item) : [...previous, next]
        })
      }
    })
    window.ghost.snapshot().then(next => {
      if (!active) return
      setSnapshot(next)
      const initialProject = next.settings.lastProjectId || null
      setSelectedProject(initialProject)
      const initialSession = next.sessions.find(s => s.id === next.settings.lastSessionId && s.projectId === initialProject)
      if (initialSession) { setSelectedSession(initialSession.id); selectedRef.current = initialSession.id }
      setReady(true)
    }).catch(onError)
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    if (!selectedSession || runtime.connection !== 'connected') return
    let current = true
    setHistoryLoading(true)
    window.ghost.history(selectedSession).then(history => { if (current) setItems(history) }).catch(onError).finally(() => { if (current) setHistoryLoading(false) })
    return () => { current = false }
  }, [selectedSession, runtime.connection])
  useEffect(() => {
    setAttachments([]); setPlan([]); setUsage(null)
    const id = selectedSession
    if (!id) return
    let active = true
    window.ghost.draft(id).then(text => { if (active) { draftRef.current = text; setDraft(text) } }).catch(onError)
    return () => { active = false }
  }, [selectedSession])
  useEffect(() => { if (autoScroll.current) messageEnd.current?.scrollIntoView({ behavior: 'instant', block: 'end' }) }, [items, approvals.length])
  useEffect(() => {
    if (!textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(180, textarea.current.scrollHeight)}px`
  }, [draft])
  useEffect(() => {
    const beforeUnload = () => { if (selectedRef.current && !document.hidden) void window.ghost.draft(selectedRef.current, draftRef.current).catch(() => {}) }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])
  useEffect(() => {
    const resumeView = async () => {
      if (document.hidden) return
      try {
        const next = await window.ghost.snapshot()
        setSnapshot(next)
        if (next.settings.lastSessionId !== selectedRef.current) {
          selectedRef.current = next.settings.lastSessionId
          setSelectedSession(next.settings.lastSessionId)
          setSelectedProject(next.settings.lastProjectId)
          setItems([])
        }
        const text = next.settings.lastSessionId ? await window.ghost.draft(next.settings.lastSessionId) : ''
        draftRef.current = text; setDraft(text)
        if (next.runtime.connection === 'connected') {
          await window.ghost.syncHistory()
          if (next.settings.lastSessionId && !['running', 'approval'].includes(next.runtime.activity)) {
            const id = next.settings.lastSessionId
            const history = await window.ghost.history(id)
            if (selectedRef.current === id) setItems(history)
          }
        }
      } catch (value) { onError(value) }
    }
    document.addEventListener('visibilitychange', resumeView)
    window.addEventListener('focus', resumeView)
    return () => { document.removeEventListener('visibilitychange', resumeView); window.removeEventListener('focus', resumeView) }
  }, [])
  async function chooseProject() {
    if (detailsDirty && !confirm('切换项目会放弃尚未保存的编辑，继续？')) return
    try { await persistDraft(); const next = await window.ghost.addProject(); if (next) { setSelectedProject(next.id); setSelectedSession(null); selectedRef.current = null; setItems([]); changeDraft(''); setDetailsDirty(false); setDetailOpen(false); setHistoryScope('project'); setArchived(false); await onSaveSettings({ lastProjectId: next.id, lastSessionId: null }); await reload() } } catch (err) { onError(err) }
  }
  async function selectProject(next: Project) {
    setHistoryScope('project'); setArchived(false); setHistoryLimit(100)
    if (next.id === selectedProject) return
    if (detailsDirty && !confirm('切换项目会放弃尚未保存的编辑，继续？')) return
    try { await persistDraft(); setSelectedProject(next.id); setSelectedSession(null); selectedRef.current = null; setItems([]); changeDraft(''); setDetailsDirty(false); setDetailOpen(false); await onSaveSettings({ lastProjectId: next.id, lastSessionId: null }) } catch (err) { onError(err) }
  }
  async function selectSession(next: Session) {
    if (next.projectId !== selectedProject && detailsDirty && !confirm('切换项目会放弃尚未保存的编辑，继续？')) return
    try {
      await persistDraft()
      if (next.projectId !== selectedProject) { setDetailOpen(false); setDetailsDirty(false) }
      selectedRef.current = next.id; setSelectedSession(next.id); setSelectedProject(next.projectId); setItems([]); draftRef.current = ''; setDraft(''); autoScroll.current = true
      await onSaveSettings({ lastProjectId: next.projectId, lastSessionId: next.id })
    } catch (err) { onError(err) }
  }
  async function newSession() {
    try { await persistDraft(); selectedRef.current = null; setSelectedSession(null); setItems([]); changeDraft(''); setError(''); await onSaveSettings({ lastSessionId: null }); textarea.current?.focus() } catch (err) { onError(err) }
  }
  async function ordinaryChat() {
    if (detailsDirty && !confirm('切换到普通聊天会放弃尚未保存的编辑，继续？')) return
    try { await persistDraft(); setSelectedProject(null); selectedRef.current = null; setSelectedSession(null); setItems([]); changeDraft(''); setDetailsDirty(false); setDetailOpen(false); setHistoryScope('chat'); setArchived(false); setHistoryLimit(100); setError(''); await onSaveSettings({ lastProjectId: null, lastSessionId: null }); textarea.current?.focus() } catch (err) { onError(err) }
  }
  async function syncHistory() {
    try { await window.ghost.syncHistory(); const next = await reload(); if (selectedRef.current && !running) setItems(await window.ghost.history(selectedRef.current)); if (next.historySync.error) setError(next.historySync.error) } catch (err) { onError(err) }
  }
  async function send() {
    if ((!draft.trim() && !attachments.length) || busy || running || session?.archived) return
    setBusy(true); setError('')
    const text = draft
    try {
      let id = selectedSession
      if (!id) {
        const created = await window.ghost.createSession(project?.id || null)
        id = created.id; selectedRef.current = id; setSelectedSession(id)
        await onSaveSettings({ lastProjectId: project?.id || null, lastSessionId: id })
      }
      autoScroll.current = true
      await window.ghost.send(id, text, { attachments, mode: settings.mode })
      changeDraft(''); setAttachments([])
    } catch (err) { onError(err) } finally { setBusy(false) }
  }
  async function followup(queue: boolean) {
    if (!draft.trim() || !selectedSession || busy) return
    setBusy(true)
    try {
      const input = [{ type: 'text', text: draft, text_elements: [] }]
      if (queue) await window.ghost.capability('thread/queue/add', { threadId: selectedSession, input, clientUserMessageId: crypto.randomUUID() })
      else await window.ghost.capability('turn/steer', { threadId: selectedSession, expectedTurnId: runtime.activeTurnId, input })
      changeDraft('')
    } catch (err) { onError(err) } finally { setBusy(false) }
  }
  function toggleDetail(mode: 'files' | 'git') {
    if (!project) { void chooseProject(); return }
    if (detailOpen && detailMode === mode && detailsDirty && !confirm('关闭工作区会放弃尚未保存的编辑，继续？')) return
    if (detailOpen && detailMode === mode) setDetailsDirty(false)
    setDetailOpen(open => !open || detailMode !== mode); setDetailMode(mode)
  }
  function resize(event: React.PointerEvent, kind: 'sidebar' | 'detail') {
    const start = event.clientX, width = kind === 'sidebar' ? settings.sidebarWidth : settings.detailWidth
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const value = kind === 'sidebar' ? Math.max(200, Math.min(360, width + e.clientX - start)) : Math.max(360, Math.min(Math.min(1200, window.innerWidth - 540), width - e.clientX + start))
      setSnapshot(s => ({ ...s, settings: { ...s.settings, [kind === 'sidebar' ? 'sidebarWidth' : 'detailWidth']: value } }))
    }
    const end = (e: PointerEvent) => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); const value = kind === 'sidebar' ? Math.max(200, Math.min(360, width + e.clientX - start)) : Math.max(360, Math.min(Math.min(1200, window.innerWidth - 540), width - e.clientX + start)); void onSaveSettings({ [kind === 'sidebar' ? 'sidebarWidth' : 'detailWidth']: value }) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end)
  }
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSettingsOpen(false); setShowSearch(false) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); void newSession() }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); setSettingsOpen(true) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); setSidebarOpen(v => !v) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [selectedSession, selectedProject])

  if (!ready) return <div className="boot-screen"><Ghost small motion="reduced" /><span>正在唤醒 Ghost…</span>{error && <p>{error}</p>}</div>
  const hasConversation = !!selectedSession || items.length > 0
  const connected = runtime.connection === 'connected'
  const visibleSessions = snapshot.sessions.filter(s => !!s.archived === archived && (historyScope === 'all' || historyScope === 'chat' ? historyScope === 'all' || !s.projectId : s.projectId === selectedProject) && (!search || `${s.title} ${s.originator || ''}`.toLowerCase().includes(search.toLowerCase())))
  return <div className="app-shell" style={{ '--ui-scale': settings.fontSize / 14, '--sidebar-width': `${settings.sidebarWidth}px`, '--detail-width': `${settings.detailWidth}px`, '--text-size': `${settings.fontSize}px` } as React.CSSProperties} data-motion={settings.motion}>
    {sidebarOpen && <>
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-eye"><span /></div><div><strong>GHOST</strong><span>PERSONAL WORKSTATION</span></div><button className="icon-button" title="收起侧栏 · Ctrl B" aria-label="收起侧栏" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={16} /></button></div>
        <div className="sidebar-actions"><button className="new-session" onClick={() => { void newSession() }}><Plus size={17} /><span>新建会话</span><kbd>Ctrl N</kbd></button><button className="search-button" onClick={() => setShowSearch(v => !v)}><Search size={15} /><span>搜索会话</span></button>{showSearch && <input autoFocus className="search-input" aria-label="搜索会话" placeholder="搜索标题…" value={search} onChange={e => setSearch(e.target.value)} />}</div>
        <div className="sidebar-section-label"><span>工作空间</span><button className="icon-button" title="打开项目" aria-label="打开项目" onClick={() => { void chooseProject() }}><Plus size={14} /></button></div>
        <button className={`project-row ${!selectedProject ? 'selected' : ''}`} onClick={() => { void ordinaryChat() }}><MessageSquare size={16} /><span>普通聊天</span><Plus size={13} /></button><div className="projects-list">{snapshot.projects.length ? snapshot.projects.map(p => <button key={p.id} className={`project-row ${p.id === selectedProject ? 'selected' : ''}`} title={p.path} onClick={() => { void selectProject(p) }}><FolderOpen size={16} /><span>{p.name}</span>{p.id === selectedProject && <span className="project-active" />}</button>) : <button className="empty-project-button" onClick={() => { void chooseProject() }}><FolderOpen size={16} /><span>打开你的第一个项目</span><Plus size={13} /></button>}</div>
        <div className="sidebar-section-label history-label"><span>本机 Codex 历史</span><button className="icon-button" aria-label="同步本机历史" title="同步项目和会话（包括归档）" disabled={!connected || snapshot.historySync.state === 'syncing'} onClick={() => { void syncHistory() }}><LoaderCircle size={14} className={snapshot.historySync.state === 'syncing' ? 'spin' : ''} /></button></div>
        <div className="history-filters"><select aria-label="历史范围" value={historyScope} onChange={e => { setHistoryScope(e.target.value as typeof historyScope); setHistoryLimit(100) }}><option value="all">全部会话</option><option value="chat">普通聊天</option>{selectedProject && <option value="project">当前项目</option>}</select><label><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setHistoryLimit(100) }} />归档</label><span>{visibleSessions.length}</span></div>
        <div className="history-sync-status" role="status" title={snapshot.historySync.error || '使用同一 CODEX_HOME 下 App Server 可访问的会话；不含未落地到本机的云端聊天。'}>{snapshot.historySync.state === 'syncing' ? '正在读取本机历史…' : snapshot.historySync.state === 'error' ? '同步失败，点击上方重试' : snapshot.historySync.updatedAt ? '本机历史已共享 · 切回窗口自动同步' : '连接后自动读取本机历史'}</div>
        <div className="sessions-list">{visibleSessions.slice(0, historyLimit).map(s => <button key={s.id} className={`session-row ${s.id === selectedSession ? 'selected' : ''}`} onClick={() => { void selectSession(s) }} title={`${s.title}\n${s.originator || 'Codex'} · ${s.projectId ? snapshot.projects.find(p => p.id === s.projectId)?.name || '项目' : '普通聊天'}${s.parentThreadId ? ' · 子代理' : ''}`}><MessageSquare size={14} /><span>{s.title}</span>{runtime.activeThreadId === s.id && running && <span className="session-running" />}</button>)}{!visibleSessions.length && <div className="empty-history"><MessageSquare size={19} strokeWidth={1.2} /><span>新的想法，从这里开始。</span><p>连接 Codex 后可共享本机历史</p></div>}{visibleSessions.length > historyLimit && <button className="load-more-history" onClick={() => setHistoryLimit(n => n + 100)}>加载更多会话</button>}</div>
        <div className="sidebar-bottom"><div className="system-card"><div><span className={`status-dot ${runtime.connection}`} /><strong>{connected ? 'Codex 已连接' : runtime.connection === 'connecting' ? '正在连接 Codex' : 'Codex 未连接'}</strong><span className="local-tag">LOCAL</span></div>{runtime.limits?.primary ? <><div className="quota-line"><span>当前额度窗口</span><span>{Math.max(0, Math.round(100 - runtime.limits.primary.usedPercent))}% 可用</span></div><div className="quota-track"><span style={{ width: `${Math.max(0, Math.min(100, 100 - runtime.limits.primary.usedPercent))}%` }} /></div><span className="reset-label">{new Date(runtime.limits.primary.resetsAt * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 重置</span></> : <p>{connected ? runtime.account ? '已认证 · 额度信息暂不可用' : '在设置中登录你的账户' : '在设置中检查本地连接'}</p>}</div>
          <button className="account-button" onClick={() => setSettingsOpen(true)}><span className="account-avatar">G</span><span><strong>{runtime.account?.email?.split('@')[0] || '本地工作空间'}</strong><small>{runtime.account?.planType ? `ChatGPT ${runtime.account.planType}` : '账户与偏好设置'}</small></span><Settings2 size={16} /></button>
        </div>
      </aside><div className="panel-resizer sidebar-resizer" role="separator" aria-label="调整侧栏宽度" onPointerDown={event => resize(event, 'sidebar')} />
    </>}
    <main className="main-area">
      <header className="titlebar"><div className="titlebar-left">{!sidebarOpen && <button className="icon-button" aria-label="展开侧栏" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={16} /></button>}<span className="breadcrumb">{project?.name || '普通聊天'}</span><ChevronRight size={12} /><span className="titlebar-title">{session?.title || '新会话'}</span></div><div className="titlebar-actions"><button className={`toolbar-button ${detailOpen && detailMode === 'files' ? 'active' : ''}`} aria-label="打开项目文件" title="打开项目文件" onClick={() => toggleDetail('files')}><PanelRightOpen size={15} /><span>文件</span></button><button className={`toolbar-button ${detailOpen && detailMode === 'git' ? 'active' : ''}`} aria-label="查看代码变更" title="查看代码变更" onClick={() => toggleDetail('git')}><GitBranch size={15} /><span>变更</span></button><button className="toolbar-button" aria-label="打开 Codex 功能中心" title="Codex 功能中心" onClick={() => setCapabilityMethod('skills/list')}><Settings2 size={15} /><span>功能</span></button><div className="titlebar-divider" /><button className="icon-button" title="收起为 Ghost" aria-label="迷你悬浮窗" onClick={() => { void tuckAway() }}><GhostIcon size={16} /></button><div className="window-controls"><button aria-label="最小化" onClick={() => window.ghost.window('minimize')}><Minus size={14} /></button><button aria-label="最大化或还原" onClick={() => window.ghost.window('maximize')}><Maximize2 size={12} /></button><button className="window-close" aria-label="收起窗口" onClick={() => { void tuckAway() }}><X size={15} /></button></div></div></header>
      <div className="workspace-body"><section className={`conversation ${hasConversation ? 'has-conversation' : ''}`}>
        <div className="hdd-background"><div className="hdd-grid" /><div className="hdd-glow" /></div>
        {running && runtime.activeThreadId !== selectedSession && <button className="background-task" onClick={() => { const target = snapshot.sessions.find(s => s.id === runtime.activeThreadId); if (target) void selectSession(target) }}><LoaderCircle className="spin" size={13} />另一会话正在执行任务<span>查看<ArrowUpRight size={12} /></span></button>}
        {!hasConversation ? <div className="hero">
          <div className="hero-system-line"><span className="tiny-cross">+</span><span>HOLLOW DEEP DIVE</span><i /><span>GHOST SYSTEM · 01</span></div>
          {settings.mascotVisible && <Ghost activity={currentActivity} motion={settings.motion} />}
          <div className="hero-wordmark"><span className="wordmark-prefix">YOUR PERSONAL AI</span><h1>GHOST<span className="wordmark-dot">.</span></h1></div>
          <div className="hero-status"><span className={`status-dot ${connected ? 'connected' : runtime.connection}`} /><span>{connected ? '系统就绪，等待你的指令。' : runtime.connection === 'connecting' ? '正在建立连接…' : '工作空间就绪，连接 Codex 后开始。'}</span></div>
          <p className="hero-description">从一个想法，到下一次突破。</p>
          <div className="quick-actions">
            {[{ icon: Search, title: '探索项目', sub: '理解结构，找到起点', prompt: '请先只读探索这个项目，介绍目录结构、技术栈和主要入口，不修改文件。' }, { icon: Terminal, title: '构建与迭代', sub: '把想法变成可运行的代码', prompt: '请先了解项目现状，和我一起规划下一步开发任务。' }, { icon: GitBranch, title: '检查变更', sub: '审查差异，验证结果', prompt: '请审查当前项目中尚未提交的代码变更，指出实际问题和验证建议，先不要修改代码。' }].map(card => <button key={card.title} onClick={() => { changeDraft(card.prompt); textarea.current?.focus() }}><card.icon size={17} strokeWidth={1.5} /><strong>{card.title}</strong><span>{card.sub}</span><ArrowUpRight size={12} /></button>)}
          </div><div className="hero-bottom-caption"><span>LOCAL FIRST</span><i /><span>MADE FOR YOUR NEXT DISCOVERY</span></div>
        </div> : <>
          <div className="conversation-header"><div>{settings.mascotVisible ? <Ghost small activity={currentActivity} motion={settings.motion} /> : <GhostIcon size={22} />}<div><strong>Ghost</strong><span>{activityLabels[currentActivity]}</span></div></div><div className="conversation-actions"><button className="icon-button" aria-label="重命名当前会话" title="重命名" onClick={() => setCapabilityMethod('thread/name/set')}><MessageSquare size={14} /></button><button className="icon-button" aria-label="分叉当前会话" title="分叉会话" onClick={() => setCapabilityMethod('thread/fork')}><GitBranch size={14} /></button><button className="icon-button" aria-label="会话更多操作" title="归档、恢复、回退与设置" onClick={() => setCapabilityMethod(session?.archived ? 'thread/unarchive' : 'thread/archive')}><MoreHorizontal size={16} /></button><span className="conversation-id">{selectedSession?.slice(0, 8)}</span></div></div>
          <div className="messages" ref={scrollContainer} onScroll={() => { const el = scrollContainer.current!; autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }}>
            <div className="messages-inner">{!!plan.length && <details className="task-plan" open><summary>执行计划</summary>{plan.map((p, i) => <div key={i} data-status={p.status}>{p.status === 'completed' ? '✓' : p.status === 'inProgress' ? '◉' : '○'} {p.step}</div>)}</details>}{historyLoading && <div className="history-loading"><LoaderCircle size={14} className="spin" />正在恢复会话…</div>}{items.map(item => <ConversationItem key={item.id} item={item} onError={onError} />)}{approvals.map(approval => <ApprovalCard key={approval.id} approval={approval} onError={onError} />)}{running && runtime.activeThreadId === selectedSession && !approvals.length && <div className="working-indicator"><span /><span /><span /><em>Ghost 正在工作</em></div>}<div ref={messageEnd} /></div>
          </div>
        </>}
        {error && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={14} /></button></div>}
        {!connected && runtime.connection !== 'connecting' && <div className="connection-banner"><PlugStatus /><span>{runtime.error || '连接本地 Codex，即可开始真实任务。'}</span><button onClick={() => setSettingsOpen(true)}>连接设置<ArrowUpRight size={13} /></button></div>}
        <div className="composer-dock">{session?.archived && <div className="archived-notice">归档会话 · <button className="inline-link" onClick={() => setCapabilityMethod('thread/unarchive')}>恢复归档后继续</button></div>}<div className="composer-topline"><select className="workspace-select" aria-label="会话工作空间" value={selectedProject || ''} disabled={!!selectedSession || running} onChange={e => { const p = snapshot.projects.find(p => p.id === e.target.value); if (p) void selectProject(p); else void ordinaryChat() }}><option value="">普通聊天 · 无需项目</option>{snapshot.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="project-selector" onClick={() => { void chooseProject() }} title={project?.path || emptyProjectText}><FolderOpen size={13} /><span>{project ? '打开其他项目' : '打开项目'}</span><ChevronDown size={11} /></button><span className="composer-session-hint">{settings.personaEnabled ? 'Ghost 人设已启用' : '常规助手模式'}</span></div>
          <div className="composer-card">{!!attachments.length && <div className="composer-attachments">{attachments.map(file => <div key={file.id} title={file.path}>{file.preview && <img src={file.preview} alt={file.name} />}<span>{file.type === 'skill' ? '$ ' : ''}{file.name}</span><button aria-label={`移除附件 ${file.name}`} onClick={() => setAttachments(list => list.filter(f => f.id !== file.id))}><X size={12} /></button></div>)}</div>}<textarea ref={textarea} aria-label="发送给 Ghost 的任务" placeholder={project ? '给 Ghost 一个任务，或一起探索新的想法…' : '直接和 Ghost 聊天，无需选择项目…'} value={draft} maxLength={100000} onChange={e => changeDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} rows={2} /><div className="composer-controls"><div className="composer-options"><button className="icon-button" title="添加图片、音频或文件" aria-label="添加附件" disabled={running} onClick={() => window.ghost.chooseAttachments().then(files => setAttachments(list => [...list, ...files].slice(0, 20))).catch(onError)}><Plus size={16} /></button><select aria-label="工作模式" value={settings.mode || 'default'} disabled={running} onChange={e => { void onSaveSettings({ mode: e.target.value as Settings['mode'] }).catch(onError) }}><option value="default">执行</option><option value="plan">计划</option></select><select aria-label="模型" value={settings.model || model?.model || ''} disabled={!runtime.models.length || running} onChange={e => { const picked = runtime.models.find(m => m.model === e.target.value); void onSaveSettings({ model: e.target.value, effort: picked?.defaultReasoningEffort || 'medium' }).catch(onError) }}><option value="" disabled>选择模型</option>{runtime.models.map(m => <option key={m.id} value={m.model}>{m.displayName}</option>)}</select><select aria-label="推理强度" value={settings.effort} disabled={running} onChange={e => { void onSaveSettings({ effort: e.target.value }).catch(onError) }}>{(model?.supportedReasoningEfforts?.length ? model.supportedReasoningEfforts : [{ reasoningEffort: 'medium', description: '' }]).map(e => <option key={e.reasoningEffort} value={e.reasoningEffort}>{({ low: '低', medium: '中等', high: '高', xhigh: '极高', minimal: '最低', none: '无', max: '最大', ultra: '超高' } as Record<string, string>)[e.reasoningEffort] || e.reasoningEffort}</option>)}</select><div className="composer-option-divider" /><Shield size={12} /><select aria-label="权限范围" value={project ? settings.permission : 'read-only'} disabled={running || !project} onChange={e => { void onSaveSettings({ permission: e.target.value as Settings['permission'] }).catch(onError) }}><option value="workspace-write">项目内读写</option><option value="read-only">只读探索</option></select></div>{running && runtime.activeThreadId === selectedSession && <div className="followup-actions"><button className="text-button" disabled={busy || !draft.trim() || !runtime.activeTurnId} onClick={() => { void followup(false) }}>补充指令</button><button className="text-button" disabled={busy || !draft.trim()} onClick={() => { void followup(true) }}>加入队列</button></div>}{running ? <button className="send-button stop-button" aria-label="停止任务" title="停止任务" disabled={!runtime.activeTurnId} onClick={() => window.ghost.interrupt().catch(onError)}><Square size={14} fill="currentColor" /></button> : <button className="send-button" aria-label="发送任务" title="发送 · Enter" disabled={busy || (!draft.trim() && !attachments.length) || !!session?.archived || !connected || !runtime.account} onClick={() => { void send() }}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={20} />}</button>}</div></div>
          <div className="composer-footer"><span title={usage ? JSON.stringify(usage) : ''}>{usage && <span>{usage.total?.totalTokens?.toLocaleString() || usage.last?.totalTokens?.toLocaleString() || '—'} tokens{usage.modelContextWindow ? ` / ${usage.modelContextWindow.toLocaleString()}` : ''} · </span>}<span className={`status-dot ${runtime.connection}`} />{connected ? runtime.account ? '已认证 · 本地工作空间' : '请先在设置中登录账户' : '离线工作空间'}</span><span><kbd>Enter</kbd> 发送<span className="footer-separator">·</span><kbd>Shift Enter</kbd> 换行</span></div>
        </div>
      </section>{detailOpen && project && <><div className="panel-resizer detail-resizer" role="separator" aria-label="调整工作区宽度" onPointerDown={event => resize(event, 'detail')} /><Suspense fallback={<aside className="detail-panel loading-panel"><LoaderCircle className="spin" size={20} />正在载入工作区…</aside>}><DetailPanel key={project.id} project={project} mode={detailMode} setMode={setDetailMode} onClose={() => { if (!detailsDirty || confirm('关闭工作区会放弃尚未保存的编辑，继续？')) { setDetailOpen(false); setDetailsDirty(false) } }} onDirty={setDetailsDirty} onError={onError} refresh={refresh} fontSize={settings.fontSize} /></Suspense></>}</div>
    </main>{capabilityMethod && <CapabilityPanel snapshot={snapshot} sessionId={selectedSession} initialMethod={capabilityMethod} onClose={() => setCapabilityMethod(null)} onSession={s => { void selectSession(s).then(() => window.ghost.history(s.id)).then(setItems).catch(onError) }} onSkill={file => setAttachments(list => [...list, file])} onError={onError} />}{settingsOpen && <SettingsPanel snapshot={snapshot} onClose={() => setSettingsOpen(false)} onSave={onSaveSettings} onError={onError} />}
  </div>
}

function PlugStatus() { return <Monitor size={14} /> }
function ConversationItem({ item, onError }: { item: Item; onError: (error: unknown) => void }) {
  if (item.type === 'userMessage') return <div className="message-user"><div>{item.text}{(item.raw as any)?.content?.filter((c: any) => c.type !== 'text').map((c: any, i: number) => <div className="message-attachment" key={i}>{c.type === 'skill' ? '$ ' : '↳ '}{c.name || c.path?.split(/[\\/]/).at(-1) || c.type}</div>)}</div></div>
  if (item.type === 'agentMessage') return item.text ? <article className="message-agent"><div className="agent-name"><span className="agent-mark">G</span><span>Ghost</span>{item.phase === 'commentary' && <small>进度</small>}</div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} onClick={e => { e.preventDefault(); if (href) window.ghost.openExternal(href).catch(onError) }}>{children}</a>, img: ({ alt }) => <span className="image-placeholder">[图片：{alt || '外部图片'}]</span> }}>{item.text}</ReactMarkdown></div><button className="copy-message" title="复制回复" aria-label="复制回复" onClick={() => navigator.clipboard.writeText(item.text).catch(onError)}><Copy size={12} /></button></article> : null
  if (item.type === 'reasoning' || item.type === 'plan') return item.text ? <details className="tool-item"><summary><Sparkles size={13} /><span>{item.type === 'plan' ? '任务计划' : '推理摘要'}</span><ChevronDown size={12} /></summary><pre>{item.text}</pre></details> : null
  if (['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch', 'contextCompaction', 'collabAgentToolCall'].includes(item.type)) return <details className="tool-item"><summary>{item.status === 'inProgress' ? <LoaderCircle size={13} className="spin" /> : item.status === 'failed' || item.status === 'declined' ? <CircleAlert size={13} /> : <Check size={13} />}<span>{item.type === 'commandExecution' ? item.command || '执行命令' : item.type === 'fileChange' ? `修改文件 · ${item.files?.join(', ') || ''}` : ({ mcpToolCall: '调用工具', webSearch: '检索资料', contextCompaction: '整理上下文', collabAgentToolCall: '协调任务' } as Record<string, string>)[item.type]}</span><ChevronDown size={12} /></summary>{item.output && <pre>{item.output}</pre>}{item.files?.map(path => <div className="tool-file" key={path}><FileCode2 size={12} />{path}</div>)}</details>
  return <details className="tool-item"><summary><Terminal size={13} /><span>{({ imageGeneration: '生成图像', imageView: '查看图像', enteredReviewMode: '进入代码审查', exitedReviewMode: '代码审查结果', dynamicToolCall: '客户端工具', search: '搜索' } as Record<string, string>)[item.type] || item.type}</span><ChevronDown size={12} /></summary>{item.text && <pre>{item.text}</pre>}<pre>{JSON.stringify(item.raw || item, null, 2).slice(0, 30000)}</pre></details>
}

export function App() { return new URLSearchParams(location.search).has('mini') ? <Pet /> : <StudioApp /> }



