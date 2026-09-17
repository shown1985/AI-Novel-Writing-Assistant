# Sprint 2：单书创作现场与模型透明度

## 目标、范围与容量

本页细分[路线图](./agent-collaboration-sprints.md)中的 S2-01～04，并作为滚动状态合同维护。S2-01a 与 S2-02 已在 R1-S2A 完成；S2-01b 与 S2-04a 已进入 [R1-S2B](./r1-s2b-sprint-commitment.md)，其余卡按依赖保持 Ready、Blocked 或 Refinement。目标是让作者在原作品现场读到成果、按需展开协作、处理一个明确下一步，并区分预计使用模型和本次实际调用。

当前源码已提供章节修改预览、候选、差异、正文保存和审校；本 Sprint 复用这些能力。全局 Creative Hub 和运行记录保持只读，运行中的任务恢复仍走现有来源页命令。简易体验的用户写门禁和不可逆转专业语义继续生效。

细分后为 8 张卡、28 点候选容量；路线图原 18 点是初始概要估计，新增拆分显式计入超长总控收敛、调用证据持久化和独立接线成本。28 点不作为一个 1～2 周窗口的固定承诺，按下面的验收窗口安排：

| 窗口 | 候选卡 | 点数 | 退出条件 |
| --- | --- | --- | --- |
| S2-A 创作现场 | S2-01a、01b、02、03a、03b | 17 | 总控收敛、正文开关、推荐与来源恢复联通；S1-X 已通过则减去 S2-02 的 3 点 |
| S2-B 模型透明度 | S2-04a、04b、04c | 11 | 来源合同、实际调用证据与只读显示联通；存储 Spike 若超出 5 点另拆卡，不缩减历史保护验收 |

仅接纳已冻结依赖的卡。模型透明度合同可与总控拆分并行设计；未冻结的持久化和客户端接线均为 Not Ready。点数代表相对复杂度，具体开发基线由根集成人开工时记录。

## 源 ID 映射与共同边界

| 路线图源 ID | 实施卡 | 范围与复用 |
| --- | --- | --- |
| S2-01 | S2-01a / S2-01b | 查询与导演编排、阶段展示装配分别归属；同一 owner 串行完成 |
| S2-02 | S2-02 | 对应 S1-X；已交付且未被后续修改失效时只复用验收证据，不重复实现 |
| S2-03 | S2-03a / S2-03b | 先冻结纯展示模型，再绑定既有来源页动作 |
| S2-04 | S2-04a / S2-04b / S2-04c | 来源合同、实际尝试证据、提交前与运行显示分别验收 |

父 ID 是里程碑映射，不是额外实施卡，不重复计点；原概要估算只保留为历史，承诺以细分卡 refinement 后的容量为准。

共同非范围：不重写自动导演或章节生产；不开放简易用户编辑；不新增付费模型测评；不切换全局默认模型语义；不实现任务总预算；不新增通用自由文本关键字路由；不把历史调用按最新配置重算；不以 AI 实况的临时正文代替已保存稿。

## S2-01a：单书查询与导演编排归属

- 用户价值：切换作品、阶段和任务时仍能看到属于当前作品的真实状态，后续协作入口有明确事实来源。
- 状态：Done（application 归属）；S2-01b 只承接 presentation 装配，不重复迁移本卡能力。
- 点数：5；Owner：Agent A，独占总控模块。
- 真实源码：client/src/pages/novels/NovelEdit.tsx（审计时 2871 行）、hooks/useNovelEditWorkflow.ts、hooks/useNovelEditInitialization.ts、hooks/useNovelEditChapterRuntime.ts、hooks/novelEditWorkflowParams.ts。
- 拟建归属：client/src/pages/novels/workspace/application/ 下的查询与导演编排能力；对外通过该模块 index.ts 使用。名称在责任清单中冻结，不新建同层泛用 helpers。
- 非范围：不改变查询合同、任务选择优先级、continue 参数、quality-first 暂停、表单内容或服务端权限；不为模块迁移新增第二任务或自动恢复。

步骤：

