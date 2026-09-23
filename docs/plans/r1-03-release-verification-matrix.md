# R1-03：Release 1 验证矩阵

## Story 合同

- Release / Sprint：Release 1 / R1-S0。
- Story：R1-03 Release 1 验证矩阵（3 点）。
- 用户价值：Windows、macOS 和本机网页使用同一组可追溯发布门，避免用 typecheck、单阶段测试或单个平台成功替代完整成书验收。
- 范围：平台、loopback、SQLite 空库与升级、十章主链、失败恢复、TXT 导出、桌面包装和发布触发门；区分自动化、用户 UI 验收和真实模型验收。
- 非范围：修复生产缺陷或迁移历史、实现 R1-02 fixture、运行用户数据库迁移、调用付费模型、签名/公证、上传安装包或晋级 beta/main。
- 基线：`codex/r1-s0-release-readiness@ec19dde7`，已包含 `origin/main@e3545c1f`（`v0.4.25`）及 R1-00～02。
- Owner / 文件边界：R1-03 验证 owner 独占本文与 `scripts/release/r1-03-static-gate-audit.cjs`；R1-02 owner 独占十章 fixture；R1-RC01 数据升级 owner 独占升级/备份 fixture；R1-RC02 桌面发布 owner 独占包装与工作流。

## beta 组合验证状态

- R1-S2G beta 组合验证：PASS。权威合并提交为 `eaa8cce8`，双亲 `32b2e9c7` / `21c7642e`，merge tree 一致；shared/server/client build/typecheck PASS，服务端 8 文件 `45/45`、client `3/3`，合计 `48/48`；验证前后工作树均 clean。Computer Use 证据复用既有 Sprint/Story 合同。
- Release 1 尚未完成。R1-03 当前静态状态为 `PASS=11 / REVIEW=1`：G01a 严格标签门与 G01b macOS arm64 候选 workflow 合同均已通过本地审计及聚焦测试。PO 已决定 Release 1 只支持 Windows x64 与 macOS arm64、不支持 macOS x64，但审计器仍未消费该口径以关闭 `REVIEW`。真实 GitHub Actions、macOS 包装与安装证据尚未执行。

## 证据类型与判定

| 类型 | 能证明什么 | 不能替代什么 |
| --- | --- | --- |
| 自动化 | 固定输入下的结构、行为、失败、重试和恢复合同 | 用户能否在真实 UI 找到入口并完成操作 |
| 用户 UI 验收 | 指定平台上的安装、导航、来源页恢复、导出和重开体验 | 并发、幂等、迁移完整性或模型语义质量 |
| 真实模型验收 | 经授权供应商、固定模型与预算下的实际生成质量和失败表现 | 确定性回归；单次成功不能证明恢复或无重复写入 |
| 包装/平台 | 安装产物、原生依赖、迁移文件、数据目录和重开行为 | 公开上传、签名、公证或另一操作系统 |

每次证据必须记录：Git SHA、操作系统/架构、Node 与 pnpm 版本、完整命令、退出码、开始/结束时间和日志路径。fixture 还要记录 fixture ID/hash、数据库副本路径、前后关键计数；安装包记录 `desktop/package.json` 版本、文件名和 SHA-256。未执行、失败、仅人工口述或缺日志均不得写为通过。

## Release 1 总矩阵

状态含义：`可执行` 表示已有命令但不代表当前通过；`待接入` 表示 owner 产物尚未进入矩阵；`用户验收` 和 `需授权` 不得由自动化代签；`阻断` 表示当前不能晋级 Release Candidate。

