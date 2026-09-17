# S1-06：世界维护与恢复合同

## Story 合同与结论

- Release / Sprint：Release 1 / R1-S1。
- Story：S1-06 世界维护与恢复契约 Spike（3 点）。
- 用户价值：先固定世界评估、提案、采用、复核和恢复的安全合同，后续开发不会覆盖作者刚保存的内容，也不会在刷新或重启后重复应用修改。
- 产物状态：`Done（合同 Spike）`。Runtime / Prompt / UI 审阅已签认；本页仍是只读设计，不代表 schema、API、Prompt、运行时或 UI 已实现。
- 范围：模块 ownership、内容来源、版本语义、状态图、幂等/CAS、租约恢复、引用完整性、旧数据兼容、计划 API/错误、Prompt 子模块边界和正式运行门面。
- 非范围：生产代码、共享类型、Prisma schema/迁移、HTTP 接线、Prompt 实现、query key、UI、真实模型调用、用户数据库写入、Task Center 操作面。
- 依赖：S1-05 已完成世界问题原子归属校验；后续 S3/S4 仍需各自依赖和行为证据，不能用本合同冒充业务 Done。

## 已核对的当前事实

以下只描述 2026-09-17 当前代码；“目标合同”见后续章节。

| 事实 | 当前证据 | 结论 |
| --- | --- | --- |
| 世界样本有 `World.version`，但不是统一内容版本 | `WorldService.updateWorld`、分层生成/手动层更新、深化回答不会统一递增；公理、确认层、结构保存、字段 replace、快照恢复和 push 会递增 | 不能把当前 `version` 宣称为覆盖所有内容写入口的 CAS |
| 本书世界没有独立内容版本 | `NovelWorld` 只有 `syncBaseVersion`、`updatedAt` 与切片字段 | `updatedAt` 和 `syncBaseVersion` 都不能代替 `contentRevision` |
| 切片刷新不更新 `NovelWorld.updatedAt` | `NovelWorldInstanceService.persistStorySlice` 与 `NovelWorldSliceService.persistSlice` 只写切片字段 | 这是可保留的缓存/内容分离基线 |
| 本书世界优先于旧外部世界绑定 | `NovelWorldSliceService.getActiveWorldSource` 先读 `NovelWorld.structuredDataJson`，再退回 `Novel.world` | Gateway 来源优先级已有可复用基础 |
| Gateway 读取可能触发模型与缓存写入 | `WorldContextGateway.getWorldContextBlock` 会 `ensureStoryWorldSlice` 并 `persistStorySlice` | 当前 Gateway 不是严格零副作用读取门面；维护恢复不能把一次 Gateway 读取当作纯查询 |
| 当前同步没有双侧 CAS 或幂等身份 | `NovelWorldSyncService.syncWithLibrary` 读取两边后事务写入，请求只有 `direction/sections`；记录 ID 使用时间戳 | 查看差异后任一侧改变仍可能被覆盖；重放会重复写历史 |
| `syncBaseVersion` 当前记录来源 `World.version` | 导入、生成、push、pull 都把来源世界版本写入 `NovelWorld.syncBaseVersion` | 它是来源同步基线，不是本书内容版本 |
| 结构归一化会静默过滤悬空引用 | `normalizeWorldStructuredData` 会过滤不存在的势力/地点关系和实体引用；现有测试明确断言 trimming | 正式维护提交和分区同步必须在过滤前拒绝，不能把静默丢关系当修复 |
| 一致性检查会替换旧问题历史 | `checkWorldConsistency` 事务内 `deleteMany` 后 `createMany`，LLM 失败时吞掉异常并保存 rule-only 结果 | 当前没有观察历史、输入版本、incomplete 状态或可信复核证据 |
| 当前语义检查含固定英文 regex | `worldImprovementService.checkWorldConsistency` 用正则判断魔法/时代冲突 | 后续 S3-04 必须移入 AI-first 结构化评估；确定性代码只保留 schema、引用和安全检查 |
| 深化回答会直接追加 legacy 文本 | `answerWorldDeepeningQuestions` 拼接 `Q/A`、标记 `integrated` 并直接更新字段 | 旧 `integrated` 不是结构化提交或验证证据，不能自动覆盖可信骨架 |
| 字段润色有“候选”和“直接替换”两种路径 | `worldDraftGeneration.createWorldDraftRefineStream` 的 `alternatives` 零写入，默认 `replace` 在 stream 完成后直接写字段 | 候选可作为提案线索；replace 是待收敛的无统一 CAS 写入口 |
| 世界骨架检查点已有阶段恢复但无执行租约 | `WorldGenerationCheckpointService` 保存请求、阶段、结果和来源路由；没有 operationId、target ownership、lease/fencing 或 commit receipt | 可扩展其“世界来源页检查点”模式，不能原样充当维护运行时 |
| 通用小说 workflow 不适合世界样本维护 | `NovelWorkflowLane` 只有 `manual_create / auto_director / creation_studio`，恢复逻辑专用于小说/导演 | 世界样本任务不得冒充导演任务或占用 `directorTaskId` |
| 运行记录已能只读投影世界生成 | `WorldGenerationTaskAdapter` 返回 `sourceRoute`，retry/cancel/archive 均拒绝并要求回来源页 | 世界维护应沿用“运行记录只读、来源页操作”的产品边界 |
| 世界 Prompt 已进入 Registry，但文件超过硬阈值 | `world.prompts.ts` 约 1316 行，含深化、一致性、结构、生成、导入和可视化多职责 | 扩展维护 Prompt 前必须先拆分 owned 子模块 |
| 当前 Prompt 静态登记存在版本漂移 | loader 声明 `novel.world.generate_from_theme@v2`，资产源码声明 `v3`；Registry 加载时会按资产实际 key 重绑定到 `v3`，现有测试没有单独把 `v2` 固定为预期 | 运行时自修复不能代替静态治理；S3-01 开工前须由 Prompt/根集成人统一 loader 与资产 key |

