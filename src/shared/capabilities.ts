import requestSchema from './protocol/requests.json'
import stableMethods from './protocol/stable-methods.json'

export type JsonSchema = Record<string, any>
export const protocolSchema = requestSchema as JsonSchema
const internal: Record<string, string> = {
  initialize: '连接握手，由主进程自动管理',
  'mock/experimentalMethod': '官方协议测试接口',
  'thread/increment_elicitation': '内部交互计数，由服务端交互生命周期管理',
  'thread/decrement_elicitation': '内部交互计数，由服务端交互生命周期管理'
}
const titles: Record<string, string> = {
  'thread/start': '新建对话', 'thread/resume': '恢复对话', 'thread/fork': '分叉对话', 'thread/archive': '归档对话', 'thread/delete': '删除对话', 'thread/unarchive': '恢复归档', 'thread/name/set': '重命名', 'thread/compact/start': '压缩上下文', 'thread/revert': '回退对话历史', 'thread/list': '会话列表', 'thread/search': '全文搜索会话', 'thread/searchOccurrences': '搜索命中位置', 'thread/settings/update': '会话模型与权限', 'thread/metadata/update': '更新会话元数据', 'thread/section/move': '移动会话分组',
  'thread/goal/set': '设置持续任务目标', 'thread/goal/get': '查看任务目标', 'thread/goal/clear': '清除任务目标', 'thread/queue/add': '加入待执行队列', 'thread/queue/list': '查看任务队列', 'thread/queue/update': '修改队列消息', 'thread/queue/delete': '移除队列消息', 'thread/queue/reorder': '调整队列顺序', 'thread/queue/start': '启动队列任务',
  'project/list': '本机项目列表', 'project/read': '查看项目', 'project/create': '创建项目', 'project/import': '导入项目', 'project/update': '修改项目', 'project/move': '调整项目顺序', 'project/delete': '移除项目',
  'threadSection/list': '会话分组', 'threadSection/create': '新建分组', 'threadSection/update': '修改分组', 'threadSection/delete': '删除分组',
  'turn/start': '开始任务', 'turn/steer': '执行中补充指令', 'turn/interrupt': '停止任务', 'review/start': '代码审查', 'collaborationMode/list': '计划与协作模式',
  'command/exec': '运行沙箱命令', 'command/exec/write': '发送终端输入', 'command/exec/resize': '调整终端尺寸', 'command/exec/terminate': '停止终端',
  'process/spawn': '运行主机进程（不使用 Codex 沙箱）', 'process/writeStdin': '输入主机进程', 'process/resizePty': '调整主机终端', 'process/kill': '终止主机进程',
  'skills/list': '发现技能', 'skills/config/write': '启用或停用技能', 'skills/extraRoots/set': '额外技能目录', 'hooks/list': '查看 Hooks',
  'mcpServerStatus/list': 'MCP 服务与工具', 'mcpServer/oauth/login': 'MCP 登录', 'config/mcpServer/reload': '重新加载 MCP', 'mcpServer/tool/call': '调用 MCP 工具', 'mcpServer/resource/read': '读取 MCP 资源',
  'plugin/list': '插件目录', 'plugin/search': '搜索插件', 'plugin/installed': '已安装插件', 'plugin/install': '安装插件', 'plugin/uninstall': '卸载插件', 'plugin/read': '插件详情',
  'app/list': '可用应用', 'app/installed': '已安装应用', 'app/read': '应用详情',
  'config/read': '读取 Codex 配置', 'config/value/write': '修改配置项', 'config/batchWrite': '批量修改配置', 'configRequirements/read': '配置策略要求',
  'fs/readFile': '读取文件', 'fs/writeFile': '写入文件', 'fs/readDirectory': '浏览目录', 'fs/createDirectory': '创建目录', 'fs/copy': '复制文件', 'fs/remove': '删除文件', 'fs/getMetadata': '文件信息', 'fs/watch': '监听文件', 'fs/unwatch': '停止监听',
  'fuzzyFileSearch': '项目文件搜索', 'account/logout': '退出 Codex 账户', 'account/usage/read': '账户用量', 'account/rateLimits/read': '额度窗口', 'account/workspaceMessages/read': '账户工作区消息', 'account/read': '账户状态',
  'windowsSandbox/setupStart': '设置 Windows 沙箱', 'windowsSandbox/readiness': '检查 Windows 沙箱', 'experimentalFeature/list': '实验功能', 'experimentalFeature/enablement/set': '切换实验功能', 'permissionProfile/list': '权限配置',
  'model/list': '模型列表', 'modelProvider/capabilities/read': '模型提供商能力', 'externalAgentConfig/detect': '检测其他 Agent 配置', 'externalAgentConfig/import': '导入 Agent 配置', 'feedback/upload': '发送诊断反馈',
  'memory/status': '记忆状态', 'memory/reset': '重置记忆', 'remoteControl/status/read': '远程连接状态', 'remoteControl/enable': '开启远程控制', 'remoteControl/disable': '关闭远程控制', 'server/diagnostics': '服务诊断'
}
const words: Record<string, string> = { thread: '会话', attachment: '附件', attachmentOwner: '附件来源', backgroundTerminals: '后台终端', realtime: '实时音视频', timeline: '时间线', memoryMode: '记忆模式', readState: '已读状态', prediction: '预测', turn: '任务', account: '账户', gatewayOAuth: '网关登录', bedrock: 'Bedrock', plugin: '插件', share: '分享', skill: '技能', marketplace: '插件市场', mcpServer: 'MCP', event: '事件', stream: '流', remoteControl: '远程控制', client: '客户端', pairing: '配对', userVerification: '用户验证', environment: '执行环境', externalAgentConfig: '外部配置', rollout: '历史存储', fuzzyFileSearch: '文件搜索', sessionStart: '开始搜索', sessionUpdate: '更新搜索', sessionStop: '结束搜索', read: '读取', list: '列表', add: '添加', set: '设置', get: '获取', update: '更新', clear: '清除', start: '开始', stop: '停止', delete: '删除', remove: '移除', cancel: '取消', status: '状态', enable: '启用', disable: '停用', login: '登录', installed: '已安装', save: '保存', checkout: '检出', updateTargets: '更新共享对象', upgrade: '升级', reconcile: '同步', appendAudio: '输入音频', appendText: '输入文本', appendSpeech: '输入语音', listVoices: '声音列表', verify: '验证', enroll: '登记', revoke: '撤销', info: '信息', readHistories: '导入历史', recordHistory: '记录导入', inject_items: '注入上下文', unsubscribe: '取消订阅', loaded: '已加载', items: '消息项', turns: '轮次', clean: '清理', terminate: '终止', compress: '压缩', settings: '设置', sendAddCreditsNudgeEmail: '发送额度申请邮件', rateLimitResetCredit: '额度重置积分', consume: '使用', discover: '发现', setup: '设置', checkGovCloudRequirements: '检查 GovCloud 要求', approveGuardianDeniedAction: '重新批准被 Guardian 拒绝的操作' }
export function capabilityGroup(method: string) {
  if (/^(project|threadSection)\//.test(method)) return '项目与分组'
  if (/^(thread\/realtime|thread\/timeline|userVerification|remoteControl|environment)/.test(method)) return '实时与远程'
  if (/^(thread|turn|review|collaborationMode)\//.test(method)) return '对话与任务'
  if (/^(command|process)\//.test(method)) return '命令与终端'
  if (/^(skills|hooks|plugin|marketplace|app|mcpServer|mcpServerStatus)\//.test(method) || method === 'config/mcpServer/reload') return '技能与扩展'
  if (/^(fs|fuzzyFileSearch)/.test(method)) return '文件与搜索'
  if (/^(account|model|modelProvider)\//.test(method)) return '账户与模型'
  return '配置与诊断'
}
export interface Capability { method: string; title: string; group: string; experimental: boolean; mutation: boolean; unavailable?: string; schema: JsonSchema }
export const CAPABILITIES: Capability[] = protocolSchema.oneOf.map((entry: JsonSchema) => {
  const method: string = entry.properties.method.const || entry.properties.method.enum[0]
  return { method, title: titles[method] || method.split('/').map(w => words[w] || w).join(' · '), group: capabilityGroup(method), experimental: !stableMethods.includes(method), mutation: !/(?:\/|^)(read|list|status|info|get|readiness|readHistories|search|searchOccurrences|installed)$/.test(method) && !['fuzzyFileSearch', 'configRequirements/read', 'getConversationSummary', 'getAuthStatus', 'gitDiffToRemote'].includes(method), unavailable: internal[method], schema: entry.properties.params || { type: 'null' } }
})
export function resolveSchema(schema: JsonSchema): JsonSchema {
  if (schema?.$ref) return resolveSchema(protocolSchema.definitions[schema.$ref.split('/').at(-1)])
  if (Array.isArray(schema?.type)) return { ...schema, type: schema.type.find((t: string) => t !== 'null') || 'null' }
  return schema || {}
}
export function defaultParams(schema: JsonSchema, context: Record<string, any> = {}, depth = 0): any {
  schema = resolveSchema(schema)
  if (depth > 7) return null
  if (schema.default !== undefined) return schema.default
  if (schema.const !== undefined) return schema.const
  if (schema.enum) return schema.enum.find((v: unknown) => v !== null) ?? null
  if (schema.anyOf || schema.oneOf) return defaultParams((schema.anyOf || schema.oneOf).find((s: JsonSchema) => resolveSchema(s).type !== 'null'), context, depth + 1)
  if (schema.type === 'object' || schema.properties) return Object.fromEntries((schema.required || []).map((key: string) => [key, context[key] !== undefined ? context[key] : defaultParams(schema.properties?.[key] || {}, context, depth + 1)]))
  if (schema.type === 'array') return []
  if (schema.type === 'boolean') return false
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum || 0
  if (schema.type === 'null') return null
  return ''
}
export function redact(value: any): any {
  if (typeof value === 'string' && /^data:image\//.test(value)) return `[图像数据已省略，${value.length.toLocaleString()} 字符]`
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|authToken|authorization|client[_-]?secret|password|secret|token|credentials)$/i.test(k) && v ? '[已隐藏]' : redact(v)]))
  return value
}
