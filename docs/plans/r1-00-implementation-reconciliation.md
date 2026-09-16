# R1-00：Release 1 实现与计划重对账

## Story 合同

- Release / Sprint：Release 1 / R1-S0。
- Story：R1-00 上游实现与计划重对账（3 点）。
- 用户价值：只开发真正缺失的单机成书能力，不按过期计划重复建设，也不把相似实现误报为验收完成。
- 范围：逐张核对 Release 1 候选实施卡，记录代码、测试和运行合同证据，并给出唯一状态。
- 非范围：实现候选 Story、写入用户数据库、运行付费模型、执行公开包装或晋级 beta/main。

## 对账基线

- 远端事实源：`origin/main@e3545c1f`（`v0.4.25`，2026-09-17 获取）。
- 对账分支：`codex/r1-s0-release-readiness`。
- 合流提交：`66e2c980`，保留既有 macOS 包装校验并接入 v0.4.25 的品牌、迁移与 Windows 包装修复。
- 计划来源：`agent-collaboration-sprint-1.md`、`agent-collaboration-sprint-2.md`、`agent-collaboration-sprint-3.md`、`agent-collaboration-sprint-4.md`、`agent-collaboration-sprints-5-8.md`。
- 证据原则：源码存在只证明能力线索；只有行为级断言覆盖相应成功、拒绝、失败、重试/并发和恢复边界，才可标记 `Done`。

## 状态定义

| 状态 | 判定规则 |
| --- | --- |
| `Done` | 当前基线已有完整业务能力与匹配 AC 的行为证据；UI 卡仍需明确用户验收状态。 |
| `Partial` | 已有可复用能力，但至少一项 Story AC、接线、失败恢复或验收证据缺失。 |
| `Ready` | 当前能力未实现，但 Story 已满足 DoR，可进入后续 Sprint Planning。 |
| `Not Ready` | 未决合同或依赖会改变实现方案，当前只能 refinement/Spike。 |
| `Superseded` | 已由另一项明确能力或 Story 替代，且不存在需要继续交付的独立用户结果。 |

## 基线风险与验证事实

### v0.4.25 合流后的迁移历史重叠

当前分支已有 `20260910140000_visual_asset_source_compatibility`，而 v0.4.25 又加入六个 `20260916090*` 细分修复迁移。两组迁移覆盖相同的四个字段和两张表：

- `ComicCharacter.gender`
- `ComicPanel.sceneRef`
- `DramaCharacter.portraitData`
- `DramaCharacter.threeViewData`
- `ComicCharacterAsset`
- `ComicScene`

`server/src/db/runtimeMigrations.ts` 会在运行时通过 `isMigrationAlreadySatisfied` 跳过已满足迁移，能够表达两条既有升级历史的兼容意图；但 v0.4.25 新增的 `server/tests/prismaMigrationCompleteness.test.js` 会在空库中按文件顺序直接执行全部 SQL，当前在 `20260916090000_comic_character_gender` 报 `duplicate column name: gender`。因此：

- 桌面 TypeScript 检查通过；冲突合并脚本通过语法和 `git diff --check`。
- SQLite 全迁移序列证据当前失败，不能据此宣称 R1 升级门可用。
- `runtimeMigrations.test.js` 的既有五项运行时迁移场景通过；新增的“部分满足视觉资产 schema”场景在 fixture 预置阶段重复添加 `ComicCharacter.gender`，尚未进入被测恢复逻辑即失败，说明该测试夹具也未兼容合流后的双迁移历史。
- 该问题作为 R1-S0 refinement 输入处理；R1-00 不顺带修改迁移历史，也不对任何用户库执行迁移。

## 逐卡状态

以下表格以详细实施卡的独立 ID 为单位；父级概要不重复计点。

