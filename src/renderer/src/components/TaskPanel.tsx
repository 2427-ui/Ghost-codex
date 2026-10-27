import { useEffect, useRef, useState } from 'react'
import type { Runtime, Session } from '../../../shared/types'

export function TaskPanel({ runtime, sessions, sessionId, onSelect, onError }: { runtime: Runtime; sessions: Session[]; sessionId: string | null; onSelect: (session: Session) => void; onError: (error: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [queue, setQueue] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [queueError, setQueueError] = useState('')
  const currentSession = useRef(sessionId)
  currentSession.current = sessionId
  const active = Object.entries(runtime.tasks || {}).filter(([, task]) => ['running', 'approval'].includes(task.activity))
  async function load() {
    if (!sessionId) return
    try {
      const items = []
      let cursor: string | undefined
      do {
        const result = await window.ghost.capability('thread/queue/list', { threadId: sessionId, ...(cursor ? { cursor } : {}) })
        items.push(...result.data || []); cursor = result.nextCursor || undefined
      } while (cursor)
      if (currentSession.current === sessionId) { setQueue(items); setQueueError('') }
    } catch (error) { if (currentSession.current === sessionId) setQueueError(error instanceof Error ? error.message : String(error)) }
  }
  useEffect(() => {
    setQueue([]); setQueueError('')
    if (!open || !sessionId) return
    let alive = true
    const refresh = () => { if (alive) void load() }
    refresh(); const timer = setInterval(refresh, 4000)
    return () => { alive = false; clearInterval(timer) }
  }, [open, sessionId, runtime.tasks?.[sessionId || '']?.activity])
  async function action(method: string, id: string) {
    setBusy(true)
    try { await window.ghost.capability(method, { threadId: sessionId, queuedSubmissionId: id }); await load() } catch (error) { onError(error) } finally { setBusy(false) }
  }
  return <div className="task-manager">
    <div className="task-manager-bar">{active.map(([id, task]) => <button key={id} onClick={() => { const session = sessions.find(value => value.id === id); if (session) onSelect(session) }} title={task.task}>{task.activity === 'approval' ? '待确认' : '执行中'} · {sessions.find(value => value.id === id)?.title || id.slice(0, 8)}</button>)}{sessionId && <button aria-expanded={open} onClick={() => setOpen(value => !value)}>任务队列{queue.length ? ` (${queue.length})` : ''}</button>}</div>
    {open && sessionId && <div className="queue-panel" aria-label="当前会话任务队列"><button disabled={busy} onClick={() => { void load() }}>刷新队列</button>{queueError && <p role="alert">{queueError}</p>}{!queue.length && !queueError && <p>暂无排队任务。执行时可从输入框加入队列。</p>}{queue.map(item => <div className="queue-row" key={item.id}><span>{item.input?.map((part: any) => part.text || part.name || part.type).join(' ') || item.id}</span><button disabled={busy || ['running', 'approval'].includes(runtime.tasks?.[sessionId]?.activity || '')} onClick={() => { void action('thread/queue/start', item.id) }}>执行</button><button disabled={busy} onClick={() => { void action('thread/queue/delete', item.id) }}>移除</button></div>)}</div>}
  </div>
}
