# S3-02b3s：AI 结构补全幂等与费用边界 Spike

## 身份与决定范围

- Release / Epic：Release 1 / S3 可信世界；稳定 ID：`S3-02b3s`；2 点，R1-S3D 已完成，当前 Done。
- 用户价值：作者点击“AI 补全世界结构”后，即使响应丢失或世界内容同时变化，也不会重复付费、误覆盖较新内容，且能知道模型结果是否已保存。
- 依赖：S3-02a、S3-02b1、S3-02b2 已 Done；Spike 已进入 R1-S3D。后续实施卡仍须等待本 Spike 决策和独立 DoR，不因前置完成自动启动。
- Owner：一名 Luna xhigh 全栈工程师负责只读主链审计和隔离 seam proof；根 PM/PO 冻结合同。若 Luna 额度不可用，由根 PM 继续只读证据，不改为低能力模型直接实施。

## 为什么不能直接复用 S3-02b2

`POST /worlds/:id/structure/backfill` 先调用已登记的 `world.structure.backfill` Prompt，再以模型输出构造完整结构，随后直接 `prisma.world.update`、创建 `structure-backfill` 快照并排队 RAG。客户端每次点击都会重新发起请求，当前请求没有 `operationId`、`expectedContentRevision` 或可查询结果身份。

手动结构保存的 request hash 可以由作者提交的固定 `structure/bindingSupport` 计算；AI 补全在模型调用前并没有最终 candidate。若只把生成结果交给既有 commit 门面，响应在模型完成后、提交前丢失时仍可能再次调用模型和重复计费；若 hash 包含每次模型输出，相同用户意图也无法稳定重放。现有模型 attempt store 记录物理调用证据，不持久化可直接复用的结构化输出，也不是世界内容 operation receipt，不能自动解决这一缺口。

## Spike 必须回答的三个问题

1. **调用前幂等**：客户端保存意图应冻结哪些输入（world、基线 revision、Prompt/version、provider/model 与 operationId）；服务端在模型调用前如何判断 committed、in-flight、failed-retryable 或未知结果，确保相同 operation 不重复触发付费调用？
2. **生成后提交**：模型输出如何与冻结的基线 revision 绑定，并以同一 operation 身份进入世界 CAS；若世界在生成期间被作者修改，应返回冲突、保留哪份生成结果，以及是否允许显式重新生成？不得用最新世界自动合并来掩盖冲突。
3. **响应丢失与恢复**：模型成功但提交未开始、提交成功但 HTTP 响应丢失、模型调用状态未知三种情况各由什么持久事实判断；来源页应显示“生成中、已保存、未保存结果可处理、状态待确认”中的哪一种，且重试何时复用结果、何时允许新 operation？

## 范围、证据与退出

- 只检查 `POST /worlds/:id/structure/backfill`、`WorldService.backfillStructure`、`worldStructureWorkspace.backfillWorldStructure`、`world.structure.backfill` Prompt、模型 attempt evidence、既有世界 CAS/operation/receipt 与同一世界工作台两处入口/视图的“AI 补全结构”动作。
- 产出：时序图或状态表、operation/request hash 合同、是否需要持久化生成结果或租约的决定、单张实现 Story 是否可保持 5 点、owner/文件边界和行为 AC。
- 最窄 seam proof：新增非生产原型 `server/tests/worldStructureBackfillIdempotencySpike.test.js`，mock 模型与 `/tmp/ai-novel-s3-02b3s-*` 隔离 SQLite 证明同 operation 并发/重放最多发起一次模型调用；模型成功但提交前中断后复用持久结果；调用状态未知或 lease 到期不自动重新付费调用；生成期间 revision 冲突零世界写入；提交成功响应丢失可按 operation 读回原 receipt，并从拟议 result record 读回归一化结构。命令为 `pnpm --filter @ai-novel/server build && node --test server/tests/worldStructureBackfillIdempotencySpike.test.js`；该 proof 只证明拟议 claim/result 合同可行，不证明现有生产 `/backfill` 已安全。不得调用真实模型或用户数据库。
- 非范围：`POST /structure/generate` 单区块建议、手动 PUT、分层/深化/导入/同步/评估/提案、Prompt 内容改写、新模型路由策略、通用任务中心动作、Release 2 或额外安全体系。
- 若不新增持久状态便无法区分“模型未调用”和“模型已调用但结果未保存”，Spike 必须明确最小 owned store/既有表扩展、可查询 operation 身份、归一化生成结果的持久位置及 migration 影响，并据此拆分；commit receipt 只证明世界提交，不能冒充生成结果仓库。不得为了守住 5 点而宣称模型调用天然幂等。

