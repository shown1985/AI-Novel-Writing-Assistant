# R1-S3K Sprint 承诺：独立发行版发布指向与版本线

## Sprint Goal 与承诺

本发行版的公开发布只能使用自己的版本线（major ≥ 1），tag 只能推到 `fork`，已安装应用只从本发行版仓库检查更新；GA 前 fork 不产生任何公开 tag 或预发布。本窗口不改应用名称、appId 或数据目录，不产生新安装包。

- Release / Epic：Release 1 / R1-RC 桌面发布候选；规划基线 `beta@64d128a1`；PO 已于 2026-09-25 答复 [R1-G02](./r1-g02-fork-desktop-identity-contract.md) 全部开放问题（`R1-G02f` Done）。
- 承诺 [R1-G02a 独立版本线与 tag 碰撞门](./r1-g02-fork-desktop-identity-contract.md) 3 点加 [R1-G02b 发布与自动更新目标指向本发行版](./r1-g02-fork-desktop-identity-contract.md) 3 点，共 6 点，无 Stretch。
- 状态：**DoR 待执行**。两张卡为 Ready-candidate，进入 Sprint 前须取得独立 GPT-6 Scrum 与 QA DoR PASS；任一张未通过，本窗口不开工。
- 容量 6 点，与已知 velocity（S3G/S3H/S3J 各 5 点）相当，未超过 25 点上限。两张卡共同编辑 `desktop-release.yml` 与静态审计器，必须由同一名工程师严格按 **G02a → G02b** 顺序完成：先有 major 门，再切换有写权限的发布目标，避免上游 `v0.4.x` tag 在 fork 触发发布。G02a 未自检通过前不得开始 G02b，WIP 始终为 1。
- 首次独立 DoR（2026-09-25）未通过：G02a 缺少上游 remote 的判定方式与失败处理，G02b 的审计无法抵御后续上游同步的回退。合同已补齐，G02b 增量约 0.5 点，仍按 6 点承诺，待复核。
- G02c/d/e（身份拆分与旧数据复制）仍在 Refinement，不在本窗口。

## Owner 与退出门

- 一名 GPT-6 Luna xhigh 发布工程师依次独占两张卡合同列出的生产文件与测试文件：G02a 为 `desktop-release.yml` 的 validate guard、`scripts/trigger-desktop-release.cjs`、审计器 `FORK-VERSION-LINE`、新增 G02a 测试及 G01a 正例 fixture；G02b 为 builder 与 stage 脚本的 owner/repo 默认值、`desktop-release.yml` 的发布 env、`desktop-beta-release.yml`、审计器 `FORK-PUBLISH-TARGET` 与新增 G02b 测试。不得改 `desktop/package.json`、appId、productName、数据目录、`desktop/src`、`server/src` 或客户端。
- 根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki/发布记录判断、阶段提交、feature→beta 集成与 Review。
- GPT-6 Luna Medium QA/QC 独立核查：真实 workflow guard 对 `v0.4.28`、`v1.2.3`（fixture）、`desktop-v*`、`-rc1` 的输出；发布脚本（复制进临时仓库、配合本地 bare remote）按 fetch/push URL 判定上游并拒绝推送目标为上游、本地/目标/上游已有 tag、major 0，且在无上游 remote 或 `ls-remote` 失败时明确拒绝；G01a 第 74-92 行正例已迁到临时目录 fixture；四处 owner、上游 owner 白名单扫描、beta 禁用串与跨 workflow 写权限扫描的突变断言；Windows 发布 job 仍是唯一写权限 job；文件边界。Scrum Master 审查 WIP、DoR/DoD、范围与 Sprint Review。
- 固定最窄命令：`node --check` 改动脚本；`node --test scripts/release/r1-g01a-release-trigger.test.cjs scripts/release/r1-g01b-macos-candidate.test.cjs scripts/release/r1-g02a-fork-version-line.test.cjs scripts/release/r1-g02b-fork-publish-target.test.cjs`；`node scripts/release/r1-03-static-gate-audit.cjs --strict`。预期 `FORK-VERSION-LINE=REVIEW`（版本仍为 `0.4.28`）、`FORK-PUBLISH-TARGET=PASS`，既有 finding 不退化。
- 满足以下全部条件才能标 Done：工程师自检、固定命令 PASS、独立 QA/QC PASS、Wiki 决策（预计补充 [桌面版本号与发布标识规则](../wiki/workflows/desktop-release-versioning.md) 的 fork 版本线与发布目标规则）、UI 验收记为不适用、每张卡一次阶段提交、beta 快进后同一命令复核。

## 非范围

- 不改应用名称、appId、AUMID、数据目录、更新缓存目录或任何用户数据路径，不做旧数据复制（G02c/d/e）。
- 不把版本 bump 到 `1.0.0`，不创建、推送或删除任何 tag，不运行 `stage`/`dist`/包装、签名、公证或上传，不触发或依赖真实 GitHub Actions 运行。
- 不改应用内 GitHub 链接、官网或 `NOTICE`，不引入 Release 2。
- 出现以下任一情况时停回 Refinement 由 PO 拆分，不扩大范围：需要改 `desktop/src` 或 `server/src`、需要新增 workflow、需要真实网络或 Actions 才能验证，或工作量超过 6 点。

## Review 与 Retrospective 出口

Sprint 结束时记录目标是否达成、承诺/完成点数、carryover 与原因、返工/逸出缺陷、最多两项可执行改进；未完成不得以审计通过代替 Done。

（Review 待填写。）
