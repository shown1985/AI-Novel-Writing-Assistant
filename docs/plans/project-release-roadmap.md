# 项目 Roadmap：单机成书与多人协作

## 路线决策

项目按两个产品 Release 推进。这里的 `Release 1 / Release 2` 是产品范围里程碑，不是语义版本号；公开发布仍沿用日期标识，桌面安装包继续遵守其独立版本和标签规则。

| 产品里程碑 | 核心结果 | 权威存储 | 访问边界 |
| --- | --- | --- | --- |
| Release 1：单机成书版 | 新手在一台电脑上从想法完成、恢复并导出整本小说 | 本地 SQLite；Qdrant 只承载向量索引 | 默认仅桌面受控窗口或 `127.0.0.1`；无账号、无多人、不开 LAN |
| Release 2：多人协作版 | 管理员、MFA、分权账号和多人共同维护同一作品 | 阿里云 RDS MySQL 为中央事务主库；SQLite 保留个人本地作品 | 认证后 LAN/在线访问；工作区授权和资源隔离 |

选择这一顺序是为了先证明“一个完全不懂写作的人能在本机完成一本书”，再引入身份、云迁移、跨租户安全和实时协作。Release 2 不得反向阻塞 Release 1 的单机完成率。

## Release 1：单机成书版

### Release Goal

用户安装或启动应用后，不需要理解数据库、账号、团队、Prompt 或小说理论，即可在同一台设备完成开书、规划、连续写章、暂停恢复、维护世界和角色、处理质量问题并导出正文。

### 范围

- 本地桌面和本机浏览器使用 SQLite 保存事实数据；已有数据不被隐式上传。
- 自动导演、章节生产、质量债、恢复、世界维护、人物和写法资产形成单机闭环。
- AI Agent 协作是“作者与本机 AI 协作”，不是多人账号或远程团队。
- Windows/macOS 开发启动、升级兼容、备份恢复和安装包验证进入发布门。
- Release 1 桌面候选明确限定为 Windows x64 与 macOS arm64；macOS x64 不在本 Release 支持范围，若未来需要必须另立 Story 和验收入口。
- 默认只监听回环地址。需要 LAN、账号或多人访问时，进入 Release 2，不以宽松 CORS 代替认证。

### 非范围

- User、Owner、MFA、邀请、工作区成员、评论、在线状态或实时共编。
- RDS MySQL 主库、SQLite 云端双向同步、作品云迁移。
- 公网服务、微信扫码登录、组织计费和多租户运营。

### Sprint 列车

每个验收窗口建议 1～2 周，承诺容量不超过 25 点；表中超过 25 点的既有批次必须按其 A/B/C 窗口分别承诺，不能作为一个 Sprint 强塞。

| Sprint/窗口 | 目标 | Story 来源 | 退出门 |
| --- | --- | --- | --- |
| R1-S0 路线重整 | 重新核对上游现状、单机边界、验收基线和首个承诺 Backlog | `R1-00～04` | Backlog 可追溯，首个实施 Sprint 满足 DoR |
| R1-S1 配置与安全阅读 | 先解除 SQLite 升级阻断，再冻结被动诊断门、恢复阅读现场和世界归属安全 | `R1-MIG01`、`S1-00/04/05/06` | [15 点承诺窗口](./r1-s1-sprint-commitment.md)通过 |
| R1-S2 单书工作台 | 正文优先、一个推荐动作、模型来源可追溯 | `S2-01～04` 的细分卡；前两窗补齐 P0 配置/诊断 Backlog | S2A～S2F 已通过（S2F `8/8`）；R1-S2G 已完成 `8/8` 点：S2-04b4 与 S3-02b1 均 Done，不接 04c UI/API |
| R1-S3 可信世界 | 世界版本、评估来源、作者决定和历史可信 | `S3-00～06` 的细分卡 | S3-01、S3-02a、S3-02b1 已完成；S3-02b1 仅接 `updateWorld`/`updateAxioms` CAS，原 S3-02b 其余旧入口保持 Refinement |
| R1-S4 世界修改闭环 | 提案、差异、采用、复核和失败恢复在来源页闭环 | `S4-01～05` 的细分卡 | 保存和验证分离，刷新不重复采用 |
| R1-S5 本机委托与预算 | 任务范围、模型策略、总预算、保存暂停和同任务恢复 | Sprint 5～6 实施卡 | 取消/恢复/重试共用一份任务账本 |
| R1-S6 记忆与资产 | 本书记忆、人物/正文/规划修改、资产适配与来源保护 | Sprint 7 实施卡 | 已发布稿和作者保护内容不被覆盖 |
| R1-S7 单机长链 | 有限撤回、导航过渡、十章连续产出与故障恢复 | Sprint 8 实施卡 | 确定性回归与真实模型抽样分开留证 |
| R1-RC 发布候选 | 升级、数据恢复、桌面启动、安装包和第一本书验收 | `R1-RC01～04` | beta 组合验证后才可进入 main |