## 当前 DoR 结论

S3-02b3 生产父项及后续 a～e 实施卡保持 **Refinement / Not Ready**。本 Spike 已决定模型调用前的 durable claim 与生成结果恢复合同，但各实施卡仍需分别冻结依赖、owner/文件边界与生产行为验收后才能进入 Planning。S3-02b3s 只交付调查决策和隔离证据，不代表 backfill 已受版本保护。

## Spike 决策（2026-09-22）

### 结论摘要

主因分类：功能闭环未完成，并叠加现有 backfill 写入绕过 CAS 的实现缺口。

当前生产 backfill **不具备**幂等、结果恢复或版本安全保证。本 Spike 冻结的后续合同是：先为一次作者意图创建 durable operation claim，再在 claim 已进入 `model_in_flight` 后最多打开一次供应商调用；模型成功后的归一化结构必须先写入 durable result record，再以同一 operation 和冻结的 `baseContentRevision` 进入 CAS。响应丢失只允许通过 operation receipt/result 读回；lease 到期或模型结果未知不得自动重新付费调用。以下决策和测试只证明拟议合同可行，不改变现有 `/backfill` 行为。

### 真实生产时序与持久事实

审计了以下实际入口：

- `server/src/modules/setup/world/http/worldStructureRoutes.ts:63-79`
- `server/src/modules/setup/world/http/worldHttpContext.ts:276-279`
- `server/src/services/world/WorldService.ts:854-859`
- `server/src/services/world/worldStructureWorkspace.ts:268-313`
- `server/src/prompting/prompts/world/maintenance/worldMaintenance.prompts.ts:160-约 300`
- `server/src/platform/llm/provenance/attempts/`
- `server/src/services/world/maintenance/application/WorldMaintenanceWorkflowService.ts`
- `server/src/services/world/maintenance/infrastructure/PrismaWorldSampleCommitStore.ts`

| 阶段 | 当前实际行为 | 已有持久事实 | 空白 / 风险 |
| --- | --- | --- | --- |
| 请求 | `POST /worlds/:id/structure/backfill` 只校验可选 `provider/model`；同一世界工作台的两处入口/视图直接调用，不发送 operation 或基线 revision | Express 请求日志（若启用） | 没有可查询 operation 身份、稳定意图 hash 或来源页恢复状态；重复点击就是新请求 |
| Prompt / attempt | `WorldService.backfillStructure` 委托 `backfillWorldStructure`；`runStructuredPrompt` 使用 `world.structure.backfill@v1`，每个请求上下文生成随机 `requestId` | `ModelAttemptEvidence` 记录 request/attempt、provider/model、transport status、adoption、usage 和失败分类 | attempt 是观察证据，不保存模型输出；backfill 没有把 operation 传给 Prompt runner，当前入口也没有完整归因，不能作为结果恢复或费用 claim |
| 归一化 | `result.output` 进入 `normalizeWorldStructuredData`，再生成 binding support 和兼容字段 | 返回对象只在当前进程内存在 | 归一化结果未落库；进程退出、响应丢失或提交前中断都会丢失候选 |
| 世界写入 | 直接 `prisma.world.update`，更新结构字段并 `version: { increment: 1 }` | `World` 行和旧字段兼容投影 | 不带 `operationId`/`expectedContentRevision`，不更新 `contentRevision`，因此生成期间作者修改可能被整份候选覆盖 |
| snapshot / RAG | 更新后创建 `structure-backfill` snapshot，再排队 `enqueueUpsert("world", worldId)` | `WorldSnapshot` 行；RAG job/queue 事实 | snapshot 没有 operation/result 关联；snapshot 失败会让请求失败，RAG 是后置派生队列，二者都不能证明候选或世界 CAS 已提交 |
| 响应 | 返回 `world/structure/bindingSupport/source`，来源页收到后刷新世界查询 | HTTP 200 或错误 | 没有 operation receipt 查询；提交后响应丢失无法判断已保存还是应重调；没有“未保存结果可处理/状态待确认”投影 |

