# R1-S3E Sprint 承诺：桌面公开发布标签门

## Sprint Goal 与承诺

只有与 `desktop/package.json` 版本完全一致的正式 `vX.Y.Z` push tag 能进入公开桌面上传；旧标签和手动触发不能上传。

- Release / Epic：Release 1 / R1-RC 桌面发布候选。
- 基线：`beta@7023b3ed`；R1-S3D 已完成 `2/2`，R1-03 验证矩阵已 Done。
- 承诺：仅 [R1-G01a 公开 Release 严格标签发布门](./r1-g01-release-governance-contract.md)，3 点；Stretch：无。Story Ready，完成 `0/3`。
- 容量：3 点。R1-G01b 虽为 Ready，但与本卡共享 workflow/审计脚本且依赖本卡合并，未进入本 Sprint。S3-02b3a～e 均保持 Refinement / Not Ready。

## Owner 与文件边界

- 根 PM/PO：Sprint/Story 状态、范围裁决、共享 `TASK.md`、Roadmap、R1-03 矩阵、Wiki 与发布记录、阶段提交和 beta 集成。
- Luna xhigh 全栈工程师：唯一实现 owner，只编辑 `.github/workflows/desktop-release.yml`、`scripts/release/r1-03-static-gate-audit.cjs` 与 `scripts/release/r1-g01a-release-trigger.test.cjs`。R1-03/R1-RC02 的历史 owner 不并占当前文件；不编辑版本、builder、发布脚本、beta workflow 或其他 workflow。
- Terra medium Scrum Master：检查单卡 3 点承诺、依赖、文件边界和非范围；Terra medium QA/QC：独立审阅触发条件、上传前版本匹配、静态审计 finding 与负例。
- 一个 Agent 同时只持有本卡。后续 G01b 必须在本卡合入 `beta` 后重新 Planning，不能顺手加入 macOS job。

## 验收与退出门

1. 公开上传 job 仅在 push tag 精确符合 `vX.Y.Z`，且标签版本与 `desktop/package.json.version` 完全相等时可执行上传；版本不符在上传前停止。
2. `desktop-v*`、手动触发、非严格 `v*` 标签均不能调用 `publish:desktop:release*`、更新 GitHub Release 或获得用于上传的写权限。若保留手动入口，只允许无上传验证。
3. `PUBLIC-RELEASE-TRIGGER` 的静态审计需检查实际触发与 job/上传前置条件，不能仅因 YAML 含有 `v*` 字样而 PASS。聚焦测试固定在 `scripts/release/r1-g01a-release-trigger.test.cjs`，对真实 guard 和 workflow 接线断言：匹配 `v${desktop.package.version}` 可放行，`desktop-v*`、手动触发、`v1.2.3-rc1` 与版本不符的严格标签不可上传。
4. 最窄检查：`node --check scripts/release/r1-03-static-gate-audit.cjs`、`node --test scripts/release/r1-g01a-release-trigger.test.cjs` 与 `node scripts/release/r1-03-static-gate-audit.cjs --strict`。本卡应把 `PUBLIC-RELEASE-TRIGGER` 改为 PASS；`MACOS-WORKFLOW` 仍 BLOCKED 时严格命令预期退出码为 `2`，不得据此否定本卡或伪报整条 Release gate 已通过。
5. Terra medium QA/QC 独立 PASS，`git diff --check` 通过；根 PM 明确 Wiki 与用户可见发布记录判断，完成 scoped 阶段提交并在 `beta` 检查同一静态合同。没有产品 UI 变更，UI 验收不适用。

## 非范围

- 不创建/推送 tag，不执行包装、签名、公证或公开上传。
- 不实现 G01b macOS arm64 CI、macOS x64 支持、beta 发布语义、版本 bump 或新发布功能。
- 不修改 Release 2、业务 runtime、数据库或来源页；不把静态合同 PASS 当作真实 GitHub Actions 运行证据。

## Review 与 Retrospective 出口

完成时记录 Sprint Goal 结果、承诺/完成点数、carryover、发现的误判与最多两项流程改进。G01a Done 只关闭公开标签触发 finding；R1-G01b、平台包装、两平台 UI 与 RC 候选仍有各自退出门。