既有详细 Story 以[作者协作交互与 AI 能力 Sprint](./agent-collaboration-sprints.md)为准，不在本页重复计点。

### R1-S2G 已完成窗口

R1-S2G 是 Release 1 已完成实施 Sprint，承诺/完成 `8/8` 点、无 Stretch，规划基线为 `codex/r1-s2g-attribution-world-writes@32b2e9c7`。Sprint Review 与 Retrospective 已关闭；beta 组合验证已通过：合并提交 `eaa8cce8`（双亲 `32b2e9c7` / `21c7642e`，merge tree 一致），shared/server/client build/typecheck PASS，服务端 8 文件 `45/45`、client `3/3`，合计 `48/48`，验证前后工作树 clean，Computer Use 证据复用既有合同：

| Story | 点数 | 状态 | 当前范围 | 明确不带入 |
| --- | ---: | --- | --- | --- |
| [S2-04b4 首批身份归因与内部读投影](./s2-04b4-attribution-read-projection-contract.md) | 5 | Done | 自动导演完整 runtime frame、本书 `novel-world-generate`、章节 `ai-revision-preview` 三个显式 context；director frame 整体优先；内部 read service/tests；Terra 最终 PASS，shared/server build、三文件定向检查 `20/20`，无 UI | 公开 API/UI、shared/public DTO、schema/migration、S2-04c、其他入口/batch/旧记录回填 |
| [S3-02b1 世界编辑与公理保存 CAS 兼容](./s3-02b1-world-edit-axiom-cas-contract.md) | 3 | Done | `WorldService.updateWorld` 兼容 HTTP/API；既有 `updateAxioms` UI 显式 revision + 稳定 operationId；统一 CAS；Terra 代码级 PASS（maintenance/runtime/migration/service/route `25/25`、client CAS `3/3`，shared/server/client build/typecheck PASS）；Computer Use PASS，隔离路径保存/刷新、并发冲突与草稿保留、两条 committed operation、client retry harness `3/3` 均通过 | 普通编辑新 UI、原 S3-02b 父项其余旧写入口、提案/评估/同步/快照、schema/migration |

两张卡均已写明 DoR、AC、owner、非范围和最窄验证。R1-S2G 已完成 `8/8` 点并通过 beta 组合验证，但这不代表 Release 1 可发布；R1-03 仍为 `PASS=9 / BLOCKED=2 / REVIEW=1`，公开发布 workflow 触发规则与 macOS arm64 候选 workflow 仍待实现，arm64-only 范围决定尚待审计器消费。S2-04c、S3-03～06、原 S3-02b 父项其余旧世界入口、S4+ 均不因本窗口完成自动标为 Ready，也不启动或承诺下一 Story。

### R1-S2H 已完成窗口

R1-S2H 承诺并完成 [S2-04c1 实况模型来源只读显示](./s2-04c1-live-model-provenance-contract.md) 3 点、无 Stretch。Terra Computer Use 已在固定 mock 隔离场景通过：作者可看到预计 `openai/gpt-expected`、实际 adopted `deepseek/deepseek-chat`、首选失败与备用采用顺序详情、无 requestId/not_found/error 文案，并确认 A→B→C 切换不串线；未使用真实库或付费模型。`beta@8a76e079` 组合验证 PASS（shared/server build、client typecheck、server `5/5`、client `4/4`）。任务抽屉、运行记录、全局历史、按 task/novel 反查、schema/migration、S3 与 RC 不属于本窗口。完整 Review/Retrospective 见 [R1-S2H Sprint 承诺](./r1-s2h-sprint-commitment.md)。

原 S2-04c 父范围不重复计点；未进入 S2-04c1 的任务/历史展示保持 Refinement。R1-S2H 完成不代表 Release 1 或发布门完成，也不启动下一 Story。

