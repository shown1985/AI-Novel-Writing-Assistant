# R1-02：第一本书与十章连续创作基线

## Story 合同

- Release / Sprint：Release 1 / R1-S0。
- Story：R1-02 第一本书与十章连续创作基线（5 点）。
- 用户价值：用一条可重复的真实持久化链判断“第一本书能否继续写下去”，而不是用页面可打开或零散单元测试代替成书证据。
- 范围：固定想法、导演准备、十章生产、一次中断恢复、一次局部质量债、世界/人物更新和 TXT 导出；回归只使用临时 SQLite 与确定性 mock。
- 非范围：修复链路中发现的业务缺陷；调用真实或付费模型；执行用户数据库迁移；替代 R1-RC03 的用户 UI 与真实模型抽样验收。

## 固定夹具

权威夹具为 `server/tests/fixtures/r1-first-book-ten-chapter-baseline.json`。它固定以下事实：

- 一句开书想法、一部 10 章长篇小说、一个世界和一名主角。
- 第 6 章首次执行注入 `runtime.model_unavailable`，前 5 章必须已经跨过正文资产边界。
- 恢复沿用同一个 `GenerationJob` 的 `resumePipelineJob` 入口；第 6 章重新执行，第 1～5 章不得重复生成或改变正文哈希。
- 第 8 章固定产生 `quality.chapter_below_threshold`，以 `defer_and_continue` 落为局部质量债，第 9～10 章仍须完成。
- 十章完成后更新绑定世界的冲突字段和主角当前状态/目标，再按章节顺序导出 TXT。

夹具的 `stages` 为验收合同。每个阶段都必须提供：事实源、预期状态、来源页动作和失败恢复。运行记录只用于查看，不承载恢复、重试或修改动作。

## 可执行边界

行为测试为 `server/tests/r1FirstBookTenChapterBaseline.test.js`，子进程场景为 `server/tests/r1FirstBookTenChapterBaseline.scenario.cjs`。测试使用现有生产边界：

| 阶段 | 生产事实/边界 | 确定性替代 |
| --- | --- | --- |
| 想法与开书 | `NovelIntentVersion`、`NovelCoreCrudService` | 固定一句想法并直接落意图事实，不调用或验收公共意图识别入口 |
| 导演准备 | `NovelWorkflowTask`、`StoryMacroPlan`、`BookContract`、`Chapter` | 直接持久化固定的已验收导演产物，不调用或验收公共导演准备链 |
| 十章生产 | `NovelCorePipelineService`、`NovelPipelineExecutor`、章节资产检查点的恢复侧读取 | 注入脚本化章节协调器，固定正文/审校结果并写入 fixture checkpoint；不验收真实 coordinator 的生成与资产同步生产侧 |
| 中断恢复 | `pendingManualRecovery`、`completedCount`、`resumePipelineJob` | 第 6 章仅首次抛出已分类模型不可用错误 |
| 局部质量债 | `QualityReport`、`Chapter.riskFlags.qualityLoop`、任务 payload | 第 8 章固定低分与局部 pacing 问题 |
| 世界/人物更新 | `WorldService.updateWorld`、`NovelCoreCharacterService.updateCharacter` | 模拟作者在来源模块做显式编辑；不把第 8 章质量债自动晋升成世界/人物 canonical fact |
| TXT 导出 | `NovelExportService.buildExportContent` | 无替代，验证十章标题和正文顺序 |

测试数据库由 `prisma db push` 创建在 `server/.tmp/r1-02-*`，子场景结束后删除。它不读取或写入桌面库、开发库或用户数据库。

## 确定性回归与真实模型抽样

确定性回归是 R1-02 的唯一自动门：

- provider/model 固定为 `deterministic_mock / r1-02-script-v1`。
- 章节协调器通过依赖注入替代模型生成和资产同步生产侧；fixture 直接写正文与当前内容 checkpoint。生产流水线状态机、问题治理、checkpoint 恢复侧判定、恢复、质量债落库、显式资料编辑和导出仍走现有服务。
- 测试期间网络调用被禁止，并断言付费模型调用数为 0。
- 预期 mock 调用章序为 `1,2,3,4,5,6,6,7,8,9,10`；第 6 章只因一次中断重入。

真实模型抽样不是本回归的 fallback，也不能用来覆盖 mock 失败。只有在确定性回归先通过后，才可由 R1-RC03 owner 取得明确授权与预算，另建测试作品、另存 provider/model/调用量/人工判断证据，并与本测试结果分开报告。

## 最窄验证

从仓库根目录运行：

```bash
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node --test server/tests/r1FirstBookTenChapterBaseline.test.js
```

通过标准：

1. 第 6 章中断后任务为 `queued + pendingManualRecovery`，`completedCount=5`。
2. 恢复后同任务完成 10/10；前五章哈希保持不变，十章均有当前正文资产检查点。
3. 第 8 章存在 `defer_and_continue` 质量债，任务仍完成第 10 章。
4. 世界和人物更新落库；TXT 按 1～10 顺序包含全部固定正文。
5. 网络调用、付费模型调用均为 0。

## 验收边界与已知风险

- 本 Story 建立可执行基线，不宣称 R1-S7、R1-RC03 或 Release 1 已完成。
- 公共 idea→导演准备入口、自动导演 AI 候选生成、真实章节文学生成和真实 artifact producer 均被固定产物替代；这是明确的 deterministic mock 边界，不是这些生产入口或模型质量的证据。
- 本场景只证明显式作者世界/人物编辑可在十章后保存；没有把审校建议、质量债或模型推断直接写成 canonical fact，也不证明未来 `pending_review` 提案链。
- 本测试不做浏览器交互。来源页的按钮、提示与视觉恢复仍由后续用户 UI 验收负责。
- 若生产迁移历史冲突导致 `prisma migrate deploy` 失败，应由 R1-03/独立迁移 Story 处理；本基线只用临时库 `db push`，不掩盖也不修复迁移门。
- 本文记录的是 R1-02 验收夹具，不新增长期架构规则；无需修改 Wiki。