1. 列出总控职责和依赖：查询、URL 身份、导演状态与锁、恢复与审批、阶段装配、下载及流式活动。
2. 将按 activeTab 启用的查询和资源派生移入 owned application，保留现有 queryKeys 和加载条件。
3. 将 active/latest director 校验、book automation projection、task panel 与恢复编排收敛到导演能力；区分 directorTaskId 与 workspaceTaskId。
4. 总控消费 facade，维持现有生命周期与用户交互；由 S2-01b 完成剩余展示装配和最终阈值收敛。

可检验 AC：

1. activeTab 查询启用矩阵迁移前后相同，非当前阶段不额外装载大资产。
2. 缺少 URL directorTaskId 时依旧读取真实当前导演任务；workspaceTaskId 不充当导演任务 ID。
3. 切书后旧查询或异步响应不写入新书的本地状态、URL 或提示。
4. pendingManualRecovery 和 quality-first 暂停不因轮询或模块装载被清除；局部质量债不升级为 replan。
5. 迁移后 continue/recover/approve 参数与既有入口相同，打开页面不额外启动正文生产。
6. 新提取文件均不超过 1300 行；残留总控不得在 S2-01b 完成前扩展新功能。01a/01b 作为同一模块收敛阶段验收，最终总控必须低于硬阈值。

聚焦行为检查：复用 client/src/pages/novels/hooks/novelEditWorkflowParams.test.mjs、novelWorkspaceNavigation.test.mjs、novelEditAutomationStatus.test.mjs；针对迁移涉及的资源身份和查询启用行为补纯函数或 mock-query 测试。执行 client typecheck，不写逐行源码镜像测试。

数据安全与失败恢复：不触发章节重置、快照恢复、数据库迁移或用户库写测试；查询 Error 与 Empty 分开。迁移失败以代码修复或回退本阶段未发布代码解决，不回滚用户创作数据。

交付证据：[S2-01a 完成证据](./s2-01a-single-book-application-facade.md)记录责任/依赖图、查询矩阵、身份与暂停行为、文件行数、模块边界 README 与定向检查。S2-01 父项仍等待 S2-01b 的 presentation 装配，不因本卡提前标成全部完成。

## S2-01b：阶段装配与页面组合收敛

- 用户价值：各阶段共享一个稳定作品现场，后续交互调整不会改坏角色、世界、卷章与正文生产。
- 状态：In Progress（R1-S2B）；S2-01a facade 已冻结。
- 点数：3；Owner：Agent A，与 01a 串行，不分给第二人抢改总控。
- 真实源码：client/src/pages/novels/NovelEdit.tsx、components/NovelEditView.tsx、components/NovelEditView.types.ts（审计时 670 行）、mobile/MobileNovelEditView.tsx；现有 hooks/useNovelVolumePlanning.ts、useNovelCharacterMutations.ts 等保持本模块职责。
- 拟建归属：client/src/pages/novels/workspace/presentation/ 的各阶段 props 装配与组合；公开 index.ts。业务编排依赖 application，通用 workspace 展示组件不依赖小说 API。
- 非范围：不一并优化所有专业表单，不改阶段枚举，不用聊天替代专业编辑器，不扩大本书世界写权限。

步骤：

1. 分离基础/世界、故事与卷章规划、角色、章节与 pipeline、导出展示合同，按明确职责建立 owned 装配模块。
2. 对旧 NovelEditViewProps 保留兼容，避免一次跨所有专业面板重写接口。
3. 让 NovelEdit 只组合 application 与 presentation，审查双向导入、同层 feature 前缀堆积和匿名大 props 构造。
4. 补模块 README：URL、任务身份、已保存产物、查询与系统写命令各自事实源。

可检验 AC：

1. 现有所有阶段在相同输入下得到等价 props 和回调，manual 与 system 动作没有互换。
2. URL 的 stage/chapterId/volumeId/directorTaskId/workspaceTaskId 及旧 taskId 兼容规则保持。
3. 桌面和移动视图使用同一业务装配结果，没有第二套任务解释逻辑。
4. NovelEdit.tsx 及每个新增/触及扩展的源文件不超过 1300 行，优先接近 1200 行以下；跨模块只经 facade 导入。
5. 打开、切阶段、导出及显示最近任务不额外触发生成或审批命令。
6. 简易项目仍导航到既有只读体验；转专业行为、运行任务与保存资产不被拆分改变。

