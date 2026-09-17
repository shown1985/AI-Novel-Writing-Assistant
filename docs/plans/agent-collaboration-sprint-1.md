# Sprint 1：开发任务与并行实施卡

## 开工范围

本页是 [交互与 AI Sprint 路线图](./agent-collaboration-sprints.md) 的首轮任务卡与滚动状态合同。各子 Story 的状态和完成证据以本页链接及当前 Sprint 承诺为准。

目标是可信的 AI 配置状态、可恢复的阅读现场和世界问题安全更新。滚动 refinement 后候选核心 24 点：显式补计共享接线门2点，将原 S1-02 的5点概要拆成后端3点和前端3点，并将需要事务 CAS/幂等收据的 S1-03 从3点校正为5点。点数不是单窗口承诺；可分 S1-A 配置/安全/契约、S1-B 诊断/阅读验收。三个执行 Agent 与一个根集成人；S1-X 为可移出的 Stretch。

## 拟定的首轮接口行为

以下是新增/调整合同，不是当前已实现的接口。

### 能力状态读取与检测

- GET /api/llm/model-routes/connectivity：读取最近诊断，零模型调用，零模型路由写入。
- POST /api/llm/model-routes/connectivity：沿用显式检测入口；只执行探测、保存诊断与建议，不应用路由。
- GET /api/rag/readiness：读取配置与最近诊断，零 embedding 调用；前端自动读取迁到此接口。
- POST /api/rag/health-check：显式检索能力检测；结果区分 embedding 和 vector store。
- 既有 GET /api/rag/health：保留端点与 embedding/qdrant 投影，迁为被动读取并补 checkState；旧 ok 布尔值不能表达未知，所有项目内消费者必须使用 checkState 区分未检测/过期与失败，不能主动 embedTexts。外部旧消费者的兼容限制须记录，不把保留端点称为完整语义兼容。
- 应用协议/格式建议复用现有模型路由保存命令，增加可选 expectedFingerprint/目标 revision 的服务端原子校验；提交目标列表明确，不把检测建议自动批量保存。旧手动保存保持既有行为，检测建议应用必须携带前置条件。

被动读取成功的响应 success=true，诊断本身失败使用 checkState=failed；读取失败属于 HTTP/API Error，不能显示为未配置。

诊断记录至少包括：

    {
      checkState: "not_checked | healthy | failed | stale",
      checkedAt: "ISO 时间或 null",
      configurationFingerprint: "不含明文凭证的配置指纹",
      targets: [{
        targetId: "任务类型或检索组件",
        provider: "厂商",
        model: "模型",
        plain: "检查结果或 null",
        structured: "检查结果或 null",
        errorSummary: "脱敏说明或 null",
        recommendation: "协议与格式建议或 null"
      }]
    }

上例是字段说明，不是可直接提交的 JSON 枚举值。根集成人接线时使用共享类型定义离散枚举与 nullable 字段；RAG 检测保留现有 embedding/qdrant 详细结果投影。

诊断持久化由 diagnostics 模块 owned store 承接，单独保存状态，不混入模型路由事实。首轮数据模型由根集成人集中审查；采用增量字段/表并同时维护 SQLite/PostgreSQL兼容。接口不返回 API key、鉴权头或秘密指纹原文。

配置指纹覆盖模型、有效地址及后缀、协议、输出策略、provider启用状态、authMode及凭证配置 revision；RAG 另覆盖 embedding模型、向量库地址与collection。配置变化后显示 stale；旧探测响应只属于旧指纹。并发相同指纹检测合并，不同目标不误用旧结果；进程重启可读取最近已完成诊断。

凭证版本比较在服务端完成：数据库凭证/AppSetting 使用其更新版本，并补实际有效配置比较；环境凭证使用服务端持久化密钥的 HMAC opaque 摘要，不能仅依赖进程启动时间或公开裸 hash。持久化密钥由 diagnostics infrastructure 管理，权限与跨重启稳定性须测试，密钥丢失时旧记录失效而非误报健康。客户端只接收不透明配置标识，不接收凭证摘要、密钥或秘密内容。根集成人在 B 开工前冻结存储模型、指纹类型及 CAS 保存接线；未冻结时 S1-02/03 不进入生产实现。

### 资源与阅读

