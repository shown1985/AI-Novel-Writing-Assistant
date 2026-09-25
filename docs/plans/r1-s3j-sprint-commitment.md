# R1-S3J Sprint 承诺：结构补全结果持久化编排

## Sprint Goal 与承诺

一次 AI 世界结构补全操作的执行顺序为：先持久 claim，再发出最多一次物理模型调用，然后把结果与基线 revision 绑定保存。响应丢失、重启、并发或结果不明时，只能读回既有事实，不会再次调用模型。本窗口不接现有 `/backfill`，不写 World。

- Release / Epic：Release 1 / S3 可信世界；规划基线 `beta@cb169a52`；PO 已于 2026-09-25 确认范围；首次独立 DoR 未通过，合同已补齐（attempt id 补绑、并发落败方返回当前状态、`model_not_called` 重放漂移校验），独立 DoR 复核 PASS（2026-09-25，含外层上下文 `mode: "invoke"` 修正），已承诺并开始实施。
- 仅承诺 [S3-02b3b2b](./s3-02b3b2b-backfill-generation-orchestration-contract.md) 5 点，无 Stretch。PO 已确认：result→World 提交、提交后 snapshot/RAG 与失败类别持久化归 S3-02b3c。进入 Sprint 前须取得独立 GPT-6 Scrum 与 QA DoR PASS。b3c/d/e 与 `R1-PROMPT02` 仍在 Refinement，不在本窗口。
- 容量 5 点，未超过已知 velocity（S3G/S3H 各 5 点）或 25 点上限。采用单 Story、单工程师：编排、store 状态扩展与解析分类修正属于同一条失败分类契约，拆给多人会产生共享文件 owner 冲突。

## Owner 与退出门

- 一名 GPT-6 Luna Max 全栈工程师独占 Story 合同列出的 backfill owned 文件、`structuredInvokeParser.ts` 零修复分支和两份聚焦测试。不得改 Prisma schema/migration、PromptRunner/structuredInvoke、`/backfill`、WorldService、HTTP 或 UI。
- 根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki/发布记录判断、阶段提交、feature→beta 集成与 Review。
- GPT-6 Luna Medium QA/QC 独立核查：provider `stream()` 层实际调用次数、调用前 `model_in_flight` 持久事实、同一文件型临时库双连接并发（落败方 0 调用且不抛引用错误）、attempt id 补绑、`model_not_called` 重放漂移拒绝、lease/unknown 不重调、`malformed_json`/`empty_content` 分类、零 World 写入与文件边界。Scrum Master 审查 WIP、DoR/DoD、范围与 Sprint Review。
- 满足以下全部条件才能标 Done：工程师自检、固定最窄命令 PASS、独立 QA/QC PASS、Wiki 决策、UI 验收记为不适用、范围内阶段提交、beta 快进后同合同复核。不调用真实模型，不访问用户数据库。

## 非范围

- 不宣称现有 `/backfill` 已具备幂等、结果恢复或版本保护。不调用 `commitPersistedResult`，不写 snapshot/RAG，不改 HTTP/来源页/运行记录。
- 不做真实 PostgreSQL apply、migration 或 reset，不开发通用调用预算，不引入 Release 2。
- 出现以下任一情况时停回 Refinement 由 PO 拆分，不扩大范围：需要 schema 变更、需要改 PromptRunner/structuredInvoke、需要持久化失败类别，或工作量超过 5 点。

## Review 与 Retrospective 出口

（待 Sprint 结束填写）需记录：目标是否达成、承诺/完成点数、carryover 与原因、返工/逸出缺陷、最多两项可执行改进。未完成时不得以 build 通过代替 Done。
