# S2-04b0 实际模型调用尝试证据合同

## Story 合同与结论

- Release / Sprint：Release 1 / R1-S2C。
- Story：S2-04b0 实际模型调用尝试证据 Spike（3 点）。
- 用户价值：后续页面可以依据每一次真实 transport 尝试说明“实际调用了什么、最终采用了什么”，而不是从当前模型设置、Token 汇总或短期 live 状态反推历史。
- 范围：只冻结合同、repository port、通用存储 ADR、双库迁移草案、身份归因、失败降级、首批入口与生产拆卡，并以 mock transport + in-memory repository 证明 seam 可执行。
- 当前结论：Spike 已消除主要方案歧义，但 **没有把整个 S2-04b 生产里程碑误标为 Ready**。根集成人已签认独立通用 store、授权 `promptRunner` 等价拆分并保留共享 schema/API 单一 ownership，因此 04b1 与 04b2 可进入 Ready；04b3/04b4 仍必须等待各自前置卡，章节改稿身份也只能在 04b4 实施。
- 明确非成果：没有接入真实模型、没有数据库写入、没有新增 Prisma/API/shared 类型、没有改变 live 或 Token 用量、没有给用户提供调用历史。

## 当前源码事实

1. `shared/types/llm.ts` 的 S2-04a `ModelAttemptLineage` 只有可空的 request/attempt/parent/index 与粗粒度 role，且注释明确“后续 Story 才关联和持久化”。它不能表达 strategy retry、transport retry、repair、semantic retry 和最终采用结果。
2. `server/src/llm/usageTracking.ts` 以 Token 为前提：usage 为 null 时不写；导演记录服务于用量投影，并吞掉数据库异常。它既看不到零 Token/未知 Token 的真实尝试，也不能成为通用 attempt 事实。
3. `server/src/platform/llm/live/LlmLiveBroker.ts` 的 interaction 是进程内短期快照，完成后仅保留十分钟；它包含输出预览并使用自己的 interactionId。live 适合即时反馈，不是持久证据或 requestId 权威。
4. `server/src/llm/structuredInvoke.ts` 已存在 structured strategy sequence、transport retry、fallback 与 repair 路径；`server/src/llm/structuredInvokeRepair.ts` 会发起独立模型调用。物理调用边界分散，不能只在外层 Prompt 成功时记一行。
5. `server/src/prompting/core/promptRunner.ts` 负责 text/structured 的 invoke/stream、live、post-validate、semantic retry 与 repair 协调，当前 1348 行，超过 1300 行硬阈值。生产接线前必须先形成清晰的执行模块边界，禁止继续向该文件堆叠 attempt 逻辑。
6. 自动导演已有 AsyncLocal usage context，可提供 novel/task/run/step/node 身份；`novel-world-generate` 已传 `novelId + entrypoint`；`ai-revision-preview` 的章节编辑 Prompt 当前未传 `novelId/chapterId/entrypoint`，不能可靠归因。
7. PostgreSQL 与 SQLite Prisma schema 都只有导演 `DirectorLlmUsageRecord`，其任务关系、级联和字段语义均为导演用量服务，不适合作为全系统实际 attempt 事实。

## 决策：独立通用 attempt store

### Background

实际 attempt 是模型平台事实，会同时服务自动导演、世界生成、章节编辑及后续其他模块。导演 Token 表以 `directorTelemetry` 为门，只在有 usage 时记录，且带有导演 task/run/step 关系。直接泛化会让非导演入口借用错误身份，也会把“用量记录”和“调用是否发生”混为一谈。

### Decision

生产方向采用独立、通用、append/finalize 型 `ModelAttemptEvidence` store；导演 Token 表保持现状，后续若需要可按 `attemptId` 派生或对账，但不作为 attempt 权威。一个 attempt 对应一次真实 provider transport open：每次 invoke、每次 stream、每次 transport retry、每个 structured strategy、每次 JSON repair、每次 semantic retry、每次 fallback 都各占一行。