## 冻结的模块 ownership 与依赖方向

### 目标模块

以下路径中标注“拟建”的文件当前不存在，仅表示后续 owner 边界，不表示能力已落地。

| 责任 | Owner 与路径 | 允许依赖 | 禁止依赖 |
| --- | --- | --- | --- |
| 世界维护领域规则 | Runtime Agent：拟建 `server/src/services/world/maintenance/domain/` | 纯共享 DTO、目标实体/版本值对象 | Prisma、Express、React、Prompt Runner |
| 提案/提交/复核编排 | Runtime Agent：拟建 `server/src/services/world/maintenance/application/` | domain ports、Prompt execution port、store/lease/index ports | HTTP request、客户端状态、导演内部 store |
| 持久化/CAS/租约 | Runtime Agent：拟建 `server/src/services/world/maintenance/infrastructure/` | Prisma、SQLite retry、事务 | Prompt 文案、UI、导演命令解释器 |
| 对外业务门面 | Runtime Agent：拟建 `server/src/services/world/maintenance/index.ts` 导出 `WorldMaintenanceWorkflowService`；现有 `WorldService` 只做兼容委托 | application public contract | 外部模块深导入 domain/store |
| 本书世界适配 | Runtime Agent：现有 `server/src/services/novel/worldContext/` | maintenance 的 commit/read ports、`WorldContextGateway` | 直接写 maintenance store；自动 push/pull |
| 世界维护 Prompt | Prompt Agent：拟建 `server/src/prompting/prompts/world/maintenance/`；现有 `world.prompts.ts` 保留兼容 export | Prompt core types、schema、Context Broker/Runner | Prisma、HTTP、写世界服务 |
| HTTP 与共享接线 | 根集成人：`server/src/modules/setup/world/http/`、novel-world HTTP、shared types、Prisma、迁移、Registry/catalog、client API/query keys | `WorldMaintenanceWorkflowService` public facade | 直接调用 infrastructure/store |
| 来源 UI | UI Agent：现有 `WorldWorkspace.tsx`、`WorldConsistencyTab.tsx`、`WorldDeepeningTab.tsx`；拟建 `components/workspace/maintenance/` | client API/query keys、只读投影 | 推断服务端状态、本地保存提交事实、Task Center 写操作 |
| 运行记录投影 | 根集成人/Task owner：现有 task adapter 模式，后续增加 maintenance 只读投影 | maintenance run read model | 继续、重试、采用、拒绝、撤销等命令 |

依赖方向固定为：

```text
HTTP / 来源 UI
      ↓
WorldMaintenanceWorkflowService（唯一正式门面）
      ↓
application orchestration
   ↙        ↓          ↘
domain   Prompt port   persistence / lease / index ports
                         ↓
                    Prisma / worker

NovelWorldSyncService ──→ maintenance commit port
WorldContextGateway  ──→ canonical world read + decision read port
Task Center adapter  ──→ maintenance run read model（只读）
```

`NovelWorkflowTask`、导演 command/runtime 和章节 pipeline 均不拥有世界维护写入。自动导演只继续通过 `WorldContextGateway` 消费本书世界；世界维护失败也不能被投影成整本小说生产失败。

## 正式运行承接门面

### 选择

正式选择“扩展世界检查点运行族”，不选择通用 `NovelWorkflowTask`：

- 对外门面为拟建 `WorldMaintenanceWorkflowService`，由 `maintenance/index.ts` 导出；HTTP、worker、同步适配和任务投影只依赖这一门面。
- `World` 与 `NovelWorld` 各自只增加 aggregate 所需的最小 `contentRevision`；run/proposal/commit/verification/operation 等 maintenance 生命周期记录使用专属增量表，不把它们硬塞进世界内容表，也不把维护记录伪装成 `WorldGenerationRun` 的骨架阶段。
- 可复用 `WorldGenerationCheckpointService` 的来源路由、阶段快照和“回来源页恢复”经验，但现有类与现有表保持骨架生成语义。maintenance 记录必须另外具备 target、operationId、请求摘要、lease/fencing、commit receipt 和验证检查点。
- 运行记录需要独立的只读 maintenance 投影；若共享 `TaskKind` 需新增类型，由根集成人接线。现有 `world_generation` 标题和阶段不能直接套用到维护任务。
- 世界样本来源路由为 `/worlds/:worldId/workspace`；本书世界来源路由为 `/novels/:novelId/edit?stage=world`。maintenance 深链接还必须携带适用的 `tab`、`runId`、`proposalId` 或 `issueId`，来源页负责解析并恢复对应现场。运行记录只导航，恢复/采用只在对应来源页。

### 门面职责

`WorldMaintenanceWorkflowService` 计划公开以下能力类别，具体方法名可在实现 Story 内调整，但语义不可改变：

- 建立/读取评估 run。
- 建立/读取 proposal 与备选方案。
- 用 operationId 和依据版本原子采用 proposal。
- 读取 commit receipt；响应丢失后可查询，不重复提交。
- 领取/续租/恢复 verification；只续未完成检查。
- 返回来源页使用的统一投影：内容是否已保存、复核是否完整、当前依据、残留风险、资料债、稳定 sourceRoute。

