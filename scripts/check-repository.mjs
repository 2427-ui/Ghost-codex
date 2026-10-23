import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const read = file => readFile(file, 'utf8')
const manifest = JSON.parse(await read('package.json'))
const lock = JSON.parse(await read('package-lock.json'))
const types = await read('src/shared/types.ts')
assert.equal(types.match(/export const APP_VERSION = '([^']+)'/)[1], manifest.version, 'APP_VERSION differs from package.json')
assert.equal(lock.version, manifest.version, 'Lockfile version differs')
assert.equal(lock.packages[''].version, manifest.version, 'Lockfile root version differs')
assert.deepEqual(lock.packages[''].engines, manifest.engines, 'Node requirements differ')
for (const script of Object.values(manifest.scripts)) {
  for (const match of script.matchAll(/scripts\/[\w./-]+\.(?:cjs|mjs|ts)/g)) await access(match[0])
}
const docs = (await readdir('.')).filter(file => file.endsWith('.md'))
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`
    if (entry.isDirectory()) await collect(file)
    else if (file.endsWith('.md')) docs.push(file)
  }
}
await collect('docs')
let links = 0
for (const file of docs) {
  for (const match of (await read(file)).matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0]
    if (!target || /^[a-z]+:/i.test(target)) continue
    await access(resolve(dirname(file), decodeURIComponent(target))).catch(() => { throw new Error(`${file}: broken local link ${target}`) })
    links++
  }
}
console.log(`Repository checks passed: version ${manifest.version}, ${docs.length} Markdown files, ${links} local links, script entrypoints.`)
