import { useEffect, useState } from 'react'
import type { InputAttachment, Project } from '../../../shared/types'

export async function transferFiles(files: File[]): Promise<InputAttachment[]> {
  if (files.length > 20) throw new Error('每次最多添加 20 个附件。')
  const inputs = []
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error('附件不能超过 20 MB。')
    const path = window.ghostFiles?.path(file)
    inputs.push(path ? { path, name: file.name } : { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
  }
  return window.ghost.importAttachments(inputs)
}

const commands = [
  { label: '/plan', description: '切换到计划模式', action: 'plan' },
  { label: '/execute', description: '切换到执行模式', action: 'execute' },
  { label: '/review', description: '审查当前项目变更', action: 'review' },
  { label: '/search', description: '搜索项目文件内容', action: 'search' },
  { label: '/clear', description: '清空当前输入', action: 'clear' }
]

export function useComposerAssist({ text, cursor, project, onText, onAttach, onAction, onError }: { text: string; cursor: number; project?: Project; onText: (text: string) => void; onAttach: (file: InputAttachment) => void; onAction: (action: string) => void; onError: (error: unknown) => void }) {
  const [paths, setPaths] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const before = text.slice(0, cursor)
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before)
  const slash = /^\/([a-z]*)$/.exec(text)
  const query = match?.[1]
  useEffect(() => {
    setActive(0); setDismissed(false); setPaths([])
    if (!project || query === undefined) return
    let live = true
    const timer = setTimeout(() => { window.ghost.search(project.id, query, true).then(result => { if (live) setPaths(result.hits.slice(0, 8).map(h => h.path)) }).catch(onError) }, 180)
    return () => { live = false; clearTimeout(timer) }
  }, [project?.id, query, text])
  const options = slash ? commands.filter(c => c.label.startsWith(text)).map(command => ({ label: command.label, description: command.description, run: () => { onText(''); onAction(command.action) } })) : match && project ? paths.map(path => ({ label: path, description: '引用项目文件', run: async () => {
    try {
      const file = await window.ghost.reference(project.id, path)
      onAttach(file)
      const start = before.lastIndexOf('@')
      onText(`${text.slice(0, start)}${text.slice(cursor)}`)
    } catch (error) { onError(error) }
  } })) : []
  const visible = !dismissed && options.length > 0
  const keyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!visible || event.nativeEvent.isComposing) return false
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'Escape') setDismissed(true)
      else if (event.key === 'ArrowDown') setActive(i => (i + 1) % options.length)
      else if (event.key === 'ArrowUp') setActive(i => (i + options.length - 1) % options.length)
      else { void options[Math.min(active, options.length - 1)].run(); setDismissed(true) }
      return true
    }
    return false
  }
  const view = visible ? <div className="composer-assist" role="listbox" aria-label={slash ? '斜杠命令' : '项目文件引用'}>{options.map((option, index) => <button key={option.label} role="option" aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => { void option.run(); setDismissed(true) }}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div> : null
  return { keyDown, view }
}
