# 桌面客户端分平台构建边界

## Background

桌面客户端同时包含 Electron 宿主、网页资源、本地 Node 服务、Prisma Client、SQLite 驱动和图片处理模块。TypeScript 与网页资源可以跨平台生成，但 `better-sqlite3`、`sharp`、Electron 主程序以及安装介质都带有操作系统和 CPU 架构约束。把一个平台生成的 `node_modules` 或 staging 目录直接交给另一个平台，会得到表面完整、运行时才因原生模块格式错误而失败的安装包。

Docker Desktop 在 macOS 上提供的是 Linux 容器环境，不是 macOS 容器，因此不能作为 `.app`、DMG、代码签名或 Apple 公证的最终构建环境。

## Decision

- Windows x64 安装包只能在 Windows 构建环境中完成；现有 GitHub Actions Windows runner 是该链路的所有者。
- macOS 首个支持目标为 Apple Silicon arm64，只在 Apple Silicon macOS 环境中完成依赖安装、staging、Electron 重建和打包。
- 两个平台可以共享源码和锁文件，但不得共享 `node_modules`、`desktop/build/app` 或已经重建过的原生模块。
- 本地 Mac 开发包使用 ad-hoc 签名，只用于当前机器的开发验收。公开分发必须改用 Developer ID 签名并通过 Apple 公证。

## Current Rule

- `pnpm dist:desktop:mac:dir` 生成用于快速启动验证的 arm64 `.app`。
- `pnpm dist:desktop:mac` 生成 `.app`、DMG、ZIP 和 macOS 更新元数据。
- `pnpm verify:desktop-package:mac` 必须检查包结构、Prisma 资源、客户端资源、ICNS、Electron 架构，以及 `better-sqlite3` 和 `sharp` 的 Mach-O arm64 原生模块。
- `pnpm verify:desktop:runtime:mac` 在已生成包的 Mac 主机上挂载 DMG、复制到临时独立目录，启动两次并通过本地 `/api/health` 与 `/api/worlds` 验证服务、SQLite 写入和重启恢复；测试目录保留供排查，不触碰用户数据。
- 本地 Mac 构建写入 `aiNovelLocalBuild` 包元数据。这类包不自动访问公开更新通道，避免把尚未发布的 `latest-mac.yml` 当成网络故障。
- Windows 默认命令和发布命令保持 Windows x64 语义。NSIS 模板处理只允许在 `--win` 目标执行。
- Windows 测试安装包沿用上述原生构建边界，在 `desktop-windows-candidate.yml` 的 Windows runner 构建。专属 `codex/windows-installer-*` 分支推送或手动触发生成 NSIS 安装包，候选身份由源码提交 SHA 标识；不通过改版本或公开 tag 冒充正式发布。
- 候选构建设置 `AI_NOVEL_LOCAL_DESKTOP_BUILD=true`，使生成包的 `aiNovelLocalBuild` 元数据关闭公开自动更新。运行时数据目录、应用身份和版本源沿用现有桌面能力。用户配置、数据库和小说内容不属于构建输入。
- 候选 workflow 仅有 `contents: read` 权限，保留通过检查的安装包、SHA-256 校验值与来源信息到短期 Actions artifact。只上传明确的产物白名单，不上传整个 staging、工作区或数据目录；生成测试安装包不调用公开发布脚本。
- 安装验证失败时可保留安装器用于诊断，来源信息必须携带实际 `installerSmokeOutcome` 和 `readyForAcceptance=false`，不能把 artifact 存在视为可验收。只有构建、结构验证成功且安装验证确实执行后才允许准备产物；上传以准备步骤成功为前提。
- 持续构建环境中 electron-builder 会推断默认发布模式，不能只依赖候选分支名称或没有令牌。包装入口对本地构建显式强制 `--publish never`，并在启动构建前拒绝冲突或重复的发布参数；正式发布调用继续沿用原有令牌校验。
- macOS 的最后窗口关闭后应用进程可以继续存活；用户从 Dock 再次激活应用时，应复用已经运行的本地服务并重新创建主窗口。
- macOS 打包时，宿主 Node 与 Electron 使用不同的原生 ABI：构建包装器先把 staging 中的 `better-sqlite3` 重建为当前 Electron arm64 ABI，electron-builder 在 Mac 目标关闭自动重建，并在签名前把该绑定写入 app bundle；打包结束后再恢复宿主 Node 的绑定。不要把 Electron ABI 的 staging 原生模块直接留给宿主 Node 测试使用。

## Verification

每个平台至少验证以下三层：

1. 类型检查和各 workspace 构建成功。
2. 安装包结构完整，且原生文件属于目标平台与目标架构。
3. 从安装介质复制到独立目录后能够启动本地服务、创建或打开 SQLite 数据库、加载 renderer，并在正常退出后再次启动。

本地运行验收优先使用 `pnpm verify:desktop:runtime:mac`。脚本按每次启动前的日志偏移解析新的健康端口，避免把前一次已关闭服务的端口当作当前实例；它不包含真实模型调用，也不替代首次配置、世界生成和 Dock 点击的人工验收。

Windows 安装验证同样按每次启动前的日志字节偏移读取新增记录；首次安装与重装后启动都必须各自产生窗口显示和后台健康信息，不能用第一次启动的日志证明第二次成功。验证失败时结束该次测试进程，避免影响后续卸载或 runner 退出。

真实 LLM 工作流验证还需要有效的模型连接。没有模型时，桌面构建验收只确认首次配置引导和本地服务，不应伪造世界观生成成功。

## Failure Modes

- Mac 打包出现 `ELF`、`PE32` 或 `x86_64` 原生模块：检查是否复用了 Linux、Windows 或 Intel Mac 的 staging/依赖目录，清理构建产物后在目标平台重新安装并重建。
- Mac 打包器进入 NSIS 模板逻辑：检查构建包装器是否只在参数包含 `--win` 时处理 NSIS。
- 本地 Mac 包启动后自动更新返回 `latest-mac.yml` 404：检查最终 `app.asar/package.json` 是否包含 `aiNovelLocalBuild: true`。
- DMG 可生成但复制后的应用无法启动：先检查深度签名，再检查 Electron、`.node` 和随包动态库是否均为 arm64。
- Dock 点击不能恢复窗口：检查 `activate` 是否重新创建窗口并复用已保存的本地服务端口。
- Mac 运行验收第二次启动连接到旧端口：检查验收脚本是否从本次启动的日志偏移读取健康记录，不要直接复用历史日志中的端口。
- 打包后 Node 测试出现 `NODE_MODULE_VERSION 133/137` 冲突：说明宿主 Node 与 Electron 原生模块被同一份 staging 依赖覆盖。重新使用 Mac 构建包装器完成 staging 重建和宿主依赖恢复，不要手工把包内 `.node` 文件复制回 workspace。

## Related Modules

- `desktop/electron-builder.config.cjs`：各平台目标、图标、产物和包元数据。
- `desktop/scripts/run-electron-builder.cjs`：平台构建入口及 Windows 专用兼容处理。
- `desktop/scripts/verify-desktop-package.cjs`：跨平台安装包结构与原生架构验证。
- `desktop/scripts/verify-desktop-runtime-mac.cjs`：DMG 独立复制、首次启动、本地 API、SQLite 持久化和重启恢复验收。
- `desktop/src/main.ts`：窗口生命周期、本地服务和更新器初始化。
- [桌面版本号与发布标识规则](./desktop-release-versioning.md)