| 门 ID | 场景与最低行为 | 平台 | 证据类型 | 当前入口 / 最窄命令 | Owner | 当前状态 | 失败处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1-P01 | 服务端、Vite、桌面 API 默认仅 `127.0.0.1`；LAN、wildcard、私网 host 和非回环 CORS 在迁移/worker 前拒绝 | 共通 + 本机网页 | 自动化 | `pnpm --filter @ai-novel/server build`；`node --test server/tests/serverRuntimeBoundary.test.js server/tests/databaseConfig.test.js server/tests/imageStorage.test.js`；`pnpm --filter @ai-novel/client typecheck`；`node --experimental-strip-types --test client/tests/runtimeBoundary.test.js client/src/lib/constants.test.mjs` | R1-01 / 平台 owner | 可执行；R1-01 已留证 | 任一失败即停止启动/包装；回到 R1-01，不以账号或宽松 CORS 绕过 |
| R1-D01 | 空 SQLite 从零按序应用全部迁移，最终 schema、索引、完整性和外键一致 | 共通 | 自动化 | 先构建 server；`node --test server/tests/prismaMigrationCompleteness.test.js` | R1-MIG01 / R1-RC01 数据升级 owner | **R1-MIG01 已通过**：空库走真实运行时迁移入口并记录全部迁移 | 任一回归即阻断；禁止 reset、删用户库或忽略失败 |
| R1-D02 | 支持的历史 SQLite 副本自动升级；部分满足、pending record 和重启均不丢作品/章节/世界/任务 | 桌面共通 | 自动化 | 先构建 server；`node --test server/tests/runtimeMigrations.test.js`；完整历史版本 fixture 仍由 R1-RC01 owner 接入 | R1-RC01 数据升级 owner | **部分**：宽迁移、六个细分迁移、部分 schema 与 pending record 共 10 项已通过；正式支持版本清单/完整关键计数 fixture 待 R1-RC01 | 在隔离临时目录复制历史库；原件只读；失败停止启动写入并保留副本与日志 |
| R1-D03 | 升级前生成具体备份并校验存在/大小；故障后恢复副本，关键计数和引用一致 | Windows x64 / macOS arm64 | 自动化 + 平台 | 由 R1-RC01 owner 提供 owned fixture/命令；未接入前不得通过 | R1-RC01 数据升级 owner | 待接入，阻断 R1-RC01 | 不得对用户库演练；无已验证备份不得执行破坏性恢复 |
| R1-C01 | 固定想法和已验收导演产物进入真实 pipeline/executor，连续保存 10 章；每章顺序、正文、任务状态和来源路由可核对 | 共通 | 自动化 mock | 先构建 shared/server；`node --test server/tests/r1FirstBookTenChapterBaseline.test.js` | R1-02 fixture owner / R1-RC03 产品验收 owner | **可执行且 R1-S0 已通过 2/2**；公共 idea→导演交接与真实资产生成器不在此证据内 | 失败留存临时 SQLite、任务快照和 mock 调用账本；按首个错误阶段开缺陷 Story |
| R1-C02 | 局部质量债按 completion-first 继续；明确 `replan_required` 才停；quality-first 的 `pause_for_manual` 保持等待显式恢复 | 共通 | 自动化 mock | 长链：`node --test server/tests/r1FirstBookTenChapterBaseline.test.js`；分层：先构建 server，再运行 `server/tests/novelProduction/reliabilityBaseline.test.js` 与 `server/tests/novelDirectorAutoExecutionRuntime.test.js` | 章节生产 / 导演 owner | 十章 fixture 已证明第 8 章 `defer_and_continue` 后完成第 10 章；其他策略分层检查仍可执行 | 若误停整书或后台清除人工暂停，阻断主链；不得把 warning 改写成成功 |
| R1-R01 | 一次中断发生在已保存正文之后；恢复从 durable checkpoint 继续，不重复已完成章节、不覆盖正文、不由旧 lease 写终态 | 共通 | 自动化 mock | 长链：`node --test server/tests/r1FirstBookTenChapterBaseline.test.js`；分层：先构建 server，再运行恢复聚焦测试 | 恢复 owner / R1-RC03 | 十章 fixture 已证明第 6 章显式恢复且前五章哈希不变；并发 lease 仍由分层测试覆盖 | 保留失败任务与 checkpoint；来源页显式恢复；禁止从“运行记录”写状态 |
| R1-R02 | Windows/macOS 关闭应用后重开，回到正确作品/来源页；保存章、质量债和待人工恢复状态仍在 | Windows x64 / macOS arm64 | 用户 UI + 包装 | 使用候选安装包按下文 UI 清单执行 | 用户 / R1-RC02 | 用户验收，未执行 | 记录平台、步骤、截图/日志和数据目录；失败阻断对应平台，不用另一平台结果代替 |
| R1-E01 | TXT 导出严格按 1～10 章排序，标题/正文完整；无重复、无缺章、UTF-8 可打开 | 共通 | 自动化 mock | 十章：`node --test server/tests/r1FirstBookTenChapterBaseline.test.js`；服务层补充：先构建 server，再运行 `server/tests/novelExportService.test.js` | R1-02 / 导出 owner | **可执行且 R1-S0 已通过**；系统编辑器打开仍属 R1-E02 用户验收 | 缺章/乱序/空正文即失败；保留导出文件 hash 与期望章节清单 |
| R1-E02 | 用户从作品来源页下载整本 TXT，并在系统编辑器打开核对首尾章 | Windows x64 / macOS arm64 / 本机网页 | 用户 UI | 使用同一 R1-02 fixture，按下文 UI 清单执行 | 用户 / R1-RC03 | 用户验收，未执行 | 入口不可见、下载失败或内容不完整均阻断；不以服务层单测替代 |
| R1-W01 | Windows x64 stage/package 含 server、renderer、Prisma client、全部 SQLite 迁移和 native module | Windows x64 | 包装自动化 | `pnpm verify:desktop-package` | R1-RC02 桌面发布 owner | 可执行，R1-S0 未运行 | 失败保留 stage/dist 日志；不执行 publish 脚本 |
| R1-W02 | NSIS 静默安装、首次启动、健康检查、快捷方式、卸载保留数据、重装和二次启动 | Windows x64 | 包装自动化 + 用户 UI | Windows 候选机：`pnpm verify:desktop:installer`，随后执行 UI 清单 | R1-RC02 / 用户 | 可执行，未运行 | 任一步失败阻断 Windows 候选；测试目录与用户真实数据分离 |
| R1-M01 | DMG/ZIP、app bundle、arm64 原生模块、Prisma/迁移布局有效 | macOS arm64 | 包装自动化 | `pnpm verify:desktop-package:mac` | R1-RC02 桌面发布 owner | 可执行，R1-S0 未运行 | 失败保留 dist 与架构检查；不签名、不公证、不上传 |
| R1-M02 | 从 DMG 复制 app，首次启动创建隔离世界，关闭后重开仍可读取 | macOS arm64 | 包装自动化 + 用户 UI | 在 R1-M01 成功后：`pnpm verify:desktop:runtime:mac`，随后执行 UI 清单 | R1-RC02 / 用户 | 可执行，未运行 | 任一步失败阻断 macOS arm64 候选；保留脚本输出的临时数据路径 |
| R1-G01 | beta 组合验证覆盖迁移与候选包装；公开发布只由与 `desktop/package.json` 完全匹配的 `vX.Y.Z` tag 触发 | Windows x64 / macOS arm64 | CI/发布治理 | 静态盘点：`node scripts/release/r1-03-static-gate-audit.cjs --strict`；G01a/G01b 聚焦 `node --test scripts/release/r1-g01a-release-trigger.test.cjs scripts/release/r1-g01b-macos-candidate.test.cjs` | R1-RC02 / 发布 owner | **静态合同通过、候选未验收**：`PUBLIC-RELEASE-TRIGGER` 与 `MACOS-WORKFLOW` PASS，聚焦 `11/11`；`MACOS-X64-SCOPE` REVIEW；实际 GitHub Actions 与平台候选未执行 | 按同一 SHA 留存 Windows/macOS Actions、包装与安装证据；R1-03 不运行 publish，不以静态检查替代候选证据 |
| R1-A01 | 候选安装包完成开书、十章、中断恢复、质量债、世界/角色更新、导出和重开 | Windows x64 / macOS arm64 | 用户 UI | 下文 UI 清单；每个平台独立签字 | 用户 / PO / R1-RC03 | 用户验收，未执行 | 任一平台失败回到来源 Story；未验收不得写 Release Done |
| R1-L01 | 授权的真实供应商按固定模型/参数/预算运行 R1-02 指定样本，保存每次 attempt、失败和人工质量记录 | 明确指定的平台 | 真实模型 | 命令与样本由 R1-02/S8-07 owner 提供；需单独授权、预算与测试作品 | PO / 模型验收 owner | 需授权；本 Story 禁止运行 | 未授权只表示“真实模型未验收”；不得用 mock 或历史生成结果冒充，也不得用单次成功替代确定性回归 |

