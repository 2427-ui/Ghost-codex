# Codex 接口覆盖清单 · 0.2.0

协议快照日期：2026-10-23，CLI：0.163.0-alpha.11.2，完整实验请求 schema。共 172 个请求，168 个可操作接口；握手、测试及内部交互计数 4 项不作为功能按钮。

“已接入”表示存在参数表单、上下文填充、主进程 schema 校验、RPC、结果/错误反馈和通知入口，不表示每项都已实调或拥有完整官方交互。复杂配置、实时音视频、远程、分享和导入等通过高级表单使用；实际可用性取决于后端、账户、特性开关、网络与主机。

实调状态来自 [已保存验证记录](protocol-verification.json)（2026-10-23，CLI 0.163.0-alpha.11.2），生成文档不会执行探测或真实任务。当前记录与协议快照版本一致。

全部可操作请求由自动测试覆盖校验器编译。账号、全局配置、分享、插件安装/删除等未自动逐项实调。常见凭据字段隐藏；文件接口限已打开项目，递归操作不跟随符号链接或穿过内部目录。

该快照的 Windows 沙箱 streaming command/exec 曾不受支持。终端提供沙箱非交互命令和明确确认的主机 PTY，后者使用 process/spawn，不自动退回主机执行。持续目标可能启动任务，队列可能自动消费；审查按 exitedReviewMode、压缩按 thread/compacted 完成。

