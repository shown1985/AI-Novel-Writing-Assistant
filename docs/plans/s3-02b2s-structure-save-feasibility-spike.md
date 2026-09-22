# S3-02b2s：世界结构保存 CAS 可行性 Spike

## 身份与决定范围

- Release / Epic：Release 1 / S3 可信世界；稳定 ID：`S3-02b2s`；2 点，Done 的限时 Spike，不属于实施 Sprint 承诺。
- 用户价值：在修改既有结构保存前，确认重试、快照失败和编辑草稿的最小可靠行为，避免作者看到“保存失败”却已经覆盖内容，或在冲突后丢掉草稿。
- 依赖：S3-02a/b1 已 Done；[S3-02b2 候选合同](./s3-02b2-world-structure-cas-contract.md)保持 Refinement。
- Owner：一名 Luna xhigh 全栈工程师只读审计/隔离验证；根 PM/PO 决定合同与点数。共享计划文件只由根 PM 编辑。

## 要回答的三个问题

1. 同一结构保存请求 A 成功、随后其他请求 B 改写世界后，A 按原 operationId/payload 重试：现有调用顺序能否在不重建当前候选的条件下返回 A 的 receipt？若不能，最小修改边界是什么？
2. 内容提交成功但独立 `structure-saved` snapshot 失败时，现有 API 实际返回什么、重放是否补建快照？选择不增加表/队列的最小可解释语义，并证明不会把已保存内容误报为未保存。
3. 手册与高级结构两个现有编辑视图遇到 409、未知结果、query refresh、切书迟到响应时，草稿在哪些条件下被重置？能否只在现有组件和父 mutation 中保留草稿，不建立新的冲突中心？

## 范围、证据与退出

- 只检查手动 `PUT /worlds/:id/structure` 及其两个现有编辑视图；只读源码和现有聚焦测试，必要时用隔离 mock/SQLite fixture 验证，不使用用户数据库或真实模型。
- 输出每问的现状证据、最小决策、owner/文件边界和一条可执行 AC；判断 S3-02b2 是否仍可在 5 点内独立实施，或必须再次拆分。
- 非范围：实现 CAS、改生产代码、AI backfill、分层/深化/导入、同步、评估、schema/migration、新 UI、安全体系或 Release 2。
- Spike Done 只代表决定与证据完成，不代表 S3-02b2 Ready、世界保存已受保护或 Release 1 完成。根 PM 按证据更新候选合同，独立 QA/QC 复核后才可进入后续 Planning。

## 决定与证据

- 重放：`WorldMaintenanceWorkflowService.commitWorldSample` 会先验证候选，再读取已有 operation；持久化层也先解析已有 operation 后进入新提交。既有 `worldMaintenanceCommit.test.js` 已覆盖 A 保存、B 改写、A 重放，以及候选变化但显式原始请求 hash 不变的重放。S3-02b2 只需按原始 `structure/bindingSupport` 和固定 operationId 构造稳定 hash，沿用现有门面；不要求新 preflight API 或“完全不构造候选”来满足本卡。新增结构入口回归须证明 A→B→A 返回原 receipt、B 内容保持、revision 不重增；若候选校验本身失败则明确返回错误，不猜测提交结果。
- 快照：旧结构保存的顺序是内容写入后独立创建快照；快照失败会让 API 报 500，尽管内容已保存。选择最小语义为：CAS 的内容、revision、operation、receipt 是成功事实；`structure-saved` 快照仅在首次 `committed` 尝试，失败不回滚、不伪报内容失败。成功响应以 `snapshotStatus=created|failed|unknown` 表示首次成功、首次失败和重放未核查；首次失败仍 HTTP 200 并提示历史快照未完成。`replayed` 不补建、不声称快照已存在；不增加持久化状态或补偿队列，因此只承诺 at-most-once 尝试，不承诺 exactly-once 快照。
- 草稿：现有两个编辑视图在任意 `initialPayload` 变化时重置本地草稿。S3-02b2 只保护当前视图内的脏草稿：409、未知结果、同一 world 查询刷新及旧 world 迟到响应不得覆盖；当前 operation 成功后接受服务器结果，切换 world 时采用新 world 结果。手册与高级视图之间切换时的未保存草稿共享不属于本卡，不建立父级跨视图草稿仓库。结构 mutation 携带 worldId 和固定 operationId，回包先匹配当前 world 再更新反馈与查询。
- 文件顺序：单 Luna 全栈 owner 先完成 Runtime、客户端与定向测试；根 PM 独占共享 `worldHttpContext.ts`/`worldStructureRoutes.ts`，在 Runtime 合同稳定后串行接线并做 beta 集成。初步仍可按仅手动 PUT 的 5 点候选评估，QA/QC 未复核前不得标 Ready。

只读验证复用服务端四文件聚焦检查 `22/22` 与客户端公理保存检查 `3/3`；没有写生产代码、真实数据库或运行模型。上述证据证明当前门面的可行性，不证明结构 PUT 已受 CAS 保护。