## 平台覆盖

| 平台 | 自动化最低门 | 用户 UI 最低门 | 当前缺口 |
| --- | --- | --- | --- |
| 本机网页 | R1-P01、R1-C01/C02、R1-R01、R1-E01 | 开书、十章结果、来源页恢复、TXT 下载；确认无 LAN 使用说明 | 公共 idea→导演交接和浏览器 UI 未验收 |
| Windows x64 桌面 | 共通门 + R1-D01～03、R1-W01/W02 | 安装、首次配置、完整主链、关闭/重开、导出、卸载/重装数据保留 | 完整历史版本/备份恢复与候选包装/UI 未运行 |
| macOS arm64 桌面 | 共通门 + R1-D01～03、R1-M01/M02 | DMG 安装、首次配置、完整主链、关闭/重开、导出 | 完整历史版本/备份恢复待接入；公开 CI 无 macOS job；候选包装/UI 未运行 |
| macOS x64 | 不适用 | 不适用 | **Release 1 不支持**。当前无 builder target、runtime 或 UI 验收入口；候选说明不得泛称支持全部 macOS。未来若要支持，必须另建 Story 并重新估点/验收 |

## 用户 UI 验收清单

每个平台使用隔离测试数据目录和 R1-02 固定作品，逐项记录 `通过 / 失败 / 未执行`。运行记录仅用于查看和导航；恢复、重试、继续、replan 和采用必须在来源页执行。

