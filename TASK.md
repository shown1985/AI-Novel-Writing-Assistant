# 当前项目看板：Release 1 单机成书版

更新时间：2026-09-25
集成分支：`beta`
当前里程碑：Release 1（单机成书版）
当前状态：R1-S3I 已完成 `S3-02b3b2a` 单次物理模型调用门 `3/3` 点，独立 QA/QC PASS，已合入 beta。此前 R1-S3E～S3H 均已完成并合入 beta。下一窗口 R1-S3J 已起草 `S3-02b3b2b` 模型→持久 result 编排合同（5 点），PO 已确认范围，独立 DoR PASS，实施中。HTTP 与 UI 接线继续 Refinement；Release 1 未完成。

## 权威文档

- 发布路线：[项目Roadmap](./docs/plans/project-release-roadmap.md)
- 敏捷规则：[Agent敏捷开发与交付规范](./docs/wiki/workflows/agent-agile-delivery.md)
- Release 1详细Backlog：[作者协作交互与AI能力Sprint](./docs/plans/agent-collaboration-sprints.md)
- Release 2数据底座：[MySQL中央主库存储计划](./docs/plans/mysql-primary-storage-sprints.md)
- Release 2认证：[本地首次管理员、MFA与账号权限](./docs/plans/local-auth-bootstrap-sprints.md)
- Release 2多人能力：[真人多人协作](./docs/plans/human-collaboration-sprints.md)

## 发布顺序

| 顺序 | 里程碑 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | Release 1：单机成书版 | Active | SQLite、本机回环、无需账号；优先完成整本创作、恢复和桌面发布 |
| 2 | Release 2：MySQL与多人协作版 | Backlog | MySQL中央主库、Owner+MFA、账号权限、工作区和多人协作 |

Release 2只允许做不抢占R1产能的只读Spike/Refinement。账号、LAN登录、MySQL迁移和协作入口不得以半成品进入Release 1。

## 已完成 Sprint：R1-S0

### Sprint Goal

以最新`main`为事实重新核对既有Story，冻结单机运行和数据边界，建立第一本书长链验收基线，并只承诺一个满足DoR的首轮实现窗口。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 结果 |
| --- | --- | --- | --- | --- |
| R1-00 上游实现与计划重对账 | 3 | Done | 根集成人 | [69张独立候选卡已按 v0.4.25 证据对账](./docs/plans/r1-00-implementation-reconciliation.md) |
| R1-01 单机运行与数据边界冻结 | 3 | Done | 根集成人 | [本机监听与本地数据边界已冻结并通过配置测试](./docs/plans/r1-01-local-runtime-data-boundary.md) |
| R1-02 第一本书与十章连续创作基线 | 5 | Done | R1-02 验收owner | [临时 SQLite 十章、恢复、质量债与 TXT 基线已通过](./docs/plans/r1-02-first-book-ten-chapter-baseline.md) |
| R1-03 Release 1验证矩阵 | 3 | Done | R1-03 验证owner | [平台、迁移、主链、包装与发布触发门已形成可执行矩阵](./docs/plans/r1-03-release-verification-matrix.md) |
| R1-04 首个实施Sprint承诺 | 2 | Done | PO/根集成人 | [15点、无Stretch的 R1-S1 已冻结](./docs/plans/r1-s1-sprint-commitment.md) |

承诺容量：16点。Stretch：无。

### R1-S0 Review

- 最新源码与所有Release 1候选Story完成证据对账。
- R1默认仅回环访问、SQLite本地事实源和零隐式上传成为稳定合同。
- 第一本书/十章长链fixture和平台验证矩阵可执行。
- 首个实施Sprint不超过25点，所有承诺卡满足DoR。
- Review与 Retrospective 见 [R1-S1 Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)；承诺/完成 `16/16` 点，无 carryover。

## 已完成 Sprint：R1-S1

### Sprint Goal

先解除 SQLite 升级阻断，再让作者获得可恢复的简易阅读现场和跨世界零误写；同时冻结诊断共享门与世界维护恢复合同。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 依赖 / 结果 |
| --- | ---: | --- | --- | --- |
| R1-MIG01 视觉资产双迁移历史兼容 | 5 | Done | 根数据集成人 | [空库、双历史、部分 schema 与 pending record 已通过](./docs/plans/r1-mig01-visual-asset-migration-compatibility.md) |
| S1-00 诊断共享接线与存储契约门 | 2 | Done | 根集成人 | [DTO、存储/CAS/迁移方案与兼容矩阵已冻结](./docs/plans/s1-00-diagnostics-contract.md) |
| S1-04 简易书架阅读现场恢复 | 3 | Done | 阅读体验 Agent | [代码级检查与隔离环境 Computer Use 五项交互验收均通过](./docs/plans/s1-04-simple-shelf-reading-resume.md) |
| S1-05 世界问题归属校验 | 2 | Done | 世界安全 Agent | [跨世界与不存在请求均零行写入](./docs/plans/s1-05-world-issue-ownership.md) |
| S1-06 世界维护与恢复契约 Spike | 3 | Done | 世界契约 Agent | [Runtime / Prompt / UI 合同已签认，不代表生产能力已实现](./docs/plans/s1-06-world-maintenance-recovery-contract.md) |

承诺容量：15 点。Stretch：无。权威合同见 [R1-S1 Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)。

R1-S1 当时的 Release 静态门：`PASS=9 / BLOCKED=2 / REVIEW=1`；迁移历史共存已由行为测试保护，当时的静态阻断为公开发布触发和 macOS 工作流。当前状态见 R1-S3E。

S1-05 聚焦证据：server build 通过，世界问题归属行为测试 6/6；S1-06 依赖已解除。

S1-00 聚焦证据：shared build、诊断合同测试 3/3、client typecheck 通过；S1-02a 已具备后续 Sprint 的 Ready 合同，S1-02b/03 仍等待实现依赖，三者均未进入本 Sprint。

S1-04 聚焦证据：阅读状态行为测试 8/8、简易创作治理回归 5/5、client typecheck 通过；隔离 SQLite 下的刷新、普通重进、跨作品隔离、浏览器前进/后退和暂停态阅读均通过 Computer Use 验收，浏览器无告警或错误。

S1-06 聚焦证据：世界维护门面、五类 revision、CAS/幂等、lease 恢复、旧数据、Prompt 与来源页边界完成三方签认；其静态 Prompt 版本登记前置门已由 S3-00 解除，S3-01 等待后续 Sprint Planning。

