import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { full: { type: 'string' }, stable: { type: 'string' }, 'cli-version': { type: 'string' } } })
if (!values.full || !values.stable || !values['cli-version']) {
  throw new Error('Usage: npm run protocol:generate -- --full <experimental ClientRequest.json> --stable <stable ClientRequest.json> --cli-version <version>')
}
const full = JSON.parse(await readFile(values.full, 'utf8'))
const stable = JSON.parse(await readFile(values.stable, 'utf8'))
if (!Array.isArray(full.oneOf) || !Array.isArray(stable.oneOf)) throw new Error('Expected ClientRequest schemas with oneOf request branches.')
const methodOf = schema => schema.properties.method.const || schema.properties.method.enum[0]
const fullMethods = new Set(full.oneOf.map(methodOf))
const stableMethods = [...new Set(stable.oneOf.map(methodOf))]
if (stableMethods.some(method => !fullMethods.has(method))) throw new Error('Stable methods are missing from the experimental schema. Export both from the same CLI.')
const root = 'src/shared/protocol'
const exportedAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
await mkdir(root, { recursive: true })
await writeFile(`${root}/requests.json`, JSON.stringify(full))
await writeFile(`${root}/stable-methods.json`, JSON.stringify(stableMethods))
await writeFile(`${root}/metadata.json`, JSON.stringify({ cliVersion: values['cli-version'], exportedAt, experimental: true }, null, 2) + '\n')
console.log(`Generated ${fullMethods.size} methods (${stableMethods.length} stable), CLI ${values['cli-version']}.`)
