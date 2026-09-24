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
