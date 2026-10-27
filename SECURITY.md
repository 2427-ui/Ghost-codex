# 安全反馈

正式支持的版本以仓库最新发布版本为准。升级前从托盘退出旧实例，避免继续运行旧构建。

请通过本仓库 Security 页的“Report a vulnerability”私下报告漏洞；如果该入口未启用，请先提交不含漏洞细节的 issue，请求维护者提供私密反馈方式。不要在公开 issue 或 PR 中粘贴可用凭据、个人数据或针对真实用户的利用记录。

报告应包含受影响版本、运行环境、最小复现步骤、影响范围和建议修复方式。复现请使用隔离目录与测试账户。

维护检查：

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run audit:dependencies
npm.cmd run build
npm.cmd run check:publication -- --built
```

打包后另执行 `npm.cmd run check:publication -- --packaged`。编辑器存在内置清洗库，修复时需要同时核对依赖清单、Vite 重定向和实际打包代码，不能仅以修改锁文件作为验证。