1. 首次启动显示本机工作台，不要求账号；应用内链接和 API 均保持 loopback。
2. 从固定想法创建作品并进入自动导演，能看到当前阶段、保存成果和唯一推荐动作。
3. 连续十章完成后逐章抽查顺序、标题与正文；局部质量债以警告/待处理项显示，不能伪装为整书失败。
4. 在 R1-02 指定中断点关闭或终止测试进程；重开后从来源页恢复，既有正文不重复生成、不消失。
5. 执行固定世界或角色更新，刷新后仍可辨认来源、结果和待复核状态；不要求在运行记录中操作。
6. 下载整本 TXT，在系统文本编辑器核对第 1 章、第 10 章、顺序和 UTF-8 中文；记录文件名、大小与 SHA-256。
7. 关闭并重开应用，再次确认作品、十章正文、质量债和恢复状态；Windows 另执行卸载/重装保留数据，macOS 另执行 DMG 复制启动。

## 执行顺序与停止条件

```text
静态盘点/loopback
  → SQLite 空库迁移
  → 历史库升级 + 备份恢复
  → R1-02 mock 十章主链
  → 中断恢复 + 质量债 + TXT
  → Windows/macOS 候选包装
  → 两平台用户 UI 验收
  → 经授权的真实模型抽样
  → beta 组合验证
  → PO 晋级决定
```

- R1-D01～03、R1-C01、对应平台包装或用户验收失败时立即停止后续晋级；后续检查可以为诊断而运行，但不能冲掉失败结论。
- 真实模型验收与 mock 回归并列留证。没有授权时标记“未验收”，不能偷偷调用；授权后失败也不能靠重跑只保留成功样本。
- 包装检查不得调用 `publish:desktop:*`、`release:desktop:github` 或推送 tag。公开上传、签名和公证属于独立授权。
- 所有 SQLite 演练只针对临时副本；禁止 `prisma migrate reset`、删除用户库、覆盖原 fixture 或把用户真实数据目录指向测试命令。