R1-S1 Review 与 Retrospective 见 [Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)：Sprint Goal 达成，承诺/完成 `15/15` 点，无 carryover；S1-04 五项 UI 验收通过，后续 UI 数值证据先锁定真实滚动容器。

## 已完成 Sprint：R1-S2A

### Sprint Goal

作者查看 AI 状态时不会产生模型调用，未配置参数采用可靠默认值；进入单书工作台后以正文为中心，切书、恢复和导演状态不会串书或误恢复。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 依赖 / 结果 |
| --- | ---: | --- | --- | --- |
| S1-01 缺省数值配置正确生效 | 3 | Done | 配置 Agent | [默认值、合法低值与零副作用 7 项行为检查通过](./docs/plans/s1-01-numeric-settings-defaults.md) |
| S1-02a 诊断读取、显式探测与持久化 | 3 | Done | 诊断 Agent + 根集成人 | [被动读取、显式探测、跨重启持久化与双库增量迁移通过](./docs/plans/s1-02a-diagnostic-readiness-backend.md) |
| S2-01a 单书查询与导演编排归属 | 5 | Done | 单书总控 Agent | [作品身份、暂停保持与零自动命令 36 项检查通过](./docs/plans/s2-01a-single-book-application-facade.md) |
| S2-02 专业章节辅助区域按需展开 | 3 | Done | 章节编辑 Agent + 根集成人 | [正文优先、按需模型调用、状态保持与隔离 Computer Use 验收通过](./docs/plans/s2-02-professional-chapter-assist-panels.md) |

承诺容量：14 点。Stretch：无。权威合同见 [R1-S2A Sprint 承诺](./docs/plans/r1-s2a-sprint-commitment.md)。

未承诺：S1-02b/03、S2-01b、S2-03a/03b、S2-04a/04b/04c。Ready 的 S2-04a 因容量顺延，其他卡保持依赖状态；本 Sprint 未在实现中顺手带入。

完成 `14/14` 点，无 Story carryover。Sprint Goal 部分达成：可靠默认值、单书状态隔离、正文优先和诊断后端均完成，知识库旧状态读取已被动化；模型设置页仍会自动调用旧 POST，须由下一窗口的 S1-02b 切换到被动 GET 后，才能宣称“查看 AI 状态零模型调用”在 UI 全面达成。

Review 与 Retrospective 见 [R1-S2A Sprint 承诺](./docs/plans/r1-s2a-sprint-commitment.md)。S2-02 已完成 Computer Use 验收；S1-02a 的 shared/server 构建与 32 项聚焦检查通过，测试数据库全部位于 `/tmp` 隔离目录。

## 已完成 Sprint：R1-S2B

### Sprint Goal

作者进入设置或知识库只读取已有诊断并主动决定何时检测；单书各阶段完成稳定展示装配，模型解析同步产出可信且脱敏的选择来源，为下一窗口的建议应用、推荐动作和实际调用展示解除依赖。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 依赖 / 验收边界 |
| --- | ---: | --- | --- | --- |
| S1-02b 设置与知识库诊断状态消费 | 3 | Done | 诊断 UI Agent；根集成人共享接线 | [自动 GET 零探测、显式 POST 防重与 Computer Use 验收通过](./docs/plans/s1-02b-diagnostic-readiness-ui.md) |
| S2-01b 阶段装配与页面组合收敛 | 3 | Done | 单书 Presentation Agent | [Hook 顺序、真实装配矩阵与模块边界 43 项回归通过](./docs/plans/s2-01b-single-book-presentation.md) |
| S2-04a 模型选择来源与有效参数合同 | 3 | Done | 模型平台 Agent；根集成人共享类型 | [字段级来源、调整厂商归因与脱敏投影 19 项聚焦检查通过](./docs/plans/s2-04a-model-selection-provenance.md) |

承诺容量：9 点。Stretch：无。权威合同见 [R1-S2B Sprint 承诺](./docs/plans/r1-s2b-sprint-commitment.md)。

未承诺：S1-03 已重新估为 5 点并返回 Refinement；S2-03a 的 01b 依赖已解除但仍须后续 Sprint Planning，03b 继续等待 03a；S2-04b 进入持久化合同 Refinement，04c 继续等待 04b。不得在本 Sprint 中顺手带入。

完成 `9/9` 点，无 Story carryover。Sprint Goal 达成：诊断页面自动读取与显式检测完成分离，单书阶段装配收敛，模型解析来源合同可提供脱敏证据。S1-02b 的 14 项行为检查、client typecheck 与隔离环境 Computer Use 通过；真实进入、刷新和焦点恢复只有 GET，模型路由与知识库双击各只有一次 POST，pending 轮询会在 lease 到期后停止。

Review 与 Retrospective 见 [R1-S2B Sprint 承诺](./docs/plans/r1-s2b-sprint-commitment.md)：承诺/完成 `9/9` 点，carryover 0，逸出缺陷 0；评审内发现的问题均在 Story Done 前关闭。

## 已完成 Sprint：R1-S2C

### Sprint Goal

冻结单书成果/进度/推荐动作与实际模型调用尝试的唯一事实合同，并消除世界 Prompt 静态版本漂移，让后续可见接线、调用证据持久化和可信世界 Prompt 拆分能够按明确边界实施。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 验收边界 |
| --- | ---: | --- | --- | --- |
| S2-03a0 单书展示事实与动作权威 Spike | 3 | Done | 单书 Contract Agent | [三层进度、身份、严重度、唯一动作源和降级矩阵已冻结](./docs/plans/s2-03a-single-book-display-authority-contract.md)；不改生产 UI |
| S2-04b0 实际模型调用尝试证据 Spike | 3 | Done | 模型平台 Contract Agent | [通用 store ADR、lineage、身份、失败降级与 8 项 seam proof 通过](./docs/plans/s2-04b-model-attempt-evidence-contract.md)；不改生产 schema |
| S3-00 世界 Prompt 静态登记一致性门 | 2 | Done | 根集成人 | [9 处声明对齐、全量 key 一致且唯一检查通过](./docs/plans/s3-00-world-prompt-registry-alignment.md) |

承诺容量：8 点。Stretch：无。权威合同见 [R1-S2C Sprint 承诺](./docs/plans/r1-s2c-sprint-commitment.md)。

