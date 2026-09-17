# S1-00：诊断共享接线与存储契约门

## Story 结论

- Release / Sprint：Release 1 / R1-S1。
- Story：S1-00 诊断共享接线与存储契约门（2 点）。
- 用户价值：设置、知识库和后续建议应用共享同一份“未知/成功/失败/过期”事实，不会因打开页面而触发模型请求，也不会把检测建议自动写成配置。
- 状态：合同门已冻结；诊断持久化、被动 GET、显式探测和建议应用仍由 S1-02a/02b/03 实施，不能据此标为业务完成。

## Shared DTO

权威运行 Schema 位于 `shared/types/diagnostics.ts`：

- `checkState` 只有 `not_checked / healthy / failed / stale`；没有 legacy `ok` 布尔值。
- 读取接口成功但尚未检测时返回 `success=true + checkState=not_checked`；HTTP/存储读取错误保持 API Error，不能包装成 `failed` 或空数据。
- `diagnosticId` 在未检测时可空；`configurationFingerprint` 始终是服务端产生的不透明 HMAC 标识，客户端不得接收凭证摘要、API Key、鉴权头或 HMAC 密钥。
- 每个 target 保存独立状态、时间、能力结果、脱敏错误、建议和整数 revision；模型 plain/structured 与 RAG embedding/vector store 使用同一能力数组。
- 建议应用请求必须携带 `operationId`、`diagnosticId`、`expectedConfigurationFingerprint`、唯一 target 列表、recommendationId 和 expectedRevision；客户端不回传协议/格式值作为权威建议内容。
- 批量应用只有 `applied / replayed / conflict` 三种结果；任何 target 冲突时整批零写入。

客户端已预留但尚未消费以下接线：

- `GET /api/llm/model-routes/connectivity` → `getModelRouteReadiness()`，只读最近报告，零模型调用。
- `GET /api/rag/readiness` → `getRagReadiness()`，只读配置与最近报告，零 embedding/Qdrant 探测。
- `PUT /api/llm/model-routes` 的 `source=diagnostic_recommendation` guarded batch → `applyModelRouteDiagnosticRecommendations()`；legacy 单路由手动保存保持原合同。
- query keys 使用 `modelRouteReadiness` 与 `ragReadiness`；现有主动 connectivity key 在消费者迁移完成前保留，不能混用缓存。

## 持久化模型设计

S1-02a 实施时在 SQLite/PostgreSQL 同步加入 owned diagnostics 模块和增量迁移，不复用 `ModelRouteConfig` 作为检测事实：

### DiagnosticRun

- `id`、`scope(model_routes|rag)`、`configurationFingerprint`、`checkState`、`startedAt/completedAt`、脱敏 `errorSummary`、`createdAt/updatedAt`。
- 索引：`(scope, createdAt)`；同 scope+fingerprint 的活动 claim 必须唯一，以合并并发相同检测。
- 运行成功或失败都保留最新报告；失败不能覆盖上一份报告，读取时同时表达“最新尝试失败”和前一份完成证据。

### DiagnosticTargetResult

- `runId`、`targetId`、`targetKind`、`taskType/provider/model`、`checkState`、能力结果 JSON、脱敏错误、建议 JSON、目标 revision、时间。
- 唯一键：`(runId, targetId)`；结果只能属于创建它的 configurationFingerprint。

### DiagnosticRecommendationApplication

- `operationId` 唯一、`diagnosticId`、selection hash、expected/current fingerprint、结果与时间。
- 相同 operationId+selection 重放返回原结果；相同 operationId 不同 selection 确定冲突。
- guarded batch 与目标 revision 校验、路由更新、应用记录必须在一个数据库事务内完成。

保留策略：每个 scope 保留最近 20 个完成 run；活动 run、最近成功、最近失败和仍被未消费建议引用的 run 不删除。清理在新 run 提交后异步执行，清理失败不改变诊断结果。

## 指纹与凭证版本

- 配置指纹覆盖有效 provider/model/baseURL 标准化结果、协议/格式、启用状态、authMode、任务类型，以及凭证版本；不覆盖无关 UI 状态。
- 数据库存储的凭证使用记录 revision/updatedAt 参与；环境凭证使用 diagnostics infrastructure 在应用数据目录维护的随机本机 HMAC key 计算稳定摘要。密钥文件不得经 API、日志、导出或诊断记录返回，权限按平台尽力限制为当前用户。
- HMAC key 丢失或轮换会使旧报告统一变为 `stale`，不能误报失败或继续应用旧建议。
- API 只返回最终不透明 `configurationFingerprint`；它不能被用来恢复或比较明文凭证。

## 状态与并发合同

```text
无报告 → not_checked
显式检测开始 → active claim（读取仍返回最近完成报告 + pending 元数据）
成功 → healthy
失败 → failed（保留上一次完成报告供审阅）
有效配置或凭证版本变化 → stale
```

- GET、页面聚焦、刷新和自动 refetch 零 transport 调用、零模型路由写入。
- POST 显式检测按 scope+fingerprint 合并；不同 fingerprint 不共享结果，旧响应不能覆盖新配置视图。
- 读取持久化失败返回 API Error；模型/embedding/Qdrant 检测失败是 200 报告中的 `failed`。
- S1-03 应用前在同一事务内重算 current fingerprint 并校验每个 target revision；任一不匹配返回 HTTP 409 和 `conflict`，整批零写。
- legacy 手动保存不要求 diagnosticId，但必须推进目标 revision，使既有报告变 `stale`。

## 兼容与实施门

| 消费方 | 当前状态 | 解锁条件 |
| --- | --- | --- |
| LLM connectivity POST | 仍会探测并可能写路由 | S1-02a 拆成报告持久化与零配置写入 |
| 设置概览/模型路由页 | 仍可能自动 POST | S1-02b 改读 readiness，并保留显式按钮 |
| RAG GET health | 仍调用 embedding/Qdrant | S1-02a 新增只读 readiness；旧端点迁成兼容投影 |
| 知识库页 | 仍消费 `ok` | S1-02b 使用 checkState，不把 unknown 显示为失败 |
| 检测建议应用 | 尚无 guarded batch | S1-03 实施事务/CAS/幂等；legacy 手动保存单独兼容 |

S1-02a 在提交 schema/迁移前必须用隔离 SQLite 与 PostgreSQL 演练增量路径，并由根集成人独占 schema/迁移接线。任何 HMAC key 存储、活动 claim 唯一性或旧手动保存 revision 仍未实现时，对应 Story 不能标 Done。

## 验收证据

```text
pnpm --filter @ai-novel/shared build
node --experimental-strip-types --test client/tests/diagnosticsContract.test.mjs
pnpm --filter @ai-novel/client typecheck
```

Schema 测试覆盖 unknown≠failed、禁止 secret-bearing 字段和 guarded target 唯一性。该证据只证明共享合同与客户端接线可编译，不证明后端接口、持久化或 UI 已实现。

## Wiki 判断

本 Story 冻结的是后续实施合同，仍未形成已运行的稳定架构；暂不更新 Wiki。S1-02a/03 完成持久化、并发与恢复行为后，再把经验证规则写入 prompts/architecture 或 debugging Wiki，避免把设计草案写成事实。