### R1-S3A 已完成窗口

本窗口仅承诺并完成 [S3-03a1 本书世界实例内容版本](./s3-03a1-novel-world-content-revision-contract.md) `5/5` 点。旧作品兼容、四个既有实例写入口、双 schema/migration 和版本递增均通过隔离验证；`beta@f96386fd` 组合门 PASS。切片主读切换、双侧同步和其他世界旧入口仍属于后续卡。Review/Retrospective 见 [R1-S3A Sprint 承诺](./r1-s3a-sprint-commitment.md)。本窗口完成不代表 Release 1 或 PostgreSQL apply 发布门通过。

### R1-S3B 已完成窗口

本窗口仅承诺并完成 [S3-03a2 世界切片缓存与 Gateway 版本消费](./s3-03a2-world-slice-revision-consumption-contract.md) `5/5` 点、无 Stretch；`beta@67361baf` 的 shared/server build 和聚焦组合检查 `40/40` PASS。生成上下文只消费当前本书世界实例对应的切片，缓存刷新、legacy 兼容、模型失败或晚到结果均按 Story 合同处理。同步、其他旧写入口、shared/schema、UI 与 Release 2 均不属于本窗口；Review/Retrospective 见 [R1-S3B Sprint 承诺](./r1-s3b-sprint-commitment.md)。本窗口完成不代表 Release 1 或 PostgreSQL apply 发布门通过。

### R1-S3C 已完成窗口

本窗口仅承诺并完成 [S3-02b2 世界手册手动结构保存 CAS](./s3-02b2-world-structure-cas-contract.md) `5/5` 点、无 Stretch；[限时 Spike](./s3-02b2s-structure-save-feasibility-spike.md)、独立 DoR、代码级 QA/QC、`beta@d7df4af2` 组合验证与隔离 Chrome 来源页验收均通过。实际 UI 覆盖两视图成功保存、刷新持久化、409/未知结果草稿保留、显式重读和快照失败提示。实施仅限手动 `PUT /structure` 及两个既有编辑视图，AI backfill、其他世界旧入口和同步均不在本窗口。Review/Retrospective 见 [R1-S3C Sprint 承诺](./r1-s3c-sprint-commitment.md)；本窗口完成不代表 Release 1 完成。

### R1-S3D 已完成窗口

本窗口仅承诺并完成 [S3-02b3s AI 结构补全幂等与费用边界 Spike](./s3-02b3s-structure-backfill-idempotency-spike.md) `2/2` 点、无 Stretch，基线为 `beta@88e0e00d`。模型调用前 durable claim、生成结果与世界 revision/CAS 的绑定、响应丢失及未知调用恢复合同已冻结；mock 模型与隔离 SQLite seam proof 经 Terra QA/QC 独立通过。没有实现生产 backfill、schema/migration 或来源页新状态。S3-02b3a～e 及 S3-03b～06 继续保持 Refinement / Not Ready；Review/Retrospective 见 [R1-S3D Sprint 承诺](./r1-s3d-sprint-commitment.md)。

### R1-S3E 已完成窗口

本窗口只承诺并完成 [R1-G01a 公开 Release 严格标签发布门](./r1-g01-release-governance-contract.md) `3/3` 点、无 Stretch。严格标签与桌面版本等值、只读验证 job、唯一有写权限的发布 job、三种旁路负例均经独立 QA/QC 和 beta 静态复核；真实标签、包装和上传未执行。Review/Retrospective 见 [R1-S3E Sprint 承诺](./r1-s3e-sprint-commitment.md)。

### R1-S3F 已完成窗口

本窗口只承诺并完成 [R1-G01b macOS arm64 候选包装 CI 证据](./r1-g01-release-governance-contract.md) `5/5` 点、无 Stretch。新增同 SHA、只读、无上传的 macOS arm64 候选 job 并扩展静态审计；真实 Actions、公开上传或平台 UI 验收尚未执行。Review/Retrospective 见 [R1-S3F Sprint 承诺](./r1-s3f-sprint-commitment.md)。

### R1-S3G 已完成窗口

