import Ajv from 'ajv'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative } from 'node:path'
import { CAPABILITIES, protocolSchema, redact, resolveSchema } from '../shared/capabilities'
import { safePath } from './files'
import type { StudioService } from './service'

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
const validators = new Map<string, any>()
export function validateCapability(method: string, params: any) {
  const info = CAPABILITIES.find(c => c.method === method)
  if (!info || info.unavailable) throw new Error(info?.unavailable || '未允许的 Codex 接口。')
  let validate = validators.get(method)
  if (!validate) {
    const branch = protocolSchema.oneOf.find((entry: any) => (entry.properties.method.const || entry.properties.method.enum[0]) === method)
    validate = ajv.compile({ ...branch, definitions: protocolSchema.definitions })
    validators.set(method, validate)
  }
  const request = { id: 0, method, ...(params === null || params === undefined ? {} : { params }) }
  if (!validate(request)) throw new Error(`参数不符合本机协议：${ajv.errorsText(validate.errors, { separator: '；' })}`)
  return info
}

export async function validateFileParams(service: StudioService, method: string, params: Record<string, any>) {
  // File endpoints are host-level APIs; preserve the editor's established project boundary.
  if (!method.startsWith('fs/')) return
  for (const key of ['path', 'sourcePath', 'destinationPath', 'source', 'destination']) {
    if (typeof params[key] !== 'string') continue
    const target = params[key]
    if (!isAbsolute(target)) throw new Error('文件接口需要绝对路径。')
    let allowed = false
    for (const project of service.storage.projects()) {
      try {
        const rel = relative(project.path, target)
        try { await safePath(project.path, rel) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          await safePath(project.path, relative(project.path, dirname(target)))
          if (['.git', '.codex', '.aws'].includes(basename(target).toLowerCase())) throw error
        }
        if (params.recursive && (method === 'fs/remove' || method === 'fs/copy' && key === 'sourcePath')) {
          let count = 0
          const inspect = async (directory: string): Promise<void> => {
            if (++count > 10000) throw new Error('递归操作包含过多目录，请缩小范围。')
            const info = await stat(directory)
            if (!info.isDirectory()) return
            for (const entry of await readdir(directory, { withFileTypes: true })) {
              const child = await safePath(project.path, relative(project.path, `${directory}/${entry.name}`))
              if (entry.isSymbolicLink()) throw new Error('递归操作不跟随目录联接或符号链接。')
              if (entry.isDirectory()) await inspect(child)
            }
          }
          await inspect(target)
        }
        allowed = true; break
      } catch { /* try another authorized project */ }
    }
    if (!allowed) throw new Error('文件操作限于已打开项目，且不能访问内部目录或目录联接之外。')
  }
}

export async function executeCapability(service: StudioService, method: string, params: Record<string, any> = {}) {
  const advertised = CAPABILITIES.find(c => c.method === method)
  const wireParams = advertised && resolveSchema(advertised.schema).type === 'null' ? null : params
  const info = validateCapability(method, wireParams)
  params ||= {}
  const client = service.client
  if (!client?.connected) throw new Error('请先连接 Codex。')
  await validateFileParams(service, method, params)
  const threadId = params.threadId
  const startsTask = ['review/start', 'thread/queue/start', 'thread/shellCommand', 'thread/compact/start', 'turn/start'].includes(method)
  if (method === 'thread/queue/start' && params.queuedSubmissionId) {
    const queue = await client.request('thread/queue/list', { threadId })
    if (!(queue.data || []).some((q: any) => q.id === params.queuedSubmissionId)) throw new Error('这条消息已被原生队列取走或移除，请刷新队列。')
  }
  if (startsTask) {
    if (['running', 'approval'].includes(service.runtime.activity)) throw new Error('请先等待或停止当前任务。')
    if (threadId) await service.prepareThread(threadId)
    service.beginActivity(threadId, info.title)
  } else if (threadId && ['thread/goal/set', 'thread/settings/update', 'thread/memoryMode/set', 'turn/settings/update', 'thread/inject_items', 'thread/realtime/start'].includes(method)) await service.prepareThread(threadId)
  if (['thread/revert', 'thread/delete', 'thread/archive', 'thread/unarchive', 'thread/fork'].includes(method) && threadId === service.runtime.activeThreadId && ['running', 'approval'].includes(service.runtime.activity)) throw new Error('当前会话仍在运行，请先停止。')
  try {
    const result = await client.request(method, wireParams, method === 'command/exec' ? (params.disableTimeout ? 24 * 60 * 60 * 1000 : Math.max(90000, (params.timeoutMs || 0) + 15000)) : 90000)
    if (method === 'thread/metadata/update' && typeof params.projectId === 'string') {
      const session = service.storage.sessions().find(s => s.id === threadId)
      const project = service.storage.projects().find(p => p.nativeId === params.projectId)
      if (session) service.storage.putSession({ ...session, projectId: project?.id || null, projectless: params.projectId === '' })
    }
    if (['thread/start', 'thread/resume', 'thread/fork'].includes(method) && result.thread) await service.trackThread(result.thread, method === 'thread/start')
    if (['thread/revert', 'thread/delete', 'thread/archive', 'thread/unarchive', 'thread/name/set', 'thread/section/move', 'thread/settings/update', 'thread/metadata/update', 'project/create', 'project/import', 'project/update', 'project/delete', 'project/move'].includes(method)) await service.syncHistory()
    if (method === 'account/logout') await service.refreshAccount()
    return redact(result)
  } catch (error) {
    if (startsTask) service.failActivity((error as Error).message)
    throw error
  }
}
