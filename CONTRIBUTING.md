# 参与贡献

开发需要 Windows、Node.js 24+、npm、Git 和 Git LFS。首次克隆执行 `git lfs pull`，然后在仓库根目录运行 `npm.cmd ci` 与 `npm.cmd run dev`。

提交前执行：

```powershell
npm.cmd run check
npm.cmd run audit:dependencies
npm.cmd run build
npm.cmd run check:publication -- --built
```

修改界面时还需 `npm.cmd run check:ui`；修改输入、文件或 Git 流程时运行 `npm.cmd run check:workflows`。相关检查使用隔离数据；调用真实模型、账户或远端写入的测试应单独说明。

PR 请说明问题、修改后的行为、验证结果和已知限制。新功能需要覆盖失败、取消、权限和重启行为。请勿提交账户、凭据、会话正文、测试数据库、个人路径或未经确认可再分发的素材。

项目自有代码使用 MIT 许可证。第三方代码、图标、人设和依赖保留各自许可证及署名，详见 `THIRD_PARTY_NOTICES.md`。引入外部素材时同时提交来源和适用的再分发许可。

详细命令与结构见 [开发文档](docs/DEVELOPMENT.md)。
