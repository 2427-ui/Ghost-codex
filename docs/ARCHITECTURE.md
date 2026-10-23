# Ghost Studio 架构与维护约定

当前基线：0.2.0 + C3。主进程拥有本地权限；renderer 通过 window.ghost 调用 preload 暴露的类型化接口。IPC 只接受本应用主框架，生产窗口启用 context isolation、sandbox 和严格 CSP，不开放 Node.js 或远程脚本。

## 进程与状态

StudioService 维护唯一 Codex 连接和当前任务，同时向主窗口与桌宠广播事件。当前应用同时执行一个任务；切换页面或会话不取消任务。桌宠通过受限 petSend 接口发送，不创建第二套运行时。恢复主窗口时重新读取会话选择与草稿。

request 与 notification 分开处理；审批响应沿用请求 ID。turn/start 响应可能先于 turn/started，取消使用服务端确认的 live turn ID。审查依据 exitedReviewMode、压缩依据 thread/compacted 完成，旧轮次事件不能覆盖新任务状态。

## 连接、协议与能力

连接执行 initialize → initialized → 账户/模型查询。新线程第一轮直接 turn/start，已有会话在发送前 resume。人设变更用于下一轮 developerInstructions，不改写历史。

共享协议快照在 src/shared/protocol，包括 schema、稳定方法列表和导出元数据。capabilities.ts 描述入口，capability-service.ts 按允许列表与 Ajv schema 校验后 RPC；文件接口另外验证项目边界。握手、测试及内部计数不作为功能按钮。常用功能有专用交互，高级功能通过递归表单提供参数、结果、错误与通知。

接口接入与实调证据分开维护。历史证据保存在 [协议验证记录](protocol-verification.json)，生成文档不启动真实任务。返回对象隐藏常见凭据和插件内嵌图像，展示限长。

## 本机项目、历史与持久化

Codex 管理凭据与会话正文。SQLite 只保存应用元数据、项目/会话引用、人设、偏好和已有会话草稿；GHOST_HOME 可隔离测试数据。默认字号 18，默认人设来自已署名的 Fairy-DSH 公开预设适配版。默认值迁移有独立版本标记，仅替换旧默认字号或完全匹配的旧人设，不改写用户自定义文本与人设开关。

thread/items/list 分页只读读取历史，兼容空 thread.turns；打开会话不得 resume。thread/list 遍历所有来源、提供商及归档列表，完整同步成功后清理失效引用，保留新建未持久化和正在运行的线程；部分失败不清理。

项目优先使用公开 project/list 和原生 ID 映射。功能中心的创建、导入、编辑、排序与移除调用原生接口，并触发索引刷新；本地项目选择和旧版归属适配仍保留。history.ts 只读桌面状态中的目录、名称和归属标记，失败时按 cwd 推断，不写官方状态文件。

CODEX_HOME 继承当前环境。普通聊天 projectId 为空，自动使用 userData/chat-workspaces/UUID，默认只读。本机可枚举历史不等于 ChatGPT 云端或其他主机历史；多个 App Server 不共享全部运行时与审批状态。

## 文件、编辑器与终端

文件接口先解析真实路径并检查项目边界，拒绝内部目录和联接逃逸。UTF-8 文本上限 2 MB；保存携带读取时的 SHA-256 版本，磁盘变化时拒绝覆盖。Git 使用 execFile 参数数组，Diff 只读。主进程边界与 Codex 沙箱是两层独立控制。

Monaco 通过本地 worker 加载，使用 ghost-light 主题。终端有沙箱非交互 command/exec 与需要确认的主机 PTY 两种范围。主机模式使用 process/spawn、writeStdin、resizePty、kill，退出面板清理进程，不在沙箱失败后自动切换到主机执行。

## C3 视觉与原生窗口

theme.css 集中维护白色/灰阶变量、玻璃材质与交互状态；基础、桌宠和功能样式复用变量。聊天时淡化背景网格。Ghost 使用 SVG 银灰渐变与环纹，React 提供视线跟随、眨眼和状态动画；每个实例使用独立绘图资源 ID，并遵守动效设置、系统减少动效和页面可见性。视觉不生成虚构进度，也不额外调用模型。

PNG/ICO 由同一 SVG 导出。BrowserWindow 显式指定 ICO，托盘使用 PNG，electron-builder 将多尺寸 ICO 写入 EXE。原生图标验证读取实际窗口和 EXE 关联图标。

桌宠收起尺寸 196×236，展开保持右下眼球锚点并约束到显示器工作区。窗口透明、无系统阴影、置顶且不出现在任务栏；renderer 根据交互命中切换鼠标穿透。拖动使用主进程鼠标位置，不能影响主窗口。主窗口关闭会收起为桌宠，真正退出在托盘或桌宠电源按钮。

## 维护入口

- [开发、离线检查及打包](DEVELOPMENT.md)
- [当前功能边界](CODEX-PARITY.md)
- [当前验证与未覆盖项](VERIFICATION.md)

不绑定开发者机器上的 CLI 哈希路径；从 PATH、已安装桌面版或 npm 原生二进制目录发现，也允许用户指定。协议调整以目标 CLI 导出和回归验证为准，不能复制凭据或完整用户配置到源码、日志或分发包。
