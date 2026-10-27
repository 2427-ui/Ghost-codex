import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { normalize } from 'node:path'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
assert.equal(manifest.license, 'MIT')
assert.ok(readFileSync('LICENSE', 'utf8').startsWith('MIT License'))
assert.equal(lock.packages['node_modules/dompurify'].version, '3.4.17')
assert.equal(manifest.overrides['monaco-editor'].dompurify, '3.4.17')
assert.ok(readFileSync('electron.vite.config.ts', 'utf8').includes('monaco-patched-dompurify'))
const forbidden = ['src/renderer/src/assets/hdd-startup.mp4', 'docs/screenshots/startup-preview.gif', 'docs/screenshots/startup-grid.png']
for (const file of forbidden) assert.ok(!existsSync(file), `Uncleared third-party footage: ${file}`)
const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].filter(file => existsSync(file) && statSync(file).isFile())
for (const file of files) {
  assert.ok(!/^(?:node_modules|out|output|\.ghost-dev|\.reference|test-results|playwright-report)\//.test(file), `Local-only data selected for publication: ${file}`)
  assert.ok(!/(?:^|\/)(?:auth\.json|credentials(?:\.[^/]+)?|id_rsa|id_ed25519|.*\.(?:sqlite|sqlite3|db|p12|pfx))$/i.test(file), `Potential private file: ${file}`)
  assert.ok(!/(?:^|\/)\.env(?:$|\.(?!example$))/.test(file), `Environment secrets file: ${file}`)
  if (statSync(file).size > 100 * 1024 * 1024) assert.ok(git(['check-attr', 'filter', '--', file]).trim().endsWith('filter: lfs'), `Large non-LFS file: ${file}`)
}
const unsafeVersion = /DOMPurify\s+(?:[012]\.[0-9]+\.[0-9]+|3\.(?:[0-3]\.[0-9]+|4\.(?:[0-9]|1[0-6])))(?![0-9])/g
if (process.argv.includes('--built') || process.argv.includes('--packaged')) {
  const renderer = readdirSync('out/renderer/assets').filter(file => file.endsWith('.js')).map(file => readFileSync(`out/renderer/assets/${file}`, 'utf8')).join('\n')
  assert.ok(renderer.includes('DOMPurify 3.4.17'), 'Patched purifier missing from renderer')
  assert.ok(!unsafeVersion.test(renderer), 'Vulnerable vendored purifier remains in renderer')
  assert.ok(!readdirSync('out/renderer/assets').some(file => /hdd-startup|\.mp4$/i.test(file)), 'Game video remains in renderer')
}
if (process.argv.includes('--packaged')) {
  const asar = require('@electron/asar')
  const archive = 'dist/win-unpacked/resources/app.asar'
  const paths = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'))
  assert.ok(!paths.some(file => /hdd-startup|startup-preview|\/node_modules\/(?:monaco-editor|dompurify)\//.test(file)), 'Unused or uncleared payload bundled')
  const packageText = paths.filter(file => /^\/out\/renderer\/.*\.js$/.test(file)).map(file => asar.extractFile(archive, normalize(file.slice(1))).toString()).join('\n')
  unsafeVersion.lastIndex = 0
  assert.ok(packageText.includes('DOMPurify 3.4.17') && !unsafeVersion.test(packageText), 'Packaged renderer is not patched')
  assert.ok(asar.extractFile(archive, 'LICENSE').toString().startsWith('MIT License'), 'Project license missing from package')
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json').toString()).version, manifest.version)
}
console.log(`Publication checks passed: ${files.length} candidate files, MIT license, patched purifier and asset boundaries${process.argv.includes('--packaged') ? ', including actual EXE payload' : ''}.`)
