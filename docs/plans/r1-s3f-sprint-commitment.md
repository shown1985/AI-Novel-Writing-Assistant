# R1-S3F Sprint 承诺：macOS arm64 候选包装 CI 合同

## Sprint Goal 与承诺

公开桌面 workflow 的同一候选 SHA 同时拥有 Windows 发布链和只读的 macOS arm64 包装验证链；macOS 链不上传、不签名、不公证。

- Release / Epic：Release 1 / R1-RC 桌面发布候选。
- 基线：`beta@ab411deb`；R1-S3E 已完成 `3/3`，G01a 严格标签门在 beta 的本地静态与 guard 测试通过，`MACOS-WORKFLOW` 仍 BLOCKED。
- 承诺：仅 [R1-G01b macOS arm64 候选包装 CI 证据](./r1-g01-release-governance-contract.md)，5 点；Stretch：无。Story In Review，完成 `0/5`，待 beta 集成复核。
- 容量：5 点。S3-02b3a～e 生产卡仍在 Refinement / Not Ready，不进入本 Sprint。

## Owner 与文件边界

- 根 PM/PO：`TASK.md`、Roadmap、Sprint/Story 状态、R1-03 矩阵、Wiki/发布记录判断、阶段提交和 beta 集成。
- Luna xhigh 全栈工程师：唯一实现 owner，仅编辑 `.github/workflows/desktop-release.yml`、`scripts/release/r1-03-static-gate-audit.cjs`、既有 `scripts/release/r1-g01a-release-trigger.test.cjs` 与新增 `scripts/release/r1-g01b-macos-candidate.test.cjs`。旧 G01a 测试只允许把“两 job”反例更新为“额外未授权第四 job”反例，并保留原严格标签回归；G01a 历史 owner 不并占文件。不得编辑版本、builder、发布脚本、beta workflow、数据库或其他业务 runtime。
- Terra medium Scrum Master 复核承诺、依赖、文件边界；Terra medium QA/QC 独立验收 workflow 接线、arm64 候选证据与无发布副作用。

## 验收与退出门

1. 新增 `macos-15` arm64 runner 的候选 job，与 Windows 发布 job 处于同一 workflow/事件 SHA。候选 job 只使用默认 `actions/checkout`，不得覆盖 `ref` 或 `repository`；`needs: validate-release` 且完整 `if` 同时要求 `allowed == 'true'`、`push`、`tag`。加入 `uname -m` 等值 `arm64` 的运行时断言，供未来 Actions 日志证明真实架构。GitHub 官方 runner 说明列出 `macos-15` 为 arm64；实际运行尚待后续候选阶段。
2. macOS job 以 `contents: read` 执行安装依赖、桌面 stage、迁移检查、`dist:desktop:mac:reuse-stage` 与 `verify:desktop-package:mac:reuse-stage`；验证器必须检查 arm64 app/原生模块与 DMG/ZIP 产物。不用 Windows 产物替代。
3. macOS job 仅有 `contents: read`，不设置发布 token 或签名环境，不调用 `publish:desktop:*`、`gh release`、Release notes 更新、签名或公证；Windows `publish-release` 的 G01a 严格标签门及唯一写权限保持有效。
4. 静态审计从 G01a 的“两 job 白名单”扩为精确的“验证、Windows 发布、只读 macOS 候选三 job”合同；任何第四 job 仍 BLOCKED。按 job 检查 runner、完整 `needs/if`、默认同 SHA checkout、运行时 arm64 断言、迁移与 arm64 包装命令、只读权限及无发布副作用；`MACOS-WORKFLOW` 应 PASS，`PUBLIC-RELEASE-TRIGGER` 继续 PASS。G01a 旧测试只调整第三 job 反例的预期，新测试固定在 `scripts/release/r1-g01b-macos-candidate.test.cjs`，直接读取真实 workflow，覆盖去除/改写 runner、arm64 断言或包装参数、迁移、guard、checkout 默认 ref，以及加入写权限、发布命令、`gh release`、Release notes、签名/公证命令等负例。
5. 最窄检查：`node --check scripts/release/r1-03-static-gate-audit.cjs`；`node --test scripts/release/r1-g01a-release-trigger.test.cjs scripts/release/r1-g01b-macos-candidate.test.cjs`；`node scripts/release/r1-03-static-gate-audit.cjs --strict`；`git diff --check`。若仅 `MACOS-X64-SCOPE` 仍为 REVIEW，严格审计可退出 `0`，但不得以静态 PASS 代替真实 GitHub Actions 成功。独立 QA/QC PASS、UI 验收不适用、阶段提交与 beta 同一静态合同复核后才能 Done。

## 非范围

- 不创建/推送 tag，不运行公开上传、签名或公证；不把静态检查当作真实 macOS CI、安装或 UI 验收。
- 不支持 macOS x64，不新增 builder target、改版本、改发布脚本或调整 beta 发布语义；`MACOS-X64-SCOPE` REVIEW 的关闭需独立范围决定与审计证据，不以本卡冒领。
- 不修改 Release 2、业务 runtime、数据库、来源页或 AI backfill 生产流程。
- 不触发真实有效 tag 来“试跑” macOS job：同一有效 tag 也会触发既有 Windows 公开发布链。本卡“无发布”指 macOS 候选 job 及本次本地验证，不把完整 workflow 误称为无发布工作流。

## Review 与 Retrospective 出口

完成时记录 Sprint Goal 结果、承诺/完成点数、carryover、QA/QC 退回原因与最多两项流程改进。G01b Done 只关闭 macOS workflow 静态合同；R1-RC 候选 SHA 的实际 Actions 日志、平台包装和 UI 仍须独立验收。
