# R1-S3D Sprint 承诺：AI 结构补全幂等边界 Spike

## Sprint Goal 与承诺

冻结 AI 世界结构补全在模型调用前、生成结果提交时和响应丢失后的唯一恢复合同，使后续实现不会重复付费或覆盖作者较新的世界内容。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@88e0e00d`；R1-S3C 已完成 `5/5`，S3-02a、S3-02b1、S3-02b2 均 Done。
- 承诺：仅 [S3-02b3s AI 结构补全幂等与费用边界 Spike](./s3-02b3s-structure-backfill-idempotency-spike.md)，2 点；Stretch：无。当前状态：Active，Story Ready；完成 `0/2`。
- 容量：2 点。Spike 产出决策与证据，不冒充生产能力；S3-02b3 实施卡保持 Refinement / Not Ready。

## 角色、Owner 与文件边界

- 根 PM/PO：唯一负责 Sprint/Story 状态、范围裁决、最终合同签认、阶段提交和 beta 集成，不编写 backfill 生产实现。
- Luna xhigh 全栈工程师：单一 Spike owner，只读追踪 `POST /worlds/:id/structure/backfill`、Prompt Runner/attempt、世界 CAS/operation/receipt 与来源页动作；可新增非生产证据 `server/tests/worldStructureBackfillIdempotencySpike.test.js`，测试数据库和状态日志写入 `/tmp/ai-novel-s3-02b3s-*` 并保留供复核。提交范围只限 Spike 决策文档和该聚焦原型证据，不改生产 backfill、schema 或 migration。
- Terra medium Scrum Master：检查稳定 ID、2 点上限、依赖、非范围和输出是否满足 DoR/DoD；不替代工程审计。
- Terra medium QA/QC：独立核对调用次数、revision 冲突、响应丢失和持久事实是否有证据；不以静态阅读代替 seam proof。
- 共享根文件、`TASK.md`、Roadmap、Sprint 合同、README、发布记录和 Wiki 仅由根 PM 修改。任何 production/schema 需求进入后续实施卡，不在 Spike 中顺手接线。

## 验收与退出门

1. 给出当前 backfill 从请求、模型调用、结构归一化、世界写入、snapshot/RAG 到响应的实际时序，并列明每一步已有的持久事实和空白；不得把模型 attempt 或世界 receipt 误称为可恢复生成结果。
2. 冻结调用前 operation 身份、稳定 request hash 输入和 durable claim 状态；明确并发同 operation、重启、lease 过期和未知调用结果分别如何处理。若缺少“模型未调用”的 durable terminal fact，自动恢复不得再次触发付费调用；必须复用已持久化结果，或进入待确认并要求作者显式创建新 operation。该规则用于保证一个 operation 最多发起一次供应商调用，不宣称第三方供应商具备 exactly-once 计费语义。
3. 冻结生成结果与基线 `contentRevision` 的绑定、CAS 提交、冲突后结果保留和显式重新生成规则；生成期间世界变化必须零世界覆盖。
4. 用带允许转换和禁止转换的状态表覆盖“模型未调用、调用中、模型成功但未提交、提交成功但响应丢失、模型状态未知、确定失败”及来源页可见状态，说明何时复用结果、何时允许新 operation；重启或 lease 到期不得把未知调用直接转回可自动调用。
5. `server/tests/worldStructureBackfillIdempotencySpike.test.js` 必须明确标注为拟议 claim/result 持久化合同的隔离原型，而非现有 `/backfill` 生产保证。使用 mock 模型和 `/tmp/ai-novel-s3-02b3s-*` SQLite fixture，至少证明：同 operation 并发/重放最多发起一次模型调用；模型成功但提交前中断后复用持久结果而不重调；调用状态未知时重启/lease 到期不自动重调；生成期间 revision 改变零世界写入并保留生成结果状态；提交成功响应丢失可按 operation 读回 receipt，并从拟议 result record 读回归一化结构。执行命令固定为 `pnpm --filter @ai-novel/server build && node --test server/tests/worldStructureBackfillIdempotencySpike.test.js`，证据记录测试退出码、临时数据库路径和状态转换摘要。不得调用真实模型、用户数据库或执行破坏性迁移。
6. 明确是否需要最小 owned store 或既有表扩展、SQLite/PostgreSQL migration 影响、模块/文件 owner，并把后续生产工作拆成每张不超过 5 点的可独立验收 Story；若一张卡无法闭环，必须拆分而不是降低验收。
7. Terra medium Scrum/QA/QC 独立 PASS，`git diff --check` 与适用的最窄文档/证据检查通过；若形成稳定运行合同，更新世界维护恢复 Wiki，否则明确仅保留在计划文档。Spike 为内部决策，不新增用户行为，UI 验收不适用，默认不改 README/release notes。

## 明确不承诺

- 不实现 S3-02b3 生产 backfill 幂等、来源页新状态、store、schema/migration 或 API。
- 不改 `POST /structure/generate`、手动结构 PUT、分层、深化、导入、同步、评估、提案或作者决定。
- 不改 Prompt 文案、模型选择/路由、通用 attempt store、任务中心或 Release 2 能力。
- 不运行真实模型、用户数据库、桌面包装或公开发布；不为守住 2 点而把未知状态视为天然幂等。

## Review 与 Retrospective 出口

完成时记录：Sprint Goal 是否达成、承诺/完成点数、carryover 原因、Spike 对后续 Story 数量和点数的结论、发现的错误假设，以及最多两项流程改进。未通过独立 QA/QC 或缺少隔离 seam proof 时不得标 Done。