| 接口 | 功能 | 协议标记 | 接入与验证状态 |
| --- | --- | --- | --- |
| `initialize` | initialize | 稳定 | 连接握手，由主进程自动管理 |
| `server/diagnostics` | 服务诊断 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `userVerification/status` | 用户验证 · 状态 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `userVerification/enroll` | 用户验证 · 登记 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `userVerification/delete` | 用户验证 · 删除 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `userVerification/verify` | 用户验证 · 验证 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `userVerification/cancel` | 用户验证 · 取消 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/start` | 新建对话 | 稳定 | 已接入；真实操作验证 |
| `thread/resume` | 恢复对话 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/fork` | 分叉对话 | 稳定 | 已接入；真实操作验证 |
| `thread/archive` | 归档对话 | 稳定 | 已接入；真实操作验证 |
| `thread/delete` | 删除对话 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/unsubscribe` | 会话 · 取消订阅 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/increment_elicitation` | 会话 · increment_elicitation | 实验 | 内部交互计数，由服务端交互生命周期管理 |
| `thread/decrement_elicitation` | 会话 · decrement_elicitation | 实验 | 内部交互计数，由服务端交互生命周期管理 |
| `thread/name/set` | 重命名 | 稳定 | 已接入；真实操作验证 |
| `thread/prediction/request` | 会话 · 预测 · request | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/goal/set` | 设置持续任务目标 | 稳定 | 已接入；真实操作验证 |
| `thread/goal/get` | 查看任务目标 | 稳定 | 已接入；真实操作验证 |
| `thread/goal/clear` | 清除任务目标 | 稳定 | 已接入；真实操作验证 |
| `thread/queue/add` | 加入待执行队列 | 实验 | 已接入；真实操作验证 |
| `thread/queue/list` | 查看任务队列 | 实验 | 已接入；真实操作验证 |
| `thread/queue/update` | 修改队列消息 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/queue/delete` | 移除队列消息 | 实验 | 已接入；真实操作验证 |
| `thread/queue/reorder` | 调整队列顺序 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/queue/start` | 启动队列任务 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/metadata/update` | 更新会话元数据 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/attachment/add` | 会话 · 附件 · 添加 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/attachment/list` | 会话 · 附件 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/attachmentOwner/list` | 会话 · 附件来源 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/attachment/remove` | 会话 · 附件 · 移除 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/section/move` | 移动会话分组 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/settings/update` | 会话模型与权限 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/memoryMode/set` | 会话 · 记忆模式 · 设置 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `memory/status` | 记忆状态 | 实验 | 已接入；本机只读调用通过 |
| `memory/reset` | 重置记忆 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `rollout/compress` | 历史存储 · 压缩 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/unarchive` | 恢复归档 | 稳定 | 已接入；真实操作验证 |
| `thread/compact/start` | 压缩上下文 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/shellCommand` | 会话 · shellCommand | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/approveGuardianDeniedAction` | 会话 · 重新批准被 Guardian 拒绝的操作 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/backgroundTerminals/clean` | 会话 · 后台终端 · 清理 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/backgroundTerminals/list` | 会话 · 后台终端 · 列表 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/backgroundTerminals/terminate` | 会话 · 后台终端 · 终止 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/revert` | 回退对话历史 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/list` | 会话列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `project/list` | 本机项目列表 | 实验 | 已接入；本机只读调用通过 |
| `project/read` | 查看项目 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `project/create` | 创建项目 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `project/import` | 导入项目 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `project/update` | 修改项目 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `project/move` | 调整项目顺序 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `project/delete` | 移除项目 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `threadSection/list` | 会话分组 | 稳定 | 已接入；本机只读调用通过 |
| `threadSection/create` | 新建分组 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `threadSection/update` | 修改分组 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `threadSection/delete` | 删除分组 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/search` | 全文搜索会话 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/searchOccurrences` | 搜索命中位置 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/loaded/list` | 会话 · 已加载 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/read` | 会话 · 读取 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/readState/update` | 会话 · 已读状态 · 更新 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/turns/list` | 会话 · 轮次 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/items/list` | 会话 · 消息项 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/items/read` | 会话 · 消息项 · 读取 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/inject_items` | 会话 · 注入上下文 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `skills/list` | 发现技能 | 稳定 | 已接入；本机只读调用通过 |
| `skills/extraRoots/set` | 额外技能目录 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `hooks/list` | 查看 Hooks | 稳定 | 已接入；本机只读调用通过 |
| `marketplace/add` | 插件市场 · 添加 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `marketplace/remove` | 插件市场 · 移除 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `marketplace/upgrade` | 插件市场 · 升级 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/list` | 插件目录 | 稳定 | 已接入；本机只读调用通过 |
| `plugin/search` | 搜索插件 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/installed` | 已安装插件 | 稳定 | 已接入；本机只读调用通过 |
| `plugin/reconcile` | 插件 · 同步 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/read` | 插件详情 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/skill/read` | 插件 · 技能 · 读取 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/share/save` | 插件 · 分享 · 保存 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/share/updateTargets` | 插件 · 分享 · 更新共享对象 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/share/list` | 插件 · 分享 · 列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/share/checkout` | 插件 · 分享 · 检出 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/share/delete` | 插件 · 分享 · 删除 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `app/read` | 应用详情 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `app/list` | 可用应用 | 稳定 | 已接入；本机只读调用通过 |
| `app/installed` | 已安装应用 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/readFile` | 读取文件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/writeFile` | 写入文件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/createDirectory` | 创建目录 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/getMetadata` | 文件信息 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/readDirectory` | 浏览目录 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/remove` | 删除文件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/copy` | 复制文件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/watch` | 监听文件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fs/unwatch` | 停止监听 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `skills/config/write` | 启用或停用技能 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/install` | 安装插件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `plugin/uninstall` | 卸载插件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `turn/start` | 开始任务 | 稳定 | 已接入；真实操作验证 |
| `turn/settings/update` | 任务 · 设置 · 更新 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `turn/steer` | 执行中补充指令 | 稳定 | 已接入；真实操作验证 |
| `turn/interrupt` | 停止任务 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/start` | 会话 · 实时音视频 · 开始 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/appendAudio` | 会话 · 实时音视频 · 输入音频 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/appendText` | 会话 · 实时音视频 · 输入文本 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/appendSpeech` | 会话 · 实时音视频 · 输入语音 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/stop` | 会话 · 实时音视频 · 停止 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/timeline/list` | 会话 · 时间线 · 列表 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `thread/realtime/listVoices` | 会话 · 实时音视频 · 声音列表 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `review/start` | 代码审查 | 稳定 | 已接入；真实操作验证 |
| `model/list` | 模型列表 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/gatewayOAuth/read` | 账户 · 网关登录 · 读取 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/gatewayOAuth/login` | 账户 · 网关登录 · 登录 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/gatewayOAuth/cancel` | 账户 · 网关登录 · 取消 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `modelProvider/capabilities/read` | 模型提供商能力 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `experimentalFeature/list` | 实验功能 | 稳定 | 已接入；本机只读调用通过 |
| `permissionProfile/list` | 权限配置 | 稳定 | 已接入；本机只读调用通过 |
| `experimentalFeature/enablement/set` | 切换实验功能 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/enable` | 开启远程控制 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/disable` | 关闭远程控制 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/status/read` | 远程连接状态 | 实验 | 已接入；本机只读调用通过 |
| `remoteControl/pairing/start` | 远程控制 · 配对 · 开始 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/pairing/status` | 远程控制 · 配对 · 状态 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/client/list` | 远程控制 · 客户端 · 列表 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `remoteControl/client/revoke` | 远程控制 · 客户端 · 撤销 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `collaborationMode/list` | 计划与协作模式 | 实验 | 已接入；本机只读调用通过 |
| `mock/experimentalMethod` | mock · experimentalMethod | 实验 | 官方协议测试接口 |
| `environment/add` | 执行环境 · 添加 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `environment/info` | 执行环境 · 信息 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `environment/status` | 执行环境 · 状态 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `mcpServer/oauth/login` | MCP 登录 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `config/mcpServer/reload` | 重新加载 MCP | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `mcpServerStatus/list` | MCP 服务与工具 | 稳定 | 已接入；本机只读调用通过 |
| `mcpServer/resource/read` | 读取 MCP 资源 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `mcpServer/event/stream/start` | MCP · 事件 · 流 · 开始 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `mcpServer/event/stream/stop` | MCP · 事件 · 流 · 停止 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `mcpServer/tool/call` | 调用 MCP 工具 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `windowsSandbox/setupStart` | 设置 Windows 沙箱 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `windowsSandbox/readiness` | 检查 Windows 沙箱 | 稳定 | 已接入；本机只读调用通过 |
| `account/login/start` | 账户 · 登录 · 开始 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/bedrock/discover` | 账户 · Bedrock · 发现 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `account/bedrock/setup` | 账户 · Bedrock · 设置 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `account/bedrock/checkGovCloudRequirements` | 账户 · Bedrock · 检查 GovCloud 要求 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `account/login/cancel` | 账户 · 登录 · 取消 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/logout` | 退出 Codex 账户 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/rateLimits/read` | 额度窗口 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/rateLimitResetCredit/consume` | 账户 · 额度重置积分 · 使用 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/usage/read` | 账户用量 | 稳定 | 已接入；本机只读调用通过 |
| `account/workspaceMessages/read` | 账户工作区消息 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `account/sendAddCreditsNudgeEmail` | 账户 · 发送额度申请邮件 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `feedback/upload` | 发送诊断反馈 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `command/exec` | 运行沙箱命令 | 稳定 | 已接入；真实操作验证 |
| `command/exec/write` | 发送终端输入 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `command/exec/terminate` | 停止终端 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `command/exec/resize` | 调整终端尺寸 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `process/spawn` | 运行主机进程（不使用 Codex 沙箱） | 实验 | 已接入；真实操作验证 |
| `process/writeStdin` | 输入主机进程 | 实验 | 已接入；真实操作验证 |
| `process/kill` | 终止主机进程 | 实验 | 已接入；真实操作验证 |
| `process/resizePty` | 调整主机终端 | 实验 | 已接入；真实操作验证 |
| `config/read` | 读取 Codex 配置 | 稳定 | 已接入；本机只读调用通过 |
| `externalAgentConfig/detect` | 检测其他 Agent 配置 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `externalAgentConfig/import` | 导入 Agent 配置 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `externalAgentConfig/import/recordHistory` | 外部配置 · import · 记录导入 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `externalAgentConfig/import/readHistories` | 外部配置 · import · 导入历史 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `config/value/write` | 修改配置项 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `config/batchWrite` | 批量修改配置 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `configRequirements/read` | 配置策略要求 | 稳定 | 已接入；本机只读调用通过 |
| `account/read` | 账户状态 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fuzzyFileSearch` | 项目文件搜索 | 稳定 | 已接入；参数校验覆盖，未逐项实调 |
| `fuzzyFileSearch/sessionStart` | 文件搜索 · 开始搜索 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `fuzzyFileSearch/sessionUpdate` | 文件搜索 · 更新搜索 | 实验 | 已接入；参数校验覆盖，未逐项实调 |
| `fuzzyFileSearch/sessionStop` | 文件搜索 · 结束搜索 | 实验 | 已接入；参数校验覆盖，未逐项实调 |

## 服务端请求与实际边界

命令、文件修改、问题回答、额外权限、MCP 表单/URL、客户端工具结果和旧版命令/补丁审批可交互处理。客户端工具接收用户填写的结果，不自动实现任意 dynamicTools。设备证明和特定身份验证需要主机原生支持；外部令牌刷新提示重新认证。

实时音视频已有部分高级参数表单和事件接收，尚无完整麦克风采集、WebRTC 协商及自动播放面板。第三方应用取决于已配置服务，不代表所有官方插件和云功能自动可用。

完整 Git/PR、worktree 生命周期、调度器、内嵌浏览器及跨设备云历史不在这份接口接入的完成范围。

生成与检查：npm run docs:interfaces、npm run check:repo。协议更新与实调命令见 [开发文档](DEVELOPMENT.md)，当前功能边界见 [功能清单](CODEX-PARITY.md)。
