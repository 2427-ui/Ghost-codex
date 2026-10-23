import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Check, CircleAlert, FolderOpen, LoaderCircle, MessageSquare, Power, Square, X } from 'lucide-react'
import { Ghost } from './Ghost'
import type { Activity, Item, Snapshot, StudioEvent } from '../../../shared/types'

const labels: Record<Activity, string> = { idle: '随时可以开始', running: '正在为你工作', approval: '需要你的确认', completed: '任务完成了', interrupted: '已停止任务', error: '有件事需要处理' }
function wireItem(item: any): Item {
  return { id: item.id, type: item.type, status: item.status, phase: item.phase, command: item.command, text: item.type === 'userMessage' ? (item.content || []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n') : item.text || '' }
}
function brief(text: string) { return text.replace(/```[\s\S]*?```/g, '[代码]').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim() }

export function Pet() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const threadRef = useRef<string | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interaction = useRef(true)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const onError = useCallback((value: unknown) => setError(value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : String(value)), [])
  const reload = useCallback(async () => { const value = await window.ghost.snapshot(); setSnapshot(value); return value }, [])
  const runtime = snapshot?.runtime
  const running = runtime?.activity === 'running' || runtime?.activity === 'approval'
  const threadId = running ? runtime.activeThreadId : snapshot?.settings.lastSessionId || null
  const session = snapshot?.sessions.find(s => s.id === threadId)
  const project = snapshot?.projects.find(p => p.id === (session ? session.projectId : snapshot.settings.lastProjectId))
  const activity = runtime?.activity || 'idle'
  threadRef.current = threadId || null

  useEffect(() => {
    let live = true
    reload().catch(onError)
    const unsubscribe = window.ghost.subscribe((event: StudioEvent) => {
      if (!live) return
      if (event.type === 'pet-collapse') { setExpanded(false); setError(''); void reload().catch(onError) }
      if (event.type === 'runtime') {
        if (event.runtime.activeThreadId && ['running', 'approval'].includes(event.runtime.activity)) threadRef.current = event.runtime.activeThreadId
        setSnapshot(current => current ? { ...current, runtime: event.runtime } : current)
      }
      if (event.type === 'approvals') setSnapshot(current => current ? { ...current, approvals: event.approvals } : current)
      if (event.type === 'data') void reload().catch(onError)
      if (event.type !== 'notification' || event.params.threadId !== threadRef.current) return
      const p = event.params
      if ((event.method === 'item/started' || event.method === 'item/completed') && p.item) {
        const next = wireItem(p.item)
        setItems(previous => previous.some(item => item.id === next.id) ? previous.map(item => item.id === next.id ? next : item) : [...previous, next])
      }
      if (event.method === 'item/agentMessage/delta') setItems(previous => {
        const current = previous.find(item => item.id === p.itemId)
        const next: Item = { ...(current || { id: p.itemId, type: 'agentMessage', text: '' }), text: (current?.text || '') + p.delta, status: 'inProgress' }
        return current ? previous.map(item => item.id === next.id ? next : item) : [...previous, next]
      })
    })
    return () => { live = false; unsubscribe(); if (draftTimer.current) clearTimeout(draftTimer.current) }
  }, [])

  useEffect(() => {
    let live = true
    setItems([])
    if (!threadId || runtime?.connection !== 'connected') return
    setHistoryLoading(true)
    window.ghost.history(threadId).then(history => {
      if (live) setItems(current => { const merged = new Map(history.map(item => [item.id, item])); for (const item of current) merged.set(item.id, item); return [...merged.values()] })
    }).catch(onError).finally(() => { if (live) setHistoryLoading(false) })
    return () => { live = false }
  }, [threadId, runtime?.connection])
  useEffect(() => {
    if (!expanded || !threadId || busy) return
    let live = true
    window.ghost.draft(threadId).then(value => { if (live) setText(value) }).catch(onError)
    return () => { live = false }
  }, [expanded, threadId])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'instant' }) }, [items, expanded])
  useEffect(() => {
    // Forward mouse movement through transparent pixels, but keep the eye and bubbles interactive.
    const move = (event: MouseEvent) => {
      if (drag.current) return
      const active = !!document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pet-interactive]')
      if (active !== interaction.current) { interaction.current = active; void window.ghost.petInteractive(active).catch(() => {}) }
    }
    const leave = () => { if (!drag.current) { interaction.current = false; void window.ghost.petInteractive(false).catch(() => {}) } }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', leave)
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', leave) }
  }, [])

  async function toggle(open = !expanded) {
    try { await window.ghost.petLayout(open); setExpanded(open); interaction.current = true; if (open) requestAnimationFrame(() => input.current?.focus()) } catch (value) { onError(value) }
  }
  function changeText(value: string) {
    setText(value)
    if (draftTimer.current) clearTimeout(draftTimer.current)
    const id = threadRef.current
    if (id) draftTimer.current = setTimeout(() => { window.ghost.draft(id, value).catch(onError) }, 350)
  }
  async function send() {
    if (!text.trim() || busy || running) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    setBusy(true); setError('')
    try { await window.ghost.petSend(text); setText(''); await reload() } catch (value) { onError(value) } finally { setBusy(false) }
  }
  async function restore() {
    if (draftTimer.current) clearTimeout(draftTimer.current)
    if (threadRef.current && expanded) await window.ghost.draft(threadRef.current, text).catch(onError)
    await window.ghost.window('restore')
  }
  const latestReply = items.filter(item => item.type === 'agentMessage' && item.text).at(-1)
  const currentTool = items.filter(item => item.status === 'inProgress' && item.command).at(-1)
  const summary = error || (activity === 'approval' ? '点击打开工作台，处理确认' : activity === 'error' ? runtime?.error || '打开工作台检查连接' : running ? currentTool?.command || (latestReply?.phase === 'commentary' ? brief(latestReply.text) : runtime?.task) : latestReply ? brief(latestReply.text) : project ? `在「${project.name}」中继续` : '直接和 Ghost 聊聊吧')
  const conversation = items.filter(item => ['userMessage', 'agentMessage'].includes(item.type) && item.text).slice(-12)

  return <div className="pet-desktop" data-motion={snapshot?.settings.motion || 'full'} data-expanded={expanded}>
    {expanded && <section className="pet-chat" data-pet-interactive role="dialog" aria-label="与 Ghost 对话">
      <header className="pet-chat-header"><div><span className={`status-dot ${runtime?.connection || 'disconnected'}`} /><strong>Ghost</strong><span>随时在你身边</span></div><div className="button-row"><button className="icon-button" title="打开完整工作台" aria-label="打开完整工作台" onClick={() => { void restore() }}><ArrowUpRight size={16} /></button><button className="icon-button" aria-label="收起桌宠对话" onClick={() => { void toggle(false) }}><X size={16} /></button></div></header>
      <div className="pet-context"><FolderOpen size={13} /><span title={project?.path}>{project?.name || '普通聊天'}</span><select aria-label="桌宠当前会话" value={snapshot?.settings.lastSessionId || ''} disabled={running || busy} onChange={event => {
        const next = snapshot?.sessions.find(s => s.id === event.target.value)
        if (draftTimer.current) clearTimeout(draftTimer.current)
        void window.ghost.settings({ lastSessionId: next?.id || null, ...(next ? { lastProjectId: next.projectId } : {}) }).then(() => reload()).catch(onError)
      }}><option value="">新会话</option>{snapshot?.sessions.filter(s => s.projectId === (project?.id || null) && !s.archived).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
      <div className="pet-messages" aria-live="polite">{historyLoading && <div className="pet-empty"><LoaderCircle size={15} className="spin" />正在读取会话…</div>}{!conversation.length && !historyLoading && <div className="pet-empty"><MessageSquare size={22} strokeWidth={1.2} /><strong>有什么新想法？</strong><p>{project ? '直接在这里发消息，和工作台接着聊。' : '无需项目，直接在这里和我聊天。'}</p></div>}{conversation.map(item => <div key={item.id} className={`pet-message ${item.type === 'userMessage' ? 'from-user' : 'from-ghost'}`}>{item.type === 'agentMessage' && <span>GHOST{item.phase === 'commentary' ? ' · 进度' : ''}</span>}<p>{item.text}</p></div>)}<div ref={end} /></div>
      {running && <div className="pet-progress">{activity === 'approval' ? <CircleAlert size={13} /> : <LoaderCircle size={13} className="spin" />}<span>{labels[activity]}</span>{activity === 'approval' ? <button onClick={() => { void restore() }}>前往处理<ArrowUpRight size={12} /></button> : <button aria-label="停止桌宠当前任务" disabled={!runtime?.activeTurnId} onClick={() => window.ghost.interrupt().catch(onError)}><Square size={11} />停止</button>}</div>}
      {error && <div className="pet-error" role="alert">{error}</div>}
      <form className="pet-composer" onSubmit={event => { event.preventDefault(); void send() }}><textarea ref={input} aria-label="桌宠消息输入" value={text} onChange={e => changeText(e.target.value)} maxLength={100000} rows={2} placeholder="和 Ghost 说点什么…" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } if (event.key === 'Escape') { event.preventDefault(); void toggle(false) } }} /><div><span>{running ? '正在处理当前任务' : 'Enter 发送 · Shift Enter 换行'}</span><button className="send-button" type="submit" aria-label="发送桌宠消息" disabled={!text.trim() || busy || running || !!session?.archived || runtime?.connection !== 'connected' || !runtime.account}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}</button></div></form>
    </section>}
    <div className="pet-companion">
      <button data-pet-interactive className={`pet-status pet-status-${activity}`} aria-label="查看 Ghost 对话状态" onClick={() => { void (activity === 'approval' ? restore() : toggle()) }} title={summary || labels[activity]}><span className="pet-status-title">{running && activity !== 'approval' ? <LoaderCircle size={10} className="spin" /> : activity === 'completed' ? <Check size={11} /> : <span className={`status-dot ${runtime?.connection || 'disconnected'}`} />}{labels[activity]}</span><span className="pet-status-summary">{summary}</span></button>
      <button data-pet-interactive className="pet-avatar" aria-label="恢复 Ghost 工作台" title="点击打开工作台 · 拖动移动 Ghost" onPointerDown={event => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.screenX, y: event.screenY, moved: false }
        void window.ghost.petDrag('start').catch(onError)
      }} onPointerMove={event => {
        if (!drag.current) return
        if (Math.hypot(event.screenX - drag.current.x, event.screenY - drag.current.y) > 5) drag.current.moved = true
        if (drag.current.moved) void window.ghost.petDrag('move').catch(onError)
      }} onPointerUp={event => {
        if (!drag.current) return
        const moved = drag.current.moved; drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        void window.ghost.petDrag('end').then(() => { if (!moved) void restore() }).catch(onError)
      }} onPointerCancel={() => { drag.current = null; void window.ghost.petDrag('end').catch(onError) }} onClick={event => { if (event.detail === 0) void restore() }} onContextMenu={event => { event.preventDefault(); void toggle() }}><Ghost small activity={activity} motion={snapshot?.settings.motion || 'full'} /></button>
      <div className="pet-tools" data-pet-interactive><button className={expanded ? 'active' : ''} aria-label="展开桌宠对话" title="和 Ghost 聊天" onClick={() => { void toggle() }}><MessageSquare size={15} /></button><i /><button aria-label="从桌宠打开工作台" title="打开工作台" onClick={() => { void restore() }}><ArrowUpRight size={17} /></button>{running && <><i /><button aria-label="停止当前任务" title="停止任务" disabled={!runtime?.activeTurnId} onClick={() => window.ghost.interrupt().catch(onError)}><Square size={12} /></button></>}<i /><button aria-label="退出 Ghost" title="退出 Ghost" onClick={() => window.ghost.window('quit').catch(onError)}><Power size={13} /></button></div>
    </div>
  </div>
}
