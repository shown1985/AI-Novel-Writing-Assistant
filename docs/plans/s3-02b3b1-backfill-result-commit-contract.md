# S3-02b3b1：AI 世界结构补全已生成结果的 CAS 提交与回执

## 身份与状态

- Release / Epic：Release 1 / S3 可信世界；Story ID：`S3-02b3b1`；5 点；优先级 P1；Done。独立 GPT-6 Scrum 与技术 QA DoR PASS、实现的独立 GPT-6 QA/QC PASS，`6ed64e31` 已合入 beta 并完成最窄复核。
- 用户价值：一次 AI 结构补全已生成的结果能在作者世界内容未变化时只保存一次；如果生成期间作者改了世界，旧结果留存而不覆盖新内容。提交响应丢失时，可按原 operation 读回保存回执和生成结果。
- 已完成依赖：S3-02b3s 冻结的身份/恢复决策、S3-02b3a durable claim/result store、S3-02b1 世界内容 revision CAS 与 S3-02b2 手动结构保存。当前生产 `/backfill` 仍走旧路径。
- 本 Story 的输入是 `model_succeeded_pending_commit` 且已有规范化 result 的 `(worldId, operationId)`；不调用模型、不创建 result、不接 HTTP。`S3-02b3b2` 才负责模型到 result 的运行时编排。

## 范围与实现边界

1. 新增 backfill-owned commit receipt 持久事实，与 backfill operation 一对一，保存 `worldId`、`operationId`、原 result digest、`baseContentRevision`、`committedRevision`、提交前后内容 digest 与提交时间。扩展 backfill operation 状态为 `committed` 和 `conflict_result_retained`，并维护双 Prisma schema、同名仅增量 SQLite/PostgreSQL migration。不把手动 `WorldMaintenanceCommitReceipt` 伪装成 backfill receipt，不改手动 PUT 的现有语义。
2. 在 `server/src/services/world/backfill/` 的 owned application/infrastructure 边界提供 `commitPersistedResult(worldId, operationId)` 与只读 `readCommitOutcome`。事务先读取并核验 operation/result 的世界归属、request hash、基线 revision、digest 与 pending-commit 状态；用 `worldStructure.ts` 已公开的 `normalizeWorldStructuredData`、`normalizeWorldBindingSupport`、`applyStructuredWorldToLegacyFields` 和 maintenance facade 已公开的 `validateWorldMaintenanceCandidate` 处理结构。先以事务内读出的完整 World 行加 result 的**原始持久化结构与 binding support** 组成候选，让维护校验在任何 normalization 之前拒绝悬空关系及使用建议引用；再归一化和生成兼容投影。无需修改这两个现有模块或复制手动保存的字段映射。不得相信调用方再传的一份生成结果。
3. 同一事务内按 `World.contentRevision == baseContentRevision` 条件更新世界结构、兼容投影及 `contentRevision + 1`，写 backfill 专属 receipt，并将 operation 置为 `committed`；若 CAS 失配，只将 operation 置为 `conflict_result_retained` 并保留 result，世界内容、revision、手动 receipt、snapshot/RAG 零写入。对同 world/operation 并发提交只允许一次内容递增和一份 receipt。
4. `committed` 重放返回原 receipt/result，不再次更新世界；两个连接并发提交同一 operation 时，落败方须读回赢家的同一 receipt/result，而不能把已成功的同一操作误报为内容冲突。`conflict_result_retained` 重放只读保留结果，不能用较新世界 revision 自动套用。事务结果或响应未知时先按同 operation 查 backfill receipt/result，不盲重提交；receipt 存在才宣称已保存。不得把世界写成功而 backfill 状态/receipt 未落库的半提交当成 Done。
5. 只保存结构相关字段和既有兼容投影，不把生成结果中的无关字段覆盖作者世界元数据。提交后的 snapshot/RAG 派生副作用留给 b3b2 的运行时接线；本 Story 不对外宣称它们已执行。

## Owner 与文件边界

- 一名 GPT-6 Luna Max 全栈工程师作为唯一数据 owner：只编辑 `server/src/services/world/backfill/` owned 模块、两份 Prisma schema、同名新增 backfill commit migration 与新增 `server/tests/worldStructureBackfillCommit.test.js`。结构/引用校验与兼容投影只 import 上述既有公开函数；不编辑 `worldStructureWorkspace.ts` 或 maintenance，不复制手动保存的字段映射；任何超出此边界的共享文件改动先回 PO Refinement。
- 根 PM/PO 独占 `TASK.md`、Roadmap、Sprint/Story 合同、Wiki/发布说明判断、提交和 beta 集成。GPT-6 Luna Medium Scrum/QA/QC 只读独立验收。一个 Agent 同时只持一张 In Progress Story。

## 验收与最窄验证

- 隔离 SQLite 从既有迁移历史增量升级；断言旧 World、手动 operation/receipt 行不变，新 receipt 的唯一键/FK/字段与双 schema/双 migration 对称。PostgreSQL 只做无连接 schema validate 与 migration 静态对称，真实 apply 留 b3e。
- 真实两个独立 SQLite 连接争同一 pending result：首次成功使 World `contentRevision` 恰从 `base` 变为 `base + 1`，只有一份 backfill receipt；落败方、重启读回和响应丢失后的重放均得到同一 receipt/result，revision 仍为 `base + 1`，不再次递增。
- 模型结果落库后作者先修改世界 revision：CAS 冲突返回保留结果，World 结构、revision、其他作者字段和派生副作用不变；重放不再次写入。无 result、错 world、错状态、结果 digest/基线不一致、结构引用不合法均在写 World 前失败，operation 也不得误置终态。测试至少包含一项 normalization 本会过滤的悬空关系或 cluster 引用，证明先校验原始持久结果。
- 固定最窄检查为双 Prisma schema validate、隔离 SQLite Prisma generate、server build、`node --test server/tests/worldStructureBackfillCommit.test.js server/tests/worldStructureBackfillStore.test.js server/tests/prismaMigrationCompleteness.test.js server/tests/runtimeMigrations.test.js`、`git diff --check`。独立 QA/QC PASS、Wiki 决策、UI 验收不适用、阶段提交与 beta 同合同复核后才能 Done。

## 非范围与数据保护

- 不改现有 `POST /structure/backfill`、`WorldService.backfillStructure`、模型/Prompt/attempt 调用、HTTP query/错误码、来源页 UI、运行记录动作、手动结构 PUT、单区块生成、同步或其他旧世界入口；b3b2/c/d/e 分别承担后续接线、HTTP、UI 与组合发布门。
- 不新增通用提交平台，不扩 Release 2/MySQL/MFA/多人协作。只用 `:memory:` 或 `/tmp/ai-novel-s3-02b3b1-*` 隔离库；不对用户库执行 migration/reset/drop、也不在没有审批和已验证备份时做破坏性操作。

## DoR 核对依据

`worldStructure.ts` 的三个结构函数与 maintenance domain 的候选校验函数均已公开。backfill-owned 事务可从自身的 World/result 行组成完整候选并通过这些函数完成校验、归一化和投影，不需要修改手动保存路径。若实现发现公开函数不足以保持既有规则，Story 返回 Refinement，而不是扩增文件边界。b3b2 只消费本 Story 的提交 facade；不重做 CAS、receipt 或本 Story 的 schema/migration。