聚焦行为检查：装配中有条件判断的转换使用输入矩阵行为测试；沿用 01a 身份/导航回归与 client typecheck；若仅机械迁移不重复昂贵 build。

数据安全与失败恢复：不操作 devResetNovelChapters、不删书、不清资产。未保存表单与流式状态须保持既有生命周期；发现挂载改变造成草稿丢失则未通过，不以清空草稿修复。

交付证据：最终行数、装配职责表、无跨层深导入检查、桌面/移动合同一致性、01a+01b 定向回归。该阶段不声称新的协作功能已经可用。

## S2-02：专业章节辅助区域按需展开

- 用户价值：正文获得安静的阅读编辑空间，需要时在同章展开目录或 AI 修改帮助。
- 状态：Done（R1-S2A）；[行为检查、按需请求计数与隔离 Computer Use 验收通过](./s2-02-professional-chapter-assist-panels.md)。
- 点数：3（Reused 时新增开发点数为 0）；Owner：Agent B，章节编辑模块独占。
- 真实源码：client/src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx、ChapterEditorSidebar.tsx、ChapterEditorDirectorPanel.tsx、ChapterTextEditor.tsx、SelectionAIFloatingToolbar.tsx；外部 NovelChapterEdit.tsx 改动由根集成人接线。
- 现有能力：previewChapterAiRevision、updateNovelChapter、reviewNovelChapter；复用候选与 AIDiffPanel，不新造写作链。
- 非范围：不开放简易页改稿，不新做生成服务，不改修订权限、审校判定或章节版本回退。

步骤：

1. 复核 S1-X 代码与证据；未实施才设计目录与协作区域独立开关。
2. 正文优先，辅助层在窄屏单层呈现；保持编辑器和 session 不因折叠重建。
3. 用户显式选区修订时展开协作区域；禁止仅选择文本就发送模型调用。
4. 检查 NovelChapterEdit 的 chapter.id:updatedAt key 是否在查询刷新时清草稿；需要变更时向根集成人提出身份/外部更新处理请求。

可检验 AC：

1. 正文默认可见，两个辅助区独立开关，键盘能操作且控件具有明确标签。
2. 关闭/重开任一辅助区保留正文草稿、选区、修订指令、候选和 activeCandidateId。
3. 点击现有选区修订入口打开正确协作区，targetRange 与请求一致；折叠不会重复生成。
4. 窄屏不会产生嵌套抽屉或内容越界；一次只显示必要的浮层。
5. 保存/预览/审校失败时原稿和候选保留，并明确可重试操作；加载不遮挡已有草稿。
6. 章节切换清理前一章 session；同章普通查询刷新不静默丢失脏稿。外部正文变化须提示冲突，不覆盖作者草稿。

聚焦行为检查：有状态开关/session 行为用现有 revision request 和候选应用测试补充；client typecheck；不测试 Tailwind 字符串。宽屏、窄屏、键盘和失败保持已由获授权的 Computer Use 在隔离环境完成。

数据安全与失败恢复：只改展示与本地 session。保存继续走既有命令，预览不自动写正文；外部更新冲突须保留草稿，不使用清库/重置处理。

交付证据：[S2-02 完成证据](./s2-02-professional-chapter-assist-panels.md)记录状态保留、初始零 workspace 请求、首次显式展开一次请求、折叠重开与纯选区零重复请求，以及宽/窄屏 UI 结果。

## S2-03a：单书成果、进度与推荐动作展示模型

- 用户价值：作者能判断已经得到什么、AI 正在做什么和唯一推荐下一步，不将普通提醒误判为全书失败。
- 状态：Blocked by S2-01a/01b；纯展示合同可先设计，生产接线等待 facade 稳定。
- 点数：3；Owner：Agent A，单书 presentation 独占。
- 真实源码：client/src/pages/novels/components/NovelEditView.tsx、NovelTaskDrawer.tsx、NovelAutoDirectorProgressPanel.tsx、novelEditAutomationStatus.ts、novelWorkspaceNavigation.ts；shared/types/directorRuntime.ts 为根集成人保留。
- 拟建归属：novels/workspace/presentation/ 的纯展示模型；展示通过 client/src/components/workspace/ 现有 primitives。
- 非范围：不让 UI 重新评判审校结论，不添加 keyword/regex 推荐，不在共享展示组件读 API，不改 Runtime checkpoint。

