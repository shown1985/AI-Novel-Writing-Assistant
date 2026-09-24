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

Sprint Goal 在已持久 result→World CAS/receipt 的内部范围达成；承诺/完成 `5/5`，carryover `0`。GPT-6 QA/QC 独立 PASS，原始结构/使用建议先校验、双连接一次提交、响应丢失同回执、内容冲突保留结果和无回执未知保护均有隔离行为证据。`6ed64e31` 快进 beta 后，beta 独立工作树的 Prisma generate、server build 与合同四测 `31/31` PASS、工作树干净。无产品 UI 改动，UI 验收不适用；真实 PostgreSQL apply、模型、旧 `/backfill`、HTTP/来源页与 snapshot/RAG 未接入，不能称为生产补全闭环。

- 退回/漏检：未有流出 Sprint 的 P0/P1；工程师首轮双连接测试出现锁等待落败方误报未知，修正后独立 QA/QC 通过，并补无 durable receipt 时不假报成功的反例。
- 改进：下张模型→result 卡继续把“生成结果”和“世界已保存回执”分开验证，避免运行时接线把内部提交成功误投影为整个来源页已恢复。
