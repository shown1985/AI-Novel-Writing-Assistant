# R1-S3L Sprint 承诺：结构补全提交编排与失败原因保存

## Sprint Goal 与承诺

一次 AI 世界结构补全操作在内部闭环：生成结果会在世界未被改动时恰好提交一次；作者改动世界时保留结果、不覆盖。失败类别会持久化，重启后仍能读出“为何失败”。响应丢失、重启、并发或提交结果不明时，只能读回持久事实，不会再次调用模型，也不会重复提交。本窗口不接 HTTP 与现有 `/backfill`。

- Release / Epic：Release 1 / S3 可信世界；规划基线 `beta@92af2d72`；PO 已于 2026-09-25 确认范围与拆分；独立 DoR 有条件 PASS（修订已并入合同）；**Done**。
- 仅承诺 [S3-02b3c1](./s3-02b3c-backfill-commit-orchestration-contract.md#s3-02b3c1提交编排与失败原因持久化) 5 点，无 Stretch。S3-02b3c2（提交后 snapshot/RAG）、S3-02b3c3（HTTP 与 `/backfill` 接线）、b3d/e 与 `R1-PROMPT02` 仍在 Refinement，不在本窗口。
- 容量 5 点，未超过已知 velocity（S3G/S3H/S3J 各 5 点）或 25 点上限。采用单 Story、单工程师：运行门面、store 类别写入与双库 migration 属于同一份持久契约，拆给多人会产生 schema 与 store 的共享 owner 冲突。

## Owner 与退出门

- 一名 GPT-6 Luna Max 全栈工程师独占 c1 合同列出的 backfill owned 文件、两份 Prisma schema（只加 `failureCategory` 列）、同名新增 migration `20260926120000_world_structure_backfill_failure_category`（双库）与 `server/tests/worldStructureBackfillRun.test.js`。以下内容不得修改：`PrismaWorldStructureBackfillCommitStore.ts`、既有测试文件、解析器/PromptRunner/`structuredInvoke.ts`、`/backfill`、WorldService、snapshot/RAG、HTTP 或 UI。
- 根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki/发布记录判断、阶段提交、feature→beta 集成与 Review。
- Scrum Master 审查 WIP、DoR/DoD、范围与 Sprint Review。
- GPT-6 Luna Medium QA/QC 独立核查以下重点：
  - **迁移只加列、双库对称**：PostgreSQL 与 SQLite 同名 migration 只含一条新增可空列语句，双 schema validate 通过。经 `server/src/db/runtimeMigrations.ts`（`applyRuntimeMigrationsToDatabase`）在 `/tmp/ai-novel-s3-02b3c1-*` 隔离临时库上验证两条路径：
    - 空库全量迁移；
    - 从既有迁移历史增量升级，既有 World/operation/result/receipt 行不变，旧 operation 的 `failureCategory` 为 `null`。
    - 不连接用户库，不做真实 PostgreSQL apply。
  - **提交恰好一次**：两个 worker 线程在同一文件型临时库上并发，provider 调用 1 次、revision 只 +1、receipt 1 份。响应丢失、重启、`COMMIT_RESULT_UNKNOWN` 之后的重放都读回同一 receipt，模型调用 0 次。作者改动世界时结果保留，零写入。
  - **失败类别不被覆盖**：类别与状态转换在同一条件更新中写入；重复标记或重放不覆盖已有类别。只接受白名单，不保存错误消息或原始输出。
  - **零修复调用方不受影响**：diff 不得触及 `structuredInvokeParser.ts`、`structuredInvoke.ts`（含 391 行单次模式守卫）、PromptRunner 或以下零修复 Prompt 资产。单次模式唯一生产调用方 `WorldStructureBackfillGenerationService` 的调用次数不变。
    - `prompting/prompts/world/worldDraft.prompts.ts`（两处）
    - `world/generation/worldGeneration.prompts.ts`
    - `novel/ideaInspiration.prompts.ts`
    - `novel/ideaConstellation/ideaConstellation.prompts.ts`（两处）
    - `PromptWorkbenchService.ts` 的策略透传
  - 文件边界符合 c1 合同。
- 满足以下全部条件才能标 Done：工程师自检、c1 合同固定最窄命令 PASS、独立 QA/QC PASS、Wiki 决策、UI 验收记为不适用、范围内阶段提交、beta 快进后同合同复核。不调用真实模型，不访问用户数据库。

## 非范围

- 不做提交后 snapshot 与 RAG 入队，这是 S3-02b3c2 的范围：snapshot 同步 best-effort，RAG 复用既有索引任务自动入队。
- 不做 HTTP 请求/查询、旧 `/backfill` 切换与生产装配，这是 S3-02b3c3 的范围。
- 不做来源页 UI 与恢复投影（S3-02b3d），不做真实 PostgreSQL apply 与组合发布门（S3-02b3e）。
- 不宣称现有 `/backfill` 已受保护。不改运行记录，不开发通用调用预算，不引入 Release 2；不做 `migrate reset`/`db reset` 或任何破坏性数据操作。
- 出现以下任一情况时停回 Refinement 由 PO 拆分，不扩大范围：需要改 b3b1 提交事务或既有测试、migration 需要改既有列或回填数据、需要持久化错误消息，或工作量超过 5 点。

## Review 与 Retrospective 出口

Sprint 结束时记录目标是否达成、承诺/完成点数、carryover 与原因、返工/逸出缺陷、最多两项可执行改进；未完成不得以 build 通过代替 Done。

Sprint Goal 在 backfill 内部范围达成；承诺/完成 `5/5`，carryover `0`。`runBackfill` 在世界未变时恰好提交一次，作者改动世界时保留结果；提交结果不明时只按持久状态收敛，不重调模型。失败类别随状态转换写入、只接受白名单且不被覆盖，重启后可由 `readRunOutcome` 读出。migration 只加一列，全新库与升级库的 `sqlite_master` 一致，旧行不变。合同固定命令 `67/67` PASS 两轮，`git diff --check` 与 server `tsc --noEmit` 通过。独立 QA/QC PASS，根评审 PASS。无 UI 改动，UI 验收不适用；现有 `/backfill` 尚未接入，不能称为生产补全已受保护。

- 返工：DoR 有条件通过，2 项合同修正（提交不明按持久状态映射、迁移升级验证）加 3 项注记（白名单常量、可注入依赖、返回已存类别），均作为合同修订写入。实施中触发 1 次拆分条件：store 测试夹具只排除自身迁移，无法承受后续 `ALTER` 迁移；经 PO 边界修订只改该夹具，断言不变。QA PASS 后补齐 2 处测试缺口（生成服务直接返回已存类别、`committed` 无回执时重抛）。逸出缺陷 `0`。
- 改进：①对临时库应用迁移的测试夹具必须按真实升级顺序（更早迁移 → 自身迁移 → 更晚迁移）执行，不能用“除自身外全部先跑”；②需要读取不可修改模块产出的记录时，DoR 须先核对该模块是否手工构造记录，避免新增字段在边界外丢失。
