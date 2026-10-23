import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Session } from '../shared/types'
import { Storage } from './storage'

export const HISTORY_SOURCES = ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown']
const pathKey = (p: string) => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p)
export const within = (root: string, path: string) => { const r = relative(pathKey(root), pathKey(path)); return !r || r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r) }
export interface NativeRegistry { projectless: Set<string>; assignments: Record<string, any>; projects: Map<string, string> }

// Compatibility reader for desktop-only project labels. Never write official app state,
// read authentication files, or rely on this private file for conversation contents.
export async function readNativeRegistry(storage: Storage, home = process.env.CODEX_HOME || join(homedir(), '.codex')): Promise<NativeRegistry> {
  const result: NativeRegistry = { projectless: new Set(), assignments: {}, projects: new Map() }
  let state: any
  try { state = JSON.parse(await readFile(join(home, '.codex-global-state.json'), 'utf8')) } catch { return result }
  result.projectless = new Set((Array.isArray(state['projectless-thread-ids']) ? state['projectless-thread-ids'] : []).filter((id: unknown) => typeof id === 'string'))
  result.assignments = state['thread-project-assignments'] || {}
  const aliases = Object.values(state['app-server-project-id-by-legacy-project-id-by-host'] || {}) as Record<string, string>[]
  for (const [legacyId, entry] of Object.entries(state['local-projects'] || {}) as [string, any][]) {
    const roots = Array.isArray(entry?.rootPaths) ? entry.rootPaths : []
    const path = roots.find((p: unknown) => typeof p === 'string' && isAbsolute(p))
    if (!path) continue
    const project = storage.addProject(path, typeof entry.name === 'string' ? entry.name : basename(path), Number(entry.updatedAt) || 0, true)
    result.projects.set(legacyId, project.id)
    for (const mapping of aliases) if (typeof mapping?.[legacyId] === 'string') result.projects.set(mapping[legacyId], project.id)
  }
  return result
}

export function importThread(storage: Storage, thread: any, archived: boolean, registry: NativeRegistry): Session | null {
  if (!thread || typeof thread.id !== 'string' || thread.ephemeral) return null
  const existing = storage.sessions().find(s => s.id === thread.id)
  const cwd = typeof thread.cwd === 'string' ? thread.cwd : existing?.cwd
  const assignment = registry.assignments[thread.id]
  const canonical = registry.projects.get(thread.projectId)
  const assigned = canonical || (assignment?.projectKind === 'local' ? registry.projects.get(assignment.projectId) : undefined)
  const studioChat = !!cwd && (within(join(storage.directory, 'chat-workspaces'), cwd) || thread.originator === 'ghost_studio' && /[\\/]chat-workspaces[\\/][0-9a-f-]{36}$/i.test(cwd))
  const ordinary = !canonical && (registry.projectless.has(thread.id) || existing?.projectless || !assigned && studioChat)
  let projectId = ordinary ? null : assigned || existing?.projectId || null
  if (!ordinary && !projectId && cwd && isAbsolute(cwd) && pathKey(cwd) !== pathKey(homedir())) {
    const root = storage.projects().filter(p => within(p.path, cwd)).sort((a, b) => b.path.length - a.path.length)[0]
    projectId = root?.id || storage.addProject(cwd, basename(cwd) || cwd, Number(thread.updatedAt) * 1000 || 0).id
  }
  const session: Session = { id: thread.id, projectId, title: thread.name || thread.preview?.replace(/\s+/g, ' ').slice(0, 72) || existing?.title || '新的会话', updatedAt: Number(thread.updatedAt) * 1000 || existing?.updatedAt || Date.now(), cwd, originator: thread.originator || existing?.originator || '', source: typeof thread.source === 'string' ? thread.source : 'subAgent', archived, parentThreadId: thread.parentThreadId || null, projectless: !canonical && !!existing?.projectless }
  storage.putSession(session)
  return session
}