## 内容来源与投影优先级

### 权威内容

1. 对世界样本，合法且通过严格 schema/引用校验的 `World.structureJson` 是权威内容；`bindingSupportJson` 是随同一 `contentRevision` 由结构确定性派生的使用建议。
2. 对本书世界，合法的 `NovelWorld.structuredDataJson` 是权威内容；`bindingContractJson` 同样是派生投影。本书世界与来源 `World` 是两个独立 aggregate。
3. `metadata.seededFrom=legacy-text` 的结构是“旧文本派生的临时结构源”：可以读取和评估，但必须携带 `sourceConfidence=legacy_derived`；它不得覆盖一个已存在的可信结构源。
4. 只有完全没有结构化内容时，才读取旧扁平字段并构建 `legacy-text` 兼容视图。若结构化 JSON 存在但损坏，返回 `STRUCTURED_SOURCE_INVALID`，不得偷偷退回旧字段掩盖损坏。
5. `WorldDeepeningQA.integratedSummary`、旧 `answer`、`consistencyReport`、旧 issue status 和历史快照都是证据/历史，不是当前权威内容。旧 integrated 回答必须先形成结构化 proposal，再经 commit 才能进入内容。
6. `StoryWorldSlice`、`storySliceDigest`、overview、可视化、RAG 索引和兼容扁平字段都是派生物。它们不得反向覆盖结构化权威源。
7. 对本书生成链，`WorldContextGateway` 仍是唯一世界上下文门面；`Bible.worldRules` 和 `canonicalState.worldState` 不能成为平行权威源。
8. 外部世界样本的变化不会自动修改已导入 `NovelWorld`；只有作者明确 import/pull/push 或适配提交才能跨 aggregate。

### 写入规则

- 所有正式内容写入都以结构化权威源为起点，同一事务写结构、兼容扁平投影、派生 binding、`contentRevision`、提交证据和待复核状态。
- 对已有可信结构的世界，不能再只写某个 legacy 字段。无法无损映射的旧入口应返回 `STRUCTURED_SOURCE_REQUIRED` 并引导到结构化编辑/提案，不制造双写漂移。
- legacy-only 世界的首次正式写入可在同一提交中物化 `seededFrom=legacy-text` 的结构化源；不得先写旧字段、稍后异步补结构。
- 报告、issue 状态声明、切片缓存、diff 缓存、运行心跳、租约、RAG 状态和 UI 偏好都不是内容写入，不推进 `contentRevision`。

## 五类 revision 的冻结语义

| 名称 | 归属与含义 | 何时变化 | 不能用来做什么 |
| --- | --- | --- | --- |
| `contentRevision` | 每个 `World` 或 `NovelWorld` aggregate 的单调内容版本 | 权威结构、兼容内容投影或作者确认的内容发生原子变更时 `+1`；快照恢复是“产生新当前版本”，也 `+1` | 不能表示缓存刷新、评估次数、同步来源版本或模型配置 |
| `evaluatedRevision` | 某次评估/复核实际读取的 `contentRevision` 快照 | run 创建并冻结输入时复制；此后不可修改 | 不是当前版本计数器；不因重新查看报告变化 |
| `baseRevision` | proposal/commit 所依据的目标 aggregate `contentRevision` | proposal 建立时复制；proposal 不可变 | 不是“上次同步版本”，也不能单独证明作者决定仍一致 |
| `syncBaseVersion` | `NovelWorld` 与来源样本最近一次成功导入/同步后记录的来源 `World.contentRevision` | import、成功 push/pull 后更新为事务完成时的来源版本；关闭同步提示不变 | 不是 `NovelWorld.contentRevision`，不能单独作为同步 CAS，也不能证明本地未变 |
| `decisionRevision` | 目标 scope 的有效作者决定集合单调版本；空集合为 `0` | 新增、修改、撤销、窗口/范围变化时 `+1` | 不修改世界内容，不代替 contentRevision |

补充冻结：

- 评估的完整输入依据是 `{ targetType, targetId, evaluatedRevision, evaluatedDecisionRevision }`。
- proposal 的完整依据是 `{ baseRevision, baseDecisionRevision, assessmentRunId }`；三者必须与当前资源/有效评估一致。
- commit 请求的 `expectedContentRevision` 必须等于 proposal 的 `baseRevision`，`expectedDecisionRevision` 必须等于 `baseDecisionRevision`。
- 验证只验证 commit receipt 中的 `committedRevision` 与当时的 `decisionRevision`。期间任一 revision 改变，结果保存为历史观察并标 `stale`，不能成为当前“已解决”。
- 诊断配置 fingerprint、Prompt 版本、provider/model 来源属于调用证据，不进入上述五类 revision。
- 未来 slice freshness 应读取 `NovelWorld.contentRevision`/内容摘要，而不是把缓存写入时间当创作版本；迁移期旧 `sourceWorldUpdatedAt` 仅作兼容失效依据。

## 作者决定空集合先接入

S3-04 不等待 S3-06 写入实现。先冻结一个只读 port：

```ts
type WorldDecisionSet = {
  scope: { type: "world" | "novel_world"; id: string };
  decisionRevision: number;
  items: WorldAuthorDecision[];
  source: "persisted" | "empty_compat";
};
```

在 S3-06a 落地前，port 必须稳定返回：

```json
{
  "scope": { "type": "world", "id": "world_123" },
  "decisionRevision": 0,
  "items": [],
  "source": "empty_compat"
}
```

