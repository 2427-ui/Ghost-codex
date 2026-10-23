import { useEffect, useState } from 'react'
import Editor, { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import { X, ChevronRight, ChevronDown, Folder, FileCode2, RefreshCw, Save, GitBranch, FileDiff as DiffIcon, FolderOpen } from 'lucide-react'
import type { FileDocument, FileEntry, GitState, FileDiff, Project } from '../../../shared/types'

;(self as any).MonacoEnvironment = { getWorker(_module: string, label: string) { if (['typescript', 'javascript'].includes(label)) return new TsWorker(); if (label === 'json') return new JsonWorker(); return new EditorWorker() } }
loader.config({ monaco })
monaco.editor.defineTheme('ghost-light', { base: 'vs', inherit: true, rules: [{ token: 'comment', foreground: '767676' }, { token: 'string', foreground: '4D6653' }, { token: 'keyword', foreground: '57516A' }], colors: { 'editor.background': '#fafafa', 'editor.foreground': '#353535', 'editor.lineHighlightBackground': '#f0f0f0', 'editorLineNumber.foreground': '#929292', 'editor.selectionBackground': '#d9d9d9', 'editorGutter.background': '#fafafa', 'diffEditor.insertedTextBackground': '#4f865522', 'diffEditor.removedTextBackground': '#a84c4c22' } })
const language = (path: string) => ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown', py: 'python', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', toml: 'ini', rs: 'rust', sh: 'shell', ps1: 'powershell', sql: 'sql', c: 'c', cpp: 'cpp' }[path.split('.').at(-1)!] || 'plaintext')

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

export function DetailPanel({ project, mode, setMode, onClose, onDirty, onError, refresh, fontSize }: { project: Project; mode: 'files' | 'git'; setMode: (mode: 'files' | 'git') => void; onClose: () => void; onDirty: (dirty: boolean) => void; onError: (error: unknown) => void; refresh: number; fontSize: number }) {
  const [documents, setDocuments] = useState<(FileDocument & { draft: string })[]>([])
  const [activePath, setActivePath] = useState('')
  const [git, setGit] = useState<GitState | null>(null)
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [staged, setStaged] = useState(false)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const current = documents.find(doc => doc.path === activePath)
  useEffect(() => { onDirty(documents.some(doc => doc.content !== doc.draft)) }, [documents])
  useEffect(() => { let live = true; window.ghost.git(project.id).then(value => { if (live) setGit(value) }).catch(onError); return () => { live = false } }, [project.id, refresh, localRefresh])
  async function open(path: string) {
    try {
      if (!documents.some(d => d.path === path)) { const document = await window.ghost.read(project.id, path); setDocuments(docs => [...docs.filter(d => d.path !== path), { ...document, draft: document.content }]) }
      setActivePath(path); setDiff(null)
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
  async function openDiff(path: string, index = staged) { try { setDiff(await window.ghost.diff(project.id, path, index)) } catch (error) { onError(error) } }
  useEffect(() => { if (diff) void openDiff(diff.path) }, [staged, refresh, localRefresh])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, saving])
  return <aside className="detail-panel" aria-label="项目工作区">
    <header className="detail-header"><div className="detail-tabs"><button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}><FolderOpen size={14} />文件</button><button className={mode === 'git' ? 'active' : ''} onClick={() => setMode('git')}><GitBranch size={14} />变更{git?.entries.length ? <span className="count">{git.entries.length}</span> : null}</button></div><div className="button-row"><button className="icon-button" aria-label="刷新工作区" onClick={() => setLocalRefresh(n => n + 1)}><RefreshCw size={14} /></button><button className="icon-button" aria-label="关闭工作区" onClick={onClose}><X size={16} /></button></div></header>
    <div className="file-browser">
      <div className="browser-label"><span>{mode === 'files' ? project.name.toUpperCase() : git?.isRepo ? git.branch : '版本管理'}</span>{mode === 'git' && git?.isRepo && <select aria-label="差异范围" value={staged ? 'index' : 'working'} onChange={e => setStaged(e.target.value === 'index')}><option value="working">工作区 vs HEAD</option><option value="index">暂存区 vs HEAD</option></select>}</div>
      {mode === 'files' ? <Directory project={project} path="" depth={0} onOpen={path => { void open(path) }} onError={onError} refresh={refresh + localRefresh} /> : git?.isRepo ? git.entries.length ? git.entries.map(entry => <button key={entry.path} className="file-row git-file" onClick={() => { void openDiff(entry.path) }}><DiffIcon size={14} /><span>{entry.path}</span><code>{entry.status}</code></button>) : <p className="browser-empty">工作区干净，没有待查看的变更。</p> : <p className="browser-empty">当前目录尚未使用 Git。已有 Git 仓库的变更会显示在这里。</p>}
    </div>
    <div className="editor-tabs">{documents.map(doc => <div className={`editor-tab ${activePath === doc.path && !diff ? 'active' : ''}`} key={doc.path}><button title={doc.path} onClick={() => { setActivePath(doc.path); setDiff(null) }}>{doc.path.split('/').at(-1)}{doc.draft !== doc.content && <span className="unsaved-dot" />}</button><button aria-label={`关闭 ${doc.path}`} onClick={() => { if (doc.draft !== doc.content && !window.confirm('放弃此文件尚未保存的编辑？')) return; setDocuments(list => list.filter(d => d.path !== doc.path)); if (activePath === doc.path) setActivePath(documents.find(d => d.path !== doc.path)?.path || '') }}><X size={12} /></button></div>)}</div>
    <div className="editor-toolbar"><span title={diff?.path || current?.path}>{diff ? `${diff.path} · Diff` : current?.path || '文件预览'}</span><div className="button-row">{current && !diff && <><button className="icon-button" aria-label="重新载入文件" onClick={() => { void reload() }}><RefreshCw size={13} /></button><button className="icon-button" disabled={saving || current.content === current.draft} aria-label="保存文件" onClick={() => { void save() }}><Save size={14} /></button></>}</div></div>
    <div className="editor-body">{diff ? <DiffEditor key={`diff:${diff.path}`} original={diff.original} modified={diff.modified} language={language(diff.path)} theme="ghost-light" options={{ readOnly: true, renderSideBySide: false, minimap: { enabled: false }, fontSize, scrollBeyondLastLine: false, automaticLayout: true }} /> : current ? <Editor path={`ghost://${project.id}/${current.path}`} value={current.draft} language={language(current.path)} theme="ghost-light" onChange={value => setDocuments(docs => docs.map(doc => doc.path === current.path ? { ...doc, draft: value || '' } : doc))} options={{ minimap: { enabled: false }, fontSize, fontFamily: 'Cascadia Code, Consolas, monospace', padding: { top: 16 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} /> : <div className="editor-empty"><FileCode2 size={28} strokeWidth={1} /><p>从上方选择一个文件</p><span>代码与对话，在同一处继续。</span></div>}</div>
    <footer className="editor-status"><span>{diff ? '只读差异' : current ? current.draft !== current.content ? '尚未保存' : '已与磁盘同步' : '本地项目'}</span><span>{current && !diff ? `${language(current.path)} · UTF-8` : 'GHOST WORKSPACE'}</span></footer>
  </aside>
}
