# 开发与维护

当前基线：0.3.1 + C3，Windows x64，默认字号 18，默认人设为 Ghost。在 Ghost-codex 正式项目根目录执行以下命令。DOMPurify 固定为 3.4.17；协议快照保持不变。

## 环境和基本命令

- Node.js 24+、npm、Git；依赖版本由 package-lock.json 固定。
- 图标导出与浏览器 UI 验证使用本机 Chrome。Electron、原生图标检查与打包需要 Windows。
- 只有连接或真实任务检查需要已安装并登录的 Codex CLI。
- 正式构建保存在 Git LFS：首次克隆前执行 `git lfs install`，克隆后执行 `git lfs pull`。提交新构建前更新 SHA-256 清单；临时 builder 调试文件继续忽略。

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run check
npm.cmd run build
npm.cmd run preview
```

`check:publication` 验证许可证、素材边界、依赖锁定及候选文件；传入 `--built` 或 `--packaged` 还会检查实际构建中的清洗库。`audit:dependencies` 查询 npm 官方漏洞数据库。Windows CI 自动执行离线测试、构建、浏览器和原生工作流检查。

`check` 执行类型检查、25 项后端测试、版本/文档链接/命令入口检查，以及接口表同步检查。Windows junction 测试需要当前进程具备目录联接权限；沙箱限制导致的失败应与代码失败区分。

## 不调用账户的界面检查

先运行 `npm.cmd run build`，再按需要执行：

| 命令 | 内容 |
| --- | --- |
| `npm.cmd run check:ui` | 生产 renderer + 本地模拟 IPC；首页两种尺寸、聊天/附件/发送、编辑器、设置、功能中心、终端、审批、视线、状态和减少动效 |
| `npm.cmd run check:workflows` | 新增离线原生工作流；隔离 Git 仓库，不连接账户或远端 |
| `npm.cmd run check:ui:native` | 原生 Electron，隔离数据；主窗口与桌宠开合、恢复 |
| `npm.cmd run check:ui:packaged` | 对打包后的 EXE 执行相同原生检查 |
| `npm.cmd run check:package` | 打包安全设置、预加载、本地 Monaco、功能中心、透明桌宠与恢复 |
| `npm.cmd run check:icons` | 九种 ICO 尺寸、EXE 内嵌资源、asar 文件一致性、实际窗口与原生关联图标 |

打包检查先运行 `npm.cmd run package:dir`。截图和 JSON 记录保存在 `output/ui-c3/`，打包综合检查的截图保存在 `.ghost-dev/screenshots/`。这些目录忽略于 Git；文档使用的最终截图单独保存到 `docs/screenshots/`。

`check:ui` 的本地 HTTP 服务仅绑定 127.0.0.1。原生测试使用 GHOST_TEST 和独立 GHOST_HOME，不自动连接 Codex。图标检查以 Windows 原生窗口/资源提取为准，并保留 Electron 通用文件图标查询结果供诊断。

## CLI 和真实任务检查

| 命令 | 是否创建真实模型任务 |
| --- | --- |
| `npm.cmd run check:codex` | 否；连接与接入检查 |
| `npm.cmd run check:capabilities` | 否；本机只读探测 |
| `npm.cmd run check:history` | 否；只读同步索引并输出数量 |
| `npm.cmd run check:codex -- --live` | 是；回复、重启恢复与取消 |
| `npm.cmd run check:capabilities -- --live` | 是；Plan、目标、队列、审查及会话管理 |
| `npm.cmd run check:history -- --live` | 是；双向接续与普通聊天 |
| `npm.cmd run check:service:live` | 是；业务服务任务 |
| `npm.cmd run check:review:live` | 是；原生代码审查 |
| `npm.cmd run check:operations:live` | 是；steer 与队列消费 |
| `npm.cmd run test:desktop` | 是；真实 Electron 和 Codex 端到端测试 |

真实任务会使用账户额度并创建隔离测试会话。不要把它们混入默认离线检查。历史实调证据保存在 [协议验证记录](protocol-verification.json)，临时只读探测保存到 `.ghost-dev/capability-probe.json`。

## 图标与打包

界面眼睛、图标 PNG 与 ICO 使用同一 SVG。改变眼睛材质后运行：

```powershell
npm.cmd run icons
npm.cmd run package
npm.cmd run check:package
npm.cmd run check:icons
```

`icons` 输出 256px 透明 PNG 和包含 16、20、24、32、40、48、64、128、256px 的 ICO。打包使用仓库中的资源，不自动启动浏览器重新生成。窗口显式指定 ICO，托盘读取 PNG。

`package:dir` 只生成解压式程序；`package` 生成 NSIS 安装包。两者重新构建源码、刷新许可并生成校验清单。校验清单涵盖 dist 根目录安装包、解压式 EXE 和 app.asar。发布前确认 dist 根目录只保留本次需要分发的安装包；旧包移到本地归档，不删除用户数据。

安装程序尚未在第二台电脑完整验证，没有发布者签名和自动更新。关闭窗口会收起桌宠，更新构建前应从托盘真正退出；不强制终止用户实例。

## 协议快照与接口文档

`src/shared/protocol/` 保存完整请求 schema、稳定方法列表和导出元数据。先用目标 CLI 导出完整实验协议和稳定 ClientRequest.json，再执行：

```powershell
npm.cmd run protocol:generate -- --full .reference/codex-schema/ClientRequest.json --stable .reference/codex-schema-stable/ClientRequest.json --cli-version 0.163.0-alpha.11.2
npm.cmd run docs:interfaces
npm.cmd run check
```

生成器要求明确 CLI 版本；不会自行升级 CLI 或联网取协议。接口文档从 APP_VERSION、元数据、能力表和 [已保存证据](protocol-verification.json) 生成，`--check` 只检查同步状态。不同 CLI 版本的历史实调不会被标为当前快照已验证。

## 目录维护

源码、协议快照、当前截图和许可进入版本控制，正式 dist 构建由 Git LFS 管理。临时编译结果、参考资料、日志、数据库、概念比较图及测试报告留在被忽略目录；不把账户凭据或用户会话正文复制进仓库。

[历史规划和验证](archive/README.md) 保留原样。一次性迁移脚本位于 scripts/archive，仅作历史记录，不能在当前源码上重跑。当前版本整理不删除 .ghost-dev 中的数据库或本地概念图。