## 当前已知阻断与解锁条件

| 阻断 | 证据 | 影响 | 解锁条件 |
| --- | --- | --- | --- |
| 公共 idea→导演准备交接缺少自动化长链 | R1-02 已固定想法与已验收导演产物，但明确不调用公共交接入口和真实资产生成器 | R1-RC03 的来源页 UI 验收与后续公共入口回归 | 用隔离作品验证来源页真实交接；不得把 R1-02 的固定产物证据扩大解释 |
| macOS 候选缺真实运行证据 | 公开 workflow 已有只读 arm64 候选 job，本地静态合同 PASS；尚无同 SHA Actions 成功日志、产物校验或安装证据 | macOS 候选组合证据、R1-G01/R1-RC02 | 在受控候选阶段留存真实 runner 架构、同 SHA 包装/验证日志与产物；不得用 Windows 或静态结果替代 |
| 静态审计尚未消费 macOS 支持决定 | PO 已冻结 Release 1 为 macOS arm64-only，但现行审计仍无条件输出 `MACOS-X64-SCOPE REVIEW` | R1-G01 关闭判断与候选说明一致性 | R1-G01 实现卡令审计器核对明确的 arm64-only 发布合同；不得为消除 REVIEW 新增 x64 范围 |
| TXT 用户打开证据未执行 | R1-02 已断言十章顺序、完整标题/正文和 UTF-8 content type，但未在系统编辑器中打开文件 | R1-E02、R1-A01 | 在每个平台从来源页下载并记录文件名、大小、SHA-256 与首尾章人工核对 |
| 真实模型无授权/预算 | R1-00 将 S8-07 标为 Not Ready，本 Story 禁止真实调用 | 只能声称 mock 回归，不能声称真实模型验收 | 固定模型/参数/样本/预算、测试作品与人工 rubric 获批后单独执行并保留所有 attempt |

## R1-03 自检命令

以下命令只读取源码与配置，不构建、不写数据库、不调用模型、不包装或上传：

```bash
node --check scripts/release/r1-03-static-gate-audit.cjs
node scripts/release/r1-03-static-gate-audit.cjs
git diff --check -- docs/plans/r1-03-release-verification-matrix.md scripts/release/r1-03-static-gate-audit.cjs
```

发布候选使用严格模式；当前因已知阻断返回退出码 `2` 是正确行为：

```bash
node scripts/release/r1-03-static-gate-audit.cjs --strict
```

R1-MIG01 已解除视觉资产双迁移历史的静态阻断；严格模式仍因公开发布触发和 macOS 工作流缺口返回 `2`。静态 PASS 只证明兼容保护与 fixture 存在，R1-D01/D02 的行为结论必须来自实际迁移测试。

R1-G01 已完成 [Backlog 拆分](./r1-g01-release-governance-contract.md)：G01a 已关闭严格公开标签静态门，G01b 已建立只读 macOS arm64 候选 workflow 静态合同，G01c 已冻结平台范围。三者均不替代真实 Actions、包装、安装与用户验收；不得把静态 PASS 写成 Release 1 已可发布。

## 文档与发布判断

- 本 Story 只建立 Release 验证合同和只读审计工具，没有改变用户行为，不更新 README 或 release notes。
- 矩阵是 R1-S0/R1-RC 的执行证据，不新增稳定架构决策；不更新 Wiki 或 Wiki 索引。若后续冻结支持平台、迁移恢复状态机或真实模型准入规则，再由对应 Story 更新 Wiki。
- 用户 UI、真实模型、包装、beta 组合和 PO 晋级均未在本 Story 执行；R1-03 完成只代表“发布门已明确且命令可核验”，不代表 Release 1 可发布。