S2-04b0 的可执行合同位于：

- `server/src/platform/llm/provenance/attempts/contracts.ts`
- `server/src/platform/llm/provenance/attempts/repository.ts`
- `server/src/platform/llm/provenance/attempts/prototype/`

这些文件是 prototype，未从 production facade 导出。

### 为什么不用 request 表作为首个硬依赖

首批 schema 可以只用 attempt 行并重复保存脱敏 request attribution；`requestId + attemptIndex` 形成完整聚合。这样 transport 开始前只需一次 insert，不会因“先建 request、再建 attempt”的跨写入失败阻断生成。若后续 API 需要请求级标题或分页摘要，可增加派生 request projection，但它不能取代 attempt 行。

## Lineage 与状态合同

### 标识与不可变规则

- `requestId`：一次用户/工作流逻辑请求的稳定标识。semantic retry、repair、fallback 不生成新 request。
- `attemptId`：一次物理 transport 尝试的全局唯一标识；transport 打开前生成。
- `attemptIndex`：同 request 内从 0 开始连续递增；数据库唯一约束为 `(requestId, attemptIndex)`。
- `parentAttemptId`：primary 为 null；其他角色必须指向同 request、较小 index 的直接原因 attempt。
- 标识由调用协调层生成，live interactionId、taskId、provider request id 都不能替代。

### role 与 routeTier

`role` 冻结为：

| role | 含义 | parent |
| --- | --- | --- |
| `primary` | request 的第一次物理调用 | null |
| `strategy_retry` | structured response strategy 切换后重试 | 触发切换的 attempt |
| `transport_retry` | 同一目标/策略的网络级重试 | 前一次失败 attempt |
| `json_repair` | 为修复不可解析或 schema 不合格 JSON 发起的新调用 | 产生损坏输出的 attempt |
| `semantic_retry` | schema 已过但产品语义校验失败后的新调用 | 被语义拒绝的 attempt |
| `fallback` | 首次切到备用 provider/model 的调用 | 触发 fallback 的 attempt |
| `legacy_unknown` | 历史导入无法恢复角色 | 可 null，仅用于 legacy |

`routeTier=primary|fallback|legacy_unknown` 独立存在。备用模型上的 transport retry 仍是 `role=transport_retry, routeTier=fallback`，不会因单值 role 丢失“发生在 fallback 目标”这一事实。

### status 与 finalAdoption 必须分离

- `status=started|succeeded|failed|cancelled|legacy_unknown` 只描述 transport 生命周期。
- `finalAdoption=pending|adopted|not_adopted|legacy_unknown` 描述输出是否成为 request 最终结果。
- structured 输出成功返回但解析/语义不合格时，是 `succeeded + not_adopted`，随后 repair/retry。
- 一个 request 最多一条 `adopted`。成功但未采用的尝试不是失败，也不能展示为最终模型。
- usage 可为 null；null 表示 provider 未返回可用用量，不能阻止 attempt 写入，也不能改写为零。

### finalize、崩溃与 legacy

- `startAttempt` 和 `finalizeAttempt` 对完全相同 payload 幂等；同 ID 的冲突 payload 必须报错并保留首个事实。
- terminal 行不可改写。最终采用必须在 terminal finalize 时确定；生产 repository 应在事务中保证一个 request 至多一个 adopted。
- 进程崩溃遗留 `started + pending + finishedAt=null`。读取时若超过运行窗口，可展示为“调用记录中断/结果未知”，但不得由启动恢复静默改成 failed。
- 旧历史没有可靠 transport 证据时只能返回 `legacy_unknown` 或“无 attempt 证据”；禁止按当前配置、Token 表或 live 快照回填 provider/model。

## 脱敏与最小持久字段

允许保存：lineage、mode、role/tier/status/adoption、实际 provider/model、structured strategy、脱敏 Prompt 身份、归因 ID、标准化 usage、耗时、允许列表 failure code/category/retryable、时间戳。

