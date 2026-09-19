# S3-02a：世界样本安全提交合同

## Story 合同

- Release / Sprint：Release 1 / R1-S2F。
- 状态 / 点数：Done / 3 点。
- 用户价值：AI 或其他页面提交世界样本时，不能覆盖作者刚保存的内容；响应丢失后也能判断同一操作是否已经完成。
- 依赖：S1-06、S3-01 已 Done；本合同冻结 S1-06 要求的样本 content revision、提交身份、旧客户端和事务边界。
- Owner：世界 Runtime Agent拥有 `server/src/services/world/maintenance/{domain,application,infrastructure}` 与聚焦测试；根集成人独占双 Prisma schema、增量迁移和共享合同。

## 冻结持久化与命令合同

- `World.contentRevision Int @default(1)`；迁移历史值初始化为 `max(1, version)`，只作为兼容下限，不把缓存/报告变化解释为内容修改。
- `WorldMaintenanceOperation` 记录 target、operation type/id、request hash、状态和时间；唯一键为 `(targetType, targetId, operationType, operationId)`，并按 `(targetType, targetId, updatedAt)` 建索引。
- `WorldMaintenanceCommitReceipt` 以 operation record 一对一保存 base/committed/decision revision、selected patch ids JSON、before/after digest 和 committedAt；本卡不要求 proposal 表，也不复用 `WorldSnapshot` 伪装提交回执。
- 内部命令必须包含 `operationId`、`expectedContentRevision`、`expectedDecisionRevision`、完整且已验证的 `candidateAggregate`、`selectedPatchIds`、`sourceRef`；禁止接受裸 `Partial<World>`。
- `DecisionRevisionPort` 在本卡返回 `0 / empty_compat`，不在 `World` 上伪造新的 decision revision 字段。
- 内部结果至少包含 operationId、target、state、contentSaved、可选 committedRevision/receipt、sourceRoute。

## 错误与旧客户端策略

- 缺少 operation id 或 revision：`428 REVISION_REQUIRED`，零内容写入。
- 基础内容版本不匹配：`409 CONTENT_REVISION_CONFLICT`，返回可解释当前版本，零内容写入。
- 同 operation id 使用不同 request hash：`409 OPERATION_ID_REUSED`。
- 只有无法由 operation/receipt 查询确定提交结果时才返回 `COMMIT_RESULT_UNKNOWN`。
- 本卡新增内部安全入口，不静默让旧客户端绕过版本保护；旧 HTTP 写入口是否收敛由 S3-02b 处理。

## 范围与非范围

范围：

- 对 `World` 样本实现 `commitWorldSample`：完整 aggregate 的 CAS、内容/兼容投影/contentRevision/operation/receipt/前后 digest 同事务提交。
- 提供 operation replay、冲突和 receipt 查询端口。
- 内容事务成功后 best-effort 刷新 RAG；失败不得撤销内容，只返回可重试资料债。
- 两套 schema 与 PostgreSQL/SQLite 增量迁移；SQLite 迁移必须能被既有 runtime migration runner 执行。

非范围：

- 不做 AI proposal/evaluation、部分采用产品流程或 NovelWorld 双侧同步。
- 不收敛普通编辑、深化、结构编辑、导入和快照恢复等所有旧入口；该工作属于 S3-02b。
- 不新增 UI/API、快照恢复权限、全局 rollback 或自动修复。

## 验收标准

1. 相同 base revision 的两个不同提交仅一个成功，另一个冲突且零内容写入。
2. 相同 operation 重放返回同一 receipt，不重复递增版本或复制证据；相同 id 不同 hash 被拒绝。
3. 内容、兼容投影、revision、operation 或 receipt 任一持久化失败，事务不留半完成状态。
4. 提交成功但响应丢失时可按 operation 查询；重启重试不会覆盖后来的人工作品。
5. 缺少版本的旧式请求不进入安全提交；RAG 失败不回滚已保存内容。

## 最窄验证

- `server/tests/worldMaintenanceCommit.test.js` 单文件 11/11 通过；与 `runtimeMigrations`、`prismaMigrationCompleteness` 组成三套组合检查共 22/22，覆盖双提交竞争、重放、operation id 复用、事务回滚、响应丢失查询与后续人工 revision 保护。
- PostgreSQL 与 SQLite 两套 schema validate/generate 通过；SQLite 增量迁移已由既有 runtime migration runner 验证。真实 PostgreSQL apply 保留为 Release gate，不作为本 Story 当前阻断，也不以 SQLite 结果冒充该发布门。
- 本卡无 UI，Computer Use 不适用。

## 完成证据

- AC1～AC5 均有行为证据：CAS 竞争只允许一个提交、同 operation 重放与 hash 冲突、事务原子性、响应丢失后的 receipt 查询、后续人工 revision 保护，以及 RAG 资料债不回滚内容。
- 新入口继续只接受完整且已验证的 aggregate 与 expected revision；旧 HTTP/手动编辑/AI 整理/快照恢复入口未被静默接管，S3-02b 继续负责后续收敛。
