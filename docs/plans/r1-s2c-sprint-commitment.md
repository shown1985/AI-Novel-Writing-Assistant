# R1-S2C：事实权威与世界 Prompt 解锁 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2C；R1-S2 与可信世界阶段之间的 1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：冻结单书成果/进度/推荐动作与实际模型调用尝试的唯一事实合同，并消除世界 Prompt 静态版本漂移，让后续可见接线、调用证据持久化和可信世界 Prompt 拆分能够按明确边界实施。
- 开发基线：`codex/r1-s2c-next-action-evidence@47b9819c`；R1-S2B 已完成 9/9 点。
- 承诺容量：8 点；Stretch：无。
- 容量依据：近期三个窗口完成 15、14、9 点，但本轮包含两张会改变后续数据/状态方案的 Spike 和一张 Prompt 治理门；保持低容量，优先消除错误实现方向，不把仍 Not Ready 的生产卡伪装成承诺。
- 产品边界：只做 Release 1 本机单书展示合同、模型 attempt 证据合同与世界 Prompt 静态登记一致性；不新增用户操作入口、数据库模型、调用历史 UI、世界维护能力、账号/MySQL/LAN/多人能力或真实模型调用。

## 承诺 Backlog

| Story | 点数 | 当前状态 | Owner | 依赖 | 交付结果 |
| --- | ---: | --- | --- | --- | --- |
| S2-03a0 单书展示事实与动作权威 Spike | 3 | Ready | 单书 Contract Agent | S2-01a/b Done | 冻结三层进度、任务身份、状态严重度、唯一动作来源和 stale/error 策略；产出可执行矩阵，不声称 UI 已联通 |
| S2-04b0 实际模型调用尝试证据 Spike | 3 | Ready | 模型平台 Contract Agent | S2-04a Done | 冻结 request/attempt lineage、通用存储、身份归因、live/API、失败降级和首批非导演入口；产出 seam proof，不改生产 schema |
| S3-00 世界 Prompt 静态登记一致性门 | 2 | Ready | 根集成人 | S1-06 Done | `generate_from_theme` loader、资产与测试统一到有意升级的 v3，并用全量静态检查阻止再次漂移 |

三张卡均以当前源码完成只读 DoR 复核。`S2-03a`、`S2-04b`、`S3-01` 继续保持未承诺；本 Sprint 的 Spike、登记门和测试不能冒充这些生产能力已经完成。

## Definition of Ready 与冻结边界

### S2-03a0

- 用户价值：后续页面不会把局部任务成功误称整书完成，也不会从按钮文案或多个互相冲突的投影猜测下一步。
- Owned：新增 `docs/plans/s2-03a-single-book-display-authority-contract.md`；可以在临时测试或计划附件中表达矩阵，但不修改生产客户端。
- 根集成人保留：共享类型、API/query keys、`TASK.md`、Roadmap、Wiki 与后续生产模块接线。
- 必须冻结的输入与身份：`novelId`、已解析的当前 `directorTaskId`、服务器 book projection、当前任务、snapshot、已保存章节查询、`Novel.estimatedChapterCount` 和各查询 freshness；`workspaceTaskId` 永不进入导演身份。
- 三层进度必须分离：已保存正文数只来自当前小说的持久章节；当前任务范围来自同任务 runtime/fact projection；整书目标只采用有效的 `Novel.estimatedChapterCount`，缺失时显示未知，不从局部任务范围反推。
- 可执行动作只允许来自同小说、同导演任务的 `bookAutomationProjection.primaryAction`。dashboard/runtime/local actions 只可提供状态、原因、影响或现有命令绑定，不得用 label、`includes`、关键词或正则生成产品语义。
- 状态优先级必须保留：明确 `replan_required`、`pendingManualRecovery` 和 quality-first 人工暂停不可被普通 running/completed 覆盖；局部质量债是可继续提醒，不升级为全书失败。
- stale/error：相同 novel/task 的旧保存成果可继续只读；任一动作依据非 fresh、身份不匹配或查询结果不确定时输出零可执行动作，不清除正文。
- 交付边界：Spike 形成输入 DTO、权威/降级表、至少一个完整状态矩阵和后续 03a/03b 文件 ownership；不修改真实页面，不宣称作者已看到单推荐动作。
- 最窄验证：文档交叉核对现有类型/命令；矩阵覆盖局部成功、running、质量债、replan、人工暂停、无 URL 的真实任务、身份不匹配、loading/error/stale/empty 和多个动作源；不得调用模型或写数据库。

### S2-04b0

