# R1-S3G Sprint 承诺：AI 世界结构补全持久事实仓库

## Sprint Goal 与承诺

为一次 AI 世界结构补全保存可跨连接和重启辨认的 claim、模型调用所有权与规范化结果，使后续运行时接线有防重复调用和防覆盖较新世界内容的持久事实基础；本窗口不接入现有 `/backfill`。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@ed2a069d`；S3-02b3s、S3-02b1、S3-02b2 均 Done。S3-02b3a 的独立 QA 与 Scrum Master DoR PASS。
- 承诺：仅 [S3-02b3a AI 世界结构补全持久 claim/result store](./s3-02b3a-backfill-store-contract.md)，5 点；Stretch：无。容量 5 点，未满两轮可测速度时低于 25 点上限。
- 后续 S3-02b3b～e 保持 Refinement / Not Ready，不自动纳入本 Sprint。

## Owner 与文件边界

- 根 PM/PO：`TASK.md`、Roadmap、Sprint/Story 合同、Wiki/发布说明判断、阶段提交及 beta 集成。
- 一名 GPT-6 Luna Max 全栈工程师：唯一 schema/migration 与 store 实现 owner；仅编辑 Story 合同列出的双 schema、双新增 migration、world/backfill owned 模块与新增聚焦测试。不得改现有 `/backfill`、世界 CAS、Prompt、模型提供方、HTTP、UI 或其他 Story 文件。
- 独立 Scrum Master 已核对承诺、依赖和边界；GPT-6 Luna Medium QA/QC 独立检查 claim 竞争、结果恢复、失败未知、双库静态对称和数据保护。每位 Agent 同时只持一张 In Progress Story。

## 验收与退出门

以 [Story 合同](./s3-02b3a-backfill-store-contract.md)的范围、非范围与最窄验证为唯一行为准绳。工程师不得用类型检查代替 SQLite 双连接竞争、重启读取、lease→unknown、结果 digest 幂等/拒绝、零世界内容写入的行为证据；也不得用静态 SQL 对称声称真实 PostgreSQL apply 已完成。

独立 QA/QC PASS、双 schema validate、聚焦迁移与 store 测试、server build、`git diff --check`、文档决策、UI 验收状态和阶段提交后才可标 Done。无产品 UI 变更，UI 验收不适用。实现从 `codex/` 功能分支完成并验证，再快进 beta 复核；未验收的代码不得进入 beta。

## Review 与 Retrospective 出口

Sprint Goal 在 store-only 范围达成；承诺/完成 `5/5`，carryover `0`。GPT-6 QA/QC 独立 PASS，双 schema validate、隔离 SQLite 双连接竞争/恢复/增量迁移、server build 与 `21/21` 聚焦测试通过。`16dc4a50` 快进 beta 后，beta 独立工作树的 Prisma generate、server build 和 `21/21` 复核通过，工作树干净。无产品 UI 改动，UI 验收不适用；真实 PostgreSQL apply、当前 `/backfill`、模型/CAS/HTTP 和来源页仍属后续卡，不能将本 Sprint 视为生产补全闭环。

- 退回/漏检：首轮 QA/QC 发现即时结果不明无法转 `model_unknown` 的 P1；同 Sprint 修正并独立复验，未流出。
- 改进：下一张 runtime 卡在 Ready 时分别写出“结果立即未知”和“lease 到期未知”的状态/恢复用例，两者均不得自动重开模型调用。
