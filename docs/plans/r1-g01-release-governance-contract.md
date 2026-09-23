# R1-G01：桌面发布治理与平台候选证据拆分合同

## Backlog Refinement 结论

- Release / Epic：Release 1 / R1-RC 桌面发布候选。
- 父项：`R1-G01` beta 组合验证与公开发布治理；父项不重复计点，也不作为一张混合实现卡进入 Sprint。
- 当前状态：Refinement 已完成；`R1-G01a` 满足 DoR 并进入 R1-S3E，当前 In Review、待 beta 集成复核；`R1-G01b` 满足 DoR、保持 Ready，须等待 G01a 合入 beta 后经后续 Planning；`R1-G01c` 为 PO 范围决定且已完成。
- PO 支持决定：Release 1 桌面候选只覆盖 **Windows x64 与 macOS arm64**。macOS x64 不属于 Release 1 支持范围，不新增 builder target、原生模块、runtime 或 UI 验收。
- 当前静态发布门为 `PASS=10 / BLOCKED=1 / REVIEW=1`：`PUBLIC-RELEASE-TRIGGER` 已 PASS；macOS CI 仍 BLOCKED，arm64-only 范围提示仍 REVIEW。静态合同不等于实际 GitHub Actions 运行证据。

选择两种已存在的目标架构，是为了先完成可验证的单机成书候选，而不是同时扩建第三套桌面架构。若未来要求 macOS x64，必须另立 Story、重新估点并独立验证，不能塞入以下卡片。

## R1-G01a 公开 Release 严格标签发布门（3 点）

- 状态 / Owner / 依赖：In Review；优先级 P0；当前 R1-S3E 的 Luna xhigh 发布 workflow owner；依赖 R1-03 与既有桌面版本/标签规则。
- 用户价值：只有与桌面版本完全一致的正式标签才能进入公开发布，手动验证或旧标签不会误上传安装包。
- 文件边界：独占 `.github/workflows/desktop-release.yml`、`scripts/release/r1-03-static-gate-audit.cjs` 与聚焦测试 `scripts/release/r1-g01a-release-trigger.test.cjs`；不得新增其他 workflow，不得改 `desktop/package.json`、builder、签名逻辑或发布脚本。R1-03 与 R1-RC02 的历史 owner 不占用这三个文件，当前 Story 只有这一名实现 owner。

### 验收条件

1. 公开上传 job 只接受 push tag `vX.Y.Z`，并在上传前确认 `X.Y.Z` 与 `desktop/package.json.version` 完全一致。
2. `desktop-v*` 不得进入公开上传。任何保留的 `workflow_dispatch` 或非匹配 tag 只能运行无上传验证，不能调用 `publish:desktop:release*`、更新 GitHub Release 或获得上传所需写权限。
3. 静态审计能够区分安全验证触发与公开上传触发；严格模式不再因公开触发规则返回 `BLOCKED`。
4. 验收只读取 workflow 和脚本，不创建、推送或删除 tag，不运行包装、签名、公证或上传。

### 最窄验证与非范围

- 验证：`node --check scripts/release/r1-03-static-gate-audit.cjs`；`node --test scripts/release/r1-g01a-release-trigger.test.cjs` 定向断言实际 guard 与 workflow 接线，至少覆盖匹配 `v${desktop.package.version}`、版本不符的严格标签、`desktop-v*`、手动触发及 `v1.2.3-rc1`；再运行 `node scripts/release/r1-03-static-gate-audit.cjs --strict`。若另一项 macOS workflow 阻断仍存在，必须按 finding ID 证明本卡只关闭 `PUBLIC-RELEASE-TRIGGER`，不能要求整条严格命令退出 0。
- 非范围：版本 bump、公开上传实操、签名、公证、beta 发布语义、macOS 候选 job、macOS x64。

## R1-G01b macOS arm64 候选包装 CI 证据（5 点）

