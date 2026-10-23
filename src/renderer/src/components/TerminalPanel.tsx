import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { Project } from '../../../shared/types'
export function TerminalPanel({ project, onError }: { project?: Project; onError: (e: unknown) => void }) {
  const host = useRef<HTMLDivElement>(null), terminal = useRef<Terminal | null>(null), live = useRef(true), handle = useRef<string | null>(null), backend = useRef('sandbox')
  const [active, setActive] = useState(false), [mode, setMode] = useState('sandbox'), [command, setCommand] = useState("Write-Output 'Hello Ghost'")
  function finish(code: unknown) { if (!live.current) return; terminal.current?.writeln(`\r\n[进程退出 ${code ?? ''}]`); handle.current = null; setActive(false) }
  async function stop() { if (handle.current) await window.ghost.capability(backend.current === 'host' ? 'process/kill' : 'command/exec/terminate', backend.current === 'host' ? { processHandle: handle.current } : { processId: handle.current }) }
  useEffect(() => {
    live.current = true
    const t = new Terminal({ fontSize: 14, fontFamily: 'Consolas, monospace', cursorBlink: true, scrollback: 5000, theme: { background: '#fafafa', foreground: '#353535', cursor: '#454545', cursorAccent: '#fafafa', selectionBackground: '#00000020', black: '#353535', red: '#a13d3d', green: '#416849', yellow: '#80622a', blue: '#456078', magenta: '#76557b', cyan: '#3e7373', white: '#767676', brightBlack: '#626262', brightRed: '#ad4545', brightGreen: '#4c7354', brightYellow: '#8b6c2c', brightBlue: '#526c88', brightMagenta: '#806185', brightCyan: '#467e7e', brightWhite: '#8b8b8b' } }), fit = new FitAddon()
    terminal.current = t; t.loadAddon(fit); t.open(host.current!); fit.fit()
    t.writeln('GHOST TERMINAL\r\n沙箱模式执行后显示结果；主机交互模式支持输入与 Ctrl-C。')
    const input = t.onData(text => { if (handle.current && backend.current === 'host') void window.ghost.capability('process/writeStdin', { processHandle: handle.current, deltaBase64: btoa(String.fromCharCode(...new TextEncoder().encode(text))) }).catch(onError) })
    const observer = new ResizeObserver(() => { fit.fit(); if (handle.current && backend.current === 'host') void window.ghost.capability('process/resizePty', { processHandle: handle.current, size: { rows: t.rows, cols: t.cols } }).catch(() => {}) }); observer.observe(host.current!)
    const off = window.ghost.subscribe(e => {
      if (e.type === 'runtime' && e.runtime.connection === 'disconnected') finish('连接中断')
      if (e.type !== 'notification' || (e.params.processHandle || e.params.processId) !== handle.current) return
      if (['process/outputDelta', 'command/exec/outputDelta'].includes(e.method)) t.write(Uint8Array.from(atob(e.params.deltaBase64), c => c.charCodeAt(0)))
      if (e.method === 'process/exited') { if (e.params.stdout) t.write(e.params.stdout); if (e.params.stderr) t.write(e.params.stderr); finish(e.params.exitCode) }
    })
    return () => { live.current = false; void stop().catch(() => {}); handle.current = null; input.dispose(); off(); observer.disconnect(); t.dispose(); terminal.current = null }
  }, [])
  async function start() {
    if (!project) { onError(new Error('请先选择项目工作目录。')); return }
    if (mode === 'host' && !confirm(`在主机运行交互终端，不使用 Codex 沙箱。\n目录：${project.path}\n命令：${command}\n继续？`)) return
    const id = crypto.randomUUID(); handle.current = id; backend.current = mode; setActive(true); terminal.current?.clear(); terminal.current?.focus()
    try {
      if (mode === 'host') {
        await window.ghost.capability('process/spawn', { command: ['powershell.exe', '-NoLogo', '-NoProfile', '-Command', command], processHandle: id, cwd: project.path, tty: true, size: { rows: terminal.current?.rows || 24, cols: terminal.current?.cols || 80 }, timeoutMs: null, outputBytesCap: 1048576 })
      } else {
        const r = await window.ghost.capability('command/exec', { command: ['powershell.exe', '-NoLogo', '-NoProfile', '-Command', command], cwd: project.path, processId: id, timeoutMs: 300000, outputBytesCap: 1048576, sandboxPolicy: { type: 'workspaceWrite', writableRoots: [project.path], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true } })
        if (live.current) { terminal.current?.write((r.stdout || '').replace(/\r?\n/g, '\r\n')); terminal.current?.write((r.stderr || '').replace(/\r?\n/g, '\r\n')); finish(r.exitCode) }
      }
    } catch (e) { if (live.current) { onError(e); finish('失败') } }
  }
  return <div className="native-terminal"><div className="terminal-controls"><span>{project?.name || '尚未选择项目'}</span><select aria-label="终端执行方式" value={mode} disabled={active} onChange={e => { setMode(e.target.value); setCommand(e.target.value === 'host' ? 'powershell.exe -NoLogo -NoProfile' : "Write-Output 'Hello Ghost'") }}><option value="sandbox">沙箱命令 · 非交互</option><option value="host">主机交互终端 · 不使用沙箱</option></select><input aria-label="终端启动命令" value={command} disabled={active} onChange={e => setCommand(e.target.value)} /><button className="primary-button" disabled={active || !project} onClick={() => { void start() }}>启动终端</button><button className="secondary-button" disabled={!active} onClick={() => { void stop().catch(onError) }}>停止</button></div><div ref={host} className="xterm-host" /></div>
}
