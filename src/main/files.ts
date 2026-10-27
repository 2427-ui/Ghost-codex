import { realpath, stat, readdir, readFile, open } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileDocument, FileEntry, FileDiff, GitState, SearchResult, GitAction, GitDetails } from '../shared/types'

const exec = promisify(execFile)
const MAX_BYTES = 2 * 1024 * 1024
const hidden = new Set(['.git', '.codex', '.aws', '.reference', 'node_modules', 'out', 'dist', '.ghost-dev'])
export const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex')

export async function safePath(root: string, input: string): Promise<string> {
  if (typeof input !== 'string' || input.includes('\0') || isAbsolute(input) || input.includes(':')) throw new Error('无效的项目相对路径。')
  const base = await realpath(root)
  const candidate = await realpath(resolve(base, input || '.'))
  const rel = relative(base, candidate)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('禁止访问项目目录以外的文件。')
  if (input.split(/[\\/]/).some(p => hidden.has(p.toLowerCase())) || rel.split(/[\\/]/).some(p => hidden.has(p.toLowerCase()))) throw new Error('该目录不向编辑器开放。')
  return candidate
}
export async function tree(root: string, input: string): Promise<FileEntry[]> {
  const dir = await safePath(root, input)
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter(e => !hidden.has(e.name.toLowerCase()) && !e.isSymbolicLink()).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0, 500).map(e => ({ name: e.name, path: relative(root, join(dir, e.name)).replaceAll('\\', '/'), directory: e.isDirectory() }))
}
export async function readDocument(root: string, input: string): Promise<FileDocument> {
  const path = await safePath(root, input)
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('仅支持不超过 2 MB 的文本文件。')
  const bytes = await readFile(path)
  if (bytes.includes(0)) throw new Error('该文件是二进制文件，无法在文本编辑器中打开。')
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return { path: input, content, version: fingerprint(content) }
}
export async function saveDocument(root: string, doc: FileDocument): Promise<FileDocument> {
  if (typeof doc.content !== 'string' || Buffer.byteLength(doc.content) > MAX_BYTES) throw new Error('文件内容超过大小限制。')
  const path = await safePath(root, doc.path)
  // Use the validated file descriptor, and compare before truncating. No blind overwrite of external edits.
  const handle = await open(path, 'r+')
  try {
    const current = await handle.readFile('utf8')
    if (fingerprint(current) !== doc.version) throw new Error('磁盘文件已被其他程序修改。请重新载入并比较后再保存。')
    const bytes = Buffer.from(doc.content)
    await handle.write(bytes, 0, bytes.length, 0)
    await handle.truncate(bytes.length)
    await handle.sync()
  } finally { await handle.close() }
  return { ...doc, version: fingerprint(doc.content) }
}
export async function git(root: string, args: string[]) {
  return (await exec('git', ['--literal-pathspecs', '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000 })).stdout
}
export async function gitState(root: string): Promise<GitState> {
  let repoRoot: string
  try { repoRoot = (await git(root, ['rev-parse', '--show-toplevel'])).trim() } catch { return { isRepo: false, branch: '', entries: [] } }
  let branch = '未提交'
  try { branch = (await git(root, ['branch', '--show-current'])).trim() || 'detached HEAD' } catch { /* unborn branch */ }
  const records = (await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])).split('\0')
  const entries = []
  for (let i = 0; i < records.length; i++) {
    const row = records[i]
    if (!row) continue
    const status = row.slice(0, 2)
    const path = relative(root, resolve(repoRoot, row.slice(3))).replaceAll('\\', '/')
    if (!path.split('/').some(segment => hidden.has(segment.toLowerCase()))) entries.push({ status, path })
    if (/[RC]/.test(status)) i++
  }
  return { isRepo: true, branch, entries }
}
export async function diffDocument(root: string, input: string, staged: boolean): Promise<FileDiff> {
  // Deleted files may not exist; validate their parent and reject traversal before asking Git.
  const normalized = input.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes(':') || normalized.split('/').some(p => p === '..' || hidden.has(p))) throw new Error('无效的 Diff 路径。')
  await safePath(root, normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '.')
  let original = ''
  let modified = ''
  try { original = await git(root, ['show', `${staged ? 'HEAD' : ''}:./${normalized}`]) } catch { /* untracked or unborn HEAD */ }
  if (staged) {
    try { modified = await git(root, ['show', `:./${normalized}`]) } catch { /* deleted in index */ }
  } else {
    try { modified = (await readDocument(root, normalized)).content } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  if (Buffer.byteLength(original) > MAX_BYTES || Buffer.byteLength(modified) > MAX_BYTES || original.includes('\0') || modified.includes('\0')) throw new Error('该文件过大或为二进制，无法展示 Diff。')
  return { path: input, original, modified }
}

export async function searchProject(root: string, query: string, filenames = false): Promise<SearchResult> {
  if (typeof query !== 'string' || query.length > 500) throw new Error('搜索词不能超过 500 字符。')
  const hits: SearchResult['hits'] = []
  if (!query.trim() && !filenames) return { hits, truncated: false }
  const needle = query.toLowerCase()
  const started = Date.now()
  let inspected = 0, truncated = false
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 30) { truncated = true; return }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (hits.length >= 200 || inspected >= 10000 || Date.now() - started > 5000) { truncated = true; return }
      if (entry.isSymbolicLink() || hidden.has(entry.name.toLowerCase()) || ['build', 'coverage', '.next', '.venv', 'vendor'].includes(entry.name.toLowerCase())) continue
      const path = relative(root, join(directory, entry.name)).replaceAll('\\', '/')
      try {
        const resolved = await safePath(root, path)
        if (entry.isDirectory()) await visit(resolved, depth + 1)
        else if (entry.isFile()) {
          inspected++
          if (filenames) { if (path.toLowerCase().includes(needle)) hits.push({ path, line: 1, text: path }); continue }
          const document = await readDocument(root, path)
          const lines = document.content.split(/\r?\n/)
          for (let index = 0; index < lines.length; index++) {
            if (lines[index].toLowerCase().includes(needle)) hits.push({ path, line: index + 1, text: lines[index].slice(0, 500) })
            if (hits.length >= 200) { truncated = true; return }
          }
        }
      } catch { /* unreadable, binary and excluded paths are skipped */ }
    }
  }
  await visit(await safePath(root, ''), 0)
  return { hits, truncated }
}