后续 `WorldAuthorDecision` 至少区分：`world_fact`、`character_belief`、`planned_direction`、`trial`、`intentional_blank`；包含稳定 decisionId、目标实体/字段、作者原话或结构化含义、认知主体（belief 必填）、有效窗口、active/revoked 状态和来源。自由文本分类必须走注册的 AI 结构化合同；作者显式选择的类型只做确定性校验。

- S3-04 评估每次都接收决定块，即使为空，保存 `evaluatedDecisionRevision=0`。
- S3-06b 才把按用途过滤的决定接入 Gateway：`outline/character/chapter/bible/optimize` 只能获得范围内、窗口内、未撤销的决定。
- `character_belief`、`trial` 与 `intentional_blank` 不能被评估或生成提升成世界事实；试演只进入讨论/预览，未采用前不进入正式生成上下文。
- 世界样本决定不会自动复制进已导入的本书世界；必须显式适配或同步并产生本书自己的 `decisionRevision`。

## proposal → commit → verification 状态图

### 领域状态

```text
evaluation queued/running
  ├─ completed(evaluatedRevision + evaluatedDecisionRevision + evidence)
  ├─ incomplete(模型/Schema/来源未完成；不得宣称通过)
  └─ stale(输入版本已变化；历史可读)

proposal_drafting
  ├─ proposal_ready ── author_reject ──> rejected（零内容写入）
  │        │
  │        ├─ basis changed ──────────> stale（零内容写入）
  │        │
  │        └─ accept(operationId + expected revisions)
  │                    ↓
  │               commit_claimed
  │                 ├─ CAS/protection/reference fail -> conflicted（零内容写入）
  │                 └─ atomic transaction succeeds
  │                               ↓
  │                 committed_pending_verification
  │                               ↓
  │                         verification_running
  │                    ┌──────────┼──────────┐
  │                    ↓          ↓          ↓
  │                 verified  verified_with  verification_incomplete
  │                           _findings       （内容已保存，可恢复）
  │                                             │
  │                                             └─ recover same commit
  │                                                    ↓
  │                                             verification_running
  └─ proposal_failed（保留输入，可用同一操作身份有界重试；零内容写入）
```

### 状态解释

- `verified_with_findings` 表示复核完整但仍有风险；不是运行失败，也不会自动回滚内容。
- `verification_incomplete` 表示至少一项复核因模型、Schema、传输、索引或持久化错误没有完成；UI 必须显示“内容已保存，复核未完成”。
- deterministic schema/引用/保护校验必须在 commit 前完成；失败零内容写入。AI 一致性判断属于 commit 后 verification，不得拥有回滚权。
- 只有与当前 `{contentRevision, decisionRevision}` 完全匹配的 `verified/verified_with_findings` 才是当前证据；旧结果始终保留为历史观察。
- 拒绝 proposal、标记“不是问题”、保存 intentional blank 与复核通过是不同事件，不能互相伪装。

## operationId、CAS 与提交证据

### operationId

- 每个会持久化 run、proposal、decision、commit、sync 或 recovery 命令的用户意图都携带客户端生成的不透明 UUID `operationId`。
- 唯一作用域为 `{targetType, targetId, operationType, operationId}`；服务端同时保存 canonical request hash。
- 同一 operationId + 相同请求 hash：返回原 operation/run/commit 结果；不得再次调用模型、再次递增版本、再次写快照或再次派发索引。
- 同一 operationId + 不同请求 hash：返回 `409 OPERATION_ID_REUSED`，零业务写入。
- 请求超时或连接丢失后，客户端先按 operationId 查询；不得生成新 operationId 猜测重试。

### commit CAS

提交事务顺序固定为：

1. 读取并校验 proposal ownership、状态、assessmentRunId、baseRevision/baseDecisionRevision。
2. 原子 claim operation；已有相同结果则直接返回。
3. 在同一事务检查 target 当前 `contentRevision` 与决定集合 `decisionRevision`。
4. 应用选定 patch，构建完整候选 aggregate；在任何 normalization 丢弃引用前执行严格 schema、保护与跨实体引用校验。
5. 以 `WHERE id = ? AND contentRevision = expectedContentRevision` 做 CAS 写入；零命中返回冲突。
6. 同事务写兼容投影、`contentRevision + 1`、before/after evidence、commit receipt、proposal adopted 状态和 `committed_pending_verification`。
7. 事务提交后再派发复核和索引；派发失败不撤销内容，持久待办由恢复扫描发现。

`commitReceipt` 至少携带 target、proposalId、operationId、baseRevision、committedRevision、decisionRevision、selectedPatchIds、before/after digest、committedAt。它是响应丢失后的事实源，不是全局撤回能力。

### 同步 CAS

- `sync-diff` 未来必须返回 `localContentRevision`、`sourceContentRevision` 与当前 `syncBaseVersion`。
- sync 请求必须携带 `operationId`、`expectedLocalRevision`、`expectedSourceRevision`、direction 和明确 sections。
- push 成功：来源 World `contentRevision + 1`；本书内容版本不变；`syncBaseVersion` 更新到来源的新版本。
- pull 成功：`NovelWorld.contentRevision + 1`；来源版本不变；`syncBaseVersion` 记来源当前版本，并使旧 slice 失效。
- direction=none 只改同步提示元数据，不推进任一内容版本，但仍需 operationId 幂等。
- 任一侧版本不匹配返回 409，整笔零写入并要求重新查看差异。

### 旧客户端策略

