import { useEffect, useRef, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import { X, ChevronRight, ChevronDown, Folder, FileCode2, RefreshCw, Save, GitBranch, FolderOpen } from 'lucide-react'
import type { FileDocument, FileEntry, GitState, FileDiff, Project, SearchResult } from '../../../shared/types'
import { GitPanel } from './GitPanel'

;(self as any).MonacoEnvironment = { getWorker(_module: string, label: string) { if (['typescript', 'javascript'].includes(label)) return new TsWorker(); if (label === 'json') return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })
monaco.editor.defineTheme('ghost-light', { base: 'vs', inherit: true, rules: [{ token: 'comment', foreground: '767676' }, { token: 'string', foreground: '4D6653' }, { token: 'keyword', foreground: '57516A' }], colors: { 'editor.background': '#fafafa', 'editor.foreground': '#353535', 'editor.lineHighlightBackground': '#f0f0f0', 'editorLineNumber.foreground': '#929292', 'editor.selectionBackground': '#d9d9d9', 'editorGutter.background': '#fafafa', 'diffEditor.insertedTextBackground': '#4f865522', 'diffEditor.removedTextBackground': '#a84c4c22' } })
const language = (path: string) => ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown', py: 'python', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', toml: 'ini', rs: 'rust', sh: 'shell', ps1: 'powershell', sql: 'sql', c: 'c', cpp: 'cpp' }[path.split('.').at(-1)!] || 'plaintext')