本窗口只承诺并完成 [S3-02b3a AI 世界结构补全持久 claim/result store](./s3-02b3a-backfill-store-contract.md) `5/5` 点、无 Stretch。双库增量 schema/migration 与 owned store 的隔离行为、独立 QA/QC 及 beta 复核均通过；现有 `/backfill`、模型、世界 CAS 和真实 PostgreSQL apply 尚未接入或执行。Review/Retrospective 见 [R1-S3G Sprint 承诺](./r1-s3g-sprint-commitment.md)。

### R1-S3H 已完成窗口

本窗口只承诺并完成 [S3-02b3b1 已持久化补全结果的 CAS 提交与回执](./s3-02b3b1-backfill-result-commit-contract.md) `5/5` 点、无 Stretch。result→World 原子提交、冲突保留、回执重放和无回执未知保护经独立 QA/QC 与 beta 隔离复核通过；模型→result 编排由后续 b3b2a/b 拆卡承担，HTTP/UI 与真实 PostgreSQL apply 仍在后续卡。Review/Retrospective 见 [R1-S3H Sprint 承诺](./r1-s3h-sprint-commitment.md)。

### R1-S3I 已完成窗口

本窗口只承诺并完成 [S3-02b3b2a 结构补全单次物理模型调用门](./s3-02b3b2a-backfill-single-attempt-prompt-contract.md) `3/3` 点、无 Stretch。显式单次模式将非流式结构化 Prompt 的物理 provider 调用限制为一次，流式入口拒绝该选项，普通 Prompt 恢复行为不变，经独立 QA/QC 通过；`S3-02b3b2b` 模型→持久 result 与 b3c/d/e 仍在 Refinement，现有 `/backfill` 尚无本保证。Review/Retrospective 见 [R1-S3I Sprint 承诺](./r1-s3i-sprint-commitment.md)。

### R1-S3J 已完成窗口

本窗口只承诺并完成 [S3-02b3b2b 结构补全从模型调用到持久结果的编排](./s3-02b3b2b-backfill-generation-orchestration-contract.md) `5/5` 点，无 Stretch。编排服务先持久 claim 并在调用前进入 `model_in_flight`，再发出一次物理模型调用；结果与基线 revision 绑定保存，或进入 `failed_terminal`/`model_unknown`。并发、重放与结果不明时只读回既有事实，不重调模型。零修复解析分类只在单次模式生效（PO 批准的一行边界修订）。经独立 QA/QC 复验通过。result→World 提交、snapshot/RAG、失败类别持久化与 b3c/d/e 仍在 Refinement，现有 `/backfill` 尚无本保证。Review/Retrospective 见 [R1-S3J Sprint 承诺](./r1-s3j-sprint-commitment.md)。

### R1-G01 发布治理 Backlog Refinement

[R1-G01 拆分合同](./r1-g01-release-governance-contract.md)已把混合父项拆成 `R1-G01a` 严格公开标签门 3 点、`R1-G01b` macOS arm64 候选 CI 5 点和 `R1-G01c` 支持范围决定 1 点。PO 已完成 G01c：Release 1 只支持 Windows x64 与 macOS arm64，不支持 macOS x64。G01a/G01b 已分别在 R1-S3E/F Done 并合入 beta；当前静态门为 `PASS=11 / REVIEW=1`，尚无真实 macOS Actions 或公开上传运行证据。

### R1-G02 独立发行版桌面身份 Backlog Refinement

[R1-G02 合同](./r1-g02-fork-desktop-identity-contract.md)规划独立发行版的桌面版本线与数据隔离。当前 appId、productName、数据目录和发布/更新 owner 均与上游相同：同时安装时两个应用共用同一份 SQLite，本发行版的自动更新也会拉取上游安装包。PO 于 2026-09-25 决定：显示名称 `Biz Novel Studio Next`（GA 前可改），appId `io.github.shown1985.biz-novel-studio-next`，数据目录 `biz-novel-studio-next`；版本从 major 1 起步，公开 tag 从 GA 的 `v1.0.0` 开始；旧数据经用户确认后先备份再复制，生成图片一并复制。`G02f` 决定 Done；`G02a` 版本线与碰撞门 3 点、`G02b` 发布/更新目标 4 点已在 R1-S3K Done；`G02g` 审计加固跟进约 2 点为 Refinement；`G02c` 身份拆分 5 点、`G02d` 旧数据复制引导 5 点、`G02e` 生成图片复制 2 点仍在 Refinement，须同批进入 beta。

### R1-S3K 已完成窗口

