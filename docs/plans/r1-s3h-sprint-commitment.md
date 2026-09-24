# R1-S3H Sprint 承诺：AI 世界结构补全结果的 CAS 提交

## Sprint Goal 与承诺

已经持久化的 AI 世界结构补全结果，只能在原世界内容版本仍匹配时保存一次；内容冲突保留结果，提交响应丢失可按同一 operation 读回回执。本窗口不接模型或现有 `/backfill`。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@eb75369c`；S3-02b3a store、S3-02b1 世界 CAS、S3-02b2 手动结构保存均 Done。S3-02b3b1 的 GPT-6 Scrum 与技术 QA 独立 DoR PASS。
- 承诺：仅 [S3-02b3b1 补全结果 CAS 提交与回执](./s3-02b3b1-backfill-result-commit-contract.md)，5 点；Stretch：无。后续 b3b2/c/d/e 不进入本 Sprint。

## Owner 与文件边界

- 根 PM/PO：`TASK.md`、Roadmap、Sprint/Story 合同、Wiki/发布说明判断、阶段提交与 beta 集成。
- 单一 GPT-6 Luna Max 全栈工程师：Story 合同指定的 backfill owned 模块、双 Prisma schema、双同名新增迁移与新增聚焦测试。现有 `worldStructure.ts` 与 maintenance 仅可经已公开 facade/import 消费，不改其文件；不能“顺手”接旧 `/backfill`、模型、HTTP、UI 或派生任务。
- GPT-6 Luna Medium Scrum/QA/QC 独立核对合同与行为；共享 schema/migration 始终归本 Story 的单一工程师。

## 验收与退出门

以 [Story 合同](./s3-02b3b1-backfill-result-commit-contract.md)为唯一范围和验收准绳。重点证据为原始引用先校验、两独立连接争同一 pending result 只提交一次、响应丢失/重启重放同回执、作者改世界后的零覆盖与结果保留、双库增量迁移对称。只跑隔离 SQLite 与无连接 PostgreSQL schema/静态检查，不执行用户库或真实 PostgreSQL apply。

工程师自测、独立 QA/QC PASS、Wiki 决策、UI 验收状态、阶段提交和 beta 同合同复核后才能 Done；类型检查或单连接 mock 不能单独证明业务完成。无产品 UI 改动，UI 验收不适用。若现有公开 facade 不足、实际超过 5 点或需改手动 maintenance，退回 PO Refinement，而不是扩大 Story。

## Review 与 Retrospective 出口

关闭时记录 Sprint Goal、承诺/完成点数、carryover/退回原因、漏检与至多两项具体改进。未完成事项重新估点，不自动顺延。