// Detach the diff model before disposal; the React adapter disposes models first.
function WorkspaceDiff({ diff, fontSize, onMount }: { diff: FileDiff; fontSize: number; onMount: (editor: monaco.editor.IStandaloneCodeEditor) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const mounted = useRef(onMount)
  mounted.current = onMount
  useEffect(() => {
    const original = monaco.editor.createModel(diff.original, language(diff.path))
    const modified = monaco.editor.createModel(diff.modified, language(diff.path))
    const editor = monaco.editor.createDiffEditor(container.current!, { readOnly: true, renderSideBySide: false, minimap: { enabled: false }, fontSize, scrollBeyondLastLine: false, automaticLayout: true, theme: 'ghost-light' })
    instance.current = editor
    editor.setModel({ original, modified }); mounted.current(editor.getModifiedEditor())
    return () => { instance.current = null; editor.setModel(null); editor.dispose(); original.dispose(); modified.dispose() }
  }, [diff.path])
  useEffect(() => {
    const model = instance.current?.getModel()
    if (model?.original.getValue() !== diff.original) model?.original.setValue(diff.original)
    if (model?.modified.getValue() !== diff.modified) model?.modified.setValue(diff.modified)
    instance.current?.updateOptions({ fontSize })
  }, [diff.original, diff.modified, fontSize])
  return <div ref={container} style={{ height: '100%' }} />
}

function Directory({ project, path, depth, onOpen, onError, refresh }: { project: Project; path: string; depth: number; onOpen: (path: string) => void; onError: (error: unknown) => void; refresh: number }) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  useEffect(() => { let live = true; window.ghost.tree(project.id, path).then(value => { if (live) setEntries(value) }).catch(onError); return () => { live = false } }, [project.id, path, refresh])
  return <>{entries.map(entry => <div key={entry.path}>
    <button className="file-row" style={{ paddingLeft: 14 + depth * 14 }} onClick={() => entry.directory ? setExpanded(list => list.includes(entry.path) ? list.filter(p => p !== entry.path) : [...list, entry.path]) : onOpen(entry.path)} title={entry.path}>
      {entry.directory ? expanded.includes(entry.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : <span className="file-indent" />}{entry.directory ? <Folder size={14} /> : <FileCode2 size={14} />}<span>{entry.name}</span>
    </button>{entry.directory && expanded.includes(entry.path) && <Directory {...{ project, onOpen, onError, refresh }} path={entry.path} depth={depth + 1} />}
  </div>)}</>
}

export function DetailPanel({ project, mode, setMode, onClose, onDirty, onError, refresh, fontSize, onQuote, onReference, onReview }: { project: Project; mode: 'files' | 'git'; setMode: (mode: 'files' | 'git') => void; onClose: () => void; onDirty: (dirty: boolean) => void; onError: (error: unknown) => void; refresh: number; fontSize: number; onQuote: (text: string) => void; onReference: (path: string) => void; onReview: (target: Record<string, string>) => Promise<void> }) {
  const [documents, setDocuments] = useState<(FileDocument & { draft: string })[]>([])
  const [activePath, setActivePath] = useState('')
  const [git, setGit] = useState<GitState | null>(null)
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [staged, setStaged] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [selection, setSelection] = useState({ start: 1, end: 1 })
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const targetLine = useRef(1)
  const diffRequest = useRef(0)
  const searchInput = useRef<HTMLInputElement>(null)
  const current = documents.find(doc => doc.path === activePath)
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setMode('files'); searchInput.current?.focus() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    let live = true
    setResults(null); setSearching(!!query.trim())
    if (!query.trim()) return
    const timer = setTimeout(() => { window.ghost.search(project.id, query).then(value => { if (live) setResults(value) }).catch(onError).finally(() => { if (live) setSearching(false) }) }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query, project.id, refresh, localRefresh])
  // Refresh status and clean buffers on focus without replacing unsaved editor text.
  useEffect(() => {
    const focus = () => { setLocalRefresh(n => n + 1); void Promise.all(documents.filter(doc => doc.draft === doc.content).map(async doc => {
      try { const next = await window.ghost.read(project.id, doc.path); setDocuments(list => list.map(value => value.path === doc.path && value.draft === doc.draft && value.content === doc.content ? { ...next, draft: next.content } : value)) } catch { /* keep deleted or unreadable buffers for recovery */ }
    })) }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [documents, project.id])
  function mountEditor(instance: monaco.editor.IStandaloneCodeEditor) {
    editor.current = instance
    instance.revealLineInCenter(targetLine.current); instance.setPosition({ lineNumber: targetLine.current, column: 1 })
    instance.onDidChangeCursorSelection(event => setSelection({ start: event.selection.startLineNumber, end: event.selection.endLineNumber }))
  }
  function quote() {
    const path = diff?.path || current?.path
    if (!path) return
    const range = editor.current?.getSelection()
    const text = range ? editor.current?.getModel()?.getValueInRange(range) || '' : ''
    onQuote(`文件 ${path}:${selection.start}${selection.end !== selection.start ? `-${selection.end}` : ''}\n${text ? `\`\`\`\n${text.slice(0, 15000)}\n\`\`\`\n` : ''}${feedback.trim() ? `审查反馈：${feedback.trim()}\n` : ''}`)
    setFeedback('')
  }
  useEffect(() => { onDirty(documents.some(doc => doc.content !== doc.draft)) }, [documents])
  useEffect(() => { let live = true; window.ghost.git(project.id).then(value => { if (live) setGit(value) }).catch(onError); return () => { live = false } }, [project.id, refresh, localRefresh])
  async function open(path: string, line = 1) {
    try {
      diffRequest.current++
      targetLine.current = line
      if (!documents.some(d => d.path === path)) { const document = await window.ghost.read(project.id, path); setDocuments(docs => [...docs.filter(d => d.path !== path), { ...document, draft: document.content }]) }
      setActivePath(path); setDiff(null)
      if (activePath === path && !diff) { editor.current?.revealLineInCenter(line); editor.current?.setPosition({ lineNumber: line, column: 1 }) }
    } catch (error) { onError(error) }
  }
  async function save() {
    if (!current || saving) return
    setSaving(true)
    try { const saved = await window.ghost.save(project.id, { ...current, content: current.draft }); setDocuments(docs => docs.map(doc => doc.path === saved.path ? { ...saved, draft: doc.draft } : doc)); setLocalRefresh(n => n + 1) } catch (error) { onError(error) } finally { setSaving(false) }
  }
  async function reload() {
    if (!current || current.draft !== current.content && !window.confirm('重新载入会放弃此文件尚未保存的编辑，继续？')) return
    try { const next = await window.ghost.read(project.id, current.path); setDocuments(docs => docs.map(doc => doc.path === next.path ? { ...next, draft: next.content } : doc)) } catch (error) { onError(error) }
  }
  async function openDiff(path: string, index = staged) { const request = ++diffRequest.current; try { const next = await window.ghost.diff(project.id, path, index); if (request === diffRequest.current) setDiff(next) } catch (error) { if (request === diffRequest.current) onError(error) } }
  useEffect(() => { if (diff) void openDiff(diff.path) }, [staged, refresh, localRefresh])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, saving])
  return <aside className="detail-panel" aria-label="项目工作区">
    <header className="detail-header"><div className="detail-tabs"><button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}><FolderOpen size={14} />文件</button><button className={mode === 'git' ? 'active' : ''} onClick={() => setMode('git')}><GitBranch size={14} />变更{git?.entries.length ? <span className="count">{git.entries.length}</span> : null}</button></div><div className="button-row"><button className="icon-button" aria-label="刷新工作区" onClick={() => setLocalRefresh(n => n + 1)}><RefreshCw size={14} /></button><button className="icon-button" aria-label="关闭工作区" onClick={onClose}><X size={16} /></button></div></header>
    <div className="file-browser">
      <div className="browser-label"><span>{mode === 'files' ? project.name.toUpperCase() : git?.isRepo ? git.branch : '版本管理'}</span></div>
      {mode === 'files' ? <><div className="project-search"><input ref={searchInput} aria-label="项目全文搜索" placeholder="搜索项目内容 · Ctrl+Shift+F" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="清空项目搜索" onClick={() => setQuery('')}>×</button>}</div>{query ? <div aria-live="polite">{searching ? <p className="browser-empty">搜索中…</p> : <p className="browser-empty">{results?.hits.length || 0} 处匹配{results?.truncated ? ' · 已达到搜索上限，请缩小范围' : ''}</p>}{results?.hits.map(hit => <button className="search-hit" key={`${hit.path}:${hit.line}`} onClick={() => { void open(hit.path, hit.line) }}><strong>{hit.path}:{hit.line}</strong><span>{hit.text}</span></button>)}</div> : <Directory project={project} path="" depth={0} onOpen={path => { void open(path) }} onError={onError} refresh={refresh + localRefresh} />}</> : git?.isRepo ? <GitPanel project={project} state={git} refresh={refresh + localRefresh} staged={staged} setStaged={setStaged} onDiff={path => { void openDiff(path) }} onChanged={() => { setLocalRefresh(n => n + 1); setDocuments(docs => docs.filter(doc => doc.content !== doc.draft)); setDiff(null) }} onReview={onReview} onError={onError} /> : <p className="browser-empty">当前目录尚未使用 Git。</p>}
    </div>
    <div className="editor-tabs">{documents.map(doc => <div className={`editor-tab ${activePath === doc.path && !diff ? 'active' : ''}`} key={doc.path}><button title={doc.path} onClick={() => { setActivePath(doc.path); setDiff(null) }}>{doc.path.split('/').at(-1)}{doc.draft !== doc.content && <span className="unsaved-dot" />}</button><button aria-label={`关闭 ${doc.path}`} onClick={() => { if (doc.draft !== doc.content && !window.confirm('放弃此文件尚未保存的编辑？')) return; setDocuments(list => list.filter(d => d.path !== doc.path)); if (activePath === doc.path) setActivePath(documents.find(d => d.path !== doc.path)?.path || '') }}><X size={12} /></button></div>)}</div>
    <div className="editor-toolbar"><span title={diff?.path || current?.path}>{diff ? `${diff.path} · Diff` : current?.path || '文件预览'}</span><div className="button-row">{current && !diff && <><button className="icon-button" aria-label="重新载入文件" onClick={() => { void reload() }}><RefreshCw size={13} /></button><button className="icon-button" disabled={saving || current.content === current.draft} aria-label="保存文件" onClick={() => { void save() }}><Save size={14} /></button></>}</div></div>
    <div className="editor-context">{(current || diff) && <><button onClick={() => onReference(diff?.path || current!.path)}>引用文件</button><button onClick={quote}>引用选区 {selection.start}-{selection.end}</button></>}{diff && <><input aria-label="逐行审查反馈" placeholder="为当前选中行写反馈" value={feedback} onChange={event => setFeedback(event.target.value)} /><button disabled={!feedback.trim()} onClick={quote}>加入反馈</button></>}</div><div className="editor-body">{diff ? <WorkspaceDiff key={`diff:${diff.path}`} diff={diff} fontSize={fontSize} onMount={mountEditor} /> : current ? <Editor onMount={mountEditor} path={`ghost://${project.id}/${current.path}`} value={current.draft} language={language(current.path)} theme="ghost-light" onChange={value => setDocuments(docs => docs.map(doc => doc.path === current.path ? { ...doc, draft: value || '' } : doc))} options={{ minimap: { enabled: false }, fontSize, fontFamily: 'Cascadia Code, Consolas, monospace', padding: { top: 16 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} /> : <div className="editor-empty"><FileCode2 size={28} strokeWidth={1} /><p>从上方选择一个文件</p><span>代码与对话，在同一处继续。</span></div>}</div>
    <footer className="editor-status"><span>{diff ? '只读差异' : current ? current.draft !== current.content ? '尚未保存' : '已与磁盘同步' : '本地项目'}</span><span>{current && !diff ? `${language(current.path)} · UTF-8` : 'GHOST WORKSPACE'}</span></footer>
  </aside>
}