- PATCH /api/worlds/:id/consistency/issues/:issueId：先校验归属再修改；不存在或不属于当前资源时零写入。
- 简易书架以合法显式 chapterId URL 优先；普通入口没有 query 时按 novelId 读取最后可读章并 replace 写回 URL。显式无效 ID 或失效存储均采用既有可读章回退并校正 URL；不让旧存储覆盖合法深链接。本地章节偏好与阅读位置只记录展示状态，按作品/章节隔离，不作为正文、权限或任务完成事实源。
- 简易页本轮不开放手动编辑或 AI 修订写入，不改变现有生产链、模式转换与服务器门禁。

## S1-01：缺省数值配置正确生效

作为作者，我希望未调整的 AI 参数采用可靠推荐值，避免无意获得极短等待或极低资料召回。

- Owner：Agent A。
- 点数：3；优先级 P0；状态 Done；无依赖。
- Owned：server/src/config/rag.ts；server/src/services/settings/RagRuntimeSettingsService.ts、RagSettingsService.ts、StyleEngineRuntimeSettingsService.ts；直接相关配置解析测试。结构化备用设置仅纳入空白输入边界，不改用户合法 retry。
- 验收：undefined/null/空字符串/空白采用声明默认；允许字段显式 0 保留；坏值回默认；越界遵守既有校验。
- 验收：缺省切片800、重叠120、候选40、TopK8；embedding batch64、timeout30秒、retry2；trace采样1；写法提取10分钟，覆盖 env 与数据库两层。
- 验收：已保存合法低值原样保留；不开启 RAG、不改模型、不重建索引；读取不回写用户配置。
- 实现：使用所属配置模块的明确数值解析边界，禁止引入无归属通用 helpers；原配置来源与 AppSetting 覆盖语义保持。
- 检查：新增配置边界行为测试，mock Prisma或隔离数据库；构建对应 server/dist 后运行定向测试；复用 ragCompatibilityBootstrap.test.js 的隔离方法，严禁桌面库测试。
- 完成证据：输入矩阵及生效值、用户保存值未变、没有索引任务或配置更新副作用。
- 交付证据：[S1-01 缺省数值配置完成证据](./s1-01-numeric-settings-defaults.md)。

## S1-00：诊断共享接线与存储契约门

作为开发团队，我们希望诊断、页面与应用设置共享同一合同，避免并发开发各造一套状态。

- Owner：根集成人；点数2；P0；状态 Done，依赖 PREP-02/03。
- Owned：共享诊断类型、client/src/api/settings.ts、knowledge.ts、queryKeys.ts；Prisma schema/增量迁移设计由根集成人独占；diagnostics 业务实现仍由 B 承接。
- 子任务：固定目标级 checkState、nullable结果与读取错误；定义诊断记录、索引和保留策略；固定指纹/credential版本与持久化密钥合同；扩展现有保存命令的 expectedFingerprint、诊断 ID 与整批事务语义；生成 mock DTO 供前端消费。
- 验收：共享类型能表达未知/成功/失败/过期而不依赖 ok 布尔值；接口没有密钥或凭证摘要。
- 验收：存储模型覆盖重启、旧指纹结果和目标级历史；SQLite/PostgreSQL迁移方案为增量，不 reset 或覆盖桌面库。
- 验收：建议应用409与零写入条件明确；批量提交与重放结果固定；旧手动保存行为单独列出。
- 验收：A/B/C 确认 ownership，B 收到固定DTO、存储及 CAS合同后才生产实现；未完成明确为接线门未通过。
- 检查：共享类型构建/接口合同测试按实际改动执行；纯设计仅核对源码和链接。迁移仅在隔离库验证，不在本卡对用户库执行。
- 非范围：探测 transport、设置 UI、用户数据库迁移执行、模型策略重排。
- 完成证据：签认合同、兼容矩阵、迁移演练方案、共享接线差异；不得将设计签认写成数据库能力已实现。

## S1-02：被动 AI 状态与显式检测

作为作者，我希望打开设置或资料页只查看状态，明确点击检测时才产生模型请求。

