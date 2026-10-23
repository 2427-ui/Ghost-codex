import { useState } from 'react'
import { defaultParams, resolveSchema, type JsonSchema } from '../../../shared/capabilities'

const labels: Record<string, string> = { threadId: '当前会话 ID', name: '名称', objective: '任务目标', tokenBudget: 'Token 预算（可选）', origin: '授权来源', status: '状态', beforeTurnId: '从此轮起回退（不恢复文件）', lastTurnId: '复制到此轮为止', sectionId: '分组 ID', projectId: '项目 ID', beforeThreadId: '放在此会话之前', input: '输入内容', text: '消息', path: '绝对路径', cwd: '工作目录', command: '命令参数列表', server: 'MCP 服务', serverName: 'MCP 服务', toolName: '工具名称', arguments: '工具参数', content: '内容', url: '地址', roots: '项目目录', keyPath: '配置项路径', value: '配置值', mergeStrategy: '合并策略', expectedVersion: '配置版本（防止覆盖其他修改）', target: '审查范围', branch: '分支', sha: '提交 SHA', instructions: '审查要求', delivery: '结果显示方式', enabled: '启用', limit: '每页数量', cursor: '下一页游标', recursive: '包括子目录', timeoutMs: '超时（毫秒）', queuedSubmissionId: '队列消息 ID', clientUserMessageId: '消息唯一 ID', idempotencyKey: '请求唯一 ID', identityKey: '附件标识', attachmentType: '附件类型', payload: '附件数据', base64: '文件内容（Base64）', permissions: '权限', sandboxPolicy: '沙箱策略', model: '模型', effort: '推理强度', collaborationMode: '协作模式', searchTerm: '搜索文本' }
export function JsonEditor({ value, onChange, label }: { value: any; onChange: (v: any) => void; label: string }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2) ?? '{}')
  const [error, setError] = useState('')
  return <div className="schema-json"><textarea aria-label={label} aria-invalid={!!error} value={text} onChange={e => { setText(e.target.value); try { onChange(JSON.parse(e.target.value)); setError('') } catch { setError('JSON 格式尚未完整') } }} spellCheck={false} /><small>{error}</small></div>
}
export function SchemaField({ schema: original, value, onChange, name = '', depth = 0 }: { schema: JsonSchema; value: any; onChange: (v: any) => void; name?: string; depth?: number }) {
  const [variant, setVariant] = useState<number | null>(null)
  let schema = resolveSchema(original)
  const choices = schema.oneOf || schema.anyOf
  if (choices) {
    const inferred = choices.findIndex((entry: JsonSchema) => {
      const s = resolveSchema(entry)
      return s.properties?.type?.enum?.includes(value?.type) || s.properties?.type?.const === value?.type && value?.type !== undefined || (s.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) || (s.type === typeof value) || (s.type === 'null' && value === null)
    })
    const selected = variant ?? (inferred >= 0 ? inferred : choices.findIndex((s: JsonSchema) => resolveSchema(s).type !== 'null'))
    return <div className="schema-choice"><select aria-label={`${name || '参数'}类型`} value={Math.max(0, selected)} onChange={e => { const n = Number(e.target.value); setVariant(n); onChange(defaultParams(choices[n])) }}>{choices.map((c: JsonSchema, i: number) => { const s = resolveSchema(c); return <option key={i} value={i}>{s.properties?.type?.const || s.properties?.type?.enum?.[0] || s.title || s.type || `选项 ${i + 1}`}</option> })}</select><SchemaField key={selected} schema={choices[Math.max(0, selected)]} value={value} onChange={onChange} name={name} depth={depth + 1} /></div>
  }
  if (schema.enum || schema.const !== undefined) return <select aria-label={name} value={JSON.stringify(value)} onChange={e => onChange(JSON.parse(e.target.value))}>{(schema.enum || [schema.const]).map((v: any) => <option key={JSON.stringify(v)} value={JSON.stringify(v)}>{v === null ? '无' : String(v)}</option>)}</select>
  if (depth > 7 || !schema.type && !schema.properties || schema.type === 'object' && !schema.properties) return <JsonEditor label={name} value={value} onChange={onChange} />
  if (schema.type === 'object' || schema.properties) return <div className="schema-object">{Object.entries(schema.properties || {}).map(([key, field]) => {
    const required = schema.required?.includes(key), exists = value?.[key] !== undefined
    return <div className="schema-field" key={key}><div className="schema-label"><label>{labels[key] || key}{required && <b> *</b>}</label>{!required && <input aria-label={`设置 ${key}`} type="checkbox" checked={exists} onChange={e => { const next = { ...(value || {}) }; if (e.target.checked) next[key] = defaultParams(field as JsonSchema); else delete next[key]; onChange(next) }} />}</div>{(required || exists) && <><SchemaField schema={field as JsonSchema} value={value?.[key]} onChange={v => onChange({ ...(value || {}), [key]: v })} name={key} depth={depth + 1} />{(field as JsonSchema).description && <details className="schema-help"><summary>参数说明</summary>{(field as JsonSchema).description}</details>}</>}</div>
  })}</div>
  if (schema.type === 'array') return <div className="schema-array">{(Array.isArray(value) ? value : []).map((v: any, i: number) => <div className="schema-array-item" key={i}><SchemaField schema={schema.items || {}} name={`${name} ${i + 1}`} depth={depth + 1} value={v} onChange={next => onChange(value.map((x: any, j: number) => j === i ? next : x))} /><button className="text-button" onClick={() => onChange(value.filter((_: any, j: number) => j !== i))}>移除</button></div>)}<button className="text-button" onClick={() => onChange([...(value || []), defaultParams(schema.items || {})])}>＋ 添加一项</button></div>
  if (schema.type === 'boolean') return <input aria-label={name} type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
  if (schema.type === 'null') return <span className="muted">无需参数</span>
  if (['number', 'integer'].includes(schema.type)) return <input aria-label={name} type="number" step={schema.type === 'integer' ? 1 : 'any'} value={value ?? ''} onChange={e => onChange(Number(e.target.value))} />
  return /text|objective|instructions|content|message/i.test(name) ? <textarea aria-label={name} rows={3} value={value ?? ''} onChange={e => onChange(e.target.value)} /> : <input aria-label={name} type={/password|secret|apiKey|token$/i.test(name) ? 'password' : 'text'} value={value ?? ''} onChange={e => onChange(e.target.value)} />
}
