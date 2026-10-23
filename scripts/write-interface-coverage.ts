import { readFile, writeFile } from 'node:fs/promises'
import { CAPABILITIES } from '../src/shared/capabilities'
import { APP_VERSION } from '../src/shared/types'
import metadata from '../src/shared/protocol/metadata.json'

const evidence = JSON.parse(await readFile('docs/protocol-verification.json', 'utf8')) as { recordedAt: string; cliVersion: string; readMethods: string[]; taskMethods: string[] }
const sameSnapshot = evidence.cliVersion === metadata.cliVersion
const reads = new Set(sameSnapshot ? evidence.readMethods : [])
const tasks = new Set(sameSnapshot ? evidence.taskMethods : [])
const rows = CAPABILITIES.map(capability => {
  const state = capability.unavailable || (tasks.has(capability.method)
    ? '已接入；真实操作验证'
    : reads.has(capability.method) ? '已接入；本机只读调用通过' : '已接入；参数校验覆盖，未逐项实调')
  return `| \`${capability.method}\` | ${capability.title} | ${capability.experimental ? '实验' : '稳定'} | ${state} |`
})
const unavailable = CAPABILITIES.filter(capability => capability.unavailable).length
const markdown = `# Codex 接口覆盖清单 · ${APP_VERSION}

协议快照日期：${metadata.exportedAt}，CLI：${metadata.cliVersion}，完整实验请求 schema。共 ${CAPABILITIES.length} 个请求，${CAPABILITIES.length - unavailable} 个可操作接口；握手、测试及内部交互计数 ${unavailable} 项不作为功能按钮。

“已接入”表示存在参数表单、上下文填充、主进程 schema 校验、RPC、结果/错误反馈和通知入口，不表示每项都已实调或拥有完整官方交互。复杂配置、实时音视频、远程、分享和导入等通过高级表单使用；实际可用性取决于后端、账户、特性开关、网络与主机。

实调状态来自 [已保存验证记录](protocol-verification.json)（${evidence.recordedAt}，CLI ${evidence.cliVersion}），生成文档不会执行探测或真实任务。${sameSnapshot ? '当前记录与协议快照版本一致。' : '记录与当前协议版本不同，以下不沿用旧版实调标记。'}

全部可操作请求由自动测试覆盖校验器编译。账号、全局配置、分享、插件安装/删除等未自动逐项实调。常见凭据字段隐藏；文件接口限已打开项目，递归操作不跟随符号链接或穿过内部目录。

该快照的 Windows 沙箱 streaming command/exec 曾不受支持。终端提供沙箱非交互命令和明确确认的主机 PTY，后者使用 process/spawn，不自动退回主机执行。持续目标可能启动任务，队列可能自动消费；审查按 exitedReviewMode、压缩按 thread/compacted 完成。

| 接口 | 功能 | 协议标记 | 接入与验证状态 |
| --- | --- | --- | --- |
${rows.join('\n')}

## 服务端请求与实际边界

命令、文件修改、问题回答、额外权限、MCP 表单/URL、客户端工具结果和旧版命令/补丁审批可交互处理。客户端工具接收用户填写的结果，不自动实现任意 dynamicTools。设备证明和特定身份验证需要主机原生支持；外部令牌刷新提示重新认证。

实时音视频已有部分高级参数表单和事件接收，尚无完整麦克风采集、WebRTC 协商及自动播放面板。第三方应用取决于已配置服务，不代表所有官方插件和云功能自动可用。

完整 Git/PR、worktree 生命周期、调度器、内嵌浏览器及跨设备云历史不在这份接口接入的完成范围。

生成与检查：npm run docs:interfaces、npm run check:repo。协议更新与实调命令见 [开发文档](DEVELOPMENT.md)，当前功能边界见 [功能清单](CODEX-PARITY.md)。
`
if (process.argv.includes('--check')) {
  const current = await readFile('docs/CODEX-INTERFACES.md', 'utf8')
  if (current.replaceAll('\r\n', '\n') !== markdown) throw new Error('Interface documentation is stale. Run npm run docs:interfaces.')
  console.log('Interface documentation matches the saved protocol and verification snapshot.')
} else {
  await writeFile('docs/CODEX-INTERFACES.md', markdown)
  console.log('Wrote complete interface coverage:', CAPABILITIES.length)
}
