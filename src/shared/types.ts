import { DEFAULT_PERSONA } from './persona'
export { DEFAULT_PERSONA } from './persona'

export const APP_VERSION = '0.3.1'
export type Activity = 'idle' | 'running' | 'approval' | 'completed' | 'interrupted' | 'error'
export interface Settings {
  codexPath: string
  personaEnabled: boolean
  persona: string
  model: string
  effort: string
  mode: 'default' | 'plan'
  permission: 'workspace-write' | 'read-only'
  motion: 'full' | 'reduced' | 'off'
  mascotVisible: boolean
  startupAnimation: boolean
  fontSize: number
  sidebarWidth: number
  detailWidth: number
  lastProjectId: string | null
  lastSessionId: string | null
}
export const DEFAULT_SETTINGS: Settings = {
  codexPath: '', personaEnabled: true, persona: DEFAULT_PERSONA, model: '', effort: 'medium', mode: 'default',
  permission: 'workspace-write', motion: 'full', mascotVisible: true, fontSize: 18,
  startupAnimation: true, sidebarWidth: 244, detailWidth: 520, lastProjectId: null, lastSessionId: null
}
export interface Project { id: string; name: string; path: string; updatedAt: number; nativeId?: string }
export interface Session { id: string; projectId: string | null; title: string; updatedAt: number; cwd?: string; originator?: string; source?: string; archived?: boolean; parentThreadId?: string | null; projectless?: boolean }
export interface HistorySync { state: 'idle' | 'syncing' | 'ready' | 'error'; updatedAt: number | null; count: number; error: string | null }
export interface ModelInfo { id: string; model: string; displayName: string; isDefault: boolean; defaultReasoningEffort: string; supportedReasoningEfforts: { reasoningEffort: string; description: string }[] }
export interface Account { type: string; email?: string; planType?: string }
export interface QuotaWindow { usedPercent: number; windowDurationMins: number; resetsAt: number }
export interface RateLimits { primary?: QuotaWindow | null; secondary?: QuotaWindow | null }
export interface Runtime {
  tasks?: Record<string, ThreadTask>
  connection: 'connecting' | 'connected' | 'disconnected'
  executable: string; version: string; account: Account | null; models: ModelInfo[]; limits: RateLimits | null
  activity: Activity; activeThreadId: string | null; activeTurnId: string | null; task: string; error: string | null
}
export interface ThreadTask { activity: Activity; activeTurnId: string | null; task: string; error: string | null }
export interface Item {
  id: string; type: string; text: string; status?: string; phase?: string; turnId?: string
  command?: string; output?: string; files?: string[]
  raw?: unknown
}
export interface InputAttachment { id: string; name: string; path: string; type: 'image' | 'audio' | 'file' | 'skill'; preview?: string }
export interface SendOptions { attachments?: InputAttachment[]; mode?: 'default' | 'plan' }
export interface Question { id: string; header: string; question: string; options?: { label: string; description: string }[]; isOther?: boolean; isSecret?: boolean }
export interface Approval {
  id: string | number; method: string; threadId: string; turnId?: string; itemId?: string
  reason?: string; command?: string; cwd?: string; grantRoot?: string
  availableDecisions?: unknown[]; questions?: Question[]; networkApprovalContext?: { host?: string; protocol?: string }
  permissions?: Record<string, any>; mode?: string; message?: string; url?: string; requestedSchema?: Record<string, any>; tool?: string; arguments?: unknown; serverName?: string
}
export interface FileEntry { name: string; path: string; directory: boolean }
export interface FileDocument { path: string; content: string; version: string }
export interface GitEntry { path: string; status: string }
export interface GitState { isRepo: boolean; branch: string; entries: GitEntry[] }
export interface FileDiff { path: string; original: string; modified: string }
export interface SearchHit { path: string; line: number; text: string }
export interface SearchResult { hits: SearchHit[]; truncated: boolean }
export type GitAction = { action: 'stage' | 'unstage' | 'restore'; path: string } | { action: 'commit'; message: string } | { action: 'branch'; name: string; create: boolean } | { action: 'push' } | { action: 'pr'; title: string; body: string }
export interface GitDetails { branches: string[]; commits: { id: string; subject: string }[]; remote: string; pullRequest: string | null }
export interface Snapshot { settings: Settings; projects: Project[]; sessions: Session[]; runtime: Runtime; approvals: Approval[]; historySync: HistorySync }
export type StudioEvent = { type: 'runtime'; runtime: Runtime } | { type: 'notification'; method: string; params: Record<string, any> } | { type: 'approvals'; approvals: Approval[] } | { type: 'data' } | { type: 'pet-collapse' } | { type: 'visibility'; visible: boolean }
export interface GhostApi {
  snapshot(): Promise<Snapshot>
  settings(patch: Partial<Settings>): Promise<Settings>
  chooseCodex(): Promise<string | null>
  connect(): Promise<void>
  login(): Promise<{ loginId?: string; authUrl?: string }>
  cancelLogin(): Promise<void>
  refreshAccount(): Promise<void>
  addProject(): Promise<Project | null>
  createSession(projectId: string | null): Promise<Session>
  syncHistory(): Promise<void>
  history(sessionId: string): Promise<Item[]>
  send(sessionId: string, text: string, options?: SendOptions): Promise<void>
  followup(sessionId: string, text: string, queue: boolean, attachments: InputAttachment[]): Promise<void>
  chooseAttachments(): Promise<InputAttachment[]>
  importAttachments(files: { path?: string; name: string; bytes?: Uint8Array }[]): Promise<InputAttachment[]>
  reference(projectId: string, path: string): Promise<InputAttachment>
  capability(method: string, params?: Record<string, any>): Promise<any>
  interrupt(threadId?: string): Promise<void>
  decide(id: string | number, decision: string | Record<string, unknown>): Promise<void>
  tree(projectId: string, path: string): Promise<FileEntry[]>
  read(projectId: string, path: string): Promise<FileDocument>
  save(projectId: string, doc: FileDocument): Promise<FileDocument>
  git(projectId: string): Promise<GitState>
  diff(projectId: string, path: string, staged: boolean): Promise<FileDiff>
  search(projectId: string, query: string, filenames?: boolean): Promise<SearchResult>
  gitDetails(projectId: string): Promise<GitDetails>
  gitAction(projectId: string, action: GitAction): Promise<string>
  draft(sessionId: string, text?: string): Promise<string>
  editorDirty(value: boolean): Promise<void>
  petLayout(expanded: boolean): Promise<void>
  petInteractive(value: boolean): Promise<void>
  petDrag(phase: 'start' | 'move' | 'end'): Promise<void>
  petSend(text: string): Promise<void>
  window(action: 'minimize' | 'maximize' | 'mini' | 'restore' | 'close' | 'quit'): Promise<void>
  openExternal(url: string): Promise<void>
  subscribe(callback: (event: StudioEvent) => void): () => void
}