- 用户价值：后续展示的是每次真实 transport 尝试和最终采用模型，而不是 Token 记录、短期 live 状态或当前配置推测。
- Owned：`server/src/platform/llm/provenance/**` 内的 attempt 合同/repository ports/隔离 seam proof，以及 `docs/plans/s2-04b-model-attempt-evidence-contract.md`。
- 只读输入：`factory.ts`、`structuredInvoke.ts`、`usageTracking.ts`、`prompting/core/promptRunner.ts`、live broker、导演用量投影和首批非导演调用点。子 Agent 不直接修改这些生产文件。
- 根集成人保留：shared types、两套 Prisma schema/迁移、HTTP/API/挂载、`promptRunner` 拆分授权、Wiki/TASK 与生产 Story 重估。
- 冻结 `requestId / attemptId / parentAttemptId / attemptIndex / role / status / finalAdoption`；primary、strategy retry、transport retry、JSON repair、semantic retry 和 fallback 都要有明确关系，invoke/stream 语义一致。
- 存储方向默认评估独立通用 attempt store，不把导演 Token 表直接泛化为全系统事实；必须给出 SQLite/PostgreSQL 增量迁移草案、幂等 finalize、崩溃遗留 started、legacy unknown、索引和保留策略。
- 冻结身份归因优先级与首批覆盖：自动导演、本书世界 `novel-world-generate`、章节 `ai-revision-preview`；独立世界库与 batch 未解决身份时明确保持非范围。
- 观测写入失败不得重发生成、改写正文、改变任务状态或清除人工暂停；查询显示 `evidenceStatus=missing`，不能静默伪造来源。
- `promptRunner.ts` 当前超过 1300 行；Spike 必须给出 owned 拆分先决方案，生产卡不得继续扩展该文件。
- 最窄验证：mock transport + in-memory repository 的可执行 seam proof，覆盖 invoke/stream、null usage、失败→重试→备用成功、repair、观测失败、两个 novel 并发隔离、脱敏和 repository 重建读取；零真实模型、零用户库写入。

### S3-00

- 用户价值：世界生成与后续维护使用唯一、可审计的 Prompt 版本，静态登记错误不会被运行时容错悄悄掩盖。
- Owner：根集成人独占 `server/src/prompting/registry/promptAssetLoaderEntries.ts` 与相应 Prompt 治理测试。
- 事实：资产 `novel.world.generate_from_theme` 已因战力体系输入有意升级为 v3；loader 和既有测试仍固定 v2。方向冻结为 loader/测试对齐 v3，不把资产降级。
- AC：loader key 与实际资产 key 一致；所有 loader entry 的声明 key 与加载资产 key 全量一致且唯一；现有 Registry 绑定、模型选择和 Prompt 行为不变。
- 非范围：不拆 `world.prompts.ts`、不修改 Prompt 文案/schema、不中途补 management/context、不过早实现 S3-01；`worldDraft.prompts.ts` 保持原位。
- 最窄验证：新增/更新静态 loader-key 检查，运行 Prompt governance、世界模型选择和相关 Registry 测试；server typecheck/build 只在实际变更需要且无可复用新鲜证据时执行。

## 并行波次与集成所有权

```text
Wave 1（并行）
  单书 Contract Agent：S2-03a0
  模型平台 Contract Agent：S2-04b0
  根集成人：S3-00、共享边界审查

Wave 2
  根集成人：审阅两个 Spike 的源码证据与 seam proof，冻结后续拆卡、Wiki 判断和阶段提交
```

- 每个 Agent 同时最多一张 `In Progress` Story；Spike Agent 不修改生产共享文件，不提交、不切分支。
- 根集成人独占 `TASK.md`、Roadmap、详细计划状态、README/Release Notes、Wiki、Registry loader 和阶段提交。
- S2-03a0 与 S2-04b0 文件域互不重叠；S3-00 只修改 Registry/测试。后续 03a/03b、04b1～3、S3-01 不得在本 Sprint 顺手实现。
- 本窗口不 push、tag、晋级 beta/main、执行桌面包装、迁移用户库或公开上传。

## 未承诺与退出门

- `S2-03a/03b`：等待 03a0 的展示权威合同签认后再重新进入 Ready/实施；当前页面仍保留既有行为。
- `S2-04b`：由 04b0 重新拆成每张不超过 5 点的生产卡；在通用 store、promptRunner 边界和非导演身份未冻结前保持 Not Ready。
- `S2-04c`：继续等待实际 attempt 持久证据；不按当前配置重算历史。
- `S3-01`：S3-00 通过后才能进入 Ready；届时只迁 `world.prompts.ts` 的 14 个资产，`worldDraft.prompts.ts` 不在 3 点范围。
- `S1-03` 与世界 Runtime 生产卡保持 Refinement/Backlog，不与本窗口交叉写共享 schema。

Sprint 退出时必须记录 Goal、`8/8` 或实际完成点数、carryover 原因、两个 Spike 是否真正解除生产 DoR、S3-00 静态检查结果、文档/Wiki/发布判断和最多两项流程改进。只有后续生产 Story 通过行为验收，才可宣称用户能力完成。
