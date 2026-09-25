# S3-02b3c：AI 世界结构补全的提交编排、失败原因保存与提交后派生

## 身份、价值与状态

- Release / Epic：Release 1 / S3 可信世界；父项 `S3-02b3c`。规划基线 `beta@64d128a1`，该基线已包含 S3J 的 `WorldStructureBackfillGenerationService`、`failed_terminal`、`onNotAcquired` 与 attempt 补绑。
- 状态：Refinement 完成；PO 已于 2026-09-25 确认拆分与三项决定（见文末“PO 决定”）。整体诚实估算 9 点，超过 5 点，因此拆为两张卡，另新建接线卡：
  - [S3-02b3c1](#s3-02b3c1提交编排与失败原因持久化)：5 点，**Done**（[R1-S3L](./r1-s3l-sprint-commitment.md)，独立 QA/QC PASS）。
  - [S3-02b3c2](#s3-02b3c2提交后-snapshotrag-一次性派生)：4 点，依赖 c1，保持 Not Ready。
  - `S3-02b3c3` HTTP 查询与 `/backfill` 接线：排在 c2 之后、b3d 之前，Not Ready，跟踪见 [Spike 拆分表](./s3-02b3s-structure-backfill-idempotency-spike.md)。
- 用户价值：作为不懂写作流程的新手作者，我点一次“AI 补全世界结构”后，希望生成结果在世界没被我改动时自动保存一次。我中途改了世界时，生成结果要保留下来、不覆盖我的修改。页面断开或服务重启后，我仍能知道结果是“已保存”“生成中”“生成失败（以及为什么）”还是“状态待确认”，而且不会被重复扣费。
- 前置（均 Done 并在基线中）：
  - [S3-02b3s](./s3-02b3s-structure-backfill-idempotency-spike.md) 状态/恢复矩阵；
  - [S3-02b3a](./s3-02b3a-backfill-store-contract.md) store；
  - [S3-02b3b1](./s3-02b3b1-backfill-result-commit-contract.md) `commitPersistedResult`/`readCommitOutcome`；
  - [S3-02b3b2b](./s3-02b3b2b-backfill-generation-orchestration-contract.md) `generatePersistedResult`。
- PO 已定（2026-09-25）：result→World 提交组合与提交后 snapshot/RAG 由本父项承担；失败类别由本父项持久化，必要时加 migration。

## 父项共同非范围

- 不接 HTTP 路由/查询接口、`POST /worlds/:id/structure/backfill`、`WorldService.backfillStructure`、`worldStructureWorkspace.backfillWorldStructure` 或来源页 UI。
  - 原 Spike 表中 b3c 的“HTTP operation query”与旧 `/backfill` 切换归新卡 `S3-02b3c3`（PO 决定 1）。
  - 来源页恢复投影属于 S3-02b3d，组合发布门与真实 PostgreSQL apply 属于 S3-02b3e。
- 不改 Prompt 资产、PromptRunner、`structuredInvoke.ts`、`structuredInvokeParser.ts`，不改手动结构 PUT、运行记录动作、其他世界旧入口，不引入 Release 2。
- 不调用真实模型，不访问用户数据库，不做真实 PostgreSQL apply、`migrate reset`/`db reset` 或任何破坏性数据操作。只用 `/tmp/ai-novel-s3-02b3c*-*` 隔离库。

## 共享调用方影响清单（R1-S3J Retro 改进①）

两张卡**都不修改**共享解析器、`structuredInvoke.ts` 或 PromptRunner。零修复与单次模式调用方的策略和调用次数不受影响；DoR 与 QA 只需确认 diff 未触及这些文件。

- 零修复 Prompt 资产（`repairPolicy.maxAttempts: 0`）：`worldDraft.prompts.ts` 两处（约 342、490 行）、`world/generation/worldGeneration.prompts.ts`（约 20 行）、`novel/ideaInspiration.prompts.ts`（约 28 行）、`novel/ideaConstellation/ideaConstellation.prompts.ts` 两处（28、82 行）。另有 `PromptWorkbenchService.ts:687` 按资产策略透传。
- 零修复分类守卫：`structuredInvoke.ts:391` 的 `classifyZeroRepairParseFailure` 只在单次模式开启。
- `singleProviderTransportAttempt: true` 的生产调用方只有 `WorldStructureBackfillGenerationService.ts:270`。

本父项**会触及**的共享面及其调用方：

| 共享面 | 现有调用方 | 影响与约束 |
| --- | --- | --- |
| 两份 Prisma schema + 新增 migration | 全部 Prisma 使用方（重新生成 client） | 只新增可空列，不改既有列、索引或默认值；既有查询语义不变 |
| `WorldStructureBackfillStore.markFailed/markUnknown`（c1） | `WorldStructureBackfillGenerationService.ts:213/329-330`；`worldStructureBackfillStore.test.js`（511/519/527/566）；`worldStructureBackfillGeneration.test.js:205-206` 的转发包装只传两个参数 | 类别参数必须可选，缺省时写 `null`；上述测试文件不改且仍须通过 |
| `WorldStructureBackfillCommitService`（c1 只读消费） | 仅测试 | c1 不改 b3b1 提交事务 |
| `WorldStructureBackfillCommitReceipt`（c2 加列） | `PrismaWorldStructureBackfillCommitStore`、b3b1 测试 | 只加可空列；b3b1 提交事务不写该列 |
| 快照与 RAG 入口（c2 只读复用） | `worldSnapshotService.createWorldSnapshot`（WorldService 多处）；`WorldService.queueRagUpsert` → `ragIndexService.enqueueUpsert`；维护 facade 的 `WorldRagRefreshPort` | c2 注入端口，不修改这些模块 |

---

## S3-02b3c1：提交编排与失败原因持久化

### 身份

`S3-02b3c1`；5 点；P1；**Done**（R1-S3L）。单一 GPT-6 Luna Max 全栈工程师负责实施，同时是唯一数据 owner。

### 范围

1. **运行门面**：新增 `WorldStructureBackfillRunService.runBackfill({ worldId, operationId, baseContentRevision, provider?, model?, signal? })`，执行顺序如下：
   - 先调用 `generatePersistedResult`。
   - 状态为 `model_succeeded_pending_commit` 时，调用 `commitPersistedResult`。
   - `committed` 与 `conflict_result_retained` 只调用 `readCommitOutcome` 读回，不再提交。
   - `in_progress`、`failed_terminal`、`model_unknown` 原样返回。

   统一 outcome 为 `committed | conflict_result_retained | result_pending_commit | in_progress | failed_terminal | model_unknown`，携带 operation、result、receipt（仅已提交时）与持久化的 `failureCategory`。
   - （DoR 修订 4）`WorldStructureBackfillRunService` 的生成服务与提交服务均为可注入依赖（构造参数），facade 只负责默认装配。测试据此注入抛出 `COMMIT_RESULT_UNKNOWN` 的提交服务，不修改 `PrismaWorldStructureBackfillCommitStore.ts`。
2. **提交结果不明**：`commitPersistedResult` 抛出 `COMMIT_RESULT_UNKNOWN` 或其他提交异常时，先用 `readCommitOutcome` 查持久事实，不调用模型。重放时可再次提交，因为 b3b1 的 CAS/receipt 已保证只写一次。
   - （DoR 修订 2）outcome 按 `readCommitOutcome` 读回的 operation `status` 映射，不按“有没有 receipt”推断：
     - `committed` 且带 receipt → `committed`；
     - `conflict_result_retained` → `conflict_result_retained`；
     - `model_succeeded_pending_commit` → `result_pending_commit`；
     - 读回为 `null` 或其他状态时，原样抛出提交异常，不得猜测为任何 outcome。
   - 禁止把“没有 receipt”直接映射为 `result_pending_commit`（冲突状态同样没有 receipt）。
3. **只读查询**：新增 `readRunOutcome(worldId, operationId)`，返回与上面相同形状的 outcome。它零模型调用、零写入；operation 不存在时返回 `null`。它是 S3-02b3c3 HTTP 查询与 b3d 来源页的唯一读取入口。
4. **失败类别持久化**：在 `WorldStructureBackfillOperation` 上新增可空列 `failureCategory`，双 schema 与同名新增 migration `20260926120000_world_structure_backfill_failure_category` 保持对称。
   - `markFailed(worldId, operationId, failureCategory?)` 与 `markUnknown({ ..., failureCategory? })` 在**同一条件更新**中写入状态与类别，只有状态真的发生转换时才写入，重放不会覆盖已有类别。
   - lease 到期路径固定写入 `lease_expired`。
   - 类别只接受白名单：`StructuredOutputErrorCategory` 各值加上 `WORLD_STRUCTURE_BACKFILL_LOCAL_FAILURE_CATEGORIES` 各值，其他字符串以 `INVALID_INPUT` 拒绝。不保存错误消息、原始输出、provider 响应体或密钥。
   - （DoR 修订 3）白名单是 contracts 文件中的运行时常量；其中结构化部分须经类型检查与 `StructuredOutputErrorCategory` 双向对齐（例如 `satisfies Record<StructuredOutputErrorCategory, true>` 形式），任一侧增删值都会让 `tsc` 失败，二者不能漂移。
   - `WorldStructureBackfillOperationRecord` 增加 `failureCategory`。生成服务写入失败时传入类别，重放时从持久字段读出，不再返回 `null`。
   - （DoR 修订 5）`recordFailure` 在 `marked.changed` 为 `false` 时返回数据库中已持久化的 `failureCategory`，不返回本次内存中的类别；AC6“已有终态不被覆盖”以此为准。
5. **用户文案不在本卡**：类别只作为机器可读事实保存。转换为面向新手的“为什么失败/下一步做什么”说明由 b3d 负责。

### 生产文件边界

- 新增：
  - `server/src/services/world/backfill/application/WorldStructureBackfillRunService.ts`
  - `server/src/prisma/migrations/20260926120000_world_structure_backfill_failure_category/migration.sql`
  - `server/src/prisma/migrations.sqlite/20260926120000_world_structure_backfill_failure_category/migration.sql`
  - `server/tests/worldStructureBackfillRun.test.js`
- 修改：
  - `backfill/domain/worldStructureBackfillContracts.ts`：record 字段、类别类型与白名单。
  - `backfill/domain/worldStructureBackfillGeneration.ts`：导出白名单所需的类别集合。
  - `backfill/infrastructure/prismaWorldStructureBackfillStore.ts`：类别写入与读取。
  - `backfill/application/WorldStructureBackfillGenerationService.ts`：传入类别、重放读出类别。
  - `backfill/application/index.ts`、`backfill/index.ts`：facade 增加 `createWorldStructureBackfillRunService`。
  - `backfill/README.md`。
  - `server/src/prisma/schema.prisma` 与 `schema.sqlite.prisma`：仅 `failureCategory String?`。
- 只读导入：`WorldStructureBackfillCommitService`（不改 `PrismaWorldStructureBackfillCommitStore.ts`）；`llm/structuredOutput.ts` 的类别类型。
- 既有测试 `worldStructureBackfillStore.test.js`、`worldStructureBackfillCommit.test.js`、`worldStructureBackfillGeneration.test.js`、`backfillSingleAttemptPrompt.test.js` 不改，且须全部通过。
- （PO 边界修订，2026-09-25）允许只改 `worldStructureBackfillStore.test.js` 的临时库夹具：先只应用排序在 `20260923120000_world_structure_backfill_store` 之前的迁移，按原样建表并完成原断言后，再应用排序在其后的迁移；断言不改不减。原因：原夹具只排除自身迁移，c1 迁移会在 store 表存在前执行 `ALTER TABLE` 而失败。
- 根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki、发布记录、提交与 beta 集成。GPT-6 Luna Medium QA/QC 只读验收。

### 验收条件

1. **成功闭环**：新 operation 恰好一次 provider `stream()`，最终为 `committed`。World `contentRevision` 恰为 `base + 1`，只有一份 backfill receipt，outcome 同时带 result 与 receipt。本卡零 snapshot、零 RAG 入队。
2. **响应丢失与重启重放**：用新连接对已提交 operation 再次 `runBackfill`，得到同一 receipt/result；模型调用 0 次，revision 仍为 `base + 1`，receipt 仍只有一份。
3. **生成后、提交前中断**：operation 停在 `model_succeeded_pending_commit` 时（包括注入提交异常或 `COMMIT_RESULT_UNKNOWN` 的情况）：
   - 首次调用返回 `result_pending_commit`，或经 `readCommitOutcome` 确认后返回 `committed`，模型调用 0 次。
   - 下一次重放完成提交，模型调用仍为 0，只递增一次 revision。
   - 没有可验证 receipt 时，不得报告 `committed`。
   - （DoR 修订 2）另测冲突路径：注入的提交服务抛 `COMMIT_RESULT_UNKNOWN`，而持久状态已是 `conflict_result_retained` 时，返回 `conflict_result_retained`，不得返回 `result_pending_commit`。
4. **作者并发修改**：生成完成后、提交前作者改了世界（revision 变化），结果为 `conflict_result_retained`。World 结构、revision 和其他作者字段均不变，result 保留。重放只读返回，模型调用 0、写入 0。
5. **并发**：在同一文件型临时 SQLite 库上，用两个 worker 线程（Retro 改进②，禁止 `:memory:`、禁止同进程双连接）并发 `runBackfill` 同一 operation：
   - provider 调用总数为 1，revision 只递增 1 次，receipt 只有一份。
   - 落败方返回 `in_progress`、`result_pending_commit` 或 `committed`，不抛引用错误。
   - 随后任一方重放都读到同一 receipt。
6. **失败类别持久化**：
   - `malformed_json`、`empty_content`、`schema_mismatch` 分别以 `failed_terminal` 持久化对应类别。
   - `transport_error`、`cancelled`、`persist_failed` 以及注入时钟触发的 `lease_expired`，以 `model_unknown` 持久化对应类别。
   - 每个场景用新连接 `readRunOutcome` 都能读回类别；重放返回持久类别，模型调用 0。
   - 已有终态再次标记时类别不被覆盖。成功路径与 `model_not_called`、`model_in_flight` 的类别为 `null`。
7. **类别守卫**：非白名单类别以 `INVALID_INPUT` 拒绝，状态不变。数据库中只出现白名单类别值，没有错误消息或原始输出字段。
8. **只读查询**：`readRunOutcome` 对每种状态返回正确的 outcome 形状，前后模型调用数和各表行数不变；未知 operation 与跨世界 operation 返回 `null`。
9. **迁移**：
   - 隔离 SQLite 从既有迁移历史增量升级，既有 World、backfill operation、result、receipt 行数与内容不变，旧 operation 的 `failureCategory` 为 `null`。
   - 双 schema validate 通过；PostgreSQL 与 SQLite 同名 migration 只含一条加可空列语句，在测试中静态比对。
   - （DoR 修订 1）`worldStructureBackfillRun.test.js` 用 `dist/db/runtimeMigrations.js` 的 `applyRuntimeMigrationsToDatabase` 在两个 `/tmp/ai-novel-s3-02b3c1-*` 文件上验证：
     - (a) 全新：空文件应用完整迁移集；
     - (b) 升级：先应用 beta 迁移集（除 `20260926120000_*` 外的全部目录），写入 World、operation、result、receipt 行，再应用完整迁移集。
     - 断言两个文件的 `sqlite_master` 完全一致；升级前写入的行内容不变，且 `failureCategory` 为 `NULL`。
10. **回归与边界**：
    - b3a、b3b1、b2a、b2b 既有测试不改且全部通过。
    - `git diff --stat` 只含上述边界。
    - 共享调用方清单中的解析器、PromptRunner、`structuredInvoke.ts` 与零修复 Prompt 资产零改动；`/backfill`、WorldService、HTTP、client 零改动。

### 失败与并发要点

- 本卡**不新增**任何可以重开模型调用的路径。所有“结果不明”只能通过读取持久事实收敛，提交重试依赖 b3b1 的 CAS 幂等。
- 类别写入与状态转换在同一条件更新内完成，不存在“状态已终态、类别丢失”的半写入。`markUnknown`/`markFailed` 本身失败时，仍由 lease 到期收敛为 `lease_expired`。
- 双 worker 并发时，SQLite 的写锁等待使用 `busy_timeout`，不得用同进程双连接制造死锁后判定失败。

### 最窄验证

依次运行：

1. `DATABASE_URL='file:/tmp/ai-novel-s3-02b3c1-validate.db' pnpm --filter @ai-novel/server exec prisma validate --schema src/prisma/schema.sqlite.prisma`
2. `DATABASE_URL='postgresql://validate:validate@127.0.0.1:1/isolated' pnpm --filter @ai-novel/server exec prisma validate --schema src/prisma/schema.prisma`（只校验，不连接）
3. `pnpm --filter @ai-novel/server prisma:generate`
4. `pnpm --filter @ai-novel/server build`
5. `node --test server/tests/worldStructureBackfillRun.test.js server/tests/worldStructureBackfillGeneration.test.js server/tests/worldStructureBackfillCommit.test.js server/tests/worldStructureBackfillStore.test.js server/tests/prismaMigrationCompleteness.test.js server/tests/runtimeMigrations.test.js`
6. `git diff --check`

不调用真实模型，不连接 `DATABASE_URL` 用户库。无 UI，UI 验收不适用。

### DoR 核对（待独立 Scrum/QA 签认）

- [x] 已核对复用 seam 存在：
  - `generatePersistedResult` 的 outcome 有 `result_stored`/`in_progress`/`failed_terminal`/`model_unknown` 四类，`failureCategory` 当前只返回、不持久化。
  - `commitPersistedResult` 返回 `committed | replayed | conflict_result_retained`，未确认时抛 `COMMIT_RESULT_UNKNOWN`。
  - `status` 列为无 CHECK 的 TEXT。
  - `markUnknown` 带 `lease_expired`/`unknown_result` 原因。
- [x] 共享调用方与零修复调用方已列出，确认不触及解析器。
- [x] PO 已确认拆分与三项决定（2026-09-25）；c1 与 c2 各带自己的只加列 migration。
- [x] 独立 GPT-6 Scrum 与 QA DoR 有条件 PASS，修订已并入本合同。

### DoD

- [x] AC1～10 均有行为测试，最窄验证全部通过。
- [x] 独立 QA/QC PASS，重点核对：零新增模型调用路径、提交只一次、类别同事务写入、迁移只加列、边界。
- [x] 根 PM 作 Wiki 决策：失败类别持久化与运行 outcome 属于稳定恢复规则，预计更新世界维护恢复 Wiki。发布说明预计跳过：没有用户可见入口。
- [ ] 阶段提交，feature→beta 快进后在 beta 复跑同一合同命令。

### 估算与拆分触发

5 点：运行门面与提交结果不明分支约 2 点，类别持久化（store、生成服务、白名单）约 1.5 点，双库 migration 与迁移断言约 0.5 点，worker 线程并发夹具约 1 点。已无缓冲。

实施中出现以下任一情况，停回 Refinement，不扩大范围：

- 需要修改 `PrismaWorldStructureBackfillCommitStore.ts` 或 b3b1 提交事务；
- 需要修改任何既有测试文件；
- 需要持久化错误消息或原始输出；
- migration 需要改既有列或回填数据；
- 需要触及解析器或 PromptRunner。

---

## S3-02b3c2：提交后 snapshot/RAG 一次性派生

### 身份

`S3-02b3c2`；4 点（按 PO 决定 3 修订后须重估）；P1；依赖 c1 Done；Not Ready（需在 c1 完成后重新走 Refinement 与 DoR）。

### 范围草案

1. **范围与触发**：c1 的 `runBackfill` 在得到 `committed` 后（首次提交或重放皆可），执行一次性提交后派生。`conflict_result_retained`、失败与未知状态不做任何派生。
2. **snapshot 恰好一次**：
   - 在 `WorldStructureBackfillCommitReceipt` 上新增可空唯一列 `postCommitSnapshotId`，双 schema 与同名新增 migration 对称。
   - 同一事务内先创建 `WorldSnapshot`（label 沿用旧路径的 `structure-backfill`，数据用 `serializeWorldSnapshot`），再执行 `updateMany receipt where postCommitSnapshotId IS NULL`。影响行数为 0 时回滚，保证并发下只有一份。
   - snapshot label 对用户可见（`WorldAssetsTab.tsx` 直接显示 label），因此不得把 operationId 写入 label。
3. **世界已被改动时**：重放发现 World `contentRevision != receipt.committedRevision` 时，不补 snapshot（它已不能代表那次提交），返回 `snapshotStatus: "skipped_world_changed"`。
4. **RAG 刷新（PO 决定 3）**：snapshot 在 `committed` 路径上同步、best-effort 执行。RAG **不得同步执行**，只复用项目既有的索引任务自动入队机制，由 `RagWorker` 在后台消费。
   - 候选入口（Refinement 时核实并写死）：`server/src/services/rag/RagIndexService.ts` 的 `RagIndexService.enqueueOwnerJob`，经 `enqueueUpsert("world", worldId)` 调用。它对同一 owner 已 `queued`/`running` 的任务去重，与上游 `79aca85c`“重建索引自动入队”所用的 `KnowledgeService.queueKnowledgeRebuild` → `enqueueOwnerJob` 是同一机制。维护 facade 的 `WorldRagRefreshAdapter` 与 `WorldService.queueRagUpsert` 也经 `enqueueUpsert` 进入这里。
   - 本卡只创建任务行，不在请求内执行索引。入队失败只返回 `ragRefreshPending: true`，不回滚已保存内容。去重由 `enqueueOwnerJob` 保证，重放不另建去重状态。
   - 运行记录保持只读，不增加“重建索引”“重试”等动作。
   - Refinement 须写明最终入口文件与函数，并决定 RAG 关闭时的行为（见“待决问题”）。
5. **端口注入与适配器**：
   - snapshot 与 RAG 都经注入端口访问。RAG 端口复用维护 facade 已导出的 `WorldRagRefreshPort` 类型。
   - 生产适配器放在 backfill `infrastructure/`：snapshot 适配器只读导入 `worldTransfer.serializeWorldSnapshot`；RAG 适配器调用 `ragIndexService.enqueueUpsert`。维护 facade 的 `WorldRagRefreshAdapter` 未导出，本卡不改维护模块。
   - 生产装配由 `S3-02b3c3` 接线卡负责。

### 文件边界草案

- 新增：backfill `infrastructure/` 两个适配器；同名 migration `20260927120000_world_structure_backfill_post_commit_snapshot`（双库）；`server/tests/worldStructureBackfillPostCommit.test.js`。
- 修改：`WorldStructureBackfillRunService.ts`、backfill contracts、facade、README，以及双 schema（仅新增列）。
- 不改：`worldSnapshotService.ts`、`WorldService.ts`、维护模块、b3b1 提交事务。
- 夹具规则（c1 PO 边界修订延伸）：c2 的迁移会 `ALTER` receipt 表，而 `worldStructureBackfillCommit.test.js` 夹具只排除自身迁移，届时须对该夹具做同样的“先前缀迁移、建表断言后再应用后续迁移”修订，并在 c2 DoR 中列入边界。

### 验收草案

1. 首次提交恰好创建一份 `structure-backfill` snapshot，receipt 记录其 id；RAG 只经既有入口创建或复用一条 world upsert 任务，请求内不执行索引。
2. 提交后、snapshot 前崩溃的重放补齐恰好一份 snapshot；两个 worker 并发重放时仍只有一份。
3. 世界已改动后的重放不创建 snapshot，返回 `skipped_world_changed`。
4. snapshot 或 RAG 失败都不回滚 World/receipt，返回 `snapshotStatus: "failed"` 或 `ragRefreshPending`。之后的重放可以补 snapshot，但不会产生第二份。
5. 冲突、失败、未知状态零 snapshot、零 RAG。
6. 迁移只加一列，旧 receipt 为 `null`。
7. c1 与 b3a/b3b1/b2b 测试不改且全部通过。

### 估算

4 点（暂定）：事务性 snapshot 标记与缺口补齐约 1.5 点，适配器与端口约 1 点，migration 约 0.5 点，并发/崩溃夹具约 1 点。改为复用既有 RAG 入队后可能减少适配器工作，Refinement 时重估。

### 待决问题（c2 Refinement 内解决）

- RAG 关闭时的行为：知识库路径 `queueKnowledgeRebuild` 在 `ragConfig.enabled` 为假时不建任务（Wiki：不得制造没有消费者的永久排队）；世界路径（`WorldService.queueRagUpsert`、维护 `WorldRagRefreshAdapter`）不检查开关。**建议**与世界路径保持一致，由 PO 在 c2 DoR 时确认。无论哪种，都不得像手动重建那样自动开启 RAG，因为补全不是作者明确要求的重建动作。

---

## PO 决定（2026-09-25）

1. **批准**新建 `S3-02b3c3`：负责 HTTP 请求/查询、旧 `/backfill` 切换到 `runBackfill`/`readRunOutcome`，以及 c2 适配器的生产装配。排在 c2 之后、b3d 之前，Not Ready。
2. **批准** c1 与 c2 各自携带只加列的 migration，不合并。
3. **改定**：提交后 snapshot 在 `committed` 路径上同步、best-effort 执行；RAG 不同步执行，复用既有索引任务自动入队机制（见 c2 范围 4），c2 Refinement 须写明确切入口。运行记录保持只读。
