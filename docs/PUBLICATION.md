# 公开发布检查

项目自有代码和文档使用根目录的 MIT 许可证。Fairy-DSH 改编代码、眼睛、人设及其他依赖保留各自许可证，详见 [第三方说明](../THIRD_PARTY_NOTICES.md)。游戏命名参考不等于游戏素材和商标的授权。

当前公开构建采用代码绘制的约 2.75 秒机械睁眼动画，不含游戏启动视频及其派生预览。导入新素材前必须记录来源与再分发许可。

安全依赖固定为 DOMPurify 3.4.17。Monaco 0.57.0 的内置旧副本通过 Vite 插件重定向到该版本，原始编辑器包不进入 app.asar。发布检查扫描实际构建，不能仅凭锁文件或 npm audit 结果判断应用载荷已修复。

## 验证命令

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run audit:dependencies
npm.cmd run build
npm.cmd run check:publication -- --built
npm.cmd run check:ui
npm.cmd run check:workflows
npm.cmd run package
npm.cmd run check:publication -- --packaged
npm.cmd run check:package
npm.cmd run check:ui:packaged
```

Windows CI 自动执行依赖安装、类型和后端测试、漏洞审计、构建及界面/原生工作流验证。它不连接模型账户、推送用户项目或创建 PR。

## 分发与边界

- 当前源码、文档、许可证和构建应属于同一版本；分发文件的校验值保存在 `dist/SHA256SUMS.txt`。
- `dist/` 中的大文件通过 Git LFS 保存。提交后应确认相关对象推送成功，首次使用执行 `git lfs pull`。
- `.reference/`、`.ghost-dev/`、`output/`、账户数据、测试数据库和日志不属于公开内容。归档素材和旧构建只保留在本机忽略目录。
- 根目录 `SECURITY.md` 和 `CONTRIBUTING.md` 分别说明安全反馈与贡献流程。
- 源码变更检查和密钥模式扫描不能保证不存在所有漏洞；账户实调、第二台电脑安装与长时间运行验证仍需按场景完成。
- 提交、推送、Release 和仓库可见性是不同操作。只有核对最终内容后才执行公开发布；本地检查不会自动改变 GitHub 可见性。