禁止保存：API key、Base URL、auth mode/header、OpenCode session、请求 header、Prompt 正文、上下文块、小说正文、模型原始输出、reasoning、provider 错误 body/stack。错误只保存稳定分类；原始异常可以进入既有受控日志，但不能复制到 attempt store/API。

`selectionProvenance` 后续如需关联，只保存 S2-04a 已定义的脱敏投影；不得把 `ResolvedLLMClientOptions` 整体序列化。

## 身份归因优先级

身份按完整 frame 选择，不做字段级拼接，避免把一个小说的 task 与另一个小说的 Prompt meta 混合：

1. **自动导演 runtime frame**：仅当 active context 同时有 `directorTelemetry=true`、非空 `novelId` 与 `workflowTaskId` 时采用；可继续携带 run/step/node。Prompt meta 若与 frame 冲突，记录归因冲突的观测告警并以 runtime frame 为准，不能降级拼接。
2. **Prompt invocation frame**：非导演入口采用调用点显式传入的 `novelId/chapterId/taskId/entrypoint`。entrypoint 只用于声明入口，不通过字符串关键词推断身份。
3. **legacy unknown**：所需身份缺失或冲突无法安全解决时保持 unattributed/unknown；不得从 label、模型路由、live taskId 或当前 URL 猜测。

首批覆盖矩阵：

| 入口 | kind/source | 必需身份 | 当前准备度 |
| --- | --- | --- | --- |
| 自动导演 | `auto_director/director_runtime` | novelId + workflowTaskId；run/step/node 尽量完整 | usage context 已有候选字段；需独立 attempt context 接线 |
| 本书世界生成 | `novel_world_generate/prompt_invocation` | novelId + `novel-world-generate` | 当前调用已传，生产接线可覆盖 |
| 章节 AI 修正预览 | `ai_revision_preview/prompt_invocation` | novelId + chapterId + `ai-revision-preview` | 当前调用缺失，先补 Prompt options 才可覆盖 |
| 独立世界库 | 非范围 | 所属小说语义未解决 | 保持 unattributed，不提前接线 |
| batch/批处理 | 非范围 | 一个 request 对多作用域的合同未解决 | 不接线，不把首项 novelId 套给全批次 |

## invoke、stream、live 与 API

- invoke 与 stream 使用同一 lineage/status/adoption 合同。stream 在 transport 打开前 start，在完整消费、验证和最终采用后 finalize；客户端中止为 cancelled，服务端异常为 failed。
- stream usage 取最终可用累计快照；始终没有 usage 时保留 null。
- live broker 继续负责即时阶段和预览。后续可把脱敏 requestId/attemptId 作为关联字段附到 live event，但 live interactionId 不是 attemptId，live 完成也不能替代 repository finalize。
- 后续读 API 只从通用 repository 构建 request 聚合；最终模型取唯一 `finalAdoption=adopted` 行。API 不从当前路由配置重算历史。
- `evidenceStatus=complete|partial|missing` 是当前请求执行结果的观测状态。若 attempt store 完全不可用，调用方必须在同步响应或所属 task/artifact 结果中携带 `missing`；仅凭历史 API 的 not-found 不能区分“从未调用”和“观测写失败”，因此不得把 not-found 伪装成 missing。
- 本 Spike 不冻结公开 DTO/URL；shared types、HTTP route、挂载和 UI 均由后续根集成卡拥有。

## 观测失败规则

attempt repository 属于 observability side channel：

1. start/finalize 写失败不得重发模型、切换模型、改写输出、清空正文、改变工作流任务状态或解除人工暂停。
2. 生成仍按原业务结果返回；执行结果携带 `evidenceStatus=partial|missing` 与通用错误码 `attempt_evidence_write_failed`。
3. 不把 repository 异常 body 暴露给用户或写入 attempt failure；attempt failure 只代表模型 transport。
4. start 成功而 finalize 失败时保留 `started`，读取显示中断证据；不能伪造 succeeded/adopted。
5. 观测失败不进入导演 replan/质量债/章节修复决策。

