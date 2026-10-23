import { StudioService } from '../src/main/service'
import { Storage } from '../src/main/storage'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
if (!process.argv.includes('--live')) throw new Error('This check starts real model tasks. Run with --live to opt in.')
const storage = new Storage(resolve('.ghost-dev/service-check'))
const service = new StudioService(storage)
const projectPath = resolve('.ghost-dev/smoke-project')
await mkdir(projectPath, { recursive: true })
const project = storage.addProject(projectPath, 'service check')
try {
  await service.connect()
  const session = await service.createSession(project.id)
  service.on('event', event => {
    if (event.type === 'runtime') console.log('状态', event.runtime.activity, event.runtime.error || '')
    if (event.type === 'notification' && ['turn/started', 'turn/completed', 'error'].includes(event.method)) console.log(event.method, JSON.stringify(event.params))
    if (event.type === 'notification' && event.method === 'item/agentMessage/delta') process.stdout.write(event.params.delta)
  })
  const done = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('service timeout')), 90000); timeout.unref()
    service.on('event', event => { if (event.type === 'notification' && event.method === 'turn/completed') { clearTimeout(timeout); resolve() } })
  })
  done.catch(() => {})
  await service.send(session.id, '只回复 GHOST_SERVICE_OK，不调用工具。')
  await done
  console.log('History items:', (await service.history(session.id)).length)
} catch (error) { console.error((error as Error).message); process.exitCode = 1 }
finally { service.close() }