### Sprint 1～2

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S1-00 诊断共享接线门 | `Ready` | 当前连接类型仍以 `ok` 为中心，Prisma 无诊断 store；需冻结 `checkState`、指纹、credential 版本、CAS/409 与双库增量迁移。证据：`client/src/api/settings.ts`、`server/src/prisma/schema.prisma`。 |
| S1-01 缺省数值配置 | `Partial` | 默认常量已存在，但 `Number(rawValue ?? "")` 会把未配置/空白转为 `0` 再落到最小值；缺完整输入矩阵与零副作用证据。证据：`server/src/config/rag.ts`、`RagRuntimeSettingsService.ts`、`RagSettingsService.ts`、`StyleEngineRuntimeSettingsService.ts`。 |
| S1-02a 被动读取、显式探测与持久化 | `Not Ready` | 被 S1-00 阻断；RAG GET 仍调用 embedding/vector health，模型探测成功仍可能写路由，无持久诊断、指纹失效或 readiness GET。证据：`server/src/routes/rag.ts`、`server/src/llm/connectivity.ts`。 |
| S1-02b 设置与知识库诊断消费 | `Not Ready` | 依赖 S1-00/02a；设置页进入即 POST 探测，知识库自动 health，`Boolean(ok)` 无法区分未知和失败。证据：`SettingsOverviewPage.tsx`、`ModelRoutesPage.tsx`、`KnowledgePage.tsx`、`KnowledgeOpsTab.tsx`。 |
| S1-03 检测建议与应用分开 | `Not Ready` | 依赖 S1-00/02a/b；当前探测会自动保存协议/格式，保存端点没有诊断 ID、revision、CAS 或批量事务，前端仍 `Promise.all`。证据：`server/src/llm/connectivity.ts`、`server/src/routes/llm.ts`、`ModelRoutesPage.tsx`。 |
| S1-04 简易书架阅读恢复 | `Ready` | 当前只有组件内选章状态，点击不更新 URL，也没有按作品/章节保存阅读位置；Story 合同已足够明确。证据：`SimpleNovelShelfPage.tsx`、`simpleCreationIssueGovernanceContracts.test.js`。 |
| S1-05 世界问题归属校验 | `Ready` | P0 缺陷仍存在：按 issue ID 更新后才检查 `worldId`；跨世界请求可能先写后报错。证据：`server/src/services/world/worldImprovementService.ts`。 |
| S1-06 世界维护与恢复 Spike | `Ready` | WorldContextGateway 等现状可作为输入，但尚无 maintenance 状态图、revision/幂等/API/恢复冻结产物；本卡只读且 DoR 完整。 |
| S1-X 专业章节辅助栏 | `Superseded` | 是 S2-02 的提前交付别名，不重复计点；能力尚未完成，统一由 S2-02 验收。 |
| S2-01a 查询与导演编排归属 | `Ready` | `NovelEdit.tsx` 仍约 2871 行，目标 application facade 不存在；现有 URL/task 身份纯函数是可保留基线。证据：`novelEditWorkflowParams.ts`、`novelEditAutomationStatus.ts`。 |
| S2-01b 阶段装配与组合收敛 | `Not Ready` | 依赖 S2-01a facade；虽已有 view/types/mobile 分文件，但没有 `workspace/presentation/` 边界，总控仍超过硬阈值。 |
| S2-02 专业章节辅助区按需展开 | `Ready` | 已有选区、候选和修订链；两侧固定渲染，无独立开关，刷新可能清脏稿/候选。证据：`ChapterEditorShell.tsx`。 |
| S2-03a 成果、进度与推荐展示模型 | `Partial` | 已能计算保存章、质量债和导演状态，也覆盖无 URL taskId 的恢复投影；仍缺统一表驱动 ViewModel、局部/整书范围区分和唯一主动作矩阵。证据：`NovelEditView.tsx`、`novelEditAutomationStatus.test.mjs`。 |
| S2-03b 来源现场动作与反馈 | `Partial` | 已有 continue/replan/manual recovery 命令和 pending 禁用；动作分支重复且常有多个主动作，缺调用次数、网络失败、刷新和跨书旧响应测试。证据：`NovelEdit.tsx`。 |
| S2-04a 模型来源与有效参数合同 | `Partial` | resolver 已得出 provider/model/降级与有效参数；缺字段级选择来源、requested/effective 理由、legacy unknown 和脱敏外发合同。证据：`server/src/llm/factory.ts`、`modelRouter.test.js`。 |
| S2-04b 实际调用尝试证据 | `Partial` | 已有 ALS 用量上下文、导演 provider/model 持久投影和 live interaction；usage 为空时直接退出，缺失败/repair/fallback attempt 链与非导演统一持久层。证据：`usageTracking.ts`、`DirectorUsageTelemetryQueryService.ts`。 |
| S2-04c 预计与实际来源显示 | `Partial` | 实况窗口和任务抽屉已显示部分实际/绑定模型；缺提交前预计来源、requested/effective、备用链、历史优先级及 unknown/error 展示。证据：`LiveExecutionDialog.tsx`、`NovelTaskDrawer.tsx`。 |

