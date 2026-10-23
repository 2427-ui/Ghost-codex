import { EventEmitter } from 'node:events'
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, readdir, stat } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { APP_VERSION } from '../shared/types'

const exec = promisify(execFile)
export async function findCodex(configured = ''): Promise<string> {
  if (configured) {
    if (!isAbsolute(configured)) throw new Error('请选择 Codex 可执行文件的绝对路径。')
    await access(configured)
    if (process.platform === 'win32' && !configured.toLowerCase().endsWith('.exe')) throw new Error('请选择 codex.exe，不使用 cmd 或 PowerShell 脚本。')
    return configured
  }
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { windowsHide: true, timeout: 5000 })
    for (const candidate of stdout.trim().split(/\r?\n/)) {
      if (process.platform !== 'win32' || candidate.toLowerCase().endsWith('.exe')) return candidate
    }
  } catch { /* try the desktop app and npm native binary */ }
  if (process.platform === 'win32') {
    const base = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'OpenAI/Codex/bin')
    try {
      const dirs = await readdir(base)
      const candidates = await Promise.all(dirs.map(async d => ({ path: join(base, d, 'codex.exe'), time: (await stat(join(base, d))).mtimeMs })))
      for (const entry of candidates.sort((a, b) => b.time - a.time)) {
        try { await access(entry.path); return entry.path } catch { /* next */ }
      }
    } catch { /* not installed with desktop */ }
    for (const root of [join(process.env.APPDATA || '', 'npm/node_modules/@openai'), join(process.env.ProgramFiles || 'C:/Program Files', 'nodejs/node_modules/@openai')]) {
      for (const folder of ['codex/node_modules/@openai/codex-win32-x64', 'codex-win32-x64', 'codex']) {
        const candidate = join(root, folder, 'vendor/x86_64-pc-windows-msvc/codex/codex.exe')
        try { await access(candidate); return candidate } catch { /* next */ }
      }
    }
  }
  throw new Error('未找到 Codex CLI。请安装官方 Codex CLI，或在设置中选择 codex.exe。')
}

export class CodexClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null
  private counter = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private buffer = ''
  private stderrTail = ''
  connected = false
  constructor(readonly executable: string, private args = ['app-server', '--listen', 'stdio://']) { super() }
  async start() {
    if (this.process) throw new Error('Codex 连接已经启动。')
    const env = { ...process.env }
    delete env.CODEX_THREAD_ID
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(this.executable, this.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env })
    this.process = child
    child.stdin.on('error', () => { /* exit/error rejects pending RPCs */ })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      this.buffer += chunk
      // Curated plugin catalogs include inline artwork and can exceed 16 MB.
      if (this.buffer.length > 128 * 1024 * 1024) { this.stop(); this.emit('disconnected', 'Codex 协议数据超过 128 MB 限制。'); return }
      let end: number
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end)
        this.buffer = this.buffer.slice(end + 1)
        if (line.trim()) this.receive(line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { this.stderrTail = (this.stderrTail + chunk).slice(-4000) })
    child.once('error', error => this.disconnected(`Codex 启动失败：${error.message}`))
    child.once('exit', code => this.disconnected(`Codex 进程已退出（${code ?? '信号'}）。${this.stderrTail ? '请检查 CLI 配置或重新连接。' : ''}`))
    try {
      const result = await this.request('initialize', { clientInfo: { name: 'ghost_studio', title: 'Ghost Studio', version: APP_VERSION }, capabilities: { experimentalApi: true } })
      this.notify('initialized', {})
      this.connected = true
      return result
    } catch (error) { this.stop(); throw error }
  }
  private receive(line: string) {
    let message: any
    try { message = JSON.parse(line) } catch { this.emit('protocolWarning', '忽略了无法解析的 Codex 消息。'); return }
    if (message.method) {
      if (message.id !== undefined) this.emit('request', message)
      else this.emit('notification', message)
    } else if (message.id !== undefined) {
      const request = this.pending.get(message.id)
      if (!request) return
      clearTimeout(request.timer)
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message || 'Codex 请求失败。'))
      else request.resolve(message.result)
    }
  }
  request<T = any>(method: string, params: unknown = {}, timeout = 90000): Promise<T> {
    if (!this.process || this.process.killed) return Promise.reject(new Error('Codex 尚未连接。'))
    const id = ++this.counter
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex 请求超时：${method}`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ id, method, params }, error => {
        if (error && this.pending.delete(id)) { clearTimeout(timer); reject(error) }
      })
    })
  }
  notify(method: string, params: unknown) { this.write({ method, params }) }
  respond(id: string | number, result: unknown) { this.write({ id, result }) }
  reject(id: string | number, message: string) { this.write({ id, error: { code: -32601, message } }) }
  private write(message: unknown, callback?: (error?: Error | null) => void) {
    if (!this.process?.stdin.writable) { callback?.(new Error('Codex 通信管道已关闭。')); return }
    this.process.stdin.write(JSON.stringify(message) + '\n', callback)
  }
  private disconnected(message: string) {
    this.connected = false
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)) }
    this.pending.clear()
    this.emit('disconnected', message)
  }
  stop() {
    const child = this.process
    this.process = null
    this.connected = false
    if (child) { child.stdin.end(); child.kill() }
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex 连接已关闭。')) }
    this.pending.clear()
  }
}

export async function codexVersion(executable: string) {
  return (await exec(executable, ['--version'], { timeout: 10000, windowsHide: true })).stdout.trim()
}
