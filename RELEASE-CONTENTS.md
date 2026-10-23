# Ghost-codex 正式发布内容

Ghost Studio 0.2.0，C3 白色玻璃界面，默认字号 18，默认人设为 Fairy-DSH 风格的 Ghost。

## 使用者

- `dist/Ghost Studio Setup 0.2.0.exe`：Windows x64 安装包。
- `dist/win-unpacked/GhostStudio.exe`：解压式程序，须保留整个 win-unpacked 目录。
- `dist/SHA256SUMS.txt`：安装包、EXE 与 app.asar 的 SHA-256 清单。
- `启动Ghost.cmd`：优先启动解压式构建。

运行 AI 功能需要用户自行安装并登录 Codex CLI。程序不带开发者账户、设置、数据库或会话正文。

## 开发者

源码、package.json/package-lock.json、构建配置、测试、维护脚本、文档截图及第三方许可均位于本目录。使用 `npm ci` 安装依赖，维护命令见 [开发文档](docs/DEVELOPMENT.md)。

默认人设来源、适配范围及归属见 [更新说明](docs/CHANGES-DEFAULTS-RELEASE.md) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。项目自有代码的许可未在本次迁移中另行变更；第三方内容遵循其原许可。

## 目录边界

公开内容不携带 node_modules、out、output、.reference、.ghost-dev、测试报告或个人配置。这些开发资料保留在原工作目录，未混入发布内容。后续运行开发/验证命令会按 .gitignore 重新产生本地依赖与输出；本地 Git 元数据也不会作为项目文件提交。

目标仓库为 `git@github.com:2427-ui/Ghost-codex.git`。源码、文档、许可和正式构建共同保存；超过普通 Git 大小限制的安装包与解压式程序通过 Git LFS 管理，`dist/SHA256SUMS.txt` 保持普通文本。克隆前执行 `git lfs install`，克隆后执行 `git lfs pull`，再使用启动脚本或安装包。