最窄验证：S1-00 完成共享 DTO/迁移合同后，S1-01 用隔离 env 与 mock Prisma 验证数值矩阵；S1-04/S2-02 使用纯状态行为测试与 client typecheck；S1-05 用 mock persistence 断言跨世界零写；S2 模型来源使用 mock secret/route/transport/persistence 覆盖无 usage、fallback 和重启。UI 仍由用户验收。

### Sprint 3～4

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S3-01 Prompt 维护能力边界 | `Partial` | 世界深化/一致性已是 Registry `PromptAsset`，但 `world.prompts.ts` 仍约 1316 行，无 owned maintenance 子模块或完整管理元数据；依赖 S1-06。 |
| S3-02a 世界样本安全提交 | `Not Ready` | `World.version` 和部分快照存在；没有 baseRevision、提交身份、幂等查询或统一 CAS，普通更新不递增版本。证据：`WorldService.ts`、`worldHttpContext.ts`。 |
| S3-02b 既有世界写入口收敛 | `Not Ready` | 公理/结构等部分路径会递增或快照，但普通编辑、层生成、手工层、素材注入、深化写入仍分裂且常不增版本；RAG 失败未形成资料债。 |
| S3-03a 本书世界独立内容版本 | `Partial` | NovelWorld 副本、Gateway、历史初始化和切片失效真实存在；只有 `syncBaseVersion/updatedAt`，缺独立 `contentRevision` 与 CAS。证据：`NovelWorldInstanceService.ts`、`NovelWorldSliceService.ts`、schema。 |
| S3-03b 双侧同步安全与引用完整性 | `Partial` | 已有显式 push/pull、分区 diff、事务和同步历史；请求不携双侧 revision，重放会重复写，normalization 会静默删除悬空引用。证据：`NovelWorldSyncService.ts`、`worldStructure.ts`。 |
| S3-04 AI 结构化世界评估 | `Partial` | 已注册并调用结构化一致性 Prompt；仍先用英文 regex 做语义判断，LLM 失败会吞掉并保存 rule-only 结果，缺 run/input revision/model source/incomplete 和作者决定输入。证据：`worldImprovementService.ts`。 |
| S3-05a 问题身份与观察史 | `Not Ready` | 旧 Issue 只有 worldId/code/status；每次评估先删除历史，且状态更新仍先写后验归属。缺稳定身份、observation/run 和决定关联。 |
| S3-05b 旧记录和并发评估 | `Not Ready` | 可读取旧 status，但无历史声明适配、验证证据时间、评估 run、去重、输入版本提交门或 crash 恢复。 |
| S3-06a 作者决定与留白持久化 | `Not Ready` | 小说级 `CreativeDecision` 是相似能力，但缺 world/NovelWorld 范围、目标实体、认知主体、类型、窗口、decisionRevision 和撤销历史。 |
| S3-06b 评估与生成按用途消费决定 | `Not Ready` | Gateway 已有五种 purpose 并接入章节/角色/大纲；`WorldContextBlock` 无 decisions，无法证明窗口、撤销、跨书、试演和 required-context 保护。 |
| S4-01 修改提案与备选方案 | `Not Ready` | 字段润色能生成 2～3 个候选但不绑定 issue/entity/baseRevision/decisionRevision，也不持久化；replace 模式会直接写世界。 |
| S4-02 采用提案事务提交 | `Not Ready` | 无 proposal/commit/pending verification 模型、迁移、API 或 query key；旧入口无 CAS 和提交身份。 |
| S4-03 提交后复核和恢复 | `Not Ready` | 世界骨架生成检查点不是维护复核运行时：无 lease、commit/verification 阶段或评估证据，RAG 失败也未持久化质量债。 |
| S4-04a 关键问题与推荐答案 | `Not Ready` | 旧深化 Prompt 仅有 question/quickOptions；不足时会注入固定力量/阵营/历史问题，缺推荐依据、实体引用和题材适配。 |
| S4-04b 回答整合为同一提案 | `Not Ready` | 当前回答直接拼接到 legacy 文本并标记 integrated，正是本卡禁止的旁路；没有 proposal→commit→verification→Gateway。 |
| S4-05a 问题与提案原地审阅 | `Not Ready` | 一致性页可显示问题并手工改 status；没有方案比较、精确 diff、版本依据、过期/未知矩阵或持久提案。 |
| S4-05b 采用、作者决定与刷新恢复 | `Not Ready` | 无采用/拒绝/留白/暂定命令，URL 不保存 issue/proposal/run，刷新无法回到同一闭环。 |

