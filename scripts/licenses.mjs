import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const sections = ['Ghost Studio — bundled dependency license inventory\nGenerated from package-lock.json. Each dependency retains its own license.\n']
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || !entry.version) continue
  try {
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    const licenseFiles = readdirSync(path).filter(name => /^(licen[cs]e|notice|copyright)(\.(md|txt))?$/i.test(name))
    if (!licenseFiles.length) continue
    sections.push(`\n${'='.repeat(72)}\n${manifest.name} ${entry.version} — ${typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license || 'see package')}\n`)
    for (const file of licenseFiles) sections.push(`${file}\n${readFileSync(join(path, file), 'utf8')}\n`)
  } catch { /* platform-specific optional packages may not be installed */ }
}
writeFileSync('licenses/DEPENDENCIES.txt', sections.join('\n'))
console.log('Dependency licenses generated.')