- Owner：Agent B；共享类型/API/queryKeys由根集成人接线。
- 本节为原 Story 的共用验收合同，不单独计点；实际派发 S1-02a、S1-02b，优先级 P0。
- Owned：server/src/llm/connectivity.ts、server/src/routes/llm.ts、server/src/routes/rag.ts；拟建 owned diagnostics 模块；client/src/pages/settings/views/SettingsOverviewPage.tsx、client/src/pages/settings/ModelRoutesPage.tsx、client/src/pages/settings/components/SettingsReadinessCard.tsx；client/src/pages/knowledge/KnowledgePage.tsx、client/src/pages/knowledge/components/KnowledgeOpsTab.tsx。
- 共享接线：client/src/api/settings.ts、client/src/api/knowledge.ts、client/src/api/queryKeys.ts及共享诊断类型由根集成人单一管理。项目没有 client/src/api/rag.ts，禁止按审计草案虚构路径。
- 验收：页面首次进入、刷新、聚焦和自动查询零模型/embedding调用；被动 GET 零路由写入。
- 验收：未检测、最近成功、最近失败、配置已变分别显示；未知不是失败，读取错误不是空数据；readiness不会永久 pending。
- 验收：readiness 为项目内 UI 诊断唯一来源；不使用旧 ok 布尔值判断 unknown/stale，不将读取异常包装成已完成的检测失败。基础运行配置完整但未检测/过期时仍可开始创作，不新增付费检测门；缺配置引导 /settings/model-routes，真实运行失败在来源现场说明。
- 验收：显式检测真实 pending，防重复；相同指纹合并；配置变化后旧响应不能将新配置显示为健康。
- 验收：最近诊断持久化，重启可读；存储与日志脱敏；缓存不证明未知模型质量。
- 检查：mock transport计数与route upsert spy；读取零请求零配置写入、检测去重、仅换凭证/鉴权/地址失效、缓存重启与环境变化测试；有效配置零诊断仍可开书；client typecheck；用户做 UI 验收。
- 完成证据：接口响应样例、调用计数、缓存失效行为、客户端 Loading/Error/Unknown 反馈。

### S1-02a：诊断读取、显式探测与持久化

- 用户价值：查看状态不消耗模型调用，检测结果跨重启可追溯。
- Owner：Agent B 后端；3点；状态 Done。Owned 为上文 connectivity、LLM/RAG routes 与 owned diagnostics application/infrastructure；共享 schema 由根集成人接线。
- 子任务：提取无副作用读取；将模型与 embedding探测收敛到显式命令；保存目标级诊断；指纹失效与同指纹并发合并；迁移旧 health投影并与 S1-03 分离配置写入。
- 验收：被动GET transport调用和路由upsert均为0；显式POST只保存诊断建议；同指纹同时扫描只一次；改凭证/地址后旧响应不变新配置健康；重启可读已完成结果且脱敏。
- 检查：mock transport/persistence计数、故障/重启/失效行为测试；只在隔离库演练增量迁移。
- 非范围：路由自动应用、前端展示、本次委托模型优先级。
- 完成证据：响应样例、调用计数、存储重启证据和错误脱敏；失败探测保留上次报告并标最新失败，不冒充配置读取失败。
- 交付证据：[S1-02a 诊断读取、显式探测与持久化](./s1-02a-diagnostic-readiness-backend.md)。

### S1-02b：设置与知识库诊断状态消费

- 用户价值：清楚知道哪些配置可运行、哪些连接尚未检测，并主动决定检测。
- Owner：Agent B 前端，与02a同 owner串行；3点；状态 Done（R1-S2B）。
- Owned：上文 SettingsOverviewPage、ModelRoutesPage、SettingsReadinessCard、KnowledgePage、KnowledgeOpsTab；API/queryKeys由根集成人接线。
- 子任务：自动查询改被动接口；显式按钮绑定检测；未知/过期/失败/读取错误分别呈现；取消旧 Boolean(ok)与错误伪健康投影；基础配置与检测健康解耦。
- 验收：进入/聚焦/刷新零探测；点击检测有pending且防重复；有效配置未检测仍可开始创作；读取错误可重试而非未配置；切换目标不会展示旧指纹健康；知识库未知不是红色连接失败。
- 检查：状态消费/命令调用行为测试、client typecheck；隔离环境 Computer Use 验收。
- 非范围：改变开书流程、RAG自动启用、默认模型替换。
- 完成证据：[14 项行为检查、类型检查与隔离环境 Computer Use 均通过](./s1-02b-diagnostic-readiness-ui.md)。