最窄验证：先完成 S1-05 与 S1-06，再以临时 SQLite、适用的 PostgreSQL 隔离库和 mock Prompt Runner 建立世界提交、同步、评估、问题史、作者决定、提案采用及恢复测试。所有世界写入必须覆盖并发、重放、跨资源、失败回滚和刷新恢复；UI 卡另留用户验收。

### Sprint 5～8

#### Sprint 5：委托与模型策略

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S5-01 委托与简易协作权限 Spike | `Not Ready` | 有可审计导演命令和章节编辑入口，但 S1-06/S3-06 未完成，也无四对象权限矩阵、重放/撤销时点或全局入口零写结论。 |
| S5-02 创建并保存委托快照 | `Not Ready` | `NovelWorkflowTask` 只有通用任务/进度/用量字段；缺 delegationId、对象 revision、授权、保护、完成标准、模型引用和请求摘要幂等合同。 |
| S5-03 来源命令范围与保护门禁 | `Not Ready` | 现有写入口无统一 collaboration gate，章节更新仍为普通 update；依赖 S5-01/02。证据：`novelCoreCrudService.ts`。 |
| S5-04 提交时解析并冻结模型策略 | `Partial` | factory/modelRouter 已解析 provider/model/协议/参数和 degraded，任务 seed 可带绑定模型；缺委托策略快照、路由版本/指纹、fallback 来源和预览/正式结果合同。 |
| S5-05 模型策略恢复、重试与现场选择 | `Partial` | 任务详情可从 seed 恢复 provider/model；缺策略快照驱动恢复、授权 fallback、凭证失效待决定和参数一致性。 |
| S5-06 来源现场 AI 意图与修改提案合同 | `Partial` | 章节已有 Registry 意图 Prompt 和局改候选；缺跨对象目标、unknown/澄清、事实/认知/计划/试演/留白分类及只读 collaboration proposal。 |
| S5-07 委托审阅与待决定现场 | `Not Ready` | 可复用章节候选与来源导航，但无委托摘要、权限、模型策略和待决定持久态；依赖 S5-02/03/05/06。 |
| S5-08 模型能力评测集 | `Not Ready` | 现有 router/capability 测试只验证协议，不是四类质量评测；缺 fixtures、负样本、语义评审 Prompt 和版本指纹。 |
| S5-09 可选真实模型抽样 | `Not Ready` | 无 evaluation runner、授权样本、额度和版本化结果；真实调用当前无授权。 |
| S5-10 有证据的任务预设 | `Not Ready` | `ModelRouteConfig` 不是待采用评测预设；缺 evidence manifest、明确采用、任务选择和 expectedFingerprint/CAS。 |

