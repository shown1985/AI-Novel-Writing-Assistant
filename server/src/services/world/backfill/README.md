# 世界结构补全持久化边界

## 模块归属与边界

本模块拥有一次 AI 世界结构补全意图对应的持久 claim、规范化结果，以及从已持久结果到世界 CAS 的提交回执。外部调用只依赖 `index.ts` facade。本模块不调用模型提供方、不接入现有 `/backfill`、不创建 snapshot、不排队 RAG、不暴露 HTTP，也不创建 UI 状态。

operation 属于一个 `World`，由 `(worldId, operationId)` 唯一标识；result 与 backfill commit receipt 分别通过唯一 `operationRecordId` 归属 operation。result 不重复保存 `worldId`，receipt 保存回执所需的 `worldId` 和 `operationId`，并通过 operation 外键保证生命周期一致。模型 attempt 的 `requestId` 与 `attemptId` 是可空观察引用，不添加指向 attempt evidence 的外键。

## 冻结请求身份

`createWorldStructureBackfillRequestHash` 负责生成 canonical SHA-256。参与 hash 的固定字段及顺序为：`worldId`、`baseContentRevision`、`promptId`、`promptVersion`、`provider`、`model`、`generationPolicyVersion`、`sourceDigest`。缺失的 provider/model 统一归一为 `null`。`operationId`、时间戳、传输重试 ID 和生成结果都不参与 hash。同一 `(worldId, operationId)` 以同一 hash 重放时只读回原 claim；hash 不同则返回 `OPERATION_ID_REUSED`，不覆盖原事实。

## 调用所有权与结果保存

`claim` 创建 `model_not_called` 事实。`startModel` 是唯一进入 `model_in_flight` 的 store 操作，并以条件更新保证只有一个并发调用方获得 `acquired: true`。重放和 lease 到期都不会重新授予模型调用权。`markUnknown` 必须带明确原因：`unknown_result` 可立即把调用结果不明的 operation 标记为 `model_unknown`；`lease_expired` 只有在 lease 截止后才能转换。两条路径都不能重新授予调用权。

`persistResult` 只接受与 claim 匹配的冻结请求、基线 revision 和模型引用，且 operation 必须处于 in-flight。它仅规范化保存世界结构与 binding support 两个 JSON 字段，计算 SHA-256 digest，并在同一数据库事务中写入 result 和 `model_succeeded_pending_commit` 状态。相同 digest 的重放读回原结果；不同 digest 返回 `RESULT_DIGEST_CONFLICT`。无效或非 JSON 值会在写入前被拒绝。

## 已持久结果的 CAS 提交

`commitPersistedResult(worldId, operationId)` 只接受状态为 `model_succeeded_pending_commit` 且有 result 的 operation。事务内核对 operation 与 result 的请求指纹、基线 revision、生成策略、模型引用和 result digest；再用事务内读取的完整 World 与 result 中原始结构、binding support 组成候选。必须先调用公开的 `validateWorldMaintenanceCandidate` 拒绝悬空结构关系和无效地点建议引用，然后才能归一化结构、binding support 并生成既有兼容字段投影。

事务以 `World.contentRevision == baseContentRevision` 为 CAS 条件，只更新结构字段和兼容投影，并将内容 revision 加一；同一事务写 backfill 专属回执并将 operation 置为 `committed`。若世界 revision 已变化，只将 operation 置为 `conflict_result_retained`，保留 result，不改 World、不创建 receipt。提交事务或响应结果不明确时，必须先按同一 operation 读取 receipt/result；没有可验证 receipt 时不得报告已保存。

已提交的重放只返回原回执和 result；同一 operation 的并发落败方先检查赢家的持久回执，再判断是否为内容冲突。冲突状态只读保留结果，不自动应用到新 revision。手动 PUT 的 `WorldMaintenanceCommitReceipt` 与 backfill 专属回执用途不同，不可互相替代。

本模块目前持久化 `model_not_called`、`model_in_flight`、`model_succeeded_pending_commit`、`model_unknown`、`committed` 和 `conflict_result_retained`。`model_unknown` 不自动重开模型调用；提交服务也不改变旧 `/backfill` 路径的运行行为。现有 attempt 记录和手动维护回执都不能替代本模块的 backfill 结果或提交事实。