未承诺：S2-03a 已由展示合同解锁为 Ready，03b 仍等待 03a 生产实现；S2-04b 已拆为 04b1～04b4，只有 04b1/04b2 Ready 且均未换入本 Sprint，04c 继续等待 04b4；S3-01 已解除静态版本门但未换入本 Sprint。不得把 Spike、静态登记修复或测试当作这些用户能力已交付。新发现的 `ComicFactService` inline Prompt 治理债进入后续 Refinement（未估点、未建 Story），不在本 Sprint 顺手扩围。

完成 `8/8` 点，无 Story carryover。Sprint Goal 达成：展示事实、实际模型 attempt 和世界 Prompt 静态版本三条后续生产边界均已冻结。S2-03a、S2-04b1、S2-04b2 与 S3-01 已分别解除对应前置门，但均须经过下一次 Sprint Planning 才能实施。

Review 与 Retrospective 见 [R1-S2C Sprint 承诺](./docs/plans/r1-s2c-sprint-commitment.md)：S2-04b0 server build 与 seam proof 8/8 通过；S3-00 全量静态门与相关 Prompt 测试通过；本窗口无生产 UI，UI 验收不适用。

## 已完成 Sprint：R1-S2D

### Sprint Goal

让单书页面形成可信的成果/进度/唯一推荐动作展示模型，同时建立真实模型 attempt 的双库持久底座并拆清 Prompt 执行边界，为来源页动作和真实 transport 接线解除依赖。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 验收边界 |
| --- | ---: | --- | --- | --- |
| S2-03a 单书成果、进度与推荐动作展示模型 | 3 | Done | 单书 Presentation owner | [21/21 行为回归与隔离环境 Computer Use 验收通过](./docs/plans/s2-03a-single-book-display-model.md)；桌面/移动、跨书隔离与零命令有证据 |
| S2-04b1 通用 attempt store 与 repository | 3 | Done | 根数据集成人 + 模型平台 owner | [双库增量迁移、真实 adapter、幂等/唯一 adopted、重启读取与脱敏证据通过](./docs/plans/s2-04b1-model-attempt-store.md)；不接 transport，UI 验收不适用 |
| S2-04b2 Prompt execution 边界拆分 | 3 | Done | Prompt 平台 owner | [facade 等价、三类 execution 边界与 57/57 有效回归通过](./docs/plans/s2-04b2-prompt-execution-boundaries.md)；核心文件 668 行，不接 attempt store，UI 验收不适用 |

承诺容量：9 点。Stretch：无。权威合同见 [R1-S2D Sprint 承诺](./docs/plans/r1-s2d-sprint-commitment.md)。

未承诺：S2-03b 等待 03a；S2-04b3 等待 04b1/04b2；04b4/04c 继续等待真实接线与读投影；S3-01 虽 Ready 但按 Release 顺序留在后续窗口。不得在前置卡完成后顺手扩入。

新发现的 `R1-PROMPT01` 结构化空响应 transport retry 基线缺陷进入 Refinement；它不在本 Sprint 承诺内，不并入 S2-04b2 纯拆分范围。

完成 `9/9` 点，无 Story carryover。Sprint Goal 达成：单书页面能区分已保存正文、本轮任务与全书目标，并只显示一个可信建议；通用 attempt store 与 Prompt execution owned 边界已建立。S2-03a 的桌面/400×800 移动视口、局部完成、失败保留、跨作品隔离和零导演命令均通过 Computer Use 验收。Review 与 Retrospective 见 [R1-S2D Sprint 承诺](./docs/plans/r1-s2d-sprint-commitment.md)。

下一 Planning 的 Ready 候选为 S2-03b、S2-04b3 与 S3-01；尚未承诺、尚未开始。`R1-PROMPT01` 继续留在 Refinement。

## 已完成 Sprint：R1-S2E

### Sprint Goal

让作者在单书来源现场安全执行唯一推荐动作，同时清理世界 Prompt 的能力边界，并恢复结构化模型调用对瞬态传输失败的既有重试保障。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 验收边界 |
| --- | ---: | --- | --- | --- |
| R1-PROMPT01 结构化调用瞬态传输失败重试 | 2 | Done | Prompt 平台 owner | [瞬态分类与 retry/空响应/取消回归通过](./docs/plans/r1-prompt01-structured-transport-retry.md)；不改策略 |
| S2-03b 来源现场推荐动作与反馈接线 | 3 | Done | 单书交互 owner | [41 项定向检查与隔离环境 Computer Use 通过](./docs/plans/s2-03b-source-action-feedback.md)；一次真实 POST、正式投影回读、运行记录只读 |
| S3-01 世界 Prompt 维护能力边界 | 3 | Done | 世界 Prompt owner | 14 个资产逐字等价迁移；33 行兼容门面、Registry loader 与消费合同通过 |

承诺容量：8 点。Stretch：无。权威合同见 [R1-S2E Sprint 承诺](./docs/plans/r1-s2e-sprint-commitment.md)。

完成 `8/8` 点，无 Story carryover。Sprint Goal 达成：来源页能按严格小说/任务身份执行唯一书级推荐动作，世界 Prompt 能力边界已收敛，结构化调用恢复瞬态传输重试。Review 与 Retrospective 见 [R1-S2E Sprint 承诺](./docs/plans/r1-s2e-sprint-commitment.md)。

未承诺：S2-04b3 的 transport retry 基线阻断已解除并回到 Ready，但只能进入下一次 Planning。04b4/04c、S3-02a/b 及 Release 2 均不顺手扩入。

## 已完成 Sprint：R1-S2F

### Sprint Goal

让真实模型调用的每次物理尝试可追溯，同时为世界内容写入建立原子、可重放的版本保护边界。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 验收边界 |
| --- | ---: | --- | --- | --- |
| S2-04b3 真实 transport attempt 接线 | 5 | Done | 模型平台 Agent | [生产 wiring 7/7；production wiring、repository、store、prototype 四套组合检查 25/25，最终 P1 已关闭](./docs/plans/s2-04b3-production-attempt-wiring-contract.md)；不做读 API/UI |
| S3-02a 世界样本安全提交边界 | 3 | Done | 世界 Runtime Agent + 根集成人共享数据合同 | [单文件 11/11；与 runtimeMigrations、prismaMigrationCompleteness 组成三套组合检查共 22/22，AC1-5、双 schema validate 与 SQLite 迁移通过](./docs/plans/s3-02a-world-sample-safe-commit-contract.md)；PostgreSQL apply 属 Release gate；不收敛全部旧写入口 |

