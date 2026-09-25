# 世界结构补全持久化边界

## 模块归属与边界

本模块拥有一次 AI 世界结构补全意图对应的持久 claim、单次模型调用编排、规范化结果，以及从已持久结果到世界 CAS 的提交回执。外部调用只依赖 `index.ts` facade。模型调用只经过 `application/WorldStructureBackfillGenerationService` 与已登记的 `world.structure.backfill` Prompt；本模块不接入现有 `/backfill`、不创建 snapshot、不排队 RAG、不暴露 HTTP，也不创建 UI 状态。

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

## 从模型调用到持久结果的编排

`generatePersistedResult({ worldId, operationId, baseContentRevision, provider?, model? })` 的输出止于 `model_succeeded_pending_commit` 或失败/未知终态，不调用 `commitPersistedResult`、不写 World。顺序固定为：先 `read`，已有 operation 走重放；否则校验 `World.contentRevision == baseContentRevision`（不符返回 `BASE_REVISION_MISMATCH`，不写 operation），用已登记 Prompt 资产的 id/version、`generationPolicyVersion` 与 `sourceDigest`（`buildWorldStructurePromptSource(world)` 的 SHA-256）组成冻结请求并 `claim`；在外层 `mode: "invoke"`、带已登记 Prompt 身份的请求上下文内取得 `requestId`，以 `onNotAcquired: "return_current"` 调用 `startModel`。只有 `acquired: true` 的一方以 `singleProviderTransportAttempt: true` 调用 `runStructuredPrompt`；落败方按 `current` 返回生成中、已存 result 或终态，不发起调用。成功输出按旧路径规则归一化（`seededFrom: "ai-backfill"`，`lastBackfilledAt` 取自注入时钟），再 `persistResult`。

`startModel` 时 attempt id 尚未产生，因此 `persistResult` 在事务内允许一次补绑：已存 `modelAttemptId` 为 null、`modelRequestId` 一致且入参带非空 attempt id 时，把它同时写入 operation 与 result。已存 attempt id 非空但不同、或 request id 不同，仍是 `MODEL_REFERENCE_MISMATCH`。不设 `onNotAcquired` 的 `startModel` 保持原有引用比对语义。

失败映射是对已结构化错误的确定性后处理，表在 `domain/worldStructureBackfillGeneration.ts`：provider 已返回但内容不可用（`malformed_json`、`empty_content`、`incomplete_json`、`schema_mismatch`、`thinking_pollution`、`output_truncated`、`reasoning_budget_exhausted`）经 `markFailed` 进入 `failed_terminal`；传输错误、取消、未列出的类别、非结构化异常，以及拿到输出后的归一化或 `persistResult` 失败，一律 `markUnknown(unknown_result)` 进入 `model_unknown`。原因是结果不明时重调可能重复扣费，宁可保守。失败类别只随返回值交给调用方，不持久化。

重放一律不新开调用，唯一例外是 `model_not_called`：重新读取 World，revision 与重算的 `sourceDigest` 都等于已存值时，才由 `startModel` 的唯一胜者继续调用；否则返回 `BASE_REVISION_MISMATCH` 且不改行。`model_in_flight` 在 lease 未到期时返回生成中，到期后只能 `markUnknown(lease_expired)`；lease 只用于发现 owner 失联，不能证明 provider 未收到请求。调用方 base revision 或 provider/model 与已存请求不同返回 `OPERATION_ID_REUSED`。

本模块目前持久化 `model_not_called`、`model_in_flight`、`model_succeeded_pending_commit`、`model_unknown`、`failed_terminal`、`committed` 和 `conflict_result_retained`。`failed_terminal` 只能从 `model_in_flight` 进入，与 `model_unknown` 一样不会重新取得调用权。`model_unknown` 不自动重开模型调用；提交服务也不改变旧 `/backfill` 路径的运行行为。现有 attempt 记录和手动维护回执都不能替代本模块的 backfill 结果或提交事实。
