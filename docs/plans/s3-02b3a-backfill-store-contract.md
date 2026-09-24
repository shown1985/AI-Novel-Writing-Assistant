# S3-02b3a：AI 世界结构补全持久 claim/result store

## 身份、价值与状态

- Release / Epic：Release 1 / S3 可信世界；Story ID：`S3-02b3a`；5 点；优先级 P1；独立 QA 与 Scrum Master DoR PASS，进入 R1-S3G 承诺；实现的独立 GPT-6 QA/QC 已 PASS，待阶段提交与 beta 复核。
- 用户价值：作者发起一次“AI 补全世界结构”后，服务端能持久辨认同一次操作、是否已经打开模型调用以及是否已有可恢复结果，为后续不重复付费、不覆盖较新世界内容提供可信事实。
- 依赖：[S3-02b3s 幂等与费用边界 Spike](./s3-02b3s-structure-backfill-idempotency-spike.md)、S3-02b1 世界 CAS、S3-02b2 手动结构保存均 Done。当前生产 `/backfill` 仍是旧路径；本 Story 不把新 store 接入 HTTP/模型/CAS，后续 b/c/d/e 分卡承担。
- 入口/数据来源：现有 `World` 的 `id/contentRevision`；同一作者意图冻结的 `worldId`、`operationId`、`baseContentRevision`、Prompt ID/version、provider/model、`generationPolicyVersion`、source digest。owned domain 函数由这些字段计算稳定 request hash；模型输出尚不存在时不能将其纳入 hash。模型观察事实的身份来自 `ModelAttemptEvidence.requestId` 与主键 `attemptId`，不能把二者混用。

## 唯一 Owner 与文件边界

- 一名 GPT-6 Luna Max 全栈工程师独占 `server/src/services/world/backfill/{domain,infrastructure}/` 与该模块的 `index.ts`、`README.md`；两份 Prisma schema `server/src/prisma/schema.prisma`、`schema.sqlite.prisma`；同名增量 migration `server/src/prisma/migrations/20260923120000_world_structure_backfill_store/migration.sql` 与 `server/src/prisma/migrations.sqlite/20260923120000_world_structure_backfill_store/migration.sql`；新增 `server/tests/worldStructureBackfillStore.test.js`。
- 根 PM/PO 独占 `TASK.md`、Roadmap、Sprint/Story 合同、Wiki/发布记录、阶段提交与 beta 集成。共享 schema/migration 由同一工程师作为唯一数据 owner；其他 Agent 只读验收。
- 现有 `WorldMaintenanceOperation/CommitReceipt` 属手动 `commit_world_sample`，不保存模型生成结果；不得挪作 backfill 结果仓库。模型 attempt 表也不是结果仓库。

## 范围与生产合同

