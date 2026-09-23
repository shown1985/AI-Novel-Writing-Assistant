# 桌面版本号与发布标识规则

## Background

桌面客户端有三处会暴露版本信息：界面顶部的当前版本、Electron 打包产物的应用版本、GitHub Release 的发布 tag。如果这些信息分别维护，用户截图、安装包文件名和自动更新判断会很容易出现不一致。

## Current Rule

- `desktop/package.json` 的 `version` 是桌面客户端唯一版本源。
- 前端网页开发态从 Vite 注入的 `VITE_APP_VERSION` 读取该版本，桌面运行态优先读取 Electron runtime 提供的 `appVersion`。
- 正式发布 tag 必须是 `vX.Y.Z`，并且 `X.Y.Z` 必须等于 `desktop/package.json` 的 `version`。
- 公开 workflow 先由只读验证 job 读取该版本并比较 push tag；只有验证输出放行时，Windows 发布 job 才取得 `contents: write`。`desktop-v*`、手动或不匹配的 tag 都不能进入上传。
- macOS arm64 候选 job 与 Windows 发布 job 使用同一触发 SHA，但只读地构建和验证候选包，不取得发布 token、不调用 GitHub Release 更新。候选 job 的静态合同通过不代表真实 Actions 成功；同一有效 tag 仍会触发 Windows 发布链，不能为“试跑 macOS”擅自推送 tag。
- 不在 UI、README 或发布脚本中硬编码另一个客户端版本号。
- GitHub 桌面发布 workflow 必须使用 Node 24 运行时和 Node 24 代际的官方 action，不再依赖 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 去强制旧 Node 20 action。
- 桌面更新状态以 Electron runtime 投影为唯一事实来源；工作区顶部入口、更新弹窗、启动页和系统设置只负责以不同密度展示同一份状态，不各自推断更新结果。
- 工作区顶部版本号是日常更新入口。发现新版本、下载中或等待重启时，入口必须直接显示对应状态；系统设置保留完整详情，但不能作为唯一入口。
- 面向用户的更新状态、错误说明和操作按钮使用中文；底层错误详情写入桌面日志，不把英文异常原文直接暴露给用户。

## Release Steps

1. 发新版桌面包前，先运行 `pnpm release:desktop:bump X.Y.Z` 更新 `desktop/package.json`。
2. 更新用户可见 release notes 和 README 最新更新，说明该版本面向用户的变化。
3. 合入 `main` 后运行 `node scripts/trigger-desktop-release.cjs --dry-run`，确认工作区、分支和 tag 规则都通过。
4. 只使用与 `desktop/package.json` 对齐的 `vX.Y.Z` tag 触发正式 GitHub Release。

## Failure Modes

- 如果界面顶部显示版本和安装包文件名不一致，先检查打包所用 commit 的 `desktop/package.json`，不要在前端组件里补一个临时版本。
- 如果 GitHub Release tag 已存在，不能复用同一个版本重新上传；应继续 bump 到新的 `X.Y.Z`。
- 如果发版前只更新 release notes 但没有 bump 桌面版本，自动更新链路会把新包识别成旧版本，必须先修正版本源再发布。
- 如果 GitHub Actions 提示某个 action 仍在使用 Node 20，应优先升级该 action 的 major 版本，而不是重新加入强制运行时环境变量。
- 如果静态审计为 PASS 但缺少 macOS runner 架构、同 SHA 或 DMG/ZIP 成功日志，发布候选仍未验收；回到候选阶段补真实日志和平台安装证据，不以 workflow 文本替代。

## Related Modules

- `client/vite.config.ts`：把桌面版本注入网页开发态和普通前端构建。
- `client/src/lib/constants.ts`：统一导出前端可用的 `APP_VERSION`。
- `client/src/components/layout/desktopUpdaterPresentation.ts`：统一更新状态、安装形态和通道的用户文案。
- `client/src/components/layout/DesktopUpdatePanel.tsx`：供顶部弹窗与系统设置复用的更新操作面板。
- `desktop/src/main.ts`：桌面运行态把 Electron `app.getVersion()` 注入 renderer。
- `desktop/src/runtime/updater.ts`：检查、下载和安装状态的事实来源。
- `scripts/bump-desktop-version.cjs` 与 `scripts/trigger-desktop-release.cjs`：版本推进与正式发布 tag 校验。
- `.github/workflows/desktop-release.yml` 与 `scripts/release/r1-03-static-gate-audit.cjs`：公开标签预检、唯一发布写权限、只读 macOS 候选与静态门。