步骤：

1. 列出真实输入：保存章数与目标、当前导演 snapshot/displayState、automation projection、manual recovery、局部质量债、查询状态。
2. 分离产物完成度、当前任务范围完成和全书完成，建立可检验展示转换。
3. 按已治理结构化状态合同输出一个推荐动作及原因/影响，诊断信息放次级区域。
4. 定义 stale/loading/error/empty 的状态与旧产物保留策略，供 03b 消费。

本卡只消费已存在的结构化任务状态与推荐，不另造AI调用来替代确定性投影。若扩展到“下一步创作方向”等新的语义决策，必须另列Prompt/schema依赖门：server/src/prompting/ 的PromptAsset、registry注册和结构化输出先冻结，由根集成人接线；不能把自由文本关键词或人工分支表当产品核心决策，也不能悄悄纳入本卡3点。

可检验 AC：

1. 最近任务 succeeded 但只完成局部范围时不能显示整书完成；依据真实保存产物和目标说明剩余范围。
2. queued/running 显示工作对象与阶段，任务查询失败不伪装为空或完成。
3. 局部质量债显示可继续的提醒；明确重规划、pendingManualRecovery 和 quality-first 人工暂停显示正确影响。
4. 无 URL directorTaskId 但存在真实最近失败/暂停任务时仍输出来源现场处理动作。
5. workspaceTaskId 永不替代 directorTaskId；没有合格任务时不产生可执行恢复动作。
6. 每个状态最多一个推荐主动作；有保存正文时查询错误与暂停仍允许阅读成果。

聚焦行为检查：拟建 client/src/pages/novels/workspace/presentation/ 下 table-driven ViewModel 测试，覆盖上述矩阵与 task 身份；复用 automation/navigation 回归，client typecheck。

数据安全与失败恢复：纯转换零写入，任务错误不清正文；UI 严重度不改变运行状态。失败恢复只给来源和明确命令引用，不自行 resume。

交付证据：输入输出矩阵、各结构化信号来源、无错误文案猜测、单主动作结果、已保存正文保护结果。

## S2-03b：来源现场推荐动作与反馈接线

- 用户价值：点击推荐后知道影响范围、看到处理中反馈，并能在同一创作现场完成恢复。
- 状态：Blocked by S2-03a 与 S2-01b；既有命令列表冻结后 Ready。
- 点数：3；Owner：Agent A，与 03a 串行；根集成人接线共享 API。
- 真实源码：client/src/pages/novels/components/NovelEditView.tsx、mobile/MobileNovelEditView.tsx、NovelTaskDrawer.tsx、hooks/useNovelEditWorkflow.ts、client/src/api/novelWorkflow.ts、novelDirector.ts（API facade 保留根 owner）。
- 非范围：不在 Creative Hub/运行记录增加执行按钮，不新增第二 continue/repair API，不修改自动导演 issue policy，不以 toast 代替持久状态。

步骤：

1. 用 03a 展示模型替换分散的主推荐，次级专业工具保留在相关上下文。
2. 绑定已有来源页 continue/recovery/approval 命令，展示当前对象、改变范围和保留产物。
3. pending 同步到真实控件，防重复与冲突操作；更新对应 query 缓存，不改其他作品。
4. 在刷新和失败时从既有投影恢复动作，技术细节与运行记录保持次级只读入口。

可检验 AC：

1. 推荐动作执行仍使用同一现有导演命令和真实 taskId，重复点击 pending 不发第二命令。
2. 用户点击后原动作位置显示排队/提交/运行反馈，不能仅隐藏按钮。
3. API 拒绝或网络错误保留成果与输入，并显示明确影响和来源页重试/重新读取方式。
4. 刷新重新读取服务器投影，不以本地 pending 宣称成功；旧书响应不更新当前书。
5. 局部质量债不阻挡 completion-first 后续范围；quality-first 人工暂停必须由用户明确恢复。
6. 桌面与移动共享推荐解释；Creative Hub/运行记录没有新增任务变更能力；简易写门禁保持。