1. 新增 `WorldStructureBackfillOperation` 与 `WorldStructureBackfillResult` 两类 owned 持久事实。operation 以 `(worldId, operationId)` 唯一，保存稳定 request hash、冻结的基线 revision、Prompt/provider/model、`generationPolicyVersion`、source digest、状态/lease、可空 `modelRequestId` 与 `modelAttemptId`；result 以 operation 唯一，保存规范化结构、binding support、基线 revision、request hash、`generationPolicyVersion`、digest 与可空的同名模型引用。`modelRequestId` 对应 attempt 记录的 `requestId`，`modelAttemptId` 对应唯一 `attemptId`；二者是可选观察引用，不加外键，以免要求尚未异步落库的 attempt 先存在或让观察表删除改变结果事实。非空引用需在 store 写入/重放时一致，后续 runtime 才负责实际填充。双 Prisma schema 与双增量 migration 字段/唯一约束一致；迁移只新增表/索引/World owned relation，不修改既有世界内容。
2. store facade 只提供 `claim/read/startModel/persistResult/markUnknown` 及必要的只读结果查询；不能调用 provider、提交世界 CAS、写 snapshot/RAG、接 HTTP 或创建 UI 状态。状态至少能持久区分 `model_not_called`、`model_in_flight`、`model_succeeded_pending_commit`、`model_unknown`。后续 committed/conflict/failed 状态由 runtime Story 接入时扩展，不在本卡伪造完整生产闭环。
3. owned domain 函数按固定字段集合与键名顺序构造 canonical JSON，再以 SHA-256 十六进制计算 request hash；可选 provider/model 缺省一律归一为 `null`。字段集合为 `worldId`、`baseContentRevision`、`promptId`、`promptVersion`、`provider`、`model`、`generationPolicyVersion`、`sourceDigest`；`operationId` 作为唯一身份而非内容 hash 输入。store 不接受调用方随意提供的 hash 代替该计算。时间戳、HTTP retry ID 和模型输出都不参与。同 world/operation 且相同 hash 的重放只能读取既有 claim/result；同 ID 不同 hash 固定返回 `OPERATION_ID_REUSED`，不得覆盖既有事实。测试须覆盖对象字段排列、仅 retry/time 变化不改 hash，任一冻结字段（尤其策略版本）变化都会拒绝重放。
4. `startModel` 是唯一从 `model_not_called` 进入 `model_in_flight` 的原子门；并发两个独立数据库连接只能有一个获得调用所有权。lease 到期或结果未知只能进入 `model_unknown`；重启、重放和 lease 过期均不能让同 operation 重新获得调用权。store 不宣称第三方 exactly-once 计费。
5. `persistResult` 只接受匹配 world/operation/hash/base revision、模型引用（若有）且已 `model_in_flight` 的规范化结果；result JSON 字段白名单仅容纳 normalized structure 与 binding support，不保存 raw prompt、密钥或 provider 错误体。写入 result 与 `model_succeeded_pending_commit` 状态应形成同一持久提交。相同 digest 可读回既有结果，不同 digest 明确拒绝；跨连接/重启仍可读取原结果。测试覆盖空模型引用、匹配引用与不匹配引用；未知世界、跨世界 operation、状态不符或错误 hash 均零世界内容写入。

## 验收与最窄验证

- SQLite：测试只对 `:memory:` 或 `/tmp/ai-novel-s3-02b3a-*` 隔离库运行；从既有 migration 历史增量升级后，既有 `World` 的内容/revision/关键行数不变，新增表/索引/外键完整；双连接并发 claim、不同 hash、结果跨连接恢复、重复 digest、lease 过期未知及零世界写入均有行为断言。
- PostgreSQL：用不连接数据库的 Prisma schema validate 与新增测试静态核对双 schema/同名增量 SQL 的 operation/result 字段、唯一索引、World 外键及无 attempt 外键决定。真实 PostgreSQL apply 与跨库组合回归留给 `S3-02b3e`。
- 固定检查：`DATABASE_URL='file:/tmp/ai-novel-s3-02b3a-validate.db' pnpm --filter @ai-novel/server exec prisma validate --schema src/prisma/schema.sqlite.prisma`；`DATABASE_URL='postgresql://validate:validate@127.0.0.1:1/isolated' pnpm --filter @ai-novel/server exec prisma validate --schema src/prisma/schema.prisma`（均只校验 schema，不连接目标库）；`pnpm --filter @ai-novel/server prisma:generate`；`pnpm --filter @ai-novel/server build`；`node --test server/tests/worldStructureBackfillStore.test.js server/tests/prismaMigrationCompleteness.test.js server/tests/runtimeMigrations.test.js`；`git diff --check`。如现有通用迁移测试不覆盖本卡关键表，在新增测试中补合同断言，避免扩改通用测试文件。
- 独立 GPT-6 QA/QC 需检查数据库并发、重启、失败/未知恢复与双 schema/migration 对称。无产品 UI 改动，UI 验收不适用。完成前需检查 Wiki 是否新增稳定存储/状态知识、用户发布记录是否有可见能力；阶段提交后在 beta 复核最窄合同。

## 非范围与数据保护

- 不改 `POST /worlds/:id/structure/backfill`、Prompt/attempt 接线、真实或 mock provider 调用、世界 CAS/commit receipt、snapshot/RAG、来源页/任务中心/UI；不宣称当前生产 backfill 已具幂等或安全恢复。
- 不接单区块生成、手动结构 PUT、同步、提案采用、其他世界旧入口、Release 2/MySQL/MFA/多人协作，不扩建通用“付费调用平台”或额外安全体系。
- 只用隔离临时数据库和增量迁移检查；不运行 `prisma migrate reset`、`db reset`、删除/覆盖用户数据库或在没有明确审批及已验证备份的情况下做破坏性操作。PostgreSQL 真实 apply 不在本 Story。