## S1-03：检测建议与应用分开

作为作者，我希望看到兼容检测建议后再决定是否改变任务模型配置。

- Owner：Agent B，与 S1-02 串行；点数5；优先级 P0；状态 Refinement / Not Ready。
- Owned：沿用 S1-02 的 connectivity、LLM route和 ModelRoutesPage，避免两个 Agent 同改。
- Ready 前置：冻结事务内当前配置指纹计算及 PostgreSQL 隔离级别；定义没有显式 route 行时 revision=0 的 CAS 创建；固定 PUT 成功/重放/冲突判别联合与 HTTP 409；定义覆盖诊断、指纹、排序目标、服务端建议与 revision 的 canonical request hash；服务端按已保存诊断验证目标与建议；固定前端 operationId 的创建、重试和默认选择生命周期。
- 验收：检测返回建议，正式模型路由保持原值；失败检测不改模型、协议、格式。
- 验收：作者选择应用时展示受影响任务，走既有保存命令；只保存明确选定的任务。
- 验收：旧指纹建议显示过期，要求重新检测或重新审阅；请求携带诊断 ID、明确目标与 expectedFingerprint/revision，服务端在保存事务内校验目标当前配置，冲突409且零写入，不能只依靠前端预检。批量应用原子成功或明确整批冲突，不能沿用 Promise.all 后宣称整批成功；提交失败保留选择并说明结果。重放应用不重复写入，已消费或已变更的建议返回原结果或确定冲突。
- 检查：mock upsert/transport区分扫描与保存；覆盖多条同模型路由、失败检测、过期建议、选定任务保存、检测后另窗修改及提交竞争；前端检查集中复用。
- 完成证据：扫描前后路由值一致，主动应用后只改指定目标。

## S1-04：简易书架阅读现场恢复

作为作者，我希望刷新或重新进入作品后继续读同一章，并保留阅读位置。

- Owner：Agent C；点数3；优先级 P1。
- Owned：client/src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx及该目录内 owned 阅读状态模块与行为测试；不改 NovelEdit.tsx。
- 验收：chapterId URL 是选章事实源；正常深链接、重载、前进后退恢复同章；无 query 的普通作品入口恢复本书最后可读章并 replace URL，合法显式深链接优先于本地偏好。
- 验收：无效/不存在/不可读章节采用已有可读章选择策略；切书不沿用上一本章节或旧请求结果。
- 验收：滚动展示状态按作品+章节隔离，storage不可用时仍可阅读；正文版本变化时位置合理校正。
- 验收：后台生成、资料债或暂停不遮挡已保存可读稿；不开放简易模式写权限。
- 检查：阅读状态行为测试覆盖路由/隔离/不可读回退、普通入口重进与深链接优先；client typecheck；已有 simpleCreationIssueGovernanceContracts 仅作兼容补充。
- 用户验收：选择中间章→滚动→刷新→离开重进；切到另一作品；运行与暂停时读已保存章节。

## S1-05：世界问题归属校验

作为作者，我希望对当前世界的操作只影响这个世界。

- Owner：根集成人；点数2；优先级 P0；无依赖。
- Owned：server/src/services/world/worldImprovementService.ts中状态更新入口及相关聚焦测试；沿用 WorldService/HTTP facade。
- 验收：目标 issue 属于指定 world 才可更新；不存在/错归属返回确定错误且零写入。
- 验收：正常 resolved/ignored/status更新保持原接口兼容；读后写的归属条件落实到原子更新条件或事务，不能再次形成先写后验。
- 检查：mock persistence验证零写入与原子归属条件；覆盖不存在、跨world、正常更新；测试不对用户数据库发写请求。
- 边界：本卡不把 resolved 声明升级成验证通过；S3 问题历史会区分旧声明。

## S1-06：世界维护与恢复契约 Spike

作为开发团队，我们希望先固定安全写入和运行承接，再开发“采用并验证”。