#### Sprint 6：总预算、暂停与恢复

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S6-01 总预算与调用生命周期 Spike | `Not Ready` | `requestBudget` 明确仅是单请求 soft policy；缺 taskBudget、父子 attempt、预留、unknown、崩溃/迟到结算和预算暂停状态机。 |
| S6-02 持久账本与原子并发预留 | `Not Ready` | WorkflowTask 有累计 token/call，但无预算、余额、预留或 attempt ledger；依赖 S6-01。 |
| S6-03 所有调用共享计数与预留 | `Not Ready` | usageTracking 仅在供应商返回 usage 后累计，usage 为空直接退出；请求前无预留，repair/fallback/embedding 无统一账本。 |
| S6-04 预算不足的保存边界暂停 | `Not Ready` | 有导演 checkpoint、manual recovery 与质量策略可复用；无 `budget_exhausted` 原因、保存边界、剩余章投影或追加额度恢复。 |
| S6-05 取消、租约与同任务累计恢复 | `Not Ready` | 通用取消与租约恢复存在；不是同预算任务累计恢复，缺预留 reconciliation、在途迟到结果和旧 lease 防双扣。 |
| S6-06 使用与剩余目标投影 | `Not Ready` | 有实际 usage 遥测；无 reserved/actual/estimated/unknown、余额区间、暂停原因、授权追加额度或来源现场投影。 |

#### Sprint 7：记忆、资产与现场修改

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S7-01 本书事实与资料可用性读取 | `Partial` | Gateway/生成上下文能读本书世界、人物认知和决定；读取可能触发 ensure/persist，缺严格零副作用 availability manifest、外部资料版本和选入理由。 |
| S7-02 显式按作品准备记忆 | `Partial` | 有显式 RAG reindex 和 owner job 去重；缺按所选资料版本的 prepare plan、激活/恢复、单 source 重试，现入口可能扩大到全量。 |
| S7-03 资产引用版本与适配提案 | `Partial` | 本书世界已有 sourceWorldId/syncBaseVersion 和实例隔离；缺 adaptationDecision、purpose、资产版本引用、类型只读合同与明确采用。 |
| S7-04 选择性同步、沉淀与发布保护 | `Partial` | 已有 push/pull、sections、事务和同步历史；缺双侧 revision CAS、发布/保护检查和并发/失败证据。 |
| S7-05a 正文修订版本 Spike | `Not Ready` | Chapter 无正文 revision/hash/publish/lock；缺写入口矩阵、选区漂移、竞争、旧客户端和发布保护决策。 |
| S7-05b 正文原子版本与幂等提交 | `Not Ready` | 当前采用前仅建整书 snapshot，再普通更新章节；缺 baseRevision、operationId、锚点、CAS 和所有入口 revision 递增。 |
| S7-05 正文口述反馈局改 | `Partial` | 已有 feedback→意图→多候选→diff→客户端采用链；客户端 offset splice 后整章覆盖，缺服务端局部原子提交、幂等、保护和刷新恢复。 |
| S7-06a 人物写入边界 Spike | `Not Ready` | 人物 profile/mind/state/relations/resources 可读；缺事实/认知/计划写路径与 revision/source 矩阵、资产隔离和发布规则。 |
| S7-06b 人物版本安全提交 | `Not Ready` | 无统一人物 content revision 或 collaboration commit adapter；缺 CAS、operationId、跨书/资产保护和 context 选定版本。 |
| S7-06 人物影响提案与有限采用 | `Partial` | CharacterInfluenceService 已有带证据/时间窗的后续影响并支持 accept/refine/supersede；它是软指导，不是人物合同修改，缺分类、CAS 和保护。 |
| S7-07a 规划版本与导演边界 Spike | `Not Ready` | 卷计划已有版本、活动版本和 lease；缺已写/执行中/未执行边界、兑现窗口、旧 worker fencing 和暂停优先级。 |
| S7-07b 未执行规划版本安全提交 | `Partial` | VolumePlanVersion、activeVersion、事务持久化与 preserveContent 存在；缺授权 range revision/CAS、operationId、旧 lease fencing 和章合同失效原子提交。 |
| S7-07 卷章规划范围审阅与提交 | `Partial` | 已有卷计划 diff/impact、版本激活/冻结和手动编辑影响分析；缺 AI 多方案、授权未执行范围、兑现窗口和旧 worker 零写。 |

#### Sprint 8：撤回、导航与长链