- 新 maintenance、proposal commit、decision 和 sync 命令从第一天起强制 expected revision；缺失返回 `428 REVISION_REQUIRED`。
- 既有手动/AI 世界写入口在 S3-02b 全量接线前只能视为兼容债，不能被新 UI 或新 Prompt 流程调用。
- S3-02b 完成门要求所有项目内写调用都携带 expected revision；之后旧客户端缺版本请求返回 428，服务端不得“现读当前 revision 后替客户端补上”，否则会掩盖陈旧编辑。
- 在接线未完成前不得公开“采用并验证”；不能靠前端禁用按钮代替服务端 CAS。

## 跨实体引用完整性

正式写入对“合并后的完整 aggregate”校验，覆盖至少：

- `faction.representativeForceIds -> forces.id`
- `force.factionId -> factions.id`
- `force.controlledLocationIds -> locations.id`
- `location.controllingForceIds -> forces.id`
- `relations.forceRelations.sourceForceId/targetForceId -> forces.id`，且两端不同
- `relations.locationControls.forceId -> forces.id`、`locationId -> locations.id`
- `relations.locationConnections.sourceLocationId/targetLocationId -> locations.id`，且两端不同
- `bindingSupport.suggestedLocationClusters.locationIds -> locations.id`
- proposal target entity、issue target entity、slice override required IDs 必须属于同一 target aggregate

规则：

- 允许先做别名/形状 normalization，但不得先过滤无效引用再校验。
- 正式 commit/sync 遇到悬空引用返回 `422 REFERENCE_INTEGRITY_VIOLATION`，附稳定 path、missingId 和最小 `requiredSections`；零内容写入。
- 分区同步不得自动扩大用户选定范围。若只同步地点/势力会破坏引用，服务端拒绝并返回依赖分区；UI 可为用户预选建议范围，由用户再次确认。
- legacy 读取可容忍并标记 `integrityDebt`，但不能回写“清洗后”的结构或把关系静默删除。
- 同名异 ID 不视为同一实体；需要合并时必须形成显式 proposal。

## 部分验证失败、重启与 lease 恢复

### Lease/fencing

- 每个可执行 maintenance run 保存 `leaseOwner`、`leaseEpoch`、`leaseExpiresAt`、`heartbeatAt` 和当前阶段。
- claim 只能领取 queued、可恢复 incomplete 或 lease 已过期且没有人工等待的 run；领取时递增 `leaseEpoch`。
- heartbeat、阶段推进、verification evidence 与终态写入必须同时匹配 runId + leaseOwner + leaseEpoch + 未过期 lease。
- 旧 worker 在 lease 过期、被接管或运行进入作者等待后失权；模型晚到结果只能记调用遥测，不能写 proposal、问题、验证结果或内容。

### 恢复规则

- proposal 前崩溃：从最后完整输入/Prompt 检查点恢复；不完整模型输出不保存为 proposal。
- commit 事务前崩溃：operation 仍未产生 commit receipt，可在重新 claim 后按相同 operationId 与 CAS 重试。
- commit 事务不确定/响应丢失：先查 commit receipt；存在则直接进入 verification，不再应用 patch；不存在才允许 CAS 重试。
- commit 后派发前崩溃：事务内的 `committed_pending_verification` 是恢复扫描事实源；重启扫描只排队 verification。
- verification 中崩溃：保留每项完整检查证据，只重跑未完成项；已经完成的 AI 调用不因 UI 刷新重做。
- AI 复核返回残留风险：状态为 `verified_with_findings`；继续维护需新 proposal，不是恢复同一验证。
- AI/Schema/传输失败：状态为 `verification_incomplete`；内容继续可读，来源页提供“继续复核”。
- RAG/index 失败：单独记录 `indexDebt`，不回滚内容、不伪装复核完成；恢复只重试索引项。
- 验证期间内容或决定改变：保存返回证据为 stale observation，当前 run 不自动改写新版内容；需要以新依据启动评估。
- 后台扫描不得越过 author wait、rejected、conflicted 或 stale proposal；来源页显式命令才可开始新操作。

## 旧数据兼容清单

| 旧数据/行为 | 兼容读取 | 首次新写/恢复规则 |
| --- | --- | --- |
| `World.version` | 迁移时作为样本 `contentRevision` 初始下界；不得声称历史每次编辑都已计数 | 增量迁移后所有内容入口统一递增；不改写旧历史 |
| 无 revision 的 `NovelWorld` | 有结构内容初始化为 revision 1，无内容为 0；初始化必须幂等 | import/generate/manual/edit/pull 后按合同递增 |
| 仅 `Novel.worldId`/旧 slice | 继续由 `ensureFromLegacyNovel` 兼容初始化，不删除旧字段 | 初始化后以 NovelWorld 内容版本为准；旧 slice 至少失效重建一次 |
| `metadata.seededFrom=legacy-text` | 作为 `legacy_derived` 展示和评估 | 不自动提升为可信骨架；正式提交保留来源证据 |
| 旧 `WorldDeepeningQA.status=integrated` | 作为“历史回答曾被追加”显示 | 不自动写新结构、不标验证完成；需要 proposal/commit |
| 旧 consistency issue `open/resolved/ignored` | 保留为历史处理声明 | `resolved` 不补造 verifiedAt/evaluatedRevision；新观察另存，不 deleteMany |
| 旧 `consistencyReport` | 可展示为 legacy report，并标输入版本未知 | 不能作为当前通过证据；首轮新评估保存完整依据 |
| 旧 `WorldSyncRecord` | 历史可读，revision/operation 标 unknown | 首次新 sync 必须重新 diff 并携双侧 revision |
| 旧 `syncBaseVersion` | 有来源世界时作为来源基线提示 | 本地 revision 仍需独立建立；不能据此跳过双侧 CAS |
| 旧 `WorldGenerationRun` | 继续只表示世界骨架生成 | 不迁成 maintenance run；新门面使用专属增量记录 |
| 旧快照恢复 | 快照继续可读 | 恢复是新 commit/revision，不把版本倒退到快照中的旧数字 |
| 旧 replace 润色/无版本 PUT | 读取结果保留 | S3-02b 接线后缺 revision 返回 428；不继续旁路写入 |