现有 `WorldMaintenanceOperation`、`WorldMaintenanceCommitReceipt` 只在手动结构 PUT 的 `commit_world_sample` 路径中创建：它们能证明世界 CAS 已提交，却不包含 backfill 的模型输出，也不证明模型在何时被调用。因此不能把现有 attempt 或 commit receipt 误称为 backfill 结果仓库。

### Durable operation / request hash / result 合同

一次 operation 由来源页在点击时生成不可变 UUID；服务端不以每次 HTTP 请求 UUID 代替 operation。建议冻结以下字段：

| 事实 | 冻结字段与规则 |
| --- | --- |
| operation 身份 | `worldId`、`operationId`、operation type=`structure_backfill`；同一世界+operation 唯一。operation 重放必须复用同一身份，换意图必须显式新建 operation |
| 稳定 request hash | canonical hash 的输入为 `worldId`、`baseContentRevision`、`promptId`/`promptVersion`、provider/model、固定生成策略版本、当前来源文本的 `sourceDigest`；不包含任何模型输出、时间戳或 HTTP 重试标识。hash 不匹配返回 `OPERATION_ID_REUSED` |
| 调用前 claim | durable `model_not_called` claim 创建后，唯一 owner 在打开 provider 前将其推进到 `model_in_flight`，写入 attempt/request 关联和 lease；并发重放只能读到 `in_flight`，不能再开调用 |
| 生成结果 | `WorldStructureBackfillResult`（拟议 owned result record）按 operation 唯一，持久化归一化结构、binding support、`baseContentRevision`、request hash、digest 和模型 attempt/request 引用；不得把 raw prompt、密钥或 provider 错误体写入结果 |
| 提交事实 | 结果存在后以同一 operation、同一 `baseContentRevision` 进入世界 CAS；成功写入世界、commit operation 与 receipt 必须同一事务。receipt 只证明世界提交，result record 才能读回归一化结构 |
| lease | lease 只用于发现 owner 是否失联，不赋予重启者重新付费调用权。`model_in_flight` lease 到期转为 `model_unknown`，永远不能自动回到 `model_not_called` |

`baseContentRevision` 必须在请求和 result 中重复保存；模型生成期间发现世界 revision 改变时，只更新 operation 为冲突结果保留，不写世界、不创建“当前世界自动合并”候选。作者查看并重读后，如仍需生成，必须创建新 operation/hash；旧 result 可作为显式人工处理的未保存候选。

### 状态与恢复矩阵

| 状态 | 允许转换 | 禁止转换 / 恢复规则 | 来源页可见状态 |
| --- | --- | --- | --- |
| `model_not_called` | 唯一 claim owner 在 provider 前推进 `model_in_flight`；仅确定性 preflight 失败可进 `failed_retryable` | 不可直接标记 committed；其他 worker 不得抢占并调用 | 生成准备中 |
| `model_in_flight` | 模型成功且归一化结果已落库 → `model_succeeded_pending_commit`；确定失败 → `failed_terminal`；供应商/进程结果不明或 lease 到期 → `model_unknown` | `model_unknown` 不得因重启或 lease 到期回到 `model_in_flight`；不得再次调用同 operation | 生成中；未知时显示“状态待确认” |
| `model_succeeded_pending_commit` | CAS 成功 → `committed`；基线 revision 不符 → `conflict_result_retained`；响应丢失时保持该持久状态并可重试提交 | 不得丢弃 result；不得用最新世界自动合并或重新调用模型 | 未保存结果可处理；冲突时保留生成结果并提示先重读 |
| `committed` | 只读 replay receipt/result | 不得再次写世界、再次调用模型或改变 receipt | 已保存，可按 operation 读回 |
| `conflict_result_retained` | 只读 result；作者显式新 operation 后重新生成 | 同 operation 不得强行覆盖新 revision；不得把冲突降级为成功 | 世界已变化，生成结果仍可处理 |
| `model_unknown` | 只读状态；作者完成外部确认后显式新 operation | 自动恢复、后台轮询和 lease worker 均不得重新付费调用 | 状态待确认 |
| `failed_retryable` | 仅适用于 provider 尚未打开前的确定性失败；按策略由作者显式新 operation | 不可把“provider 已打开但未收到结果”伪装成 retryable | 可重试但需新 operation |
| `failed_terminal` | 作者显式新 operation | 同 operation 不得自动重试或写入世界 | 生成失败 |