承诺容量：8 点。Stretch：无。权威合同见 [R1-S2F Sprint 承诺](./docs/plans/r1-s2f-sprint-commitment.md)。

未承诺：S2-04b4/04c、S3-02b1（原 S3-02b 的最小拆分）进入下一次 Planning 队列；不在本 Sprint 或当前收尾中启动后续 Story。

R1-S2F Review 与 Retrospective：见 [R1-S2F Sprint 承诺](./docs/plans/r1-s2f-sprint-commitment.md#sprint-review)。两项均为内部运行时/数据底座能力，当前没有新增用户入口，因此不更新 README 或 release notes。

## 已完成 Sprint：R1-S2G

### Sprint Goal

让自动导演、本书世界生成和章节改稿预览的模型调用证据归属于明确的作品/任务上下文，并让普通世界字段与公理保存复用统一 CAS；不新增公开调用历史、不扩大世界旧写入口。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 验收边界 |
| --- | ---: | --- | --- | --- |
| S2-04b4 首批身份归因与内部读投影 | 5 | Done | 单一模型平台全栈 owner | [Terra 最终 PASS：shared/server build、三文件定向检查 20/20；无 UI](./docs/plans/s2-04b4-attribution-read-projection-contract.md)；三入口 attribution context、director 完整 frame 优先、内部 read service；`reconstructRequest=null` 仅 `not_found`，归因另用 `attributionStatus`；execution `evidenceStatus` 只透传真实 evidence；无 API/UI/schema/migration |
| S3-02b1 世界编辑与公理保存最小 CAS 兼容接线 | 3 | Done | 世界 Runtime 全栈 owner | [Computer Use PASS：隔离路径 `/tmp/ai-novel-qc-s3-runtime-20260920000000` 保存 revision 1→2 并刷新持久；并发合法写 2→3，旧页面得到 `CONTENT_REVISION_CONFLICT`，草稿保留、数据库保留较新内容，仅两条 committed operation；client retry harness 3/3；代码级检查 25/25、client CAS 3/3、shared/server/client build/typecheck PASS](./docs/plans/s3-02b1-world-edit-axiom-cas-contract.md)；无新迁移；原 S3-02b 其余入口留 Refinement |

承诺容量：8 点。Stretch：无。权威合同见 [R1-S2G Sprint 承诺](./docs/plans/r1-s2g-sprint-commitment.md)。规划提交后立即按单 owner 派发；根集成人保留共享计划、review、组合验证和阶段提交权，不夺取生产文件。

DoR 已满足，R1-S2G 已完成 `8/8`：S2-04b4 完成 5 点，S3-02b1 完成 3 点并通过真实来源页 UI QC；仅接两个既有保存路径，原 S3-02b 其余旧入口全部 Refinement/非范围。后续卡不因本次完成自动标 Ready。

## R1-S2G 退出前置

- S2-04b4 必须证明三入口显式归因、director 完整 frame 优先、并发隔离；`reconstructRequest=null` 只产生 `not_found`，持久 legacy/unattributed 使用 `attributionStatus=unattributed`，只有真实 execution evidence 才能出现 `evidenceStatus=missing`；不以 S2-04c UI 或其他入口覆盖率代替。
- S3-02b1 必须证明两个路径同一 CAS 门面、缺保护字段业务返回 428、revision/operation 冲突返回 409、公理保存显式 revision 与稳定 operationId 重试复用；不以新增普通编辑 UI 或 migration 代替。原 S3-02b 其余入口继续 Refinement。
- Sprint Review/Retrospective 已关闭：S2-04b4 与 S3-02b1 均 Done，R1-S2G 完成 `8/8`、carryover `0`。Computer Use PASS 证据见 Sprint 合同与 Story 合同；不启动或承诺下一 Story。

## R1-S2G beta 组合验证

- beta 合并提交：`eaa8cce8`，双亲为 `32b2e9c7` / `21c7642e`，merge tree 一致。
- Terra 权威验证：shared/server/client build/typecheck PASS；服务端 8 文件 `45/45`、client `3/3`，合计 `48/48`；验证前后工作树均 clean。Computer Use 证据复用既有 Sprint/Story 合同，不重复执行。
- R1-S2G beta 集成结论：PASS。该结论只关闭本 Sprint 的 beta 组合门，不代表 Release 1 完成，也不启动下一 Story。
- R1-S2G 当时的 R1-03 发布静态门为 `PASS=9 / BLOCKED=2 / REVIEW=1`；当时的待处理项为公开发布 workflow 触发规则、macOS arm64 候选 workflow，以及让审计器消费已冻结的 arm64-only 支持决定。当前状态见 R1-S3E。

## 已完成 Sprint：R1-S2H 实况模型来源可见

- Sprint Goal：作者在实况窗口中能看懂本次调用的预计选择、实际采用结果和备用链；读取不改变配置、任务或生成结果。
- 承诺/完成：`S2-04c1`，`3/3` 点；无 Stretch，Story 状态为 Done，无 carryover。Story 合同：[S2-04c1](./docs/plans/s2-04c1-live-model-provenance-contract.md)，Sprint 合同：[R1-S2H](./docs/plans/r1-s2h-sprint-commitment.md)。
- 范围：最小脱敏 GET、shared public DTO、`LlmLiveContext.requestId` 显式传播、`LiveExecutionDialog` 只读摘要/详情及行为测试。
- 非范围：Task Center、`NovelTaskDrawer`、全局历史或按 task/novel 反查、schema/migration、配置/任务写入、S3 与 RC。
- Owner：单一 GPT-5.6 Luna xhigh 全栈 Agent；根 Agent 负责 PO/Scrum/集成；实现完成后由 GPT-5.6 Terra medium 独立 QC。
- 证据：shared/server/client build/typecheck PASS；server 聚焦 `5/5`、client 最终 `4/4`，Terra QC 已修复预计文案 P1 并复验 PASS，`git diff --check` PASS。Terra Computer Use 在隔离路径 `/tmp/ai-novel-s2-04c1-ui-IwRF6R` 完成五场景：预计 `openai/gpt-expected`、实际 adopted `deepseek/deepseek-chat`、首选失败与备用采用顺序详情、无 requestId/not_found/error 文案、A→B→C 切换不串线。固定 mock 验收未使用真实库或付费模型；4174/API 4100 已停止，隔离路径已移入废纸篓。
- beta 集成：`8a76e079` 合并 S2H 与已冻结的 S3-03a 规划，无冲突；隔离 worktree 完成 shared/server build、client typecheck、server `5/5`、client `4/4`，集成门 PASS。安装依赖、生成 Prisma Client 与构建 SQLite 原生模块只用于该 worktree 验证，未迁移或修改业务数据库。

- Review：7 项 AC、自动化、脱敏/只读边界和五场景 Computer Use 均通过；本卡只交付 `LiveExecutionDialog`，未覆盖父范围的任务抽屉、运行记录和全局历史。
- Retrospective：承诺/完成 `3/3`，carryover `0`。改进：①为下一张 UI 验收卡预先固定可复现 mock 场景与清理路径；②在 Sprint 收口前集中核对“候选/待验收”文案，避免证据通过后残留旧状态。

## 已完成 Sprint：R1-S3A 本书世界实例版本基础

- Sprint Goal：旧作品继续按既有兼容路径读取；现有本书世界创建和显式替换拥有独立内容版本，缓存读取与世界库样本更新不误增版本。
- 承诺/完成：仅 `S3-03a1`，`5/5` 点、无 Stretch，状态 Done，无 carryover。Sprint 合同：[R1-S3A](./docs/plans/r1-s3a-sprint-commitment.md)，Story 合同：[S3-03a1](./docs/plans/s3-03a1-novel-world-content-revision-contract.md)。
- Owner：一位 Luna xhigh Runtime 全栈 Agent 负责四个现有实例写入口及聚焦测试，另一位 Luna xhigh 数据合同 Agent 独占双 schema、增量 migration 和迁移检查；根 PM 唯一集成审核，Terra medium QA/QC 分别负责验收与独立复核。
- 证据：双 schema 与增量 migration、四类旧数据、显式替换 `1→2→3`、重复 lazy 幂等、事务失败回滚、缓存/样本不误增均通过；`beta@f96386fd` 完成 shared/server build、Prisma generate 与定向检查 `17/17`，`git diff --check` PASS。无新 UI，UI 验收不适用；PostgreSQL apply 保留 Release gate。
- 非范围：S3-03a2 切片主读切换、S3-03b 同步、原 S3-02b 其余旧入口、真实用户库迁移、Release 2。
- Review：AC1～6、内部版本投影、公开 DTO 不扩张和非范围均由 Terra QA/QC 通过；本卡不宣称同步 pull 或旧切片已受实例版本保护。
- Retrospective：承诺/完成 `5/5`，carryover `0`。改进：① DoR 阶段先盘点所有真实写入口并明确阶段例外；②迁移与 Runtime 按不重叠文件并行，最终使用同一隔离 fixture 组合验证。

## 已完成 Sprint：R1-S3B 世界切片版本消费

- Sprint Goal：世界切片只对应当前本书世界实例版本；缓存刷新不计为内容修改，旧切片、失败或晚到模型结果不会进入生成上下文。
- 承诺/完成：仅 `S3-03a2`，`5/5` 点、无 Stretch，状态 Done，无 carryover。Sprint 合同：[R1-S3B](./docs/plans/r1-s3b-sprint-commitment.md)，Story 合同：[S3-03a2](./docs/plans/s3-03a2-world-slice-revision-consumption-contract.md)。
- Owner：单一 Luna xhigh Runtime 全栈 Agent 独占 Slice service、Gateway、内部 persistence 辅助模块与聚焦测试；根 PM 唯一集成，Terra medium QA/QC 独立验收。
- 退出门：唯一内部缓存指纹、四格 legacy 退出、无世界零写入、条件提交拒绝晚到结果、Gateway 五种 purpose 与失败保持均有隔离行为证据；shared/server build 和定向测试通过后才进入 beta 组合验证。
- 非范围：S3-03b 同步、原 S3-02b 旧入口、shared DTO/schema、数据库 migration、UI、模型策略、任务中心、Release 2 或新增安全体系。
- 证据：Terra QA/QC 对 AC1～7 与 overrides-only 边界 PASS；隔离 SQLite/聚焦回归与 Gateway 五用途通过；`beta@67361baf` 的 shared/server build、五文件定向检查 `40/40` 和 `git diff --check` PASS。无新增 UI，UI 验收不适用；真实 PostgreSQL apply 保留 Release gate。
- Review：Sprint Goal 达成；缓存指纹、四格 legacy、无世界零写入、晚到结果拒写、失败保留和当前实例消费均有行为证据；发布说明与长期 Wiki 已分别更新，不把同步或旧写入口误报为完成。
- Retrospective：承诺/完成 `5/5`，carryover `0`。返工：QA/QC 退回了未测的竞态/legacy 分支，并发现 overrides-only 解释冲突。改进：① Planning 时把边缘旧字段归类写进唯一矩阵；②首次交付测试直接按 AC 建立行为矩阵，避免“总数全绿但关键分支缺证据”。

## 已完成 Sprint：R1-S3C 世界结构保存版本保护

- Sprint Goal：两处既有世界结构编辑现场共用 CAS；冲突或结果未知不覆盖、不丢当前草稿，快照失败不误报内容未保存。
- 承诺/完成：仅 `S3-02b2`，`5/5` 点、无 Stretch，Story Done，无 carryover。Sprint 合同：[R1-S3C](./docs/plans/r1-s3c-sprint-commitment.md)，Story 合同：[S3-02b2](./docs/plans/s3-02b2-world-structure-cas-contract.md)。
- DoR：限时 Spike 已完成重放、快照和草稿边界，独立 Terra QA/QC 与 Scrum Master PASS；S1-06、S3-02a/b1 已 Done。
- Owner：单 Luna xhigh 全栈工程师负责 Runtime、客户端与定向测试；根 PM 串行接线共享 HTTP 文件、控制范围与 beta 集成；Terra medium QA/QC 独立验收。
- 退出门：AC1～6 的 428/409、重放、候选拒绝、快照三态与当前视图草稿已有行为证据；shared/server build、client typecheck、聚焦测试和 beta 组合验证通过。隔离 Chrome 实际验证两视图保存、刷新持久化、409 与未知结果保留草稿、显式重读及快照失败提示。
- 非范围：AI backfill、其他旧世界写入口、同步、评估/提案、跨视图草稿、schema/migration、Release 2 与新增安全体系。
- Review：Sprint Goal 达成；世界手册和高级结构维护均通过受保护的同一结构 PUT 保存。高级视图一次保存将 `contentRevision 3→4`，刷新后结构与兼容投影仍在；并发外部提交至 revision 5 后旧页面收到 409 且草稿保留，显式重读采用较新内容；服务端提交至 revision 6 后浏览器丢失响应时显示状态待确认并保留草稿，重读恢复已保存结果；快照失败投影显示“世界内容已保存，历史快照未完成”。
- Retrospective：承诺/完成 `5/5`，carryover `0`。改进：① UI 验收启动时直接使用隔离 SQLite 与独立浏览器 profile，并对常驻 SSE 使用有界 DOM 等待；② 独立快照失败由服务端行为测试证明保存事实、由浏览器响应注入验证提示投影，避免为制造故障改生产代码。

## 已完成 Sprint：R1-S3D AI 结构补全幂等边界 Spike

- Sprint Goal：冻结 backfill 在模型调用前、生成后 CAS 和响应丢失后的唯一恢复合同，使后续实现不会重复付费或覆盖作者较新的世界内容。
- 承诺/完成：仅 `S3-02b3s`，`2/2` 点、无 Stretch，Story Done、无 carryover。Sprint 合同：[R1-S3D](./docs/plans/r1-s3d-sprint-commitment.md)，Spike 合同：[S3-02b3s](./docs/plans/s3-02b3s-structure-backfill-idempotency-spike.md)。
- Owner：单一 Luna xhigh 全栈工程师负责只读主链审计与隔离 seam proof；根 PM/PO 冻结合同和集成；Terra medium Scrum Master 与 QA/QC 独立验收。
- 退出门：实际时序与持久事实、durable claim/request hash、生成结果与 revision 绑定、未知状态恢复表、隔离 seam proof、后续 ≤5 点 Story 拆分均有证据。
- 非范围：不实现生产 backfill、store/schema/migration、来源页新状态；不改单区块生成、手动 PUT、同步、评估、Prompt 内容/模型路由、任务中心或 Release 2。
- 验收：隔离 SQLite/mock seam proof 的 5 项场景经 Terra QA/QC 独立重跑通过；根 PM 在 2026-09-23 复跑 `5/5`，当前隔离证据位于 `/tmp/ai-novel-s3-02b3s-ln5wNF/`。稳定恢复边界已同步世界维护 Wiki；UI 验收不适用。生产 `/backfill` 仍无该保证。

## 已完成 Sprint：R1-S3E 桌面公开发布标签门

- Sprint Goal：只有版本匹配的严格 `vX.Y.Z` push tag 可进入公开桌面上传。
- 承诺/完成：仅 `R1-G01a`，`3/3` 点、无 Stretch、无 carryover，Story Done。[Sprint 合同](./docs/plans/r1-s3e-sprint-commitment.md)与 [Story 合同](./docs/plans/r1-g01-release-governance-contract.md)。
- Owner：单一 Luna xhigh 工程师负责 desktop release workflow 与静态审计器；根 PM 独占共享计划/矩阵/发布记录并负责 beta 集成；Terra medium Scrum Master、QA/QC 独立验收。
- 验收：严格标签与桌面版本相等才可上传；旧标签、手动和非严格标签均不能上传。静态 `PUBLIC-RELEASE-TRIGGER` 必须 PASS；macOS workflow 的剩余阻断属于 G01b，不在本卡。
- 非范围：不创建/推送标签，不运行包装/上传；不接 G01b、macOS x64、beta 发布语义或 AI backfill 生产卡。
- 独立 QA/QC：严格版本、旧标签、手动、预发行与版本不符拒绝；三种发布旁路突变被静态审计拒绝，聚焦测试 `8/8`。`PUBLIC-RELEASE-TRIGGER` 已 PASS；`MACOS-WORKFLOW` 仍 BLOCKED，不能将 Release 1 标为完成。
- beta 集成：`fe055cec` 快进合入；在 beta 复跑语法、聚焦 `8/8` 与严格审计，finding 保持 `PASS=10 / BLOCKED=1 / REVIEW=1`，工作树干净。UI 验收不适用；真实 GitHub Actions、标签、包装与上传均未执行。
- Review/Retrospective：Sprint Goal 在静态与本地 guard 范围内达成。QC 两次退回暴露了审计器对 OR 旁路、额外上传 job 的误判；修复后独立 QA/QC PASS。下次发布 workflow Story 在 Ready 阶段固定副作用 job 集合及反例，再交付实现，避免验收时补洞。

## Release 1 后续队列

1. R1-S1：配置、诊断、阅读恢复和世界归属安全（已完成，15/15 点）。
2. R1-S2：R1-S2A～S2H 已完成（S2H `3/3`）；S2-04c1 实况切片已 Done，父 S2-04c 的任务/历史展示范围仍在 Refinement。
3. R1-S3～4：可信世界、提案采用和失败复核；S3-01、S3-02a、S3-02b1、S3-02b2、S3-02b3s、S3-02b3a、S3-02b3b1、S3-03a1、S3-03a2 已完成。S3-02b3b2a 已于 R1-S3I 完成；原 S3-02b 其他旧入口、S3-02b3b2b/c/d/e 和 S3-03b～06 保持 Refinement/依赖状态。
4. R1-S5～6：本机Agent委托、预算、记忆和资产。
5. R1-S7：十章长链、有限撤回和导航收束。
6. R1-RC：桌面升级、备份恢复、包装与用户验收。

## 已完成 Sprint：R1-S3F macOS arm64 候选包装 CI 合同

- Sprint Goal：同一候选 SHA 拥有独立的 macOS arm64 只读包装验证链，不触发公开上传。
- 承诺/完成：仅 `R1-G01b`，`5/5` 点、无 Stretch、无 carryover，Story Done。[Sprint 合同](./docs/plans/r1-s3f-sprint-commitment.md)与 [Story 合同](./docs/plans/r1-g01-release-governance-contract.md)。
- Owner：单一 Luna xhigh 工程师负责桌面 workflow、静态审计器及聚焦测试；根 PM 独占共享计划/矩阵/发布记录与 beta 集成；Terra medium Scrum Master、QA/QC 独立验收。
- 验收：`MACOS-WORKFLOW` 静态 finding PASS 且 `PUBLIC-RELEASE-TRIGGER` 保持 PASS；macOS job 固定 arm64 runner、同 SHA、迁移及包装验证，只读无发布副作用。真实 Actions、平台包装与 UI 留在 RC 验收。
- 非范围：不创建/推送标签，不上传、签名或公证；不接 macOS x64、AI backfill 生产卡或 Release 2。
- 独立 QA/QC：同 SHA 默认 checkout、完整标签 guard、arm64 运行断言、迁移与 DMG/ZIP 包装验证链、无发布副作用及 G01a 回归均 PASS；聚焦测试 `11/11`。静态审计 `PASS=11 / REVIEW=1`、严格模式退出 `0`；真实 Actions 与安装验收未执行。
- beta 集成：`32d34dfb` 快进合入；在 beta 复跑语法、两组聚焦 `11/11` 与严格审计，finding 保持 `PASS=11 / REVIEW=1`，工作树干净。UI 验收不适用；未创建标签、运行真实 Actions、打包或上传。
- Review/Retrospective：Sprint Goal 在静态 workflow 合同范围内达成，`5/5`、无 carryover；独立 QA/QC 未退回。保留下一次候选验收的单一改进：必须按同一 SHA 留存真实 runner 架构、Windows/macOS 包装及安装证据，不能从静态 PASS 推断平台成功。

## 已完成 Sprint：R1-S3G AI 世界结构补全持久事实仓库

- Sprint Goal：一次结构补全拥有可跨连接和重启辨认的 claim、模型调用所有权及规范化结果事实，为后续恢复/提交接线奠基；本 Sprint 不改现有 `/backfill`。
- 承诺：仅 `S3-02b3a`，5 点、无 Stretch。[Sprint 合同](./docs/plans/r1-s3g-sprint-commitment.md)与 [Story 合同](./docs/plans/s3-02b3a-backfill-store-contract.md)；独立 Terra QA 与 Scrum Master DoR PASS。
- 承诺/完成：仅 `S3-02b3a`，`5/5` 点、无 Stretch、无 carryover，Story Done。首次 QA/QC 发现“结果已知不明仍须等 lease 到期”的 P1，已修正并独立复验通过。
- Owner：单一 GPT-6 Luna Max 工程师独占双 schema、双新增 migration 与 owned store/聚焦测试；根 PM/PO 独占共享计划/Wiki/发布记录和 beta 集成；独立 Scrum Master 复核规划，GPT-6 Luna Medium QA/QC 验收实现。
- 验收：双连接竞争只有一方获得模型调用权、lease 到期为 unknown 且不重开调用；request hash 与结果 digest 稳定拒绝不一致重放；隔离 SQLite 结果可重启读回且零世界内容写入；双 schema validate、双 migration 静态对称、server build、聚焦迁移测试、独立 QA/QC 与 beta 复核。
- 非范围：不接模型、HTTP、Prompt、世界 CAS、现有 `/backfill`、UI、PostgreSQL 真实 apply、Release 2 或其他世界维护入口；不得破坏用户数据库。UI 验收不适用。
- 独立 QA/QC：GPT-6 QA/QC 均 PASS；双 schema validate、隔离 SQLite 双连接与迁移行为、server build、三组聚焦 `21/21` 均通过。`16dc4a50` 快进 beta 后，beta 独立工作树重跑 Prisma generate、server build 与 `21/21` 均 PASS，工作树干净。真实 PostgreSQL apply 与现有 `/backfill` 接线未做。
- Review/Retrospective：Sprint Goal 在 store-only 范围达成，`5/5`、carryover `0`；P1 在本 Sprint 内发现并关闭，未流出。下一张 backfill runtime 卡必须明确区分“即时结果不明”和“lease 到期”两种来源，且不得把任一来源视为可再次付费调用的许可。

## 已完成 Sprint：R1-S3H AI 世界结构补全结果的 CAS 提交

- Sprint Goal：已生成结果只在原世界内容版本匹配时保存一次；内容冲突保留结果，响应丢失能读回同一回执。
- 承诺：仅 `S3-02b3b1`，5 点、无 Stretch。[Sprint 合同](./docs/plans/r1-s3h-sprint-commitment.md)与 [Story 合同](./docs/plans/s3-02b3b1-backfill-result-commit-contract.md)；独立 GPT-6 Scrum 与技术 QA DoR PASS。
- 承诺/完成：仅 `S3-02b3b1`，`5/5` 点、无 Stretch、无 carryover，Story Done。
- Owner：单一 GPT-6 Luna Max 工程师独占 backfill owned 模块、双 schema/双新增 migration 与聚焦测试；根 PM/PO 独占共享计划/Wiki/提交与 beta 集成；GPT-6 Luna Medium QA/QC 独立验收。
- 验收：原始 result/binding support 在归一化前校验引用；同 operation 双连接争提交只递增一次 revision、仅一份 backfill receipt；响应丢失/重启重放同 receipt/result；作者并发改世界零覆盖且保留结果；双 schema/migration 对称、隔离 SQLite 迁移与 server build。
- 非范围：不接现有 `/backfill`、模型/Prompt/attempt、HTTP 查询、UI、snapshot/RAG、手动 PUT、真实 PostgreSQL apply 或 Release 2。UI 验收不适用。
- 独立 QA/QC：GPT-6 QA/QC 均 PASS，原始悬空引用先校验、两个独立 SQLite 连接只提交一次、响应丢失同回执、作者改世界保留 result、无回执不假报成功及双 schema/migration 对称均有证据。`6ed64e31` 快进 beta 后，在 beta 独立工作树重跑 Prisma generate、server build 与合同四测 `31/31` PASS，工作树干净；真实 PostgreSQL apply 未执行。
- Review/Retrospective：Sprint Goal 在已持久 result→CAS/receipt 的内部范围达成，`5/5`、carryover `0`；没有漏到 beta 的 P0/P1。自测时双连接锁等待曾让落败方过早报未知，改成只读确认同 operation 持久回执并补无回执负例，独立 QA/QC 复验通过。下次模型接线卡保持“回执证明已保存、result 证明生成内容”两事实分离，不把内部门面误报为现有 `/backfill` 已受保护。

R1-RC 独立 Refinement：[R1-G01 发布治理拆分合同](./docs/plans/r1-g01-release-governance-contract.md)已冻结。`R1-G01a` 3 点、`R1-G01b` 5 点均 Done 并合入 beta，`R1-G01c` 1 点 PO 决定已 Done。Release 1 只支持 Windows x64 与 macOS arm64，不支持 macOS x64。当前静态门为 `PASS=11 / REVIEW=1`，不代表真实平台候选或 Release 1 已通过。

## 已完成 Sprint：R1-S3I 结构补全单次模型调用门

- Sprint Goal：为后续 AI 结构补全运行时提供显式的“最多一次物理供应商调用”模式，普通结构化 Prompt 保持既有行为。合同：[R1-S3I](./docs/plans/r1-s3i-sprint-commitment.md)。
- 承诺/完成：仅 [S3-02b3b2a](./docs/plans/s3-02b3b2a-backfill-single-attempt-prompt-contract.md)，`3/3` 点、无 Stretch、无 carryover，Story Done；独立 GPT-6 Scrum/QA DoR PASS，由单一 GPT-6 Luna Max 工程师实施。
- Owner：工程师独占 PromptRunner、structured execution/invoke、Prompt 执行选项和聚焦测试；根 PM/PO 独占共享计划/Wiki/发布记录与 beta 集成；GPT-6 Luna Medium QA/QC 独立验收。
- 退出门：真实 mock provider `stream()`/transport 物理调用计数覆盖成功、重试/修复/fallback 失败、stream 拒绝与普通 Prompt 回归；server build、定向测试、独立 QA/QC、阶段提交和 beta 复核。无新 UI，UI 验收不适用。
- 非范围：不接旧 `/backfill`、World/store/CAS/HTTP/UI、真实模型或数据库、Release 2。`S3-02b3b2b` 和 b3c/d/e 不顺手带入。
- 独立 QA/QC：PASS，无阻断；逐一移除传输重试、fallback、策略上限、修复、语义重试与流式拒绝任一守卫均被测试捕获，文件边界与默认行为未变。server build 与合同定向测试 `35/35` PASS，`git diff --check`、server `tsc --noEmit` 通过；beta 快进复核由根集成人执行。
- Review/Retrospective：Sprint Goal 在运行器内部范围达成，`3/3`、carryover `0`、返工/逸出缺陷 `0`。零修复下非 JSON 被归为 `schema_mismatch` 的分类问题并入 `S3-02b3b2b`，文本 Prompt 忽略单次选项记为同卡注记；请求级统一调用预算登记为 `R1-PROMPT02` Refinement（Not Ready，未承诺）。下一 Story 未标 Ready。

## 已完成 Sprint：R1-S3J 结构补全结果持久化编排

- 状态：Done。PO 于 2026-09-25 确认范围，独立 DoR 在同日 PASS。合同：[R1-S3J](./docs/plans/r1-s3j-sprint-commitment.md)、[S3-02b3b2b](./docs/plans/s3-02b3b2b-backfill-generation-orchestration-contract.md)，`5/5` 点，无 Stretch，无 carryover。
- Sprint Goal：一次结构补全操作先持久 claim，再发出最多一次物理模型调用，然后把结果与基线 revision 绑定保存。并发、重启、响应丢失、lease 到期或结果不明时只读回既有事实，不重新调用模型。单次模式下的解析失败须分别归为 `malformed_json` 或 `empty_content`。
- PO 决定：result→World 提交、提交后 snapshot/RAG 与失败类别持久化归 S3-02b3c（Not Ready）。进入前置：独立 GPT-6 Scrum/QA DoR PASS。
- 非范围：不接 `/backfill`、不写 World、不改 HTTP/UI/schema/migration/PromptRunner，不做真实模型或 PostgreSQL apply，不引入 Release 2。
- 独立 QA/QC：首轮 FAIL，1 项阻断：零修复解析改判波及非单次零修复 Prompt，会使 `prompt_json` 下调用由 1 次升至 3 次。PO 批准在 `structuredInvoke.ts` 增加一行守卫，把新分类限于单次模式；复验 PASS，非单次调用次数与 fallback 路径和改动前一致，根代码评审 PASS。合同固定命令 `76/76` PASS，`git diff --check`、server `tsc --noEmit` 通过。
- Review/Retrospective：Sprint Goal 在 backfill 内部编排范围达成，`5/5`、carryover `0`。返工为 DoR 1 次（3 项缺口加 mode 用词）和 QA 阻断 1 项（合并前修复），逸出缺陷 `0`。改进：触及共享解析器的合同须列出全部零修复调用方；文件型双连接并发验收默认用 worker 线程。`prompting-governance` 基线失败登记为 `R1-PROMPT03` Refinement（Not Ready）。下一 Story 未标 Ready。

## 强制敏捷门

- 没有Story ID、用户价值、AC、非范围和验证方式，不开始开发。
- 未满足DoR的卡不进入Sprint；单张实现卡超过5点必须拆分。
- 一个Agent同时最多一张In Progress Story；共享文件单owner。
- Sprint中新增范围先进入Backlog，由PO明确换入/换出，不能“顺手做”。
- 通过DoD只代表Story完成；beta组合验证和Release gate通过后才代表可发布。
- 每个完成阶段必须提交；提交前检查Wiki与用户可见发布记录。

## R1-S0 完成证据

- R1-00 对账结果：69张独立候选卡中 `Done 0 / Partial 23 / Ready 6 / Not Ready 40`；另有不重复计点的 `S1-X` 已由 `S2-02` 接管。
- 已识别发布阻断：当前分支与 v0.4.25 存在重叠的视觉资产迁移历史；空库全迁移和新增部分迁移 fixture 均失败，须在 R1-03 验证矩阵和后续明确 Story 中处理。
- R1-01 已强制服务端、Vite 和桌面入口只使用回环地址；LAN、wildcard、私网主机和非回环 CORS 配置会在迁移及后台恢复前失败。
- R1-02 的确定性长链在隔离临时 SQLite 中完成十章，验证一次人工恢复、前五章正文哈希不变、第八章质量债继续、显式世界/人物编辑和 TXT 顺序完整；公共 idea→导演交接、真实模型和 UI 仍不在该证据范围内。
- R1-S0 当时的静态审计为 `PASS=8 / BLOCKED=3 / REVIEW=1`；当时硬阻断是重叠 SQLite 迁移、非标准 tag/手动触发可公开发布、公开工作流无 macOS job，且 macOS x64 支持范围尚未冻结。后续 R1-MIG01 已解除迁移阻断，PO 已冻结 Release 1 为 macOS arm64-only；当前门见 R1-S3F 的 `PASS=11 / REVIEW=1`。
- R1-04 已冻结 15 点 R1-S1；新增 R1-MIG01 独立承接迁移阻断，四张既有 Ready 卡进入明确波次，未满足依赖的诊断生产卡未被提前承诺。