| Story | 状态 | 当前证据与剩余缺口 |
| --- | --- | --- |
| S8-01 撤回与下游依赖 Spike | `Not Ready` | 有整书快照与导演 artifact ledger；缺正文/世界/人物/规划 before/after 覆盖、可回退范围、unknown 依赖和暂停边界。 |
| S8-02 版本安全有限回退 | `Not Ready` | 旧 snapshot restore 会覆盖 outline/chapters；无 operationId/current revision、反向新 revision、幂等、发布或依赖保护。 |
| S8-03 回退后依赖失效与补偿 | `Not Ready` | ledger 仅能把部分导演 artifact 标 stale；无 reversal manifest、unknown、索引/复核分离或补偿 checkpoint。 |
| S8-04 创作与资产情境入口 | `Partial` | Sidebar 已有“创作/资产”两区；缺完整情境映射、来源/实例区分、单推荐动作和进入页零生成证据。 |
| S8-05 深链接和只读全局入口过渡 | `Partial` | 运行记录 UI 已只读导航，无 URL directorTaskId 的投影与 lane 隔离较完整；Creative Hub 仍可启动生产，旧 recovery API 仍含 resume 写入口，历史 URL 矩阵缺失。 |
| S8-06 十章持续创作确定性验收 | `Not Ready` | 没有 owned 十章 fixture 或跨能力集成目录；S5～7 和 S8-05 未完成，局部生产测试不能证明完整长链。 |
| S8-07 可选真实模型与三作者验收 | `Not Ready` | 无真实模型授权、预算、测试作品或真实作者审阅；依赖 S8-06 和 S6，总体当前禁止真实调用。 |

最窄验证：先完成委托、模型策略和任务预算三个前置合同；使用 mock transport、临时 SQLite、mock clock/lease 和隔离任务 store 覆盖授权拒绝、策略跨重启、并发预留、迟到结算、正文/人物/规划 CAS、回退补偿和十章重放。真实模型抽样必须在确定性长链通过后另获预算与授权。

## 汇总

| 范围 | 卡数 | Done | Partial | Ready | Not Ready | Superseded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sprint 1～2 | 17 | 0 | 6 | 6 | 4 | 1 |
| Sprint 3～4 | 17 | 0 | 4 | 0 | 13 | 0 |
| Sprint 5～8 | 36 | 0 | 13 | 0 | 23 | 0 |
| 合计 | 70 | 0 | 23 | 6 | 40 | 1 |

`S1-X` 是 S2-02 别名；剔除该别名后为 69 张独立候选卡。当前没有卡达到 `Done`：已有能力普遍缺少 Story 对应的失败、并发、恢复、UI 验收或阶段提交证据。`Partial` 不代表可跳过，只表示实现时应复用现有能力并收窄剩余验收。

## 对后续 R1-S0 的输入

1. R1-01 必须把“Release 1 无账号且只允许回环访问”与当前开发服务器 LAN 能力分开，不能把 Release 2 鉴权带进来；同时检查桌面 v0.4.25 的迁移合流风险。
2. R1-02 的十章 fixture 不能依赖尚未实现的委托/总预算/全系统撤回；应先以现有自动导演和章节生产事实源建立基线，再把后续能力作为独立增量场景。
3. R1-03 必须包含 SQLite 双迁移历史、桌面 runtime migration、macOS/Windows 包装、loopback 绑定、无付费调用 mock 长链和用户 UI 验收。
4. R1-04 首轮实施应从六张 `Ready` 卡中选择，并优先解决安全与前置合同；`Not Ready` 卡不得通过“先写代码”绕过依赖。

## R1-00 退出检查

- [x] 每张 Release 1 候选实施卡只有一个状态。
- [x] `Done` 均有行为级证据；相似能力和文档不冒充完成。
- [x] `Partial` 均列出剩余 AC 与最窄验证。
- [x] `Ready / Not Ready` 与依赖和 DoR 一致。
- [x] R1-01～04 收到准确的运行边界、长链 fixture 和验证矩阵输入。
- [x] 对账结果经根集成人复核并形成阶段提交。