export async function gitDetails(root: string): Promise<GitDetails> {
  const branches = (await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])).trim().split('\n').filter(Boolean)
  let commits: GitDetails['commits'] = [], remote = ''
  try { commits = (await git(root, ['log', '-30', '--format=%h%x09%s'])).trim().split('\n').filter(Boolean).map(line => { const [id, ...subject] = line.split('\t'); return { id, subject: subject.join('\t') } }) } catch { /* unborn */ }
  try { remote = (await git(root, ['remote', 'get-url', 'origin'])).trim() } catch { /* no origin */ }
  return { branches, commits, remote, pullRequest: null }
}

const gitLocks = new Set<string>()
export async function gitAction(root: string, request: GitAction): Promise<string> {
  const base = await realpath(root)
  if (gitLocks.has(base)) throw new Error('Git 操作仍在进行，请稍后重试。')
  gitLocks.add(base)
  try {
    if (!request || typeof request.action !== 'string') throw new Error('无效的 Git 操作。')
    if (['stage', 'unstage', 'restore'].includes(request.action)) {
      const { path } = request as { path: string }
      if (typeof path !== 'string' || !path || path.split(/[\\/]/).some(p => p === '..' || hidden.has(p.toLowerCase())) || isAbsolute(path) || path.includes(':') || path.includes('\0')) throw new Error('无效的 Git 文件路径。')
      await safePath(root, path.includes('/') || path.includes('\\') ? path.replaceAll('\\', '/').split('/').slice(0, -1).join('/') : '.')
      try { await safePath(root, path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (request.action === 'stage') return await git(root, ['add', '--', path])
      if (request.action === 'restore') return await git(root, ['restore', '--worktree', '--', path])
      try { await git(root, ['rev-parse', '--verify', 'HEAD']) } catch { return await git(root, ['rm', '--cached', '--', path]) }
      return await git(root, ['restore', '--staged', '--', path])
    }
    // Repository-wide actions must not silently affect files outside a nested project.
    if (await realpath((await git(root, ['rev-parse', '--show-toplevel'])).trim()) !== base) throw new Error('请打开 Git 仓库根目录后执行此操作。')
    switch (request.action) {
      case 'commit':
        if (typeof request.message !== 'string' || !request.message.trim() || request.message.length > 10000) throw new Error('请输入不超过 10,000 字符的提交说明。')
        return await git(root, ['commit', '-m', request.message])
      case 'branch': {
        if (typeof request.name !== 'string' || request.name.startsWith('-')) throw new Error('无效分支名称。')
        await git(root, ['check-ref-format', '--branch', request.name])
        if ((await gitState(root)).entries.length) throw new Error('切换分支前请先提交或保存工作区变更。')
        return await git(root, ['switch', ...(request.create ? ['-c'] : []), request.name])
      }
      case 'push': {
        const branch = (await git(root, ['symbolic-ref', '--short', 'HEAD'])).trim()
        return await git(root, ['push', '--set-upstream', 'origin', branch])
      }
      case 'pr': {
        if (!request.title?.trim() || request.title.length > 300 || typeof request.body !== 'string' || request.body.length > 30000) throw new Error('请填写有效的 PR 标题和说明。')
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
        const { tmpdir } = await import('node:os')
        const temp = await mkdtemp(join(tmpdir(), 'ghost-pr-'))
        try {
          const body = join(temp, 'body.md')
          await writeFile(body, request.body)
          return (await exec('gh', ['pr', 'create', '--draft', '--title', request.title, '--body-file', body], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 })).stdout.trim()
        } finally { await rm(temp, { recursive: true, force: true }) }
      }
      default: throw new Error('无效的 Git 操作。')
    }
  } finally { gitLocks.delete(base) }
}