所有 schema 改动必须增量维护 SQLite/PostgreSQL 与桌面 runtime migration；只允许临时隔离库验证。本合同不授权迁移或修改用户数据库。

## 计划 API 与错误合同

以下均为“冻结的计划合同”，当前路由不存在。

### 世界样本

```http
POST /api/worlds/:worldId/maintenance/evaluations
POST /api/worlds/:worldId/maintenance/proposals
GET  /api/worlds/:worldId/maintenance/runs/:runId
GET  /api/worlds/:worldId/maintenance/operations/:operationId
POST /api/worlds/:worldId/maintenance/proposals/:proposalId/commit
POST /api/worlds/:worldId/maintenance/runs/:runId/recover-verification
```

### 本书世界

同一 DTO 通过来源资源路由暴露：

```http
POST /api/novels/:novelId/novel-world/maintenance/evaluations
POST /api/novels/:novelId/novel-world/maintenance/proposals
GET  /api/novels/:novelId/novel-world/maintenance/runs/:runId
GET  /api/novels/:novelId/novel-world/maintenance/operations/:operationId
POST /api/novels/:novelId/novel-world/maintenance/proposals/:proposalId/commit
POST /api/novels/:novelId/novel-world/maintenance/runs/:runId/recover-verification
```

### 示例：采用 proposal

```json
{
  "operationId": "5f7ad880-1780-4df0-8cc8-12bd82451811",
  "expectedContentRevision": 12,
  "expectedDecisionRevision": 3,
  "selectedPatchIds": ["patch_rule_cost", "patch_force_link"]
}
```

成功响应必须区分保存与复核：

```json
{
  "success": true,
  "data": {
    "operationId": "5f7ad880-1780-4df0-8cc8-12bd82451811",
    "proposalId": "proposal_123",
    "committedRevision": 13,
    "state": "committed_pending_verification",
    "contentSaved": true,
    "verificationComplete": false,
    "sourceRoute": "/worlds/world_123/workspace?tab=consistency&runId=run_123"
  }
}
```

错误响应沿用项目 `ApiResponse` 外壳，并在 `details.code` 提供稳定机器码：

| HTTP | code | 语义与写入 |
| ---: | --- | --- |
| 404 | `WORLD_TARGET_NOT_FOUND` / `PROPOSAL_NOT_FOUND` | 目标不存在，零写入 |
| 409 | `RESOURCE_OWNERSHIP_MISMATCH` | proposal/run/issue 不属于路由资源，零写入 |
| 409 | `OPERATION_ID_REUSED` | 相同 operationId 请求摘要不同，零写入 |
| 409 | `CONTENT_REVISION_CONFLICT` | 当前内容版本不等于 expected，零写入 |
| 409 | `DECISION_REVISION_CONFLICT` | 作者决定版本已变，零写入 |
| 409 | `PROPOSAL_STALE` | 评估、内容或决定依据已过期，零写入 |
| 409 | `RUN_ALREADY_LEASED` | 有有效 worker；返回当前 run 投影，不另启链 |
| 422 | `PROPOSAL_INVALID` | patch/schema/保护范围无效，零内容写入 |
| 422 | `REFERENCE_INTEGRITY_VIOLATION` | 合并后引用不完整，返回 paths/requiredSections，零内容写入 |
| 428 | `REVISION_REQUIRED` | 缺 expected revision，零写入 |
| 500/503 | `COMMIT_RESULT_UNKNOWN` | 仅在无法确认事务结果时使用；客户端必须按 operationId 查询，不能新建操作 |

示例冲突：

```json
{
  "success": false,
  "error": "世界内容已发生变化，请重新查看改动方案。",
  "details": {
    "code": "CONTENT_REVISION_CONFLICT",
    "expectedContentRevision": 12,
    "currentContentRevision": 13,
    "operationId": "5f7ad880-1780-4df0-8cc8-12bd82451811"
  }
}
```

HTTP handler 只校验、调用门面和映射错误；不得在 request 生命周期直接跑完整 proposal/verification 或用 `void Promise` 伪装后台任务。

## Prompt maintenance 子模块边界

S3-01 先拆分现有超长文件，再扩能力。目标结构：

```text
server/src/prompting/prompts/world/
  world.prompts.ts                 # 兼容 re-export，不再承载新增维护正文
  generation/                      # 骨架、分层、本书主题生成（按现有资产迁移）
  import/                          # 导入/参考提取
  visualization/                   # 可视化
  maintenance/                     # 评估、问题对应、提案、复核、关键问题/答案整合
    index.ts                       # owned public exports
    *.promptTypes.ts
    *.promptSchemas.ts
    *.prompts.ts
```

冻结规则：