因此，“模型未调用”只有在 durable `model_not_called` claim 中有明确事实时才成立；一旦进入 `model_in_flight`，任何 crash/超时都按可能已付费处理，宁可进入待确认，也不以猜测恢复来保证 exactly-once。该合同只保证本系统每个 operation 最多发起一次供应商调用，不宣称第三方供应商具备 exactly-once 计费语义。

确定失败和 hash 冲突的边界也必须保持显式：provider 尚未打开前的确定性 preflight 失败可记录 `failed_retryable`，但恢复仍由作者创建新 operation；provider 已打开后即使错误看似可重试，也不能回到同 operation 的自动调用，确定失败记录为 `failed_terminal`，供应商结果不明记录为 `model_unknown`。同一 `operationId` 的 request hash 不一致一律禁止继续、禁止写世界、禁止调用模型并返回 `OPERATION_ID_REUSED`；只有新 operation 才允许新意图。当前隔离原型用一个小断言覆盖 hash 冲突不增加调用次数；确定失败的 provider-specific 分类和双库迁移验证留给后续 runtime/store Story，不在 Spike 中扩展生产能力。

### 最小隔离 seam proof

新增的 `server/tests/worldStructureBackfillIdempotencySpike.test.js` 是拟议 claim/result 持久化合同的非生产原型，未被任何生产模块 import。它使用 mock 模型、原生 `better-sqlite3` 和 `/tmp/ai-novel-s3-02b3s-*` 独立 fixture；每个 fixture 保留 `fixture.db`、`evidence.json` 和 `state-transitions.ndjson`。证明矩阵覆盖：

1. 同 operation 在两个独立 SQLite connections 上并发和重放只产生一次 mock 调用，重放读回已提交事实。
2. 模型成功、提交前中断并关闭连接后，新的 SQLite connection 仍能读取持久化 normalized result 并恢复提交，不重新调用模型。
3. 模型结果未知时，重启读到 `model_unknown`；`model_in_flight` lease 到期也转为未知，均不自动重调。
4. 生成期间作者把世界 revision 改为 2 后，CAS 返回 `conflict_result_retained`，世界保留作者内容，normalized result 仍可读。
5. 提交成功后模拟 HTTP 响应丢失，按 operation 读回 receipt 与 normalized result，重放调用次数不增加。

该测试仅证明拟议状态机和隔离 store seam 能表达所需事实，不证明当前生产 `/backfill` 已安全，也不执行真实模型、用户数据库或迁移。

执行证据（本机隔离环境，2026-09-22 初验、2026-09-23 复跑）：

- 固定命令：`pnpm --filter @ai-novel/server build && node --test server/tests/worldStructureBackfillIdempotencySpike.test.js`
- 退出码：`0`（server TypeScript build 通过；Node test `5/5` 通过）。pnpm 仅输出现有配置字段告警，不影响退出码。
- 临时证据根目录：2026-09-23 复跑为 `/tmp/ai-novel-s3-02b3s-ln5wNF/`；各场景的 `fixture.db`、`evidence.json` 和 `state-transitions.ndjson` 当前可供复核。2026-09-22 的临时目录已被系统清理。
- 状态转换摘要：并发/重放（两个独立 SQLite connections）`model_not_called → model_in_flight → model_succeeded_pending_commit → committed`；跨连接恢复复用持久 result；未知/lease `model_in_flight → model_unknown`；revision 冲突 `model_succeeded_pending_commit → conflict_result_retained`；响应丢失场景提交后按同一 operation 读回 receipt/result，模型调用次数均为 `1`。
- 该次 build/test 未读取 `DATABASE_URL` 用户库、未调用真实 provider、未执行 Prisma 或其他迁移；`git diff --check` 已通过（仅检查本 Spike 自有文档/测试文件）。

### 最小 owned store、迁移和 owner

不能只扩展现有 attempt 表：其设计明确不保存模型输出；也不能只复用 `WorldMaintenanceCommitReceipt`：它只证明世界提交。建议后续生产实现拥有 `server/src/services/world/backfill/` 模块，并新增两类最小持久事实：

- `WorldStructureBackfillOperation`：世界/operation 唯一键、request hash、base revision、Prompt/provider/model、model state、生命周期状态、attempt/request 引用、lease、result/receipt 关联和冲突 revision。
- `WorldStructureBackfillResult`：operation 唯一键、归一化结构与 binding support、base revision、request hash、digest、保存时间和安全 attempt 引用。