本窗口承诺并完成 [R1-G02a](./r1-g02-fork-desktop-identity-contract.md) 3 点加 R1-G02b 4 点，`7/7`，无 Stretch、无 carryover，经独立 QA/QC 通过。公开发布 guard 要求 major ≥ 1；发布脚本只向 `fork` 推送单个 tag，并拒绝与本地、`fork` 或上游已有 tag 碰撞；四处发布/更新 owner 指向本发行版；beta workflow 只验证不上传。审计 `FORK-VERSION-LINE=REVIEW`（版本仍为 0.x）、`FORK-PUBLISH-TARGET=PASS`，静态门 `PASS=12 / REVIEW=2`。未改身份字段或数据目录，未产生 tag、安装包或 Actions 运行。QA 跟进项登记为 `R1-G02g`（Refinement）。Review/Retrospective 见 [R1-S3K Sprint 承诺](./r1-s3k-sprint-commitment.md)。

### R1-S3L 已完成窗口

本窗口只承诺并完成 [S3-02b3c1 结构补全提交编排与失败原因持久化](./s3-02b3c-backfill-commit-orchestration-contract.md) `5/5` 点，无 Stretch、无 carryover，经独立 QA/QC 通过。生成结果在世界未变时恰好提交一次，冲突时保留结果；提交结果不明只按持久状态收敛。失败类别随状态转换持久化、白名单约束且不被覆盖，重启后可读。migration 只加一列，全新库与升级库结构一致。store 测试夹具按 PO 边界修订改为真实升级顺序。提交后 snapshot/RAG（c2）、HTTP 与 `/backfill` 接线（c3）、UI、真实 PostgreSQL apply 仍在 Refinement，现有 `/backfill` 尚无本保证。Review/Retrospective 见 [R1-S3L Sprint 承诺](./r1-s3l-sprint-commitment.md)。

### R1-S0 新增 Story

#### R1-00 上游实现与计划重对账（3 点）

- 用户价值：开发只补真正缺失的能力，不按过期计划重复建设。
- 状态/Owner/依赖：Done；根集成人；已同步并核对 `origin/main@e3545c1f`（v0.4.25）。
- 任务：逐卡核对最新 `main`；标记 `Done / Partial / Ready / Not Ready / Superseded`；链接代码和验证证据。
- AC：每张候选卡只有一个状态；已完成能力不重新估点；Partial 明确剩余验收；无证据不能标 Done。
- 检查：只读源码、测试、迁移和 UI 入口盘点；不写用户数据。
- 非范围：实现候选Story、修改用户库或重跑全部昂贵验证。
- 证据：[R1-00 实现与计划重对账](./r1-00-implementation-reconciliation.md)。

#### R1-01 单机运行与数据边界冻结（3 点）

- 用户价值：本机使用不因未来多人功能增加登录或联网负担。
- 状态/Owner/依赖：Done；根集成人；R1-00。
- 任务：冻结 loopback、SQLite、Qdrant、文件资产、备份和升级边界；默认关闭 LAN。
- AC：无账号仍只能从本机访问；个人数据零隐式上传；远程地址不能打开业务 API；Release 2 代码不能成为 R1 启动前置。
- 检查：启动配置矩阵、桌面托管服务和浏览器入口合同。
- 非范围：实现账号、MFA、MySQL或公网部署。
- 证据：[R1-01 单机运行与数据边界验收](./r1-01-local-runtime-data-boundary.md)。

#### R1-02 第一本书与十章连续创作基线（5 点）

- 用户价值：发布判断来自真实成书路径，而不是零散页面可打开。
- 状态/Owner/依赖：Done；R1-02 验收owner；R1-00与既有主链测试inventory。
- 任务：定义从想法开书、导演准备、连续十章、一次中断恢复、一次质量债、世界/角色更新到 TXT 导出的固定 fixture。
- AC：每阶段有事实源、预期状态、来源页动作和失败恢复；付费模型抽样与 mock 回归分开；正文零静默丢失。
- 检查：隔离临时 SQLite、mock 模型长链；真实模型运行需单独授权和预算。
- 非范围：本Story不修复发现的业务缺陷，不自动调用付费模型。
- 证据：[R1-02 第一本书与十章连续创作基线](./r1-02-first-book-ten-chapter-baseline.md)。

#### R1-03 Release 1 验证矩阵（3 点）