聚焦行为检查：mock existing command 的调用次数、参数、pending/失败/刷新/跨书响应；复用 workflow params 与 source navigation 回归；client typecheck。UI验收交用户。

数据安全与失败恢复：测试不发用户库写请求，不重置章节。操作后结果不明先读取正式状态，不凭超时重新创建任务；已有正文继续由 Runtime 的保护与恢复合同保留。

交付证据：来源动作映射、请求计数/参数、失败与刷新恢复样例、只读入口边界检查、用户验收或缺口。

## S2-04a：模型选择来源与有效参数合同

- 用户价值：作者理解顶部偏好、任务路由和实际生效模型之间的关系，避免以界面选择推断所有调用。
- 状态：In Progress（R1-S2B，合同与 resolver）；实际字段/API 由根集成人冻结后进入生产接线。
- 点数：3；Owner：Agent C 平台；共享 types/出口由根集成人单一接线。
- 真实源码：server/src/llm/factory.ts、modelRouter.ts、usageTracking.ts、capabilities.ts；shared/types/llm.ts、llmLive.ts；client/src/store/llmStore.ts；server/src/services/settings/LLMSelectionSettingsService.ts。
- 拟建归属：若需要新来源类型，shared/types/ 下明确模型选择能力文件；若 factory 需提取解析能力，放 owned server/src/platform/llm/ 子模块与 facade。名称由根集成人冻结。
- 非范围：不将默认行为改成按路由优先，不把顶部持久全局选择假称一次性覆盖，不主动探测模型，不根据市场热度换模型，不实现委托策略快照。

步骤：

1. 盘点 factory 的显式 provider/model、task route、厂商默认、能力温度/Token约束和备用路径；区分每个字段的来源，允许混合来源。
2. 定义 requested/effective、选择来源、routeKey/routeDegraded、attempt lineage、unknown legacy 元数据，确保不包含 apiKey/baseURL秘密或鉴权头。
3. resolver 输出由实际解析过程产生，禁止客户端按当前配置重算历史；提交前最多展示预计解释，不宣称实际调用。
4. 冻结 04b 的所有生产调用持久化承接：现有导演记录仅覆盖一类上下文，证明非导演/世界/预览如何读到实际来源；未证明时对应接线 Not Ready。

可检验 AC：

1. 显式 provider/model、纯任务路由、厂商默认和降级路径的来源与 resolver 实际结果一致。
2. provider 与 model 或 temperature/maxTokens 来源不同可分别解释，不用一个误导性枚举掩盖混合来源。
3. 能力层调整温度或Token时 requested 与 effective 分开，保留调整原因和未知字段。
4. 解析只读、不调用模型/embedding、不保存或替换用户模型配置；旧调用缺失来源显示未记录。
5. 全局当前选择仍是 AppSetting 事实源；首轮不引入隐藏的 per-book/per-task策略变化。
6. 备用尝试有主请求关联，原模型信息不被覆盖；字段脱敏。

聚焦行为检查：server/tests/modelRouter.test.js 补混合显式选择与路由矩阵；factory resolver 用 mock secret/settings/provider；能力调整断言请求真实参数。根集成人 build shared/server 一次后运行相关定向测试。

数据安全与失败恢复：不批量修正保存设置；缺失元数据用 unknown，不伪造历史。合同变更仅增量字段，历史读取兼容。

交付证据：来源矩阵、脱敏 schema、实际 resolver 样例、持久化选型与非导演覆盖清单、明确 Ready/Not Ready 入口。

## S2-04b：实际调用尝试的来源证据

- 用户价值：即使重试、修复或切备用模型，作者能看到真正完成该次工作的模型，而非提交前猜测。
- 状态：Blocked by S2-04a；持久化/迁移/出口冻结后 Ready。
- 点数：5；Owner：Agent C，平台调用/观测模块独占；根集成人拥有 schema、共享类型与挂载。
- 真实源码：server/src/llm/factory.ts、usageTracking.ts、structuredInvoke.ts；server/src/platform/llm/live/llmLiveSession.ts、LlmLiveBroker.ts、http/llmLiveRoutes.ts；server/src/services/novel/director/runtime/DirectorUsageTelemetryQueryService.ts；server/src/services/task/taskTokenUsageSummary.ts。
- 拟建归属：如果现有 metadataJson 不能覆盖非导演调用，新增 owned platform/llm 来源记录存储与查询能力，数据库增量模型及 SQLite/PostgreSQL 迁移由根集成人审查；这是待选型，不声称通用持久调用仓库已存在。
- 非范围：不制造第二 Token统计或成本账本，不实现预算硬门禁，不改变重试次数与备用策略，不将无 usage 返回解释成免费调用。