## SQLite / PostgreSQL 增量迁移草案

两套 Prisma schema 必须在同一生产 Story 同步增加同构模型；SQLite 使用普通 String 保存状态枚举，PostgreSQL 也保持 String，避免双库 enum 漂移。建议模型名 `ModelAttemptEvidence`，字段如下：

```prisma
model ModelAttemptEvidence {
  attemptId                    String   @id
  requestId                    String
  parentAttemptId              String?
  attemptIndex                 Int
  role                         String
  routeTier                    String
  mode                         String
  status                       String
  finalAdoption                String
  provider                     String?
  model                        String?
  structuredStrategy           String?
  attributionKind              String
  attributionSource            String
  novelId                      String?
  taskId                       String?
  directorRunId                String?
  directorStepIdempotencyKey   String?
  directorNodeKey              String?
  chapterId                    String?
  entrypoint                   String?
  promptId                     String?
  promptVersion                String?
  taskType                     String?
  modelRoute                   String?
  promptTokens                 Int?
  completionTokens             Int?
  reasoningTokens              Int?
  totalTokens                  Int?
  failureCode                  String?
  failureCategory              String?
  failureRetryable             Boolean?
  startedAt                    DateTime
  finishedAt                   DateTime?
  durationMs                   Int?
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  @@unique([requestId, attemptIndex])
  @@index([requestId, startedAt])
  @@index([parentAttemptId])
  @@index([novelId, startedAt])
  @@index([taskId, startedAt])
  @@index([directorRunId, startedAt])
  @@index([chapterId, startedAt])
  @@index([status, startedAt])
  @@index([requestId, finalAdoption])
}
```

迁移顺序：

1. 在 `schema.prisma` 与 `schema.sqlite.prisma` 同步增加独立表；生成 PostgreSQL 与 SQLite 各自的增量 migration，不修改/回填导演表。
2. repository 先做 dual-disabled 部署：表存在但没有生产写入；运行两库 schema/迁移验证。
3. 接线后仅新请求写入；不从 legacy Token 表回填 attempt。
4. finalize 使用 `attemptId + status=started` 条件更新，并在事务内检查 adopted 唯一性。SQLite 与 PostgreSQL 都不能依赖只在单一数据库可用的 partial unique index。

保留策略：Release 1 默认不自动物理删除 attempt 证据。查询按 novel/request 与时间分页，started orphan 只做派生标记。未来若引入清理，必须另开数据生命周期 Story，先备份并验证，再由用户明确批准；不能在本迁移中隐藏定时 purge 或级联删除。为避免产品对象删除时意外带走证据，首版只保存标量归因 ID，不建立 Cascade 外键。

## `promptRunner` 拆分先决方案

生产接线前先由根集成人授权一张纯重构卡，保持 public exports 与行为不变，并按职责提取：

1. `prompting/core/execution/promptExecutionContext.ts`：Prompt meta、预算与 request-scope context；
2. `prompting/core/execution/textPromptExecution.ts`：text invoke/stream、token 汇聚和 live 协调；
3. `prompting/core/execution/structuredPromptExecution.ts`：structured parse/post-validate/semantic retry 协调；
4. `promptRunner.ts` 只保留准备、注册校验与 facade exports，并降到 1300 行以下，目标约 1000～1200 行。

attempt start/finalize 不应直接堆进 facade：

- factory resolver 只继续产出脱敏 selection provenance，不生成 attempt；
- structured strategy/transport retry/JSON repair/fallback 的物理边界由 `structuredInvoke` 侧的 production recorder hook 发事件；
- text invoke/stream 由提取后的 execution 模块使用同一 recorder；
- semantic retry 由 structured Prompt execution coordinator 建立子 attempt，并把 parent 传给下层；
- recorder 通过明确 port 注入，不能复用 usageTracking 的“有 Token 才记录”门。

拆分卡必须先用现有 Prompt 回归测试证明等价，之后 attempt 接线卡才能修改这些模块。禁止为了接线把 `promptRunner.ts` 继续扩到更长。