- 用户价值：Windows、macOS 和本机网页不会在发布时各自表现不同。
- 状态/Owner/依赖：Done；R1-03 验证owner；R1-00/01/02。
- 任务：形成平台×启动×升级×数据×创作主链矩阵；指定自动检查、用户 UI 验收和包装检查。
- AC：每个门有 owner、证据和失败处理；typecheck 不替代行为检查；用户未验收必须显式记录。
- 检查：矩阵审阅和命令可执行性核验。
- 非范围：执行公开包装上传、签名、公证或Release晋级。
- 证据：[R1-03 Release 1 验证矩阵](./r1-03-release-verification-matrix.md)。

#### R1-04 首个实施 Sprint 承诺（2 点）

- 用户价值：团队一次完成少量高价值结果，不同时启动全部路线。
- 状态/Owner/依赖：Done；PO/根集成人；R1-00～03。
- 任务：从重对账后的 Ready 卡中选择不超过 25 点；冻结 Goal、owner、依赖、共享文件和验收顺序。
- AC：每个 Agent 同时最多一张 In Progress Story；共享文件单 owner；未满足 DoR 的卡不能承诺；Stretch 不计承诺容量。
- 检查：Sprint Planning 记录和依赖图。
- 非范围：提前实现被选Story或把Release 2卡换入当前Sprint。
- 证据：[R1-S1 Sprint 承诺](./r1-s1-sprint-commitment.md)；15 点、无 Stretch，包含独立迁移阻断 Story 与四张 Ready 卡。

### R1-RC 发布候选 Story

#### R1-RC01 SQLite 升级、备份与恢复验收（5 点）

- 用户价值：升级桌面版后原有小说仍完整，异常时能从备份恢复。
- 状态/Owner/依赖：Backlog；数据升级owner；R1-S1～7候选完成。
- 任务：覆盖当前支持的历史schema、自动增量升级、升级前备份、失败回退和恢复校验。
- AC：用户库零reset/删除；升级前产生具体备份并校验存在与大小；失败不继续启动写入；作品、章节、世界和任务关键计数一致。
- 检查：历史fixture副本升级与恢复演练；不使用用户真实库。
- 非范围：未经授权升级用户真实数据库或清理旧备份。

#### R1-RC02 Windows/macOS 启动与包装候选（5 点）

- 用户价值：安装后可以直接打开本地工作台，开发模式与正式安装包边界清楚。
- 状态/Owner/依赖：Backlog；桌面发布owner；R1-01/03与候选代码冻结。
- 任务：开发启动、托管服务、端口、回环绑定、首次配置、关闭/重开、升级路径和平台包装矩阵。
- AC：安装包不暴露LAN；前后端版本匹配；应用重开复用正确数据目录；包装产物通过既有平台检查；失败有可理解日志。
- 检查：平台相关构建/包装检查和用户桌面验收；公开上传另行授权。
- 非范围：启用LAN、多用户登录或自动发布GitHub Release。

#### R1-RC03 第一本书端到端验收（5 点）

- 用户价值：新手能够从一句想法走到可导出的连续正文。
- 状态/Owner/依赖：Backlog；产品验收owner；R1-S1～7、R1-RC01/02。
- 任务：执行固定第一本书/十章fixture，包含一次模型失败、一次恢复、一次局部质量债、一次世界或角色更新和最终TXT导出。
- AC：已保存正文不重复生成或丢失；局部质量债按策略继续；恢复回到正确来源页；导出顺序与内容完整；关键人工决定次数可记录。
- 检查：确定性mock长链必须通过；真实模型抽样需明确预算和授权。
- 非范围：用单次真实模型成功代替确定性回归或承诺整本质量分数。

#### R1-RC04 发布说明、支持边界与晋级决策（3 点）

- 用户价值：用户知道首个Release能做什么、如何备份恢复，以及哪些多人能力尚未开放。
- 状态/Owner/依赖：Backlog；PO/发布owner；R1-RC01～03。
- 任务：用户文档、已知限制、升级/备份指南、Release gate证据和beta→main决策记录。
- AC：不把Release 2能力写成已交付；README只保留最新日期摘要；完整历史进入release notes；未通过门有明确阻断和回退分支。
- 检查：链接、版本/日期、安装入口和发布范围审阅。
- 非范围：绕过beta验证晋级main或上传公开安装包。

