import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '../src/main/storage'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_PERSONA } from '../src/shared/types'
import { LEGACY_DEFAULT_PERSONAS } from '../src/shared/persona'

test('projects, persona, draft and thread references survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-db-'))
  try {
    let storage = new Storage(directory)
    const project = storage.addProject('C:/example', '示例')
    assert.equal(storage.addProject('C:/example', '示例').id, project.id)
    storage.putSession({ id: 'thread-1', projectId: project.id, title: '任务', updatedAt: Date.now() })
    storage.updateSettings({ persona: '用户自定义人设', lastSessionId: 'thread-1' })
    storage.set('draft:thread-1', '未发送的草稿')
    storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().persona, '用户自定义人设')
    assert.equal(storage.get('draft:thread-1', ''), '未发送的草稿')
    assert.equal(storage.session('thread-1').projectId, project.id)
    storage.close()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('old default typography migrates once while custom sizes are preserved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-font-'))
  try {
    let storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 18)
    storage.close()
    const db = new DatabaseSync(join(directory, 'ghost.sqlite'))
    db.prepare('DELETE FROM kv WHERE key=?').run('typographyVersion')
    db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('settings', JSON.stringify({ fontSize: 14 }))
    db.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 18)
    storage.updateSettings({ fontSize: 16 }); storage.set('typographyVersion', 1); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 18)
    storage.updateSettings({ fontSize: 20 }); storage.set('typographyVersion', 1); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 20, 'a custom size survives the 16-to-18 migration')
    storage.updateSettings({ fontSize: 14 }); storage.set('typographyVersion', 1); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 14, 'explicit changes after migration are respected')
    storage.updateSettings({ fontSize: 16 }); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().fontSize, 16, 'custom choices after the new migration are respected')
    storage.close()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('persona upgrade replaces only the previous default and preserves opt-out and custom text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-persona-'))
  try {
    let storage = new Storage(directory)
    assert.equal(storage.settings().persona, DEFAULT_PERSONA)
    assert.ok(DEFAULT_PERSONA.includes('你叫 Ghost'))
    assert.ok(DEFAULT_PERSONA.includes('主人'))
    assert.ok(DEFAULT_PERSONA.length <= 12000)
    storage.updateSettings({ persona: LEGACY_DEFAULT_PERSONAS[0], personaEnabled: false })
    storage.set('personaDefaultsVersion', 0); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().persona, DEFAULT_PERSONA)
    assert.equal(storage.settings().personaEnabled, false)
    storage.updateSettings({ persona: '我的自定义人设' })
    storage.set('personaDefaultsVersion', 0); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().persona, '我的自定义人设')
    storage.updateSettings({ persona: LEGACY_DEFAULT_PERSONAS[0] }); storage.close()
    storage = new Storage(directory)
    assert.equal(storage.settings().persona, LEGACY_DEFAULT_PERSONAS[0], 'the migration runs once')
    storage.close()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('legacy sessions migrate without losing project links, settings or drafts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ghost-migration-'))
  try {
    const db = new DatabaseSync(join(directory, 'ghost.sqlite'))
    db.exec(`CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,path TEXT UNIQUE NOT NULL,updatedAt INTEGER NOT NULL);
      CREATE TABLE sessions(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL,updatedAt INTEGER NOT NULL);
      INSERT INTO projects VALUES('p','旧项目','C:/old',1);
      INSERT INTO sessions VALUES('s','p','旧会话',2);
      INSERT INTO kv VALUES('draft:s','"旧草稿"');`)
    db.close()
    const storage = new Storage(directory)
    assert.equal(storage.session('s').projectId, 'p')
    assert.equal(storage.get('draft:s', ''), '旧草稿')
    storage.putSession({ id: 'ordinary', projectId: null, title: '聊天', updatedAt: 3, archived: true, cwd: directory })
    assert.equal(storage.session('ordinary').projectId, null)
    assert.equal(storage.session('ordinary').archived, true)
    storage.close()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