- Owner：根集成人；点数3；优先级 P0；只读代码与文档设计。
- 产出：owned模块边界、数据状态图、API/错误例、revision和幂等合同、分阶段验证恢复、旧数据兼容清单。
- 决策：结构化骨架优先，legacy-text明确来源；旧 integrated回答不自动覆盖新结构；不同内容源不能再静默双写漂移。
- 决策：评估、提案、采用和复核分别保存阶段与证据；失效版本不提交；采用后恢复只续复核。
- 决策：选定已有通用workflow或扩展世界检查点的正式承接门面，证明租约/刷新恢复/来源投影，不直接把样本任务冒充小说导演任务。
- 决策：沿用当前本书生成/手动世界创建会生成关联样本的语义；之后push/pull仍显式确认。先纠正文档冲突，不在此Spike改变创建行为。
- 决策：世界Prompt超长文件先抽出 owned maintenance能力；作者决定如何进入评估和Gateway上下文；只允许范围明确的恢复。
- 决策：先冻结可空作者决定 schema 与 Gateway/评估输入，S3-04 可读取空集合，S3-06 再实施决定写入及生成消费，避免互相等待；分区同步必须校验跨实体引用完整性，不以归一化静默丢关系。
- 决策：区分 contentRevision、evaluatedRevision、baseRevision、syncBaseVersion 与诊断配置指纹；切片缓存刷新不推进内容版本。作者决定变化必须使相关评估失效，Spike 固定其纳入评估输入版本的具体策略。
- 验收：Spike输出由Runtime/Prompt/UI三 owner评审，形成可冻结合同；任一写入或恢复能力未证明，相关Story标Not Ready。
- 检查：路径/API与代码核对、文档链接检查，不运行全量构建或真实模型。

## S1-X：专业章节辅助区域按需展开

作为作者，我希望正文有足够空间，需要时再打开目录或AI协作。

- Owner：Agent C；点数3；Stretch，核心完成后才进入。
- Owned：client/src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx、ChapterEditorSidebar.tsx、ChapterEditorDirectorPanel.tsx（后三项同属 chapterEditor 目录）。
- 验收：正文优先；两个辅助区独立开关；窄屏不套抽屉；选区可以唤起协作；关闭不丢候选/草稿/选区。
- 检查：client typecheck与既有修改行为回归；不为className写镜像测试，UI交用户验收。
- 风险：检查 NovelChapterEdit 的组件 key/remount 是否会清草稿；需要改外部入口时先由根集成人评审接线。

## 多 Agent 派发顺序

1. 根集成人固定分支与基线，完成S1-00接线门；A:S1-01、C:S1-04可先并行。
2. 门通过后派发 Agent B:S1-02a；根集成人执行S1-05及S1-06；总并发不超过三个子Agent加根。
3. Agent B依次完成S1-02b、S1-03；Agent C容量允许再执行S1-X。
4. 各Agent提交变更说明、定向测试结果和残余风险；不自行switch/commit/merge，不修改共享保留文件。
5. 根集成人review diff，统一构建/检查，补Wiki与适用发布记录，按完整阶段提交。不得把Ready当Done。

诊断接口冻结前B可做 owned store/transport适配；mock UI不算交付。新增schema/registry由根集成人管理。Agent需要越界改文件时先发接线请求，不直接抢占文件。

## 验证与验收

首轮新回归测试使用 mock transport/persistence；新增测试不能写用户数据库或调用付费模型。

代码级检查按实际diff选择，集中执行：

    pnpm --filter @ai-novel/shared build
    pnpm --filter @ai-novel/server build
    node --test server/tests/<本轮聚焦测试>.test.js
    pnpm --filter @ai-novel/client typecheck
    git diff --check

上例测试占位必须替换为实际文件，不能原样运行。server测试读取dist时先确认产物在相关源码最后修改之后；前端纯布局不强加新测试。

回归补充候选：server/tests/modelRouter.test.js、ragCompatibilityBootstrap.test.js；client/tests/settingsNavigationContracts.test.js、simpleCreationIssueGovernanceContracts.test.js。新行为必须有有意义的行为测试，源码文本断言不替代运行合同。

用户UI验收清单：

- 打开概览/路由/知识库，看到未检测或最近结果，没有隐式模型调用；点检测后有明确反馈。
- 扫描产生建议而不改变路由；选择应用后只影响明确任务。
- 简易页原章原位置恢复；切书与后台执行不影响阅读。
- 合法设置值保持；未配置项显示推荐默认。

发布门：定向检查通过，用户UI验收结果或缺口记录，组合beta回归后才晋级main；规划阶段不触发包装或发布。
