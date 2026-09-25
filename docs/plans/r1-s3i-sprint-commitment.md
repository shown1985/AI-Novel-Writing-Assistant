# R1-S3I Sprint 承诺：结构补全单次模型调用门

## Sprint Goal 与承诺

为后续 AI 世界结构补全运行时提供显式、可验证的单次物理供应商调用模式；普通结构化 Prompt 保持原有恢复能力。本窗口不接现有 `/backfill`。

- Release / Epic：Release 1 / S3 可信世界；规划基线 `beta@fa8b95e1`。
- 仅承诺 [S3-02b3b2a](./s3-02b3b2a-backfill-single-attempt-prompt-contract.md) 3 点，无 Stretch；独立 GPT-6 Luna Medium Scrum 与 QA DoR PASS。`S3-02b3b2b` 模型→result 编排和 b3c/d/e 继续 Refinement，不在本窗口。
- 容量为 3 点，未超过已知 velocity 或 25 点上限。单 Story、单工程师、单文件边界，避免并行改 Prompt/LLM 共享运行器。

## Owner 与退出门

- 一名 GPT-6 Luna Max 全栈工程师独占 Story 合同指定的 Prompt/LLM 生产文件与聚焦测试；不得改 World/store/schema/HTTP/UI。
- 根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki/发布记录判断、阶段提交、feature→beta 集成与 Review。
- GPT-6 Luna Medium QA/QC 独立核查 transport 层实际物理调用上限、失败/并发、默认行为回归与文件边界；Scrum Master 审查 WIP、DoR/DoD、范围与 Sprint Review。
- 工程师自检、独立 QA/QC PASS、Wiki 决策、UI 验收状态、范围内阶段提交和 beta 同合同复核后才能 Done。固定最窄命令及反例以 Story 合同为准；不调用真实模型或用户数据库。

## 非范围与 Review 出口

本窗口不宣称旧 `/backfill` 有调用幂等或世界 CAS，不改 Prompt 资产/路由默认、不开发通用费用账本，也不引入 Release 2。若实现须改合同外共享文件、物理调用上限无法证明或工作量超过 5 点，停回 Refinement 由 PO 重新拆分，而不是扩大范围。

Sprint 结束时记录目标是否达成、承诺/完成点数、carryover 与原因、返工/逸出缺陷、最多两项可执行改进；未完成不得以 build 通过代替 Done。

## Review 与 Retrospective 出口

Sprint Goal 在 Prompt/LLM 运行器内部范围达成；承诺/完成 `3/3`，carryover `0`，返工与逸出缺陷 `0`。显式单次模式把 `runStructuredPrompt` 的传输重试、策略切换、备用模型、JSON 修复与语义重试都压到一次底层 provider `stream()`；`streamStructuredPrompt` 在打开 provider 前拒绝该选项，普通结构化调用保留原重试/修复/fallback。server build 与合同定向测试 `35/35` PASS，`git diff --check` 与 server `tsc --noEmit` 通过；独立 QA/QC PASS，逐一移除任一守卫的变异测试均被捕获，文件边界未越出合同。无产品 UI 改动，UI 验收不适用；现有 `/backfill` 尚未接入，不能称为生产补全已受保护。

- 低级发现转入后续：非 JSON 输出在零修复下被归为 `schema_mismatch` 的分类问题并入 `S3-02b3b2b` 范围/AC；文本 Prompt 静默忽略单次选项记为同卡注记；以单一请求级调用预算取代逐守卫限制登记为 `R1-PROMPT02` Refinement（Not Ready）。
- 改进：①涉及“调用次数上限”的卡在 DoR 同时列出错误分类契约，避免下游恢复按错误类别分支时才发现分类漂移；②合同定向构建前先确认 shared dist 与 Prisma client 已随上游合并重新生成，避免无关编译失败干扰验收。
