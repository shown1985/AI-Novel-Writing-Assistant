# R1-S3C Sprint 承诺：世界结构保存版本保护

## Sprint Goal 与承诺

作者在两处既有世界结构编辑现场保存时共用版本保护；冲突或结果未知不覆盖较新内容、不丢当前草稿，历史快照失败也不误报内容未保存。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@f971cbe6`；[S3-02b2s Spike](./s3-02b2s-structure-save-feasibility-spike.md)已完成，S3-02b2 的最终合同经 PO、Scrum Master、Terra QA/QC 确认 DoR PASS。
- 承诺：仅 [S3-02b2 世界手册手动结构保存接入 CAS](./s3-02b2-world-structure-cas-contract.md)，5 点；Stretch：无。当前状态：Done；代码级 QA/QC、beta 组合验证与隔离 Chrome 来源页验收均 PASS；完成 `5/5`。
- 容量：单卡 5 点。Spike 的 2 点是已完成的 Refinement 证据，不算本 Sprint 实施点数；原 S3-02b 概要点数不与本卡重复累计。

## 依赖、Owner 与顺序

- S1-06、S3-02a、S3-02b1 已 Done；复用既有 `contentRevision`、operation、receipt 与 CAS 门面，不新增 schema/migration。
- 一名 Luna xhigh 全栈工程师独占 Story 合同列出的 Runtime、客户端与聚焦测试，任何时刻只做 S3-02b2。根 PM 独占 `worldHttpContext.ts`、`worldStructureRoutes.ts`，待 Runtime 合同稳定后串行接线；不并发抢改同一文件。
- Terra medium QA 对照 AC1～6 做行为验收；独立 Terra medium QC 检查范围、失败/重试证据与代码风险。根 PM 负责 PO 决策、阶段提交、beta 集成与 Review。
- 每 20 分钟站立检查目标、阻塞与范围；新增需求进 Backlog，不自动并入本卡。无法在 5 点内完成时暂停拆分，不以半实现标 Done。

## 验收与退出门

1. 仅手动 `PUT /worlds/:id/structure` 受保护：缺字段 428、并发旧版本 409 且零覆盖；两处现有编辑视图传同一保护身份。
2. 原请求 hash、同 ID 同意图重放/不同意图拒绝与候选先校验的条件均按合同执行；失败或事务回滚不留下半写，legacy 投影与内容 revision 同步。
3. 首次成功/快照失败/重放分别给出 `created`、`failed`、`unknown`；已提交内容不因独立快照或 RAG 失败被说成保存失败，重放不补建快照。
4. 409、未知结果、同 world 查询刷新和切书迟到响应不清除当前视图脏草稿；成功、显式重读与切书采用对应服务器内容。不承诺跨视图共享未保存草稿。
5. shared/server build、client typecheck、聚焦 mock/隔离 SQLite 行为测试和 `git diff --check` 通过；不触及用户库或真实模型。UI 来源页验收由用户完成，未经明确 UI 验收不标业务 Done。
6. Terra QA/QC PASS，必要的稳定 Wiki 规则与用户可见发布记录完成；阶段提交后合入 beta 做组合验证，不直接晋级 main。

## 明确不承诺

- AI backfill、结构生成、分层、深化、导入、快照恢复及其他旧世界写入口；它们仍归原 S3-02b 父项 Refinement。
- 世界样本与本书实例同步、评估/提案/作者决定、普通编辑新 UI、任务中心动作、跨视图草稿仓库。
- 新表、队列、锁、全局回滚、额外安全体系、真实数据库迁移、Release 2、桌面包装或公开发布。

## Review 与 Retrospective 出口

代码级 QA/QC 对 AC1～6 PASS；`beta@d7df4af2` 的 shared/server build、client typecheck、结构 HTTP/隔离 SQLite 定向检查 `5/5`、客户端状态机 `4/4` 均 PASS，beta 工作树干净。2026-09-22 的隔离 Chrome 来源页验收覆盖两视图成功保存与刷新、真实 409 草稿保留、已提交但响应丢失、显式重读和快照失败提示；隔离路径为 `/tmp/ai-novel-s3c-ui.CDE9eE`，未使用用户库或真实模型。

- Review：Sprint Goal 达成；两处既有编辑现场使用同一受保护结构写入口，冲突和结果未知都不覆盖服务器较新内容或清除当前草稿，快照失败提示不否认内容保存事实。
- 完成度：承诺/完成 `5/5`，carryover `0`，escaped defect `0`；AI backfill、单区块生成、同步及其他旧入口未被带入。
- Retrospective：① UI 验收启动时直接固定隔离 SQLite、独立浏览器 profile 和有界 DOM 等待，避免常驻 SSE 让 `networkidle` 形成假超时；②服务端快照失败与前端提示分别在最窄 seam 验证，不为制造故障增加生产开关。
