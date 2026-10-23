import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safePath, readDocument, saveDocument, tree, gitState, diffDocument } from '../src/main/files'
import { execFileSync } from 'node:child_process'

test('project paths reject traversal, private directories and junction escapes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ghost-paths-'))
  const root = join(base, '中文项目'), outside = join(base, 'outside')
  try {
    await mkdir(root); await mkdir(outside); await mkdir(join(root, '.git'))
    await writeFile(join(root, '正常.txt'), 'hello 中文')
    assert.equal((await readDocument(root, '正常.txt')).content, 'hello 中文')
    await assert.rejects(safePath(root, '../outside'), /以外/)
    await assert.rejects(safePath(root, '.git'), /不向/)
    await assert.rejects(safePath(root, 'C:\\Windows'), /无效/)
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(safePath(root, 'linked'), /以外/)
    assert.deepEqual((await tree(root, '')).map(e => e.name), ['正常.txt'])
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('save refuses concurrent disk edits and correctly truncates UTF-8 files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ghost-files-'))
  try {
    await writeFile(join(root, 'file.txt'), 'initial long content 中文')
    const document = await readDocument(root, 'file.txt')
    const saved = await saveDocument(root, { ...document, content: '短' })
    assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), '短')
    assert.notEqual(saved.version, document.version)
    await writeFile(join(root, 'file.txt'), 'external update')
    await assert.rejects(saveDocument(root, { ...saved, content: 'overwrite' }), /其他程序修改/)
    assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'external update')
    await writeFile(join(root, 'binary.bin'), Buffer.from([0, 4, 5]))
    await assert.rejects(readDocument(root, 'binary.bin'), /二进制/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Git handles nested project roots, staged/working diffs, untracked files and deletion', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ghost-git-'))
  const root = join(base, 'nested')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: base, windowsHide: true, stdio: 'pipe' })
  try {
    await mkdir(root)
    await writeFile(join(root, 'hello.ts'), 'original\n')
    git('init'); git('add', '--', '.'); git('-c', 'user.name=Ghost Test', '-c', 'user.email=ghost@example.invalid', 'commit', '-m', 'fixture')
    await writeFile(join(root, 'hello.ts'), 'staged\n'); git('add', '--', '.')
    await writeFile(join(root, 'hello.ts'), 'working\n')
    await writeFile(join(root, 'new.ts'), 'untracked\n')
    const status = await gitState(root)
    assert.equal(status.isRepo, true)
    assert.deepEqual(status.entries.map(e => e.path).sort(), ['hello.ts', 'new.ts'])
    assert.deepEqual(await diffDocument(root, 'hello.ts', false), { path: 'hello.ts', original: 'original\n', modified: 'working\n' })
    assert.equal((await diffDocument(root, 'hello.ts', true)).modified, 'staged\n')
    assert.equal((await diffDocument(root, 'new.ts', false)).original, '')
    await unlink(join(root, 'hello.ts'))
    assert.equal((await diffDocument(root, 'hello.ts', false)).modified, '')
  } finally { await rm(base, { recursive: true, force: true }) }
})
