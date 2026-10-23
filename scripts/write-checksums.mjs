import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, writeFile } from 'node:fs/promises'

const files = (await readdir('dist')).filter(name => /^Ghost Studio Setup .*\.exe$/.test(name)).sort()
for (const file of ['win-unpacked/GhostStudio.exe', 'win-unpacked/resources/app.asar']) {
  try { await access(`dist/${file}`); files.push(file) } catch { /* directory build may not exist */ }
}
if (!files.length) throw new Error('No built artifacts found in dist. Run package or package:dir first.')
const rows = []
for (const file of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(`dist/${file}`)) hash.update(chunk)
  rows.push(`${hash.digest('hex')}  ${file}`)
}
await writeFile('dist/SHA256SUMS.txt', rows.join('\n') + '\n')
console.log(`Wrote SHA-256 checksums for ${files.length} artifact(s).`)