- 迁移既有资产时保留兼容 export 和已确认的 asset id/version；不能因拆文件无故升级版本。
- 当前 `novel.world.generate_from_theme` 的静态 loader key 为 `v2`、资产实际版本为 `v3`；Registry 虽会在加载时按资产实际 key 重绑定，S3-01 仍须先统一静态声明与资产版本，不能依赖运行时容错掩盖治理漂移。
- maintenance Prompt 只负责 AI 语义：评估风险、问题身份候选、方案生成、答案结构化整合、提交后语义复核。
- Runtime 负责 target ownership、版本、权限/保护、引用存在、patch 应用、CAS、幂等、租约和事务；Prompt 不得返回“已提交”事实。
- 评估输入必须包含 canonical source + source confidence、contentRevision、decision set/revision、目标范围、模型来源要求；输出必须有 completed/incomplete、证据、实体引用和影响，失败不能伪造 pass。
- proposal 输入必须包含 assessmentRunId、baseRevision/baseDecisionRevision、保护/留白 required context；输出 patch 只可引用稳定 entity/field paths。
- verification 复用独立、小型结构化合同，不把整世界、所有历史、提案和运行状态塞进一个巨型 JSON。
- 所有资产经 Registry + Runner，具备 schema、management/catalog、预览、受控测试、telemetry、repair/semantic retry 边界；service 不新增 inline prompt、裸 `getLLM()`、正则语义 fallback 或固定问题池兜底。

## 既有写入口收敛清单

S3-02b 必须逐项给出接线证据，未收敛项是发布阻断：

- `WorldService.updateWorld`
- `WorldService.updateAxioms`
- `WorldService.generateLayer` / `generateAllLayers`
- `WorldService.updateLayer` / `confirmLayer`
- `worldImprovementService.answerWorldDeepeningQuestions`
- `worldStructureWorkspace.updateWorldStructure` / `backfillWorldStructure`
- `worldDraftGeneration` 的 refine replace
- 世界属性素材注入与 import/create 路径
- `worldSnapshotService.restoreWorldSnapshot`
- `NovelWorldInstanceService.importFromWorldLibrary` / theme generation / manual create / save-to-library
- `NovelWorldSyncService.syncWithLibrary`
- 后续新增 NovelWorld 手动编辑入口

只读或派生写入口另列，不推进 contentRevision：一致性报告/观察、issue 处理声明、sync diff pending cache、StoryWorldSlice、overview cache、可视化、RAG/index、运行心跳/lease。

## 后续 Story readiness

Runtime / Prompt / UI 已完成合同审阅。签认只解除合同未知项，不跳过实现依赖：

| Story | 签认后的状态判断 |
| --- | --- |
| S3-01 | `Not Ready`，直到 `novel.world.generate_from_theme` 的 loader key 与资产实际版本统一；其余模块边界已冻结 |
| S3-02a | 可进入 `Ready`；仍需根集成人冻结增量 schema/迁移与共享 DTO |
| S3-02b | `Not Ready`，依赖 S3-02a 行为通过；写入口清单已冻结 |
| S3-03a | `Not Ready`，依赖 S3-02a 与 NovelWorld 增量 migration 接线 |
| S3-03b | `Not Ready`，依赖 S3-03a、S3-02b；双侧 revision/CAS 与引用策略已冻结 |
| S3-04 | `Not Ready`，依赖 S3-01、S3-02b、S2-04a/b 模型来源证据；空决定输入已解锁 |
| S3-05a/b | `Not Ready`，分别等待 S3-04 与问题历史 store/迁移 |
| S3-06a/b | `Not Ready`，分别等待 S3-02b、S3-04/S3-03a；空集合 port 不等于决定写入能力 |
| S4-01～05 | `Not Ready`，按 Sprint 4 原依赖推进；本合同只消除了运行/版本语义未知项 |

不得为了把 Story 改成 Ready 而先写 schema/API/Prompt；任何新发现且会改变 aggregate、revision 或恢复策略的未知项必须退回 Refinement。

## Runtime / Prompt / UI 三方审阅清单

### Runtime owner（根集成人签认）

- [x] 同意 `WorldMaintenanceWorkflowService` 是唯一正式门面，maintenance 不进入 `NovelWorkflowTask`/director lane。
- [x] 同意 `contentRevision` 覆盖全部权威内容入口，缓存/报告/lease 不递增。
- [x] 同意 commit 同事务包含结构、兼容投影、revision、证据、receipt 与待复核状态。
- [x] 同意 operationId/request hash 重放规则、双 revision CAS、响应丢失先查 receipt。
- [x] 同意 maintenance 专属 run + leaseEpoch fencing；旧 worker 失权零写入。
- [x] 同意验证失败不回滚内容，恢复只续 verification/index debt。
- [x] 同意严格引用校验发生在 normalization 丢弃之前；分区同步不自动扩权。
- [x] 确认旧数据增量迁移、SQLite/PostgreSQL、桌面 runtime migration 和隔离恢复演练方案。
- [x] 确认既有写入口收敛清单无遗漏。

### Prompt owner（根集成人按 Prompt Governance 签认）

- [x] 已确认静态 loader `v2` 与资产实际 `v3` 漂移；统一工作归 S3-01，不能依赖 Registry 运行时重绑定掩盖。
- [x] 同意先拆 `world.prompts.ts`，保留兼容 export，不以 generic helper 替代 owned 模块。
- [x] 同意评估/问题身份/提案/复核分别使用职责单一的结构化资产。
- [x] 同意空决定集合和未来决定分类进入 required input，intentional blank 不被补成事实。
- [x] 同意输出 completed/incomplete、证据、实体引用、影响和模型来源；无 rule-only pass fallback。
- [x] 同意移除语义 regex/固定英文问题兜底，确定性代码仅校验 schema/安全/引用。
- [x] 确认 Registry、management/catalog、预览、受控测试、telemetry、repair/semantic retry 接线责任。