- 状态 / Owner / 依赖：Ready；R1-RC02 桌面发布 owner；依赖 R1-03、已完成的 R1-G01c 支持范围决定，并须在 R1-G01a 合并后实施。
- 用户价值：macOS arm64 候选拥有不可由 Windows 结果替代的 CI 包装证据，并可与同一候选 SHA 对账。
- 文件边界：独占 `.github/workflows/desktop-release.yml` 与 `scripts/release/r1-03-static-gate-audit.cjs`，复用既有 macOS arm64 脚本；不得修改 beta workflow 或新增 workflow。R1-03 状态与共享计划由根集成人更新。

### 验收条件

1. 增加受控的 macOS arm64 候选 job，固定 `macos-*` runner，对与 Windows 候选相同的 SHA 执行迁移检查及 `verify:desktop-package:mac` 所需链路。
2. job 明确使用 arm64 产物和原生模块检查，不以 Windows 产物替代，也不声称覆盖 macOS x64。
3. macOS 候选 job 不调用任何 `publish:desktop:*`、GitHub Release 更新、签名或公证步骤；产物只作为候选验证证据。
4. 静态审计验证 runner、arm64 包装命令、同 SHA 候选边界和无 publish 合同；严格模式不再因 `MACOS-WORKFLOW` 返回 `BLOCKED`。
5. 静态检查只证明 workflow 合同。实际 macOS workflow 成功记录必须在 R1-RC 候选阶段按该 SHA 留证，不能由本卡的文本检查替代。

### 最窄验证与非范围

- 验证：`node --check scripts/release/r1-03-static-gate-audit.cjs`；workflow 定向断言；`node scripts/release/r1-03-static-gate-audit.cjs --strict`。若 G01a 尚未完成，按 finding ID 证明本卡只关闭 `MACOS-WORKFLOW`。
- 非范围：DMG/ZIP 公开上传、签名、公证、macOS x64、真实用户安装验收、业务 runtime/UI 修改。

## R1-G01c Release 1 macOS 支持范围冻结（1 点）

- 状态 / Owner：Done；PO / 根集成人。
- 用户价值：用户和验收者可以准确区分支持的平台架构，不会把 arm64 候选误写成全部 macOS。
- 决定：支持矩阵、候选发布说明和验收证据只使用“Windows x64”和“macOS arm64”；macOS x64 明确为 Release 1 不支持且无验收入口。
- 验收：本合同、Roadmap 与 R1-03 矩阵口径一致；R1-G01b 的 CI target 与决定一致；`git diff --check` 通过。
- 非范围：任何 macOS x64 实现、签名、公证、包装或上传。

## 依赖与进入 Sprint 规则

```text
R1-03 已建立验证矩阵
  ├─ R1-G01c 支持范围决定（Done，1 点）
  └─ R1-G01a 严格公开标签门（In Review，3 点）
       └─ R1-G01b macOS arm64 候选 CI（Ready，5 点）
```

- 当前 R1-S3E 只承诺 G01a 3 点。G01b 必须等 G01a 合入 beta 后再经 Planning 选择；G01c 的范围决定已完成，不重复计入本 Sprint。
- 一个 Agent 同时只持有一张 Story；两个实现卡都编辑同一 workflow 与静态审计器，必须先完成 G01a 再开始 G01b，不能并发覆盖。
- 任一卡完成都不能单独宣称 Release 1 可发布。包装运行、平台 UI、备份恢复、整本主链与 beta→main 晋级仍受 R1-RC01～04 和 R1-03 的独立门约束。

## 文档与发布记录判断

G01a 改变的是公开发布的内部触发门，尚未产生用户可用的新安装包或应用行为，因此本阶段不更新 README 或 release notes。实际标签、GitHub Actions 运行与安装包验收仍留在后续候选阶段。当前两 job 审计边界服务于 G01a；G01b 增加只读 macOS 候选 job 时必须同步扩展审计与测试。此处没有新增稳定的产品运行时/架构知识，Wiki 暂不更新。
