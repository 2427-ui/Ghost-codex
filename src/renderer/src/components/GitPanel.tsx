import { useEffect, useState } from 'react'
import type { GitAction, GitDetails, GitState, Project } from '../../../shared/types'

export function GitPanel({ project, state, refresh, staged, setStaged, onDiff, onChanged, onReview, onError }: { project: Project; state: GitState; refresh: number; staged: boolean; setStaged: (value: boolean) => void; onDiff: (path: string) => void; onChanged: () => void; onReview: (target: Record<string, string>) => Promise<void>; onError: (error: unknown) => void }) {
  const [details, setDetails] = useState<GitDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const [newBranch, setNewBranch] = useState('codex/')
  const [tab, setTab] = useState<'changes' | 'history' | 'review' | 'pr'>('changes')
  const [feedback, setFeedback] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [reviewType, setReviewType] = useState('uncommittedChanges')
  const [reviewValue, setReviewValue] = useState('')
  useEffect(() => { let live = true; window.ghost.gitDetails(project.id).then(value => { if (live) setDetails(value) }).catch(onError); return () => { live = false } }, [project.id, refresh])
  async function run(request: GitAction) {
    if (busy) return
    setBusy(true); setFeedback('')
    try { const result = await window.ghost.gitAction(project.id, request); setFeedback(result || '操作已完成'); if (request.action === 'commit') setMessage(''); onChanged() } catch (error) { onError(error) } finally { setBusy(false) }
  }
  const entries = state.entries.filter(entry => staged ? entry.status[0] !== ' ' && entry.status[0] !== '?' : entry.status[1] !== ' ' || entry.status === '??')
  return <div className="git-workflow">
    <div className="workflow-tabs">{(['changes', 'history', 'review', 'pr'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{({ changes: '变更', history: '分支与历史', review: '审查', pr: '推送与 PR' })[value]}</button>)}</div>
    {tab === 'changes' && <>
      <select aria-label="差异范围" value={staged ? 'index' : 'working'} onChange={event => setStaged(event.target.value === 'index')}><option value="working">工作区 vs 暂存区</option><option value="index">暂存区 vs HEAD</option></select>
      {entries.map(entry => <div className="git-change-row" key={entry.path}><button title={entry.path} onClick={() => onDiff(entry.path)}><code>{entry.status}</code><span>{entry.path}</span></button><button disabled={busy || /[RCU]/.test(entry.status)} title={/[RCU]/.test(entry.status) ? '重命名或冲突请在终端处理' : ''} onClick={() => { void run({ action: staged ? 'unstage' : 'stage', path: entry.path }) }}>{staged ? '取消暂存' : '暂存'}</button>{!staged && entry.status !== '??' && <button disabled={busy} onClick={() => { void run({ action: 'restore', path: entry.path }) }}>恢复</button>}</div>)}
      {!entries.length && <p>此范围没有变更。</p>}
      <textarea aria-label="提交说明" placeholder="提交说明（仅提交暂存内容）" value={message} onChange={event => setMessage(event.target.value)} maxLength={10000} />
      <button className="secondary-button" disabled={busy || !message.trim() || !state.entries.some(e => e.status[0] !== ' ' && e.status[0] !== '?')} onClick={() => { void run({ action: 'commit', message }) }}>提交暂存内容</button>
    </>}
    {tab === 'history' && <>
      <div className="workflow-row"><select aria-label="已有分支" value={branch} onChange={event => setBranch(event.target.value)}><option value="">选择分支</option>{details?.branches.map(name => <option key={name}>{name}</option>)}</select><button disabled={busy || !branch || branch === state.branch} onClick={() => { void run({ action: 'branch', name: branch, create: false }) }}>切换</button></div>
      <div className="workflow-row"><input aria-label="新分支名称" value={newBranch} onChange={event => setNewBranch(event.target.value)} /><button disabled={busy || !newBranch.trim()} onClick={() => { void run({ action: 'branch', name: newBranch, create: true }) }}>创建并切换</button></div>
      {details?.commits.map(commit => <button className="commit-row" key={commit.id} onClick={() => { setReviewType('commit'); setReviewValue(commit.id); setTab('review') }} title="审查此提交"><code>{commit.id}</code><span>{commit.subject}</span></button>)}
    </>}
    {tab === 'review' && <>
      <select aria-label="审查范围" value={reviewType} onChange={event => { setReviewType(event.target.value); setReviewValue('') }}><option value="uncommittedChanges">未提交变更</option><option value="baseBranch">与基准分支比较</option><option value="commit">指定提交</option><option value="custom">自定义审查指令</option></select>
      {reviewType !== 'uncommittedChanges' && <textarea aria-label="审查目标" value={reviewValue} placeholder={reviewType === 'baseBranch' ? '基准分支，例如 main' : reviewType === 'commit' ? '提交 SHA' : '审查指令'} onChange={event => setReviewValue(event.target.value)} />}
      <button className="secondary-button" disabled={busy || reviewType !== 'uncommittedChanges' && !reviewValue.trim()} onClick={async () => { setBusy(true); try { await onReview({ type: reviewType, ...(reviewType === 'baseBranch' ? { branch: reviewValue } : reviewType === 'commit' ? { sha: reviewValue } : reviewType === 'custom' ? { instructions: reviewValue } : {}) }); setFeedback('审查已启动，结果会显示在会话中。') } catch (error) { onError(error) } finally { setBusy(false) } }}>启动代码审查</button>
      <p>可在差异中选择行并写反馈，再引用到输入框。</p>
    </>}
    {tab === 'pr' && <>
      <p>{details?.remote ? '远程：origin' : '未配置 origin。请先在终端配置远程仓库。'}</p>
      <button className="secondary-button" disabled={busy || !details?.remote} onClick={() => { void run({ action: 'push' }) }}>推送当前分支</button>
      <input aria-label="PR 标题" placeholder="PR 标题" value={title} maxLength={300} onChange={event => setTitle(event.target.value)} />
      <textarea aria-label="PR 说明" placeholder="说明变更与验证结果" value={body} maxLength={30000} onChange={event => setBody(event.target.value)} />
      <button className="secondary-button" disabled={busy || !title.trim() || !details?.remote} onClick={() => { void run({ action: 'pr', title, body }) }}>创建草稿 PR</button>
      <p>使用已登录的 GitHub CLI（gh）；请先推送分支。推送与创建时会显示确认。</p>
    </>}
    {busy && <p role="status">正在执行…</p>}{feedback && <pre role="status">{feedback}</pre>}
  </div>
}