### UI owner（UI 审阅 Agent 签认，必改项已合入）

- [x] 同意世界样本与本书世界使用各自来源路由，样本修改不暗示已影响小说。
- [x] UI 只呈现服务端投影提供的当前依据、状态和可执行 actions；提交时原样携带 expected content/decision revision，由服务端 CAS 裁决。
- [x] 同意区分：proposal 生成中、待审阅、过期、提交冲突、内容已保存待复核、复核完整有风险、复核未完成、资料索引待恢复。
- [x] `operationId` 可由客户端首次生成；服务端保存的 operation/receipt 及其状态才是可恢复事实。本地 pending/禁用只防重复触发，不承担幂等。
- [x] query key 必含 target type/id 与适用的 run/proposal/issue id；资源或深链接变化时取消/失效旧查询并重置局部草稿。mutation 回包只有目标与 operation/receipt 同时匹配当前 URL 才更新现场，其他回包只失效对应缓存；浏览器前进后退按 URL 重读服务端投影。
- [x] 同意恢复、采用、拒绝、留白只在世界来源页；运行记录只读并导航。
- [x] 同意“标记已解决”不等于验证通过；拒绝、不是问题、留白、复核通过分开呈现。
- [x] 确认低边框、项目 primitives、作者视角文案和用户 UI 验收责任。

未来 UI Story 的最小用户验收覆盖：深链接与刷新、A 世界切到 B 世界时 A 的慢回包、同名 world/novel 隔离、运行记录只导航，以及 `verification_incomplete` 明确显示“内容已保存，复核未完成”并只在来源页提供“继续复核”。

签认记录：2026-09-17，Runtime 与 Prompt 由根集成人依据现有源码和治理规则审阅；UI 由独立 UI 审阅 Agent 审阅，所列路由、恢复查询和服务端事实修订已合入。两名额外 Runtime/Prompt 审阅 Agent 因工具额度中止，未被计作签认证据。

## 验证与路径自检

本 Spike 不运行构建、数据库迁移或真实模型。最窄检查是源码/文档路径核对、链接检查和 `git diff --check`。

已核对的现有入口：

- [R1-S1 Sprint 承诺](./r1-s1-sprint-commitment.md)
- [Sprint 1 实施卡](./agent-collaboration-sprint-1.md)
- [R1-00 实现对账](./r1-00-implementation-reconciliation.md)
- [S1-05 归属校验](./s1-05-world-issue-ownership.md)
- [Sprint 3 可信世界任务卡](./agent-collaboration-sprint-3.md)
- [Sprint 4 世界闭环任务卡](./agent-collaboration-sprint-4.md)
- [敏捷交付规范](../wiki/workflows/agent-agile-delivery.md)
- [世界上下文门面 Wiki](../wiki/architecture/world-context-gateway.md)
- [世界骨架 Wiki](../wiki/product/world-skeleton-generation.md)
- [自动导演世界准备 Wiki](../wiki/workflows/auto-director-world-setup.md)
- [自动导演运行时 Wiki](../wiki/workflows/auto-director-runtime.md)
- [章节自动恢复 Wiki](../wiki/workflows/chapter-automatic-recovery.md)
- [Prompt Registry Wiki](../wiki/prompts/prompt-registry-and-structured-output.md)
- `server/src/services/world/WorldService.ts`
- `server/src/services/world/worldImprovementService.ts`
- `server/src/services/world/worldStructure.ts`
- `server/src/services/world/worldStructureWorkspace.ts`
- `server/src/services/world/worldSnapshotService.ts`
- `server/src/services/world/worldGenerationCheckpointService.ts`
- `server/src/services/novel/worldContext/NovelWorldInstanceService.ts`
- `server/src/services/novel/worldContext/NovelWorldSyncService.ts`
- `server/src/services/novel/worldContext/WorldContextGateway.ts`
- `server/src/services/novel/storyWorldSlice/NovelWorldSliceService.ts`
- `server/src/modules/setup/world/http/`
- `server/src/modules/novel/setup/http/novelWorldSliceRoutes.ts`
- `server/src/prompting/registry.ts`
- `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- `server/src/prompting/prompts/world/world.prompts.ts`
- `server/src/prisma/schema.prisma`
- `server/src/services/task/adapters/WorldGenerationTaskAdapter.ts`
- `client/src/api/world.ts`
- `client/src/pages/worlds/WorldWorkspace.tsx`
- `client/src/pages/worlds/components/workspace/WorldConsistencyTab.tsx`
- `client/src/pages/worlds/components/workspace/WorldDeepeningTab.tsx`

拟建路径 `server/src/services/world/maintenance/`、`server/src/prompting/prompts/world/maintenance/` 和客户端 maintenance 组件在本次自检中应为不存在；这正是后续 Story 的实现范围，不得把路径建议当作现状能力。

## Wiki 与发布记录判断

- 本合同形成了长期有效的 revision、来源、CAS、恢复和模块边界，具有明确 Wiki 价值。
- 三方签认后，稳定规则已整理到 [世界维护提交与恢复边界](../wiki/workflows/world-maintenance-recovery.md)，并在 Wiki 索引中建立入口；计划页保留完整评审与后续 readiness，不把 Wiki 写成变更清单。
- 本次只有内部计划文档，没有用户可见产品行为；无需 README 或 release notes。
