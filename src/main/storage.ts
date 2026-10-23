import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_SETTINGS, type Settings, type Project, type Session } from '../shared/types'
import { LEGACY_DEFAULT_PERSONAS } from '../shared/persona'

export class Storage {
  private db: DatabaseSync
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'ghost.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT UNIQUE NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, updatedAt INTEGER NOT NULL);`)
    const columns = this.db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]
    if (!columns.some(c => c.name === 'metadata')) {
      this.db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE sessions RENAME TO sessions_old;
        CREATE TABLE sessions (id TEXT PRIMARY KEY, projectId TEXT REFERENCES projects(id), title TEXT NOT NULL, updatedAt INTEGER NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');
        INSERT INTO sessions(id,projectId,title,updatedAt) SELECT id,projectId,title,updatedAt FROM sessions_old;
        DROP TABLE sessions_old;
        COMMIT;`)
    }
    const settings = this.get<Partial<Settings>>('settings', {})
    const patch: Partial<Settings> = {}
    const typographyVersion = this.get('typographyVersion', 0)
    if (typographyVersion < 2) {
      if (settings.fontSize === 16 || (typographyVersion < 1 && settings.fontSize === 14)) patch.fontSize = DEFAULT_SETTINGS.fontSize
      this.set('typographyVersion', 2)
    }
    if (this.get('personaDefaultsVersion', 0) < 1) {
      if (settings.persona !== undefined && LEGACY_DEFAULT_PERSONAS.includes(settings.persona)) patch.persona = DEFAULT_SETTINGS.persona
      this.set('personaDefaultsVersion', 1)
    }
    if (Object.keys(patch).length) this.set('settings', { ...settings, ...patch })
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined
    if (!row) return fallback
    try { return JSON.parse(row.value) as T } catch { return fallback }
  }
  set(key: string, value: unknown) { this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)) }
  settings(): Settings { return { ...DEFAULT_SETTINGS, ...this.get('settings', {}) } }
  updateSettings(patch: Partial<Settings>) {
    const value = { ...this.settings(), ...patch }
    this.set('settings', value)
    return value
  }
  projects(): Project[] { return (this.db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC').all() as unknown as Project[]).map(p => ({ ...p, nativeId: this.get<Record<string, string>>('native-project-ids', {})[p.id] })) }
  bindProject(id: string, nativeId: string) { this.set('native-project-ids', { ...this.get('native-project-ids', {}), [id]: nativeId }) }
  addProject(path: string, name: string, updatedAt = Date.now(), nativeName = false): Project {
    const existing = this.projects().find(p => process.platform === 'win32' ? p.path.toLowerCase().replace(/\\/g, '/') === path.toLowerCase().replace(/\\/g, '/') : p.path === path)
    if (existing) {
      this.db.prepare('UPDATE projects SET name=?, updatedAt=? WHERE id=?').run(nativeName ? name : existing.name, Math.max(existing.updatedAt, updatedAt), existing.id)
      return this.project(existing.id)
    }
    this.db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(randomUUID(), name, path, updatedAt)
    return this.projects().find(p => p.path === path)!
  }
  project(id: string): Project {
    const value = this.projects().find(p => p.id === id)
    if (!value) throw new Error('项目不存在，请重新选择项目目录。')
    return value
  }
  sessions(): Session[] { return (this.db.prepare('SELECT * FROM sessions ORDER BY updatedAt DESC').all() as unknown as (Session & { metadata: string })[]).map(({ metadata, ...s }) => ({ ...s, ...JSON.parse(metadata) })) }
  session(id: string): Session {
    const value = this.sessions().find(s => s.id === id)
    if (!value) throw new Error('会话不存在。')
    return value
  }
  putSession(value: Session) {
    const { id, projectId, title, updatedAt, ...metadata } = value
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET projectId=excluded.projectId,title=excluded.title,updatedAt=excluded.updatedAt,metadata=excluded.metadata').run(id, projectId, title, updatedAt, JSON.stringify(metadata))
  }
  reconcileSessions(visibleIds: Set<string>) {
    const remove = this.db.prepare('DELETE FROM sessions WHERE id=?')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const session of this.sessions()) if (!visibleIds.has(session.id)) remove.run(session.id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    const settings = this.settings()
    if (settings.lastSessionId && !visibleIds.has(settings.lastSessionId)) this.updateSettings({ lastSessionId: null })
  }
  close() { this.db.close() }
}