SQLite 与 PostgreSQL schema/migration 必须同一字段和唯一约束；migration owner 负责双 schema、增量 migration、空库/已有库验证及回滚前备份门。backfill application owner 负责 claim/result/CAS 编排和 operation 查询；现有 world maintenance owner 负责复用或明确扩展 CAS/receipt；HTTP owner 负责请求/响应合同；来源页 owner 负责生成中、未保存结果、冲突和待确认的显式用户路径。Spike 不新增这些生产文件。

### 后续可独立验收的 Story 拆分（每张不超过 5 点）

建议由 PO 在下一次 Planning 建立以下实施卡；当前 Spike 不将它们视为 Ready 或已实现：

| 建议 ID | 点数 | 闭环范围与最小验收 |
| --- | ---: | --- |
| S3-02b3a Durable backfill claim/result store | 5 | 双 schema + 增量 migration；唯一 operation/request hash、lease、状态终态和 result record；隔离双库证明未知不重调、结果可读；不接来源页 |
| S3-02b3b Backfill runtime 与 CAS recovery | 5 | Prompt/attempt 关联、归一化结果持久化、同 operation CAS、冲突零写入、receipt/result replay；真实 mock/provider seam 与故障回放通过 |
| S3-02b3c Backfill HTTP operation query | 3 | 请求接收 operation/base revision/hash 输入，新增按 operation 读状态/receipt/result 的内部接口，响应丢失和错误码契约通过；不扩任务中心 |
| S3-02b3d 来源页恢复投影 | 3 | 同一世界工作台的两处“AI 整理/提取”入口/视图共用 operation；生成中、已保存、未保存结果可处理、冲突、状态待确认均能回到当前世界工作台；不在运行记录放操作按钮 |
| S3-02b3e 组合恢复与发布门 | 3 | SQLite/PostgreSQL 迁移检查、并发/重启/lease/响应丢失行为回归、真实来源页验收和 beta 组合验证；不引入真实模型计费验证 |

拆成五张卡是因为 store/schema、runtime/CAS、HTTP、来源页投影和组合验收拥有不同 owner；把它们压成一张 5 点卡会掩盖 migration 与未知调用恢复风险。

PO 于 2026-09-24 在 b3a 完成后进一步拆分上表的 **S3-02b3b 历史建议项**：`S3-02b3b1` 只负责已持久结果→世界 CAS/专属回执，独立 5 点合同见 [b3b1](./s3-02b3b1-backfill-result-commit-contract.md)；`S3-02b3b2` 才负责模型→持久结果及调用恢复，仍待 Refinement、未估点和未承诺。原 `S3-02b3b` 的 5 点仅为 Spike 当时的估算，不再作为独立 Story 或 Sprint 容量重复计入。拆分原因是现有手动维护回执使用专属 operation 类型，若把模型接线、backfill 专属原子回执和并发恢复绑在一张卡内，无法在 5 点内清晰验收。

### Spike 出口记录

- Sprint Goal：决策和隔离证据冻结了调用前 claim、生成结果与基线 revision 绑定、CAS 冲突保留以及响应丢失/未知状态恢复合同；不宣称生产能力。
- 承诺/完成：经根 PM 与 Terra QA/QC 独立签认，`2/2` 点，无 Stretch、无 carryover；生产 S3-02b3 继续 Refinement / Not Ready。
- 错误假设：不能把 ModelAttemptEvidence 当作生成结果仓库；不能把手动 PUT 的 WorldMaintenance receipt 套到 backfill；不能以 `version` 自增代替 `contentRevision` CAS；lease 到期不是供应商调用未发生的证据。
- 流程改进（最多两项）：①所有“AI 写入”Story 在 DoR 先画出 provider 调用、结果持久化、CAS、receipt 四个事实边界；②行为 proof 固定保留隔离库和状态转换日志，QA 直接按状态矩阵核对调用次数与零写入，而不是只看最终 HTTP 状态。
- 文档范围：本 Spike 的稳定规则已由根 PM 同步到世界维护恢复 Wiki；生产接线另按后续 Story 验证。Spike 工程师按文件边界未编辑 Wiki、TASK、Roadmap、README 或 release notes。
