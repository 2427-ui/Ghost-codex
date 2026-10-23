import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search, Play, LoaderCircle, RefreshCw, TerminalSquare, Puzzle, ListTodo, Settings2 } from 'lucide-react'
import { CAPABILITIES, defaultParams, resolveSchema, redact } from '../../../shared/capabilities'
import type { InputAttachment, Session, Snapshot } from '../../../shared/types'
import { SchemaField } from './SchemaForm'
import { TerminalPanel } from './TerminalPanel'

const shortcuts = [ ['thread/name/set', '重命名'], ['thread/fork', '分叉'], ['thread/archive', '归档'], ['thread/unarchive', '恢复归档'], ['thread/revert', '回退历史'], ['thread/compact/start', '压缩上下文'], ['thread/queue/list', '待执行队列'], ['thread/goal/get', '持续任务目标'], ['review/start', '代码审查'], ['thread/search', '全文搜索'], ['skills/list', '技能'], ['mcpServerStatus/list', 'MCP'], ['plugin/list', '插件'], ['project/list', '项目管理'], ['config/read', 'Codex 配置'] ]
export function CapabilityPanel({ snapshot, sessionId, initialMethod, onClose, onSession, onSkill, onError }: { snapshot: Snapshot; sessionId: string | null; initialMethod?: string; onClose: () => void; onSession: (session: Session) => void; onSkill: (file: InputAttachment) => void; onError: (error: unknown) => void }) {
  const [method, setMethod] = useState(initialMethod || 'skills/list'), [group, setGroup] = useState('常用功能'), [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<any>(null), [error, setError] = useState(''), [events, setEvents] = useState<any[]>([]), [unsupported, setUnsupported] = useState<Set<string>>(new Set())
  const capability = CAPABILITIES.find(c => c.method === method)
  const session = snapshot.sessions.find(s => s.id === sessionId), project = snapshot.projects.find(p => p.id === (session?.projectId || snapshot.settings.lastProjectId))
  const context = useMemo(() => ({ threadId: sessionId || '', projectId: project?.nativeId || '', cwd: session?.cwd || project?.path || '', roots: project ? [{ path: project.path }] : [], name: session?.title || '', idempotencyKey: crypto.randomUUID(), clientUserMessageId: crypto.randomUUID(), limit: 100 }), [sessionId, project?.id])
  const [params, setParams] = useState<any>({})
  const pending = useRef<{ method: string; params: any } | null>(null)
  function choose(next: string, extra: any) {
    if (next === method) { setParams((p: any) => ({ ...p, ...extra })); return }
    pending.current = { method: next, params: extra }; setMethod(next)
  }
  useEffect(() => {
    if (!capability) return
    const value = defaultParams(capability.schema, context)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const schema = resolveSchema(capability.schema), props = schema.properties || {}
      for (const key of ['cwd', 'threadId', 'projectId']) if (props[key] && context[key as keyof typeof context]) value[key] = context[key as keyof typeof context]
      if (method === 'skills/list') value.cwds = [context.cwd].filter(Boolean)
      if (method === 'review/start') { value.delivery = 'inline'; value.target = { type: 'uncommittedChanges' } }
    }
    setParams(pending.current?.method === method ? { ...value, ...pending.current.params } : value); pending.current = null; setResult(null); setError('')
  }, [method, context])
  useEffect(() => window.ghost.subscribe(e => { if (e.type === 'notification') setEvents(previous => [{ method: e.method, params: redact(e.params) }, ...previous].slice(0, 60)) }), [])
  async function run(override?: any) {
    if (!capability) return
    if (document.querySelector('.capability-modal [aria-invalid="true"]')) { setError('请先修正参数中的 JSON 格式。'); return }
    const actual = override || params
    if (capability.mutation && !confirm(`${capability.title}\n\n${method}\n${method === 'thread/delete' ? '将删除共享的本机会话记录。' : method === 'thread/revert' ? '将移除此轮及之后的对话历史，不恢复代码文件。' : method === 'process/spawn' ? '将在主机直接执行，不使用 Codex 沙箱。' : '将使用下面展示的参数执行操作。'}\n\n${JSON.stringify(redact(actual), null, 2).slice(0, 2500)}\n\n继续？`)) return
    setBusy(true); setError('')
    try {
      const response = await window.ghost.capability(method, actual || undefined); setResult(response)
      if (response?.thread?.id) { const next = await window.ghost.snapshot(); const s = next.sessions.find(s => s.id === response.thread.id); if (s) onSession(s) }
    } catch (value) {
      const message = value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : String(value)
      setError(message)
      if (/unknown method|method not found|unsupported|not supported|experimental API/i.test(message)) setUnsupported(set => new Set([...set, method]))
    } finally { setBusy(false) }
  }
  const skills = method === 'skills/list' ? (result?.data || []).flatMap((entry: any) => entry.skills || []) : []
  const resultCards = <>
    {['thread/list', 'thread/search'].includes(method) && result?.data?.map((entry: any) => { const t = entry.thread || entry; return <div key={t.id} className="capability-result-card"><strong>{t.name || t.preview || t.id}</strong>{entry.snippet && <p>{entry.snippet}</p>}<button className="secondary-button" onClick={async () => { try { await window.ghost.syncHistory(); const next = await window.ghost.snapshot(); const s = next.sessions.find(s => s.id === t.id); if (s) { onSession(s); onClose() } } catch (e) { onError(e) } }}>打开会话</button></div> })}
    {method === 'project/list' && result?.data?.map((p: any) => <div key={p.id} className="capability-result-card"><strong>{p.name}</strong><p>{p.roots?.map((r: any) => r.path).join('\n')}</p><button className="secondary-button" onClick={() => choose('project/update', { projectId: p.id, name: p.name })}>编辑项目</button><button className="text-button" onClick={() => choose('project/delete', { projectId: p.id })}>移除项目</button></div>)}
    {method === 'thread/queue/list' && result?.data?.map((q: any) => <div key={q.id} className="capability-result-card"><p>{q.input?.map((i: any) => i.text || i.path || i.type).join('\n')}</p><button className="secondary-button" onClick={() => choose('thread/queue/start', { threadId: params.threadId, queuedSubmissionId: q.id })}>执行这条消息</button><button className="text-button" onClick={() => choose('thread/queue/delete', { threadId: params.threadId, queuedSubmissionId: q.id })}>移出队列</button></div>)}
    {method === 'mcpServerStatus/list' && result?.data?.map((s: any) => <div key={s.name} className="capability-result-card"><strong>{s.name}</strong><p>{s.authStatus} · {s.runtimeStatus || '状态待更新'}{s.toolsError && ` · ${s.toolsError}`}</p><button className="secondary-button" onClick={() => choose('mcpServer/oauth/login', { name: s.name })}>登录</button>{Object.entries(s.tools || {}).map(([name, tool]: [string, any]) => <details key={name}><summary>{name}</summary><p>{tool.description}</p><button className="text-button" onClick={() => choose('mcpServer/tool/call', { server: s.name, tool: name, arguments: {} })}>填写参数并调用</button></details>)}</div>)}
    {method === 'plugin/list' && result?.marketplaces?.flatMap((market: any) => (market.plugins || []).map((p: any) => <div key={p.id} className="capability-result-card"><strong>{p.interface?.displayName || p.name}</strong><p>{p.interface?.shortDescription || p.interface?.description || p.name}</p><button className="secondary-button" onClick={() => choose(p.installed ? 'plugin/uninstall' : 'plugin/install', p.installed ? { pluginId: p.id } : { pluginName: p.name, ...(market.path ? { marketplacePath: market.path } : { remoteMarketplaceName: market.name }), installAttemptId: crypto.randomUUID() })}>{p.installed ? '卸载插件' : '安装插件'}</button></div>))}
  </>
  const groups = ['常用功能', '终端', ...new Set(CAPABILITIES.map(c => c.group))]
  const shown = CAPABILITIES.filter(c => !c.unavailable && (query ? `${c.title} ${c.method}`.toLowerCase().includes(query.toLowerCase()) : group === '常用功能' ? shortcuts.some(([m]) => m === c.method) : c.group === group))
  return <div className="modal-scrim"><section className="capability-modal" role="dialog" aria-label="Codex 功能中心"><header className="modal-header"><div><span className="eyebrow">CODEX NATIVE CAPABILITIES</span><h2>Codex 功能中心</h2><small>{snapshot.runtime.version} · {CAPABILITIES.filter(c => !c.unavailable).length} 个接口入口 · 当前上下文：{project?.name || '普通聊天'}</small></div><button className="icon-button" aria-label="关闭功能中心" onClick={onClose}><X size={20} /></button></header><div className="capability-layout"><nav className="capability-groups">{groups.map(g => <button key={g} className={group === g ? 'active' : ''} onClick={() => { setGroup(g); setQuery('') }}>{g === '终端' ? <TerminalSquare size={15} /> : g === '技能与扩展' ? <Puzzle size={15} /> : g === '对话与任务' ? <ListTodo size={15} /> : <Settings2 size={15} />}{g}</button>)}</nav><div className="capability-body">{group === '终端' ? <TerminalPanel project={project} onError={onError} /> : <><div className="capability-search"><Search size={15} /><input aria-label="搜索 Codex 功能" placeholder="搜索功能或接口名称…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="capability-workspace"><aside className="capability-list">{shown.map(c => <button key={c.method} className={method === c.method ? 'selected' : ''} onClick={() => setMethod(c.method)}><strong>{c.title}</strong><small>{c.method}{c.experimental ? ' · 实验' : ''}{unsupported.has(c.method) ? ' · 本机不可用' : ''}</small></button>)}</aside><div className="capability-form">{capability && <><div className="capability-form-title"><h3>{capability.title}</h3><code>{method}</code></div>{capability.experimental && <p className="muted">实验接口，是否可执行取决于当前版本、配置和账户权限；服务端拒绝时会展示实际原因。</p>}<SchemaField key={method + sessionId} schema={capability.schema} value={params} onChange={setParams} /><div className="button-row"><button className="primary-button" disabled={busy || snapshot.runtime.connection !== 'connected' || !!capability.unavailable} onClick={() => { void run() }}>{busy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}{capability.mutation ? '执行操作' : '读取'}</button>{result?.nextCursor && <button className="text-button" disabled={busy} onClick={() => { const next = { ...params, cursor: result.nextCursor }; setParams(next); void run(next) }}><RefreshCw size={14} />下一页</button>}</div>{error && <div className="capability-error" role="alert">{error}</div>}{skills.map((skill: any) => <div className="capability-result-card" key={skill.path}><strong>{skill.name}</strong><p>{skill.description}</p><button className="secondary-button" onClick={() => { onSkill({ id: crypto.randomUUID(), name: skill.name, path: skill.path, type: 'skill' }); onClose() }}>添加到消息</button><button className="text-button" onClick={async () => { try { await window.ghost.capability('skills/config/write', { path: skill.path, enabled: !skill.enabled }); await run() } catch (e) { onError(e) } }}>{skill.enabled ? '停用' : '启用'}</button></div>)}{resultCards}{result !== null && <><h4>操作结果</h4><pre className="capability-result">{JSON.stringify(result, null, 2)?.slice(0, 300000)}</pre>{[result?.authorizationUrl, result?.authUrl, result?.url].filter((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v)).map(url => <button className="text-button" key={url} onClick={() => window.ghost.openExternal(url).catch(onError)}>打开认证或结果页面</button>)}</>}</>}</div></div></>}<details className="capability-events"><summary>执行事件与进展（最近 60 条）</summary>{events.map((e, i) => <details key={i}><summary>{e.method}</summary><pre>{JSON.stringify(e.params, null, 2).slice(0, 10000)}</pre></details>)}</details></div></div></section></div>
}



