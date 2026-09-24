# 世界结构补全持久化边界

## 模块归属与边界

本模块拥有一次 AI 世界结构补全意图对应的持久 claim 与规范化结果。外部调用只依赖 `index.ts` facade。本模块不调用模型提供方、不修改 `World` 内容、不执行内容版本 CAS、不创建 snapshot、不排队 RAG、不暴露 HTTP，也不创建 UI 状态。现有 `/backfill` 路径尚未接入本 store。

operation 属于一个 `World`，由 `(worldId, operationId)` 唯一标识；result 通过唯一 `operationRecordId` 归属 operation，不重复保存 `worldId` 或增加第二条 World 外键。模型 attempt 的 `requestId` 与 `attemptId` 是可空观察引用，不添加指向 attempt evidence 的外键。

## 冻结请求身份

`createWorldStructureBackfillRequestHash` 负责生成 canonical SHA-256。参与 hash 的固定字段及顺序为：`worldId`、`baseContentRevision`、`promptId`、`promptVersion`、`provider`、`model`、`generationPolicyVersion`、`sourceDigest`。缺失的 provider/model 统一归一为 `null`。`operationId`、时间戳、传输重试 ID 和生成结果都不参与 hash。同一 `(worldId, operationId)` 以同一 hash 重放时只读回原 claim；hash 不同则返回 `OPERATION_ID_REUSED`，不覆盖原事实。

## 调用所有权与结果保存

`claim` 创建 `model_not_called` 事实。`startModel` 是唯一进入 `model_in_flight` 的 store 操作，并以条件更新保证只有一个并发调用方获得 `acquired: true`。重放和 lease 到期都不会重新授予模型调用权。`markUnknown` 必须带明确原因：`unknown_result` 可立即把调用结果不明的 operation 标记为 `model_unknown`；`lease_expired` 只有在 lease 截止后才能转换。两条路径都不能重新授予调用权。

`persistResult` 只接受与 claim 匹配的冻结请求、基线 revision 和模型引用，且 operation 必须处于 in-flight。它仅规范化保存世界结构与 binding support 两个 JSON 字段，计算 SHA-256 digest，并在同一数据库事务中写入 result 和 `model_succeeded_pending_commit` 状态。相同 digest 的重放读回原结果；不同 digest 返回 `RESULT_DIGEST_CONFLICT`。无效或非 JSON 值会在写入前被拒绝。

本模块只持久化 `model_not_called`、`model_in_flight`、`model_succeeded_pending_commit`、`model_unknown`。后续 runtime Story 负责 committed/conflict/failed 状态及世界 CAS/receipt 边界。现有 attempt 记录和手动维护回执都不能替代本模块的 backfill 结果记录。