步骤：

1. 将 04a 的解析证据绑定实际客户端请求与 interaction/attempt ID；invoke/stream 遵循同一元数据。
2. 在 structuredInvoke 重试/修复/备用路径传递主请求与各尝试关联，分别记录实际 provider/model。
3. 写入已冻结的持久证据存储并推送 live；查询投影读取保存事实，不依赖当前默认配置。
4. 定义观察写入失败降级：正文与创作状态不因遥测失败自动失效，明确未记录/诊断债；实况不是永久历史仓库。

可检验 AC：

1. invoke 与 stream 返回同样的实际选择来源，输出 Token 为 null 仍能记录实际模型尝试。
2. 原模型失败→重试→备用成功的记录保留每个尝试及最终成功来源，不把最终模型覆盖全部历史。
3. 重启后读取已完成记录，后改默认模型不改变旧记录；历史缺字段仍可读且显示未记录。
4. 并发两个作品/任务的 AsyncLocalStorage 上下文不串联；interactionId 与 task/novel 关联正确。
5. 记录写失败不能重放生成、重新采用正文或改变 pendingManualRecovery；必须显示证据缺失而不是虚构实际来源。
6. 保存记录和 API不含明文凭证、鉴权头或带秘密查询参数的地址；普通读取零模型调用。
7. 导演和至少世界生成、章节改稿预览两类非导演实际调用均通过冻结门面；未覆盖入口明确降级为未记录，不宣称全系统透明。

聚焦行为检查：拟建 server/tests/modelSelectionProvenance.test.js，用 mock transport+persistence 覆盖 invoke/stream、无usage、fallback、遥测失败、并发上下文与重启读取；复用 directorUsageTelemetryProjection.test.js。不发送真实模型、不写用户桌面库。

数据安全与失败恢复：增量迁移先在临时 SQLite/PostgreSQL兼容环境验证；不 reset 或回填伪造历史。遥测重试只补证据，永不重发创作请求；内容结果与观测失败分开保存。

交付证据：每个入口覆盖清单、attempt 链样例、重启后查询、并发与缺失证据结果、迁移/兼容检查及未覆盖风险。

## S2-04c：预计模型与实际来源的只读显示

- 用户价值：提交前知道选择意图，运行后看到实际调用与备用原因，技术参数保持按需查看。
- 状态：Blocked by S2-04a/04b；根集成人冻结 API/live 字段后 Ready。
- 点数：3；Owner：Agent B，04a完成后可设计纯展示模型；由根集成人接线共享/全局组件保留范围。
- 真实源码：client/src/components/common/LLMSelector.tsx、components/layout/Navbar.tsx、components/liveExecution/LiveExecutionDialog.tsx、hooks/useLlmLiveFeed.ts、pages/novels/components/NovelTaskDrawer.tsx、pages/tasks/TaskCenterPage.tsx。以上跨作品/全局文件由根集成人逐项授权，Agent 不默认抢占。
- 拟建归属：client/src/components/common/ 下明确模型来源展示能力及行为测试；不复制来源解析业务，不新增全局执行按钮。
- 非范围：不把全局持久选择改名为本次覆盖，不在运行记录执行恢复，不让实况覆盖已保存正文，不强迫作者理解11类路由。

步骤：

1. 明确提交前“预计/当前选择”与正式调用“实际使用”的文案和数据来源。
2. 展示摘要模型与来源；混合来源、有效参数、备用链和缺失字段进入可展开详情。
3. 运行历史读取04b证据；旧字段兼容，切书/切任务不沿用旧记录。
4. 通过根集成人接入全局实况/运行记录只读区域和本书drawer，检查低边框与用户任务语言。

可检验 AC：