### Release 1 退出门

- 新手主链可以在本机完成一本书，至少通过十章连续生产和中断恢复样本。
- 默认 loopback；未引入账号时不存在可从 LAN 读取作品或模型密钥的路径。
- SQLite 升级、备份和恢复演练通过，现有作品计数与引用一致。
- 自动导演和章节生产遵守 completion-first/quality-first 既有政策，局部质量债不误停整书。
- Windows/macOS 相关启动和包装检查通过；用户完成 UI 验收。
- feature → beta 的组合验证通过后才进入 main。

## Release 2：MySQL 与多人协作版

### Release Goal

首位管理员在安全初始化后创建不同权限账号；多位成员通过中心 MySQL 工作区共同维护作品，任何评论、建议、AI 任务、采用和实时编辑都能追溯人员、权限、版本和恢复位置。

### 前置原则

- Release 2 才引入账号、MFA、LAN/在线访问和中心 MySQL；不能把半成品登录门带入 Release 1。
- 阿里云 RDS MySQL 是中心协作事实源，不能直接替换桌面本地 SQLite，也不能通过复制 SQLite 文件实现多人同步。
- 当前基础系列实例只可用于隔离开发与迁移演练；生产前须通过高可用、TLS、日志备份、恢复演练和最小权限账号门。
- 选择 MySQL 后，中心服务长期只保留 MySQL 主路径；PostgreSQL 仅在迁移兼容期存在，不长期维护三套中心数据库。

### Sprint 列车

| Sprint/窗口 | 目标 | Story 来源 | 主要依赖 |
| --- | --- | --- | --- |
| R2-S0 MySQL 决策与运行底座 | provider、RDS生产基线和连接边界 | DB-00～02 | Release 1 数据边界稳定 |
| R2-S1 MySQL Schema 与兼容 | 长文本、索引、枚举、原生 SQL 和双库行为 | DB-03～06 | R2-S0 |
| R2-S2 认证基础 | 中央默认拒绝、身份模型和一次性初始化 | AUTH-00～03 | DB-04/06 |
| R2-S3 管理员与账号 | 密码、TOTP、会话、权限预设和用户管理 | AUTH-04～10 | R2-S2 |
| R2-S4 数据迁入与工作区 | 导出/导入、旧数据接管、Workspace、Membership、RBAC | DB-07～11、AUTH-11/12、C0 | R2-S1～3 |
| R2-S5 异步协作 | 评论、提及、建议、采用、活动与通知 | C1 | C0 与资源 revision |
| R2-S6 实时章节共编 | presence、实时网关、协作文档、AI patch 和离线降级 | C2 | C1；CRDT/OT Spike |
| R2-RC 多人发布候选 | 跨租户、安全、迁移、恢复和两设备长链 | 各计划发布门 | beta 隔离环境通过 |

详细拆分：

- [MySQL 中央主库存储计划](./mysql-primary-storage-sprints.md)
- [本地首次管理员、MFA 与账号权限](./local-auth-bootstrap-sprints.md)
- [真人多人协作](./human-collaboration-sprints.md)

### Release 2 退出门

- 生产 RDS 使用高可用配置、TLS、私网优先、日志备份和可验证恢复；应用使用独立最小权限数据库账号。
- 首位 Owner 只能通过宿主机一次性凭证完成初始化，并在密码、TOTP、恢复码完成后原子激活。
- 角色、工作区、资源、worker、SSE、附件、RAG 和导出均通过服务端授权矩阵。
- 本地作品只在用户明确选择、预检和备份后复制到中心工作区；失败不损坏原库。
- 两设备多人长链无静默覆盖、跨工作区泄露或重复采用；运行记录继续只读。
- 迁移、回滚、安全和灾难恢复演练通过后才允许晋级 main。

## 路线治理

- 当前只承诺 Release 1。Release 2 保持 Backlog/Refinement，除只读 Spike 外不抢占 Release 1 产能。
- 每个 Sprint 必须遵守[Agent 敏捷开发规范](../wiki/workflows/agent-agile-delivery.md)。
- 根 `TASK.md` 是当前看板；本页是发布路线；详细计划是 Story 权威来源；Wiki 只记录稳定规则。
- Roadmap 变更必须说明用户结果、依赖、被移入/移出的范围和 release gate 影响，不通过悄悄改 Story 非范围来扩张。
