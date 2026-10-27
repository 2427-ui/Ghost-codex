import { useState } from 'react'
import { X, UserRound, PlugZap, SlidersHorizontal, Info, RotateCcw, FolderOpen, ExternalLink, Check, LoaderCircle, RefreshCw } from 'lucide-react'
import { APP_VERSION, DEFAULT_PERSONA, DEFAULT_SETTINGS, type Settings, type Snapshot } from '../../../shared/types'

export function SettingsPanel({ snapshot, onClose, onSave, onError }: { snapshot: Snapshot; onClose: () => void; onSave: (patch: Partial<Settings>) => Promise<unknown>; onError: (error: unknown) => void }) {
  const [tab, setTab] = useState('persona')
  const [persona, setPersona] = useState(snapshot.settings.persona)
  const [enabled, setEnabled] = useState(snapshot.settings.personaEnabled)
  const [path, setPath] = useState(snapshot.settings.codexPath)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loginPending, setLoginPending] = useState(false)
  const run = async (fn: () => Promise<unknown>) => { setSaving(true); try { await fn() } catch (error) { onError(error) } finally { setSaving(false) } }
  const { runtime, settings } = snapshot
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
      <header className="modal-header"><div><span className="eyebrow">SYSTEM PREFERENCES</span><h2>设置</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭设置"><X size={19} /></button></header>
      <div className="settings-body"><nav className="settings-nav">
        {[['persona', UserRound, 'Ghost 人设'], ['connection', PlugZap, 'Codex 连接'], ['appearance', SlidersHorizontal, '界面与动效'], ['about', Info, '关于']].map(([id, Icon, label]) => <button key={String(id)} className={tab === id ? 'active' : ''} onClick={() => setTab(String(id))}>{typeof Icon !== 'string' && <Icon size={16} />}{String(label)}</button>)}
      </nav><div className="settings-content">
        {tab === 'persona' && <>
          <h3>让 Ghost 成为你的搭档</h3><p className="muted">定义称呼、性格与表达方式。保存后应用于后续任务，历史消息保留。</p>
          <label className="switch-row"><div><strong>启用角色人设</strong><span>外观与人设分别控制</span></div><input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSaved(false) }} /></label>
          <label className="field-label" htmlFor="persona">角色指令 <span>{persona.length} / 12000</span></label>
          <textarea id="persona" className="persona-input" maxLength={12000} value={persona} onChange={e => { setPersona(e.target.value); setSaved(false) }} spellCheck={false} />
          <div className="persona-preview"><span className="eyebrow">当前人设 · 指令预览</span><p>{enabled ? persona || '尚未设置角色指令。' : '人设已关闭，Ghost 将使用常规助手风格。'}</p></div>
          <div className="settings-actions"><button className="text-button" onClick={() => { setPersona(DEFAULT_PERSONA); setEnabled(true); setSaved(false) }}><RotateCcw size={14} />恢复默认</button><button className="primary-button" disabled={saving} onClick={() => run(async () => { await onSave({ persona, personaEnabled: enabled }); setSaved(true) })}>{saved ? <Check size={15} /> : saving ? <LoaderCircle className="spin" size={15} /> : null}{saved ? '已保存' : '保存人设'}</button></div>
        </>}
        {tab === 'connection' && <>
          <h3>连接本地 Codex</h3><p className="muted">使用官方 Codex CLI 处理认证和任务。可用模型和套餐状态由当前账户返回。</p>
          <div className="connection-card"><span className={`status-dot ${runtime.connection}`} /><strong>{runtime.connection === 'connected' ? '已连接' : runtime.connection === 'connecting' ? '连接中' : '尚未连接'}</strong><code>{runtime.version || '未检测到版本'}</code></div>
          {runtime.error && <p className="inline-error">{runtime.error}</p>}
          <label className="field-label" htmlFor="codex-path">Codex 可执行文件 <span>留空时自动检测</span></label>
          <div className="input-row"><input id="codex-path" value={path} onChange={e => setPath(e.target.value)} placeholder="自动检测 codex.exe" /><button className="icon-button outlined" aria-label="选择 Codex 可执行文件" onClick={() => run(async () => { const next = await window.ghost.chooseCodex(); if (next) setPath(next) })}><FolderOpen size={17} /></button></div>
          <p className="path-note">{runtime.executable || '安装后可自动发现，也可以手动选择可执行文件。'}</p>
          <button className="secondary-button" disabled={saving || runtime.connection === 'connecting' || ['running', 'approval'].includes(runtime.activity)} onClick={() => run(async () => { await onSave({ codexPath: path }); await window.ghost.connect() })}><RefreshCw size={14} className={saving ? 'spin' : ''} />保存并连接</button>
          <div className="settings-divider" /><h4>ChatGPT 账户</h4>
          <p className="muted">{runtime.account ? `${runtime.account.email || runtime.account.type} · ${runtime.account.planType || '已认证'}` : '登录后即可使用账户支持的 Codex 能力。'}</p>
          <div className="button-row"><button className="primary-button" disabled={saving || runtime.connection !== 'connected'} onClick={() => run(async () => { await window.ghost.login(); setLoginPending(true) })}>通过 ChatGPT 登录<ExternalLink size={14} /></button><button className="text-button" disabled={saving || runtime.connection !== 'connected'} onClick={() => run(async () => { await window.ghost.refreshAccount(); setLoginPending(false) })}>刷新状态</button></div>
          {loginPending && <p className="muted">请在浏览器完成登录。<button className="inline-link" onClick={() => run(async () => { await window.ghost.cancelLogin(); setLoginPending(false) })}>取消登录</button></p>}
          <div className="settings-divider" /><button className="text-button" onClick={() => window.ghost.openExternal('https://developers.openai.com/codex/cli').catch(onError)}>查看官方安装指引<ExternalLink size={13} /></button>
          <p className="path-note">应用内不保存账户令牌。CLI 的版本与配置可能影响可用功能。</p>
        </>}
        {tab === 'appearance' && <>
          <h3>你的工作空间</h3><p className="muted">白色工作台、透明玻璃控件与银灰 Ghost，为长时间工作留出安静的空间。</p>
          <label className="switch-row"><div><strong>显示 Ghost</strong><span>工作区与首页中的动态形象</span></div><input type="checkbox" checked={settings.mascotVisible} onChange={e => run(() => onSave({ mascotVisible: e.target.checked }))} /></label>
          <label className="switch-row"><div><strong>启动动画</strong><span>完整启动时播放约 2.75 秒的机械睁眼动画，Esc 可跳过；恢复窗口时不重播</span></div><input aria-label="启动动画" type="checkbox" checked={settings.startupAnimation} onChange={e => run(() => onSave({ startupAnimation: e.target.checked }))} /></label>
          <label className="field-label" htmlFor="motion">动态效果</label><select id="motion" value={settings.motion} onChange={e => run(() => onSave({ motion: e.target.value as Settings['motion'] }))}><option value="full">完整 · 呼吸、视线与状态动画</option><option value="reduced">轻量 · 仅保留状态提示</option><option value="off">静态 · 关闭装饰动画</option></select>
          <label className="field-label" htmlFor="font-size">文字大小 <span>{settings.fontSize} px</span></label><input id="font-size" type="range" min={12} max={20} value={settings.fontSize} onChange={e => run(() => onSave({ fontSize: Number(e.target.value) }))} />
          <div className="appearance-preview"><span className={`status-dot ${runtime.connection}`} /><span>{runtime.connection === 'connected' ? 'Ghost 已连接，准备继续你的研究。' : runtime.connection === 'connecting' ? '正在连接 Codex…' : '工作空间已就绪，Codex 尚未连接。'}</span></div>
          <button className="text-button" onClick={() => run(() => onSave({ sidebarWidth: DEFAULT_SETTINGS.sidebarWidth, detailWidth: DEFAULT_SETTINGS.detailWidth, fontSize: DEFAULT_SETTINGS.fontSize, motion: DEFAULT_SETTINGS.motion, mascotVisible: DEFAULT_SETTINGS.mascotVisible, startupAnimation: DEFAULT_SETTINGS.startupAnimation }))}><RotateCcw size={14} />恢复默认界面</button>
        </>}
        {tab === 'about' && <>
          <div className="about-brand">GHOST<span>STUDIO / {APP_VERSION}</span></div><h3>让研究有一个统一入口。</h3><p className="muted">本地优先的 Codex 桌面工作台。项目、对话与代码变更，在同一个空间中继续。</p>
          <div className="settings-divider" /><h4>视觉来源</h4><p className="muted">眼睛 SVG 与几何参数改编自 Chengzhibense 的 Fairy-DSH，采用 Apache-2.0 许可。Ghost 的工作台、任务状态和桌面集成为本项目实现。</p>
          <button className="text-button" onClick={() => window.ghost.openExternal('https://github.com/Chengzhibense/Fairy-DSH').catch(onError)}>访问参考仓库<ExternalLink size={13} /></button>
          <p className="path-note">本应用与 OpenAI、DeepSeek、米哈游及《绝区零》无官方关联。未包含游戏语音、模型或剧情语料。</p>
        </>}
      </div></div>
    </section>
  </div>
}
