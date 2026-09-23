# R1-S3G Sprint 承诺：AI 世界结构补全持久事实仓库

## Sprint Goal 与承诺

为一次 AI 世界结构补全保存可跨连接和重启辨认的 claim、模型调用所有权与规范化结果，使后续运行时接线有防重复调用和防覆盖较新世界内容的持久事实基础；本窗口不接入现有 `/backfill`。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@ed2a069d`；S3-02b3s、S3-02b1、S3-02b2 均 Done。S3-02b3a 的独立 Terra QA 与 Scrum Master DoR PASS。
- 承诺：仅 [S3-02b3a AI 世界结构补全持久 claim/result store](./s3-02b3a-backfill-store-contract.md)，5 点；Stretch：无。容量 5 点，未满两轮可测速度时低于 25 点上限。
- 后续 S3-02b3b～e 保持 Refinement / Not Ready，不自动纳入本 Sprint。

## Owner 与文件边界

- 根 PM/PO：`TASK.md`、Roadmap、Sprint/Story 合同、Wiki/发布说明判断、阶段提交及 beta 集成。
- 一名 Luna xhigh 全栈工程师：唯一 schema/migration 与 store 实现 owner；仅编辑 Story 合同列出的双 schema、双新增 migration、world/backfill owned 模块与新增聚焦测试。不得改现有 `/backfill`、世界 CAS、Prompt、模型提供方、HTTP、UI 或其他 Story 文件。
- Terra medium Scrum Master 核对承诺、依赖和边界；Terra medium QA/QC 独立检查 claim 竞争、结果恢复、失败未知、双库静态对称和数据保护。每位 Agent 同时只持一张 In Progress Story。

## 验收与退出门

以 [Story 合同](./s3-02b3a-backfill-store-contract.md)的范围、非范围与最窄验证为唯一行为准绳。工程师不得用类型检查代替 SQLite 双连接竞争、重启读取、lease→unknown、结果 digest 幂等/拒绝、零世界内容写入的行为证据；也不得用静态 SQL 对称声称真实 PostgreSQL apply 已完成。

独立 QA/QC PASS、双 schema validate、聚焦迁移与 store 测试、server build、`git diff --check`、文档决策、UI 验收状态和阶段提交后才可标 Done。无产品 UI 变更，UI 验收不适用。实现从 `codex/` 功能分支完成并验证，再快进 beta 复核；未验收的代码不得进入 beta。

## Review 与 Retrospective 出口

关闭 Sprint 时记录 Sprint Goal 是否达成、承诺/完成点数、carryover 与原因、退回/漏检问题，以及至多两项具体改进。未完成事项重新 Refinement，不以原估算自动顺延。
