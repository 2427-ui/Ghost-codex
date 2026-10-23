import { realpath, stat, readdir, readFile, open } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileDocument, FileEntry, FileDiff, GitState } from '../shared/types'

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
  if (rel.split(/[\\/]/).some(p => hidden.has(p))) throw new Error('该目录不向编辑器开放。')
  return candidate
}
export async function tree(root: string, input: string): Promise<FileEntry[]> {
  const dir = await safePath(root, input)
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter(e => !hidden.has(e.name) && !e.isSymbolicLink()).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0, 500).map(e => ({ name: e.name, path: relative(root, join(dir, e.name)).replaceAll('\\', '/'), directory: e.isDirectory() }))
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
async function git(root: string, args: string[]) {
  return (await exec('git', ['-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15000 })).stdout
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
  try { original = await git(root, ['show', `HEAD:./${normalized}`]) } catch { /* untracked or unborn HEAD */ }
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