## Seam proof 与覆盖

`attemptSeamPrototype.test.ts` 使用 mock transport 与序列化 round-trip 的 in-memory repository，覆盖：

- invoke 成功但 usage=null 仍有 adopted attempt；
- stream 使用同一 lineage 并保存最终 usage；
- fail → transport retry → strategy retry → fallback → JSON repair → semantic retry 的显式 parent/role/tier 与唯一 adopted；
- repository start/finalize 全失败时模型仅调用一次，业务结果保留且 evidenceStatus=missing；start 成功而 finalize 失败时保留 started 行并返回 partial；
- 两个 novel 并发执行后按 novel 查询互不污染；
- transport target 中的 key、endpoint、auth、Prompt/正文不进入持久行；
- 新 repository adapter 从序列化行重建 request；
- start/finalize 幂等、terminal 冲突拒绝、崩溃 started 行保留。

该 proof 不导入 factory/structuredInvoke/promptRunner，不调用真实模型，也不写 Prisma/用户数据库。

最终验证（2026-09-18，基于本 Story 最终源码）：

```text
pnpm --filter @ai-novel/server build
PASS

node --test server/dist/platform/llm/provenance/attempts/prototype/attemptSeamPrototype.test.js
8 passed, 0 failed
```

## 后续生产拆卡建议（均不超过 5 点）

### S2-04b1 通用 store 与 repository（3 点）

- Owned：两套 Prisma schema/migration、platform repository adapter、迁移/幂等/重建测试。
- AC：双库增量迁移通过；null usage、started orphan、冲突 finalize、唯一 adopted、脱敏投影通过；无生产调用接线。
- 依赖：根集成人签认本 ADR，并分配共享 schema 独占 ownership。

### S2-04b2 Prompt execution 边界拆分（3 点）

- Owned：`promptRunner` 上述 extraction 与既有测试迁移，不接 attempt store。
- AC：文件回到阈值内；text/structured invoke/stream、semantic retry、live、usage 行为等价；外部 import 不变。
- 依赖：根集成人授权重构范围。

### S2-04b3 真实 transport attempt 接线（5 点）

- Owned：attempt recorder、structuredInvoke/repair 与拆分后 text execution hook、request/attempt ID 生命周期。
- AC：mocked production seams 覆盖 strategy/transport/fallback/repair/semantic、invoke/stream/null usage，观测失败不改变业务调用次数与结果。
- 依赖：04b1 + 04b2 Done。

### S2-04b4 首批身份与读投影（3 点）

- Owned：导演 attempt context、世界/章节编辑 Prompt options、内部 read service；公开 API/shared DTO 如需增加由根集成人独占。
- AC：三入口身份矩阵通过；章节修正补齐 novel/chapter/entrypoint；独立世界库与 batch 仍明确不归因；missing/not-found 不混淆。
- 依赖：04b3 Done。

### S2-04c 用户可见调用证据（另行 Refinement）

只消费 persisted attempt read model 展示预计与实际来源；不得从当前配置重算历史。Task Center 仍是只读运行记录，任何操作留在来源页面。

## DoR、Wiki 与发布判断

- S2-04b0 自身 AC 已由合同与 seam proof 满足。
- S2-04b 生产 DoR：父里程碑不作为单卡启动。已冻结 lineage、store 方向、双库草案、身份优先级、live/API 边界、失败降级、首批入口和拆分方案；根集成人已确认共享 schema/API 单一 ownership并授权 04b2 拆分。04b1、04b2 为 Ready；04b3 依赖二者 Done，04b4 依赖 04b3 Done，章节修正身份补齐属于 04b4 AC。
- 本 Spike 澄清了长期的模型平台事实边界，具有 Wiki 价值；根据 Sprint ownership，本文件只提供源结论，Wiki 由根集成人在 Sprint 集成阶段写入，不由 Spike Agent 越权修改。
- 没有用户可见能力，也没有生产行为变化；不更新 Release Notes。