1. 未发生请求时不能显示实际模型；只显示预计并说明正式调用可能因路由/能力/备用变化。
2. 有实际证据时优先显示该次记录，修改顶部或路由不会改写历史 UI。
3. 备用成功显示备用模型及关联原尝试；未记录、加载、读取失败分别表达。
4. requested 与 effective 差异按字段解释，不显示 API key、内部全文错误或秘密地址。
5. 阅读信息不会发模型请求或保存配置；运行记录/全局 Creative Hub 没有新增任务变更入口。
6. 切换任务/作品后旧响应不能替换当前来源摘要；内容与选择器水合未知时不持久化首个候选。

聚焦行为检查：纯 provenance 展示模型输入矩阵覆盖预计/实际/混合/未知/备用；useLlmLiveFeed 既有身份与缓存回归按实际diff选择；client typecheck，UI验收交用户。

数据安全与失败恢复：只读展示不改变模型配置。查询失败允许重新读取，保持已保存正文，不发生成重试来补来源；敏感字段在服务端及展示层两次检查。

交付证据：预计和实际响应样例、历史配置变化测试、查询/调用计数、只读边界检查、用户验收或缺口。

## 并发 Wave 与接线所有权

| Wave | Agent A 单书现场 | Agent B 编辑/显示 | Agent C 平台来源 | 根集成人 |
| --- | --- | --- | --- | --- |
| 0 | 01a责任清单 | 核验S1-X证据 | 04a合同草案 | 固定基线、批准ownership；冻结共享元数据与持久化选型门 |
| 1 | 01a→01b串行 | 02或复用证据 | 04a resolver | 共享类型/API、边界审查；不让其他人同时改NovelEdit |
| 2 | 03a→03b串行 | 04c纯展示准备 | 04b实际来源记录 | 增量schema/迁移、live出口；逐项分配全局组件和drawer接线 |
| 3 | 来源动作集成 | 04c接线 | 平台定向回归 | review完整diff、统一build/检查、Wiki与适用发布记录、阶段提交 |

最多三个子Agent加根集成人。一个checkout内不自行切分支、commit、merge。NovelTaskDrawer.tsx 在03阶段归Agent A；04c涉及模型详情时先冻结接口，再由根集成人整合，禁止A/B同时写。04a/04b同一平台owner串行，factory/usage/live不拆给多人并写。S1-X与02同一章节owner，避免重复交付。

共享类型、Prisma schema、registry、API facade、queryKeys、路由挂载、README、release/wiki由根集成人单一管理。拟建类型/存储不代表现有接口；依赖不明确时生产接线标Not Ready，可只做Spike或mock联调。

## 验证、验收与阶段完成

按实际diff选择窄检查，根集成人统一执行；不默认浏览器/截图，不将typecheck替代功能验收。

    pnpm --filter @ai-novel/client typecheck
    node --experimental-strip-types --test client/src/pages/novels/novelWorkspaceNavigation.test.mjs client/src/pages/novels/hooks/novelEditWorkflowParams.test.mjs client/src/pages/novels/novelEditAutomationStatus.test.mjs
    pnpm --filter @ai-novel/shared build
    pnpm --filter @ai-novel/server build
    node --test server/tests/modelRouter.test.js server/tests/directorUsageTelemetryProjection.test.js
    git diff --check

新增行为测试在对应卡中标拟建，实际执行前替换为已创建文件；已有检查只有在同分支、相关源码最后修改之后才可复用。纯布局不强迫新镜像测试。服务器dist测试必须先确认构建未过期，平台与共享变化统一build一次。

用户验收场景：专业章正文优先、辅助开关不丢草稿；暂停与局部质量债仍可读；无URL任务ID仍看到正确来源恢复；一次点击有反馈且不重复执行；顶部改选择不改历史实际来源；未知模型证据不伪装实际使用；简易页仍只读。

模块收敛01a/01b一起达到硬阈值后完成阶段；03a/03b联通后才能声明推荐动作交付；04b/04c覆盖清单明确后才能声明实际模型透明度交付。各阶段review、定向检查、用户验收缺口记录、稳定Wiki和适用发布记录维护后由根集成人按新增/优化/修复规范提交。feature→beta组合验收→main，规划本身不触发包装或发布。
