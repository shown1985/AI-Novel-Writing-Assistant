# Sprint 5～8：委托、预算、记忆资产与交互推广实施卡

## 使用方式与状态

本页将 [Sprint 路线图](./agent-collaboration-sprints.md) 的 B-01～B-12 全部分解为不超过 5 点的卡，并新增 B-13 模型能力评测与任务预设。它是候选实施顺序，代码尚未实施；任何卡都不能因本文存在就被视为运行能力已具备。日期、产能和真实模型质量未作承诺。

统一状态为 `Ready`、`待解锁`、`Spike`、`Blocked`、`Done`。下文 Spike 可在所列前置完成后启动；生产卡默认待解锁。根集成人记录实际冻结结论、分支基线、测试证据和剩余缺口后才能改变状态。Sprint 5A、6A、7A、8A 是拆分验收窗口，可以调整，不是额外并发承诺。先验收一个闭环，再扩大对象与范围。

共同开发边界：

- 一个根集成人与最多三个执行 Agent。根集成人独占 `shared/types/`、Prompt Registry 接线、Prisma 两平台 schema/增量迁移、HTTP 挂载、API/queryKeys、Wiki、发布摘要与阶段提交。子 Agent 只改明确 owned 模块，不切分支、提交或晋级。
- 已存在的目录按实际路径描述；标为“拟建”的模块尚不存在，必须先通过边界评审。高密度目录不继续堆同级文件；模块以门面或 `index.ts` 对外提供能力。扩展前遵守长文件阈值和责任拆分。
- 全局 Creative Hub 及运行记录只查询与导航。操作发生在绑定作品、章节或资产的来源现场，带稳定来源路由；`workspaceTaskId` 与导演任务 ID 不混用。
- 简易模式的手动 API 保持只读。协作写入须由 S5-01 明确独立命令授权，不能把“切换专业”当成协作授权。没有已验证的门禁前，仅开放阅读和提案。
- 意图、规划、问题分类、修改范围与相关性由 AI 结构化理解产生。新增 Prompt 必须是 `server/src/prompting/prompts/<family>/` 中的 PromptAsset，经 Registry、目录、预览与受控测试纳管；不叠加关键词/正则路由或非 AI 语义兜底。确定性校验负责权限、版本、对象引用和额度。
- 所有卡使用 mock transport/persistence 或隔离临时 SQLite；PostgreSQL兼容按隔离环境验证。不得用用户桌面库做写入测试，不 reset、不删除或覆写作者正文。涉及真实数据破坏时必须另有明确授权和已验证备份。
- 真模型评测不默认执行。待相关现场与调用范围明确后，由作者明确选择样本、模型和预算；不把模型名称当成能力证明，不自动启用 RAG、换模型或全库重建。未实测时记录质量未知。
- 实施卡 AC 均须有行为证据。前端 typecheck 与用户 UI 验收分开记录；后端测试读取 dist 时由根集成人统一构建最新产物，不重复全套构建。不为样式 className 编写镜像测试。

## 原 Backlog 到实施卡的完整映射

| 原 ID | 本页实施卡 | 拆分结果 |
| --- | --- | --- |
| B-01 委托与权限 Spike | S5-01、02、03、07 | 权限决策 → 委托快照 → 来源命令门禁 → 现场审阅 |
| B-02 本次模型策略快照 | S5-04、05 | 启动解析与保存 → 恢复/重试保持与前端选择 |
| B-03 总预算 Spike | S6-01 | 调用账本与停止边界冻结 |
| B-04 预算预留及调用计数 | S6-02、03 | 并发预留 → 所有内部调用统一记账 |
| B-05 保存暂停与同任务恢复 | S6-04、05 | 停止边界 → 租约和重启累计恢复 |
| B-06 成本和剩余目标 | S6-06 | 实际使用、未知和剩余范围投影 |
| B-07 记忆准备 | S7-01、02 | 可用性与来源读取 → 显式按范围准备/恢复 |
| B-08 现场口述修改 | S5-06、S7-05a、05b、05、06a、06b、06、07a、07b、07 | 意图合同 → 正文/人物/规划各自Spike、版本安全和局改交付 |
| B-09 资产适配同步 | S7-03、04 | 引用版本与适配 → 选择性同步和发布保护 |
| B-10 撤回依赖 Spike | S8-01、02、03 | 真实依赖决策 → 有限事务回退 → 下游失效与恢复 |
| B-11 导航收束过渡 | S8-04、05 | 两区入口收束 → 深链接、任务来源过渡 |
| B-12 十章 E2E | S8-06、07 | 确定性长链验收 → 可选真模型作者验收 |
| B-13 模型能力评测与任务预设（新增完善项） | S5-08、09、10 | 能力回归与评测集 → 可选真实抽样 → 有证据的任务预设 |

## Sprint 5：有范围的委托与模型策略

Goal：作者的要求变成可审阅、可持续恢复的委托，写权限与模型策略具有明确来源。候选 29 点：窗口 5 为 S5-01～04（16 点），窗口 5A 为 S5-05～07（13 点）。Spike 未冻结前不得通过新增按钮扩大写权限。

独立模型能力窗口 5B 为 S5-08～10（11 点），可按平台owner容量后移，与来源透明度分开验收；真实抽样不作为基础委托功能的强制付费退出门。

### S5-01 委托与简易协作权限 Spike（3 点）

- 用户价值：作者能授权一项具体工作，同时保留直接编辑模式和受保护内容。
- 状态/前置：Spike；S1-06、S3-06及当前简易服务端门禁审计完成。若后续角色/规划版本能力缺失，列为对应生产卡前置，不默认可写。
- Owner/模块：根集成人；只读 `server/src/services/novel/director/commands/`、`server/src/modules/novel/setup/`、`server/src/services/novel/chapterEditor/`。拟建委托模块为 `server/src/modules/novel/collaboration/{domain,application,http}/`，由既有执行门面承接，不复制导演。
- 实施任务：定义目标、对象集合、允许改变、保护要求、完成标准、授权主体、到期/撤销、重要选择边界；决定简易协作命令与普通手动 API 的关系；区分首次生产与后续修订授权。
- AC：①给出正文局改、世界局改、角色动机、大范围规划四个权限矩阵例；②简易手动接口仍拒写且协作授权不触发不可逆模式切换；③全局中枢/运行记录无命令写入口；④高影响未决事项留在来源现场，已有 quality-first 暂停不被授权覆盖；⑤命令重放、撤销与任务快照生效时间明确。
- 测试隔离/安全：代码路径与接口样例评审，mock权限用例；不发真实模型，不执行权限或数据迁移。
- 非范围：开放任意全局 Agent 写权限、修改当前模式转换规则、实现撤回。
- 交付证据：矩阵、API/拒绝错误例、模块依赖图、Runtime/Prompt/UI owner评审与待解锁卡清单。

### S5-02 创建并保存委托快照（5 点）

- 用户价值：刷新后仍知道 AI 的目标、范围和作者要求；系统默认变化不会改掉这次委托。
- 状态/前置：待解锁；S5-01冻结及对应对象 revision合同可用。根集成人先接增量 schema与共享类型。
- Owner/模块：Runtime Agent；拟建 collaboration `domain/DelegationContract`、`application/DelegationCommandService` 与 owned persistence adapter，通过门面对外；复用导演 task snapshot门面。
- 实施任务：保存 delegationId、目标引用、内容 baseRevision、授权、保护、完成标准、sourceRoute、模型策略引用；idempotencyKey绑定请求摘要；定义旧任务无快照读取兼容。
- AC：①相同请求与幂等键只创建一次；②同键不同正文返回冲突；③无归属权限或失效对象零创建；④运行快照不跟随全局偏好变更；⑤来源路由与正确任务 lane持久化，旧任务标未保存合同而非补造授权。
- 测试隔离/安全：mock/隔离 SQLite测事务、重放、跨作品、旧任务；schema兼容不在作者库试错。
- 非范围：自然语言理解、预算执法、角色或规划修改。
- 交付证据：事务与重放报告、快照响应例、迁移兼容报告、旧任务策略。

### S5-03 来源命令的范围与保护门禁（5 点）

- 用户价值：AI 仅修改作者允许的对象，不能偷偷扩展工作范围。
- 状态/前置：待解锁；S5-01、02；S3/S4世界写入保护合同可用。
- Owner/模块：Runtime Agent；collaboration application command facade及既有 `director/commands/DirectorCommandService.ts`、`chapterEditor/NovelChapterEditorService.ts`适配。跨模块内部能力通过门面消费。
- 实施任务：命令执行前校验授权、范围、revision、作者锁定和发布状态；产生待决定结果；分离查询与写命令；映射拒绝错误至来源现场。
- AC：①越范围、越权、过期或保护冲突零内容写；②同委托合法局改可执行；③简易普通 API仍只读；④拒绝提案不改变事实/规划；⑤命令要求重新授权时不自动重新生成扩大范围，不清除既有人工暂停。
- 测试隔离/安全：mock executor执行计数与隔离事务；跨作品、锁稿、已发布、重放全覆盖。
- 非范围：自动解除锁定、为解决失败新增字符串路由、以运行记录按钮恢复。
- 交付证据：允许/拒绝矩阵、执行计数、稳定来源与错误投影示例。

### S5-04 提交时解析并冻结模型策略（3 点）

- 用户价值：作者知道本次按任务分工还是指定模型，之后执行使用同一选择依据。
- 状态/前置：待解锁；S2-04、S5-02；根集成人冻结模型来源共享类型。
- Owner/模块：平台 Agent；`server/src/llm/factory.ts`、`modelRouter.ts`与collaboration模型策略适配门面，同一个平台owner。
- 实施任务：枚举 route-based与explicit两种策略；启动解析有效厂商、模型、协议、参数及覆盖来源，保存策略快照；定义动态任务类型后续解析所用的路由配置版本。
- AC：①显式指定只影响本次委托，不覆写顶部/路由；②任务分工保存对应有效路由版本；③参数经过能力兼容层并显示有效值；④缺失/不可用模型明确拒绝或待决定，不静默换厂商；⑤前端预览与正式运行实际结果分开展示。
- 测试隔离/安全：mock secret store/route读取，无模型调用；复用modelRouter/llmRequestCapabilities测试。
- 非范围：自动测模型排名、开启备用、改变既有任务默认策略。
- 交付证据：策略优先级矩阵、快照例、有效参数和来源行为测试。

### S5-05 模型策略恢复、重试与现场选择（5 点）

- 用户价值：作者可在提交前选择模型策略，恢复时不用重新配置模型，也能知道备用切换发生了什么。
- 状态/前置：待解锁；S5-04；来源现场能展示和恢复同一任务。
- Owner/模块：平台 Agent负责策略/恢复adapter；UI Agent在冻结合同后消费作品工作台与 `client/src/components/common/LLMSelector.tsx`。shared/API由根接线，不并发抢改。
- 实施任务：恢复与每次重试从任务快照解析；持久化primary/fallback来源；选择控件显示本次覆盖；失效凭证时等待重新准备/明确决策，不重算模型默认。
- AC：①运行中改全局路由后重试仍用原策略；②进程重启恢复保持模型和已确认参数；③备用只在原授权配置中切换且实际结果标fallback；④凭证失效不泄露秘密、不自动换模型；⑤取消提交不保存本次覆盖为全局默认。
- 测试隔离/安全：mock transport与task store模拟重启、fallback和失效；client typecheck，用户验收选择/刷新。
- 非范围：凭证永久复制到快照、保证历史模型服务永久可用、整任务预算。
- 交付证据：启动/重试/恢复一致性报告、来源UI、未实测服务风险。

### S5-06 来源现场的 AI 意图与修改提案合同（5 点）

- 用户价值：一句模糊反馈能形成可理解的修改目标和提案，作者不用学习模块顺序。
- 状态/前置：待解锁；S5-01～03、S3-06；S2-01总控责任拆分完成。
- Owner/模块：Prompt Agent；复用 `server/src/prompting/prompts/novel/chapterEditor/userIntent.*`，拟建collaboration prompt family及结构化schema；Runtime通过collaboration facade承接。Registry/catalog由根接线。
- 实施任务：结构化输出intent、目标实体、范围、保留要求、未知与需决定事项、提案类型；上下文由resolver组装；非法引用或AI失败显示未完成；支持readonly preview。
- AC：①“太平淡”能输出引用具体片段的提案而不立即写；②无法定位或多个目标时返回澄清/候选；③事实、人物认知、计划、试演与作者留白分开；④AI失败不由关键词匹配补路由；⑤Prompt可在目录、预览及受控测试查看版本和required context。
- 测试隔离/安全：mock结构化输出、schema/postValidate、上下文保护和非法目标；不发真实模型。
- 非范围：新增全局可执行聊天、自动写事实、覆盖全部人物/规划工具。
- 交付证据：schema/Prompt目录证据、正负样例、失败与澄清投影。

### S5-07 委托审阅与待决定事项现场呈现（3 点）

- 用户价值：作者能确认本次目标、保留项和关键选择，随时看到成果与下一步。
- 状态/前置：待解锁；S5-02、03、05、06；UI不先发布mock写按钮。
- Owner/模块：UI Agent；S2拆出的novels/workspace presentation及资产来源workbench，复用diff/结果组件；不向全局中枢或运行记录加操作。
- 实施任务：委托摘要、一个推荐动作、保护要求、提案只读预览和待决定项；正文优先，辅助区收起不丢状态；提交反馈绑定任务。
- AC：①提交展示对象/范围/模型策略；②未确认的重大方向不自动写；③刷新回同委托/结果并能读已保存稿；④关闭面板不丢草稿/选择；⑤只读全局入口导航后携带要求至正确来源现场，查询不变任务状态。
- 测试隔离/安全：view model及来源route行为、client typecheck；UI由作者验收。
- 非范围：所有页面重绘、多个同级推荐主动作、未获门禁的简易写入。
- 交付证据：Loading/Error/待决定/已交付反馈例、用户验收缺口、端到端API接线证据。

### S5-08 模型能力评测集与四类任务回归（5 点）

- 用户价值：作者能根据创作任务了解模型能力证据，而不仅看到模型名或厂商标签。
- 状态/前置：待解锁；S2-04、S5-04；现有模型能力档案/受控Prompt测试接口核验。评测标准和baseline在卡内冻结，实际质量未知不阻塞基础创作。
- Owner/模块：平台评测 Agent；拟建 `server/src/platform/llm/evaluation/{domain,application,infrastructure}/`与owned测试fixtures；复用`server/src/llm/{capabilities,structuredOutput}.ts`门面。评测PromptAsset拟建于 `server/src/prompting/prompts/evaluation/`，Registry/catalog由根接线。
- 实施任务：为structured、craft、long-context、repair各建立固定输入/预期约束与负样本；记录模型/配置/Prompt版本、协议、延迟、usage与失败类别；机械校验与AI语义/作者评价分开，mock只证明评测流程和运行合同。
- AC：①structured覆盖schema合法、截断、空正文、思考干扰；②craft覆盖人物意图、情节保留、风格要求和刻意留白，不用关键词分数代替文学评价；③long-context覆盖远距离事实/绑定范围/required context遗漏；④repair覆盖局改保留、反复修复、剩余问题及degraded政策；⑤同fixture/版本可重放、mock结果明确非真实模型质量；⑥语义评审Prompt结构化输出且纳管，不内联新业务Prompt。
- 测试隔离/安全：mock transport/structured evaluator与隔离虚构样本；不调用真实模型，不上传作者稿，API密钥不进入报告。
- 非范围：模型名称硬编码排名、真实品质保证、自动改任务路由、要求作者先付费测完所有模型。
- 交付证据：四类fixture、baseline与准则、运行/语义分层报告、配置指纹/版本、mock回归及缺失证据说明。

### S5-09 可选真实模型任务抽样与证据版本（3 点）

- 用户价值：作者可花明确额度检验自己已配置模型在哪类任务更适合，并保留可复用的结果。
- 状态/前置：待解锁（可选实测）；S5-08、S1显式检测合同；若接整任务预算需S6-03。未完成S6时仅采用受控测试的有限样本/最大调用合同，不以此宣传总预算能力。
- Owner/模块：平台评测 Agent；evaluation runner/owned store与Prompt受控测试facade，设置页评测视图由UI owner在root冻结API后消费。
- 实施任务：用户选择模型、任务样本、重复次数和最大调用额度；展示可能费用与unknown，不自动运行；按四任务保存有效样本数/分布/失败及人工或AI评审来源；诊断健康与任务质量分开。
- AC：①打开评测页零请求，明确开始才抽样且不超过选定调用数；②只测用户选择模型和虚构样本；③缺usage/样本不足显示unknown/不足，不输出准确费用或泛化结论；④协议/模型/Prompt版本变化后旧证据标不同版本，不能冒充当前质量；⑤停止后零新请求，在途结果仍可保存脱敏证据；⑥不实测也能继续使用现有创作/模型设置，未实测写明。
- 测试隔离/安全：mock额度/取消/迟到结果/版本；真实调用仅明确选择后进行，缺凭证不自动换模型，无用户库写稿。
- 非范围：公共排行榜、扫全部厂商、设置打开隐性付费、按市场热度选模型。
- 交付证据：授权样本/模型/调用范围、四类真实或未测报告、证据版本与有效样本数、费用unknown说明。

### S5-10 有证据的任务预设与明确采用（3 点）

- 用户价值：作者可以采用适合当前任务的模型分工建议，理解推荐理由，并保留自定义选择。
- 状态/前置：待解锁；S5-08、S5-04/05；有适用实测证据才生成实测推荐，无证据时保持自定义/未知，不强制完成S5-09付费抽样。
- Owner/模块：平台评测 Agent负责evaluation recommendation policy；UI Agent负责设置模型路由预设视图；正式路由保存与expectedFingerprint由root接线。
- 实施任务：按任务约束、有效能力证据、延迟/usage和用户偏好形成结构化推荐；展示证据版本、样本边界与取舍；预设只是待采用提案，应用明确任务列表，保存前验证配置指纹。
- AC：①同名模型不同地址/协议/版本不共享未经验证能力；②无实测或不足样本不宣称“最优”，可继续自定义；③预设推荐不自动换顶部模型/任务快照/路由；④作者仅选择任务仅改对应路由，过期建议409零写；⑤structured/craft/long-context/repair分别解释依据，不能只以连接成功替代；⑥复核建议由AI结构化理解或已结构化证据的确定性后处理产生，不关键词匹配任务。
- 测试隔离/安全：mock测评证据和推荐输出，过期CAS/选择保存行为，client typecheck；真实品质未知明确记载。
- 非范围：厂商默认名硬编码切换、替作者开启备用或RAG、改运行中委托、强制购买评测。
- 交付证据：四类任务推荐/unknown样例、依据manifest、明确采用与过期拒绝测试、作者UI验收缺口。

## Sprint 6：整任务预算、保存暂停与恢复

Goal：作者可委托持续工作，所有生成、修复与重试都计入同一账本；暂停和恢复保留稿件与累计。候选 26 点：窗口 6 为 S6-01～03（13 点），6A 为 S6-04～06（13 点）。额度合同未冻结前不承诺人民币硬预算。

### S6-01 总预算与调用生命周期 Spike（3 点）

- 用户价值：作者给出的工作额度能约束真实内部调用，而不仅是一条模型请求。
- 状态/前置：Spike；S5-02、04；只读审计调用链、usage、worker恢复与quality-loop账本。
- Owner/模块：根集成人；`server/src/llm/{structuredInvoke,requestBudget,usageTracking}.ts`、`server/src/prompting/` runner、`director/runtime/DirectorQualityLoopBudgetLedgerService.ts`。拟建平台budget模块 `server/src/platform/llm/budget/{domain,application,infrastructure}/`，不复制章节质量账本职责。
- 实施任务：定义taskBudget、attemptId、父子调用、原子预留、结算/释放、unknown usage、取消、超时、进程崩溃与多worker；决定哪些额度可硬限制，估算与实际分开。
- AC：①列出文本/结构化策略/JSONrepair/semantic retry/transport retry/fallback/embedding参与规则；②并发预留不突破总额度；③usage缺失不按0或任意释放；④超时/崩溃/迟到结果能追账且不重复扣；⑤预算暂停与质量人工暂停有独立原因和恢复条件。
- 测试隔离/安全：状态机与mock竞态样例评审，不发模型，不读费用密钥。
- 非范围：实施计费、准确跨厂商价格、盲目调高retry。
- 交付证据：调用状态图、账本不变量、unknown策略、计数矩阵、生产卡解锁清单。

### S6-02 持久化账本与原子并发预留（5 点）

- 用户价值：多个 Agent 内部并行工作时仍遵守作者给出的整体额度。
- 状态/前置：待解锁；S6-01，root冻结schema/迁移及快照预算字段。
- Owner/模块：平台预算 Agent；拟建budget domain/application/infrastructure及公开facade。
- 实施任务：按委托绑定账本；唯一attemptId；事务预留最大请求额度、结算actual/estimated/unknown；限制与余额读取；租约恢复reconciliation。
- AC：①两个并发调用竞争最后额度仅允许合法预留；②重复attempt不多扣或多释放；③unknown usage保留保守占用与状态；④重启余额不清零；⑤非法任务归属与负/坏额度被确定性校验拒绝，所有预算变化有事件证据。
- 测试隔离/安全：隔离SQLite并发事务及PG隔离验证；模拟crash/迟到结算，不操作作者库。
- 非范围：模型调用适配、预算UI、把估计称为实际usage。
- 交付证据：并发/重放/重启报告、账本样例、跨平台兼容与局限。

### S6-03 所有调用共享计数与预留（5 点）

- 用户价值：修复、重试、备用不会变成隐藏的无限生成。
- 状态/前置：待解锁；S6-02、S5-05；完整调用矩阵冻结。
- Owner/模块：平台调用 Agent；`server/src/llm/structuredInvoke.ts`、`structuredInvokeRepair.ts`、factory/usageTracking与Prompt runner owned执行adapter。同文件由单owner；经budget facade预留。
- 实施任务：请求前登记父子attempt并预留；SDK retries维持0；把策略再试、repair、semantic、transport、fallback各自计数；绑定signal与任务snapshot；未纳入的调用禁止声称总预算已覆盖。
- AC：①主请求+两次repair+fallback计数逐项可证；②嵌套retry不会绕过余额；③额度不足时零后续transport调用；④失败、超时与取消也结算或unknown，不重复记；⑤备用不能越过授权模型策略或原委托范围。
- 测试隔离/安全：mock transport计数与usage矩阵；复用llmFactoryRetryPolicy/llmRequestBudget/llmUsageTracking。
- 非范围：自动降低作品质量换额度、AI理解失败用固定路由兜底、调整作者模型。
- 交付证据：矩阵覆盖报告、调用树及ledger事件、未接入路径清单且入口受限。

### S6-04 预算不足的保存边界暂停（5 点）

- 用户价值：额度不足时读到已完成内容，并知道剩余工作和可继续的位置。
- 状态/前置：待解锁；S6-03及既有生产完成/质量策略合同。
- Owner/模块：Runtime Agent；`server/src/services/novel/production/completion/`、director runtime/state/recovery门面；来源命令由root接线。
- 实施任务：预算不足落独立reason并保存checkpoint；不覆盖usable draft；正在保存的事务按完成边界结束；投影剩余章/待复核任务；恢复动作只在来源现场。
- AC：①已保存正文不被预算异常删除/遮挡；②保存成功后不足只暂停下一工作；③completion-first局部债按原策略保留且不中断伪装失败；④quality-first人工暂停仍需原明确恢复，不因追加额度解除；⑤无可用内容的失败与有稿待续区别显示。
- 测试隔离/安全：mock预算错误、完成事务与checkpoint；复用chapterProductionCompletionPolicy/directorIssueGovernance。
- 非范围：自动购买额度、无条件degraded覆盖质量优先政策、运行记录继续按钮。
- 交付证据：边界状态/来源恢复样例、可读稿保护和质量策略测试。

### S6-05 取消、租约与同任务累计恢复（5 点）

- 用户价值：中断后继续同一任务，既不重复改稿，也不重新获得一份隐藏预算。
- 状态/前置：待解锁；S6-02～04；运行承接/租约合同已证明。
- Owner/模块：Runtime恢复 Agent；director commands/leases、runtime recovery及budget reconciliation facade，同一恢复owner串行。
- 实施任务：保留累计、完成artifact、pending attempt；重启reconcile而非重置；取消禁止新调用、发送abort；迟到usage只记账不重复内容写；避免旧worker续写。
- AC：①重启沿原ledger和快照恢复；②取消确认后零新请求，已送出的远端请求标可能在途；③旧worker/迟到结果不能重复提交；④未知请求完成情况不会直接重发或释放全部预算；⑤恢复需明确命令且保留quality-first等待状态。
- 测试隔离/安全：fake clock/worker/transport模拟取消竞态、两租约、重启和迟到usage；不依赖真实服务abort保证。
- 非范围：保证远端已经开始的请求免费终止、新建导演任务掩盖恢复、完整撤回。
- 交付证据：故障时序与重复调用数、lease/ledger一致性、在途限制说明。

### S6-06 任务使用与剩余目标现场投影（3 点）

- 用户价值：作者知道已经交付多少、消耗多少、还剩什么，不需要阅读日志。
- 状态/前置：待解锁；S6-02、04、05。
- Owner/模块：UI Agent；作品workbench/task source view model，复用 `directorUsageTelemetryProjection`门面；运行记录仅镜像只读摘要。
- 实施任务：显示actual/estimated/unknown Token、调用与剩余章/验证项；额度暂停下一动作；追加授权从来源命令执行并留事件；无价格时不展示虚假精确金额。
- AC：①unknown不显示为0实际消耗；②预算和质量暂停分别说明；③刷新累计一致且可读已交付正文；④追加额度不改已确认范围/模型策略；⑤运行记录查看/导航不变状态，不提供额度或恢复写按钮。
- 测试隔离/安全：view model与mock API状态测试、client typecheck；用户验收实际反馈。
- 非范围：跨厂商准确货币结算、展示每个内部JSONrepair细节、自动追加额度。
- 交付证据：预算各状态样例、snapshot投影一致性、UI验收记录/缺口。

## Sprint 7：创作记忆、资产适配与现场修改

Goal：资产支持具体作品，作者一句要求可在原现场获得受保护的改稿；记忆与同步有来源和版本。候选 52 点，分四个顺序验收窗口：7 为 S7-01～04（16 点），7A 为 S7-05a/05b/05（12 点），7B 为 S7-06a/06b/06（12 点），7C 为 S7-07a/07b/07（12 点）。各对象独立完成Spike、版本安全和局改，不把前置缺口藏进“推广”。

### S7-01 本书事实与资料可用性读取（3 点）

- 用户价值：作者清楚 AI 依据哪些世界、人物、章节事实和资料创作。
- 状态/前置：待解锁；S1-02、S3-03、S3-06；当前Context Broker resolver清单审计。
- Owner/模块：记忆 Agent；`server/src/services/novel/worldContext/WorldContextGateway.ts`、`runtime/GenerationContextAssembler.ts`与owned Context resolver；knowledge/settings facade。UI在workbench消费root冻结API。
- 实施任务：读取内部事实与外部绑定文档/激活版本；index可用性、最近诊断与本次context选中/丢弃理由分开；required缺失可解释。
- AC：①RAG关闭仍展示本书内部世界/角色上下文；②不把全局资料混成明确绑定；③显示来源版本/引用范围；④GET零模型/embedding/索引任务；⑤未知连接不承诺可召回，required context失败不静默隐藏。
- 测试隔离/安全：mock resolver/persistence及ownerTypes/doc绑定矩阵；不读用户资料全文输出日志。
- 非范围：自动启用RAG、全库搜入不相关作品、生成新事实。
- 交付证据：来源manifest、被选/丢弃示例、scope与零副作用测试。

### S7-02 显式按作品范围准备记忆与恢复（5 点）

- 用户价值：作者可把选定资料准备给本书，失败时有一个明确恢复动作。
- 状态/前置：待解锁；S7-01、S6-03；S1诊断/显式检测合同可用。
- Owner/模块：记忆 Agent；`server/src/services/rag/`和knowledge公开门面，settings runtime；source workbench准备视图。
- 实施任务：依次读取准备计划、显式能力检查、用户启用/选择范围、排队对应激活版本；索引幂等与失败恢复；embedding额度按S6矩阵独立子预算或同委托计入。
- AC：①打开页面不准备/检测；②用户选择的作品/文档范围外零排队；③RAG关闭保留idle且启用动作明确；④重复请求不重复index，旧版本完成不冒充当前可用；⑤失败保留资料和结果，来源恢复不全库重建或自动换模型。
- 测试隔离/安全：mock embedding/index worker与隔离jobs；复用ragJobListing/ragCompatibilityBootstrap。
- 非范围：优化召回算法、自动重建全部资料、知识资料反向写入正史。
- 交付证据：准备计划、排队范围与幂等报告、失败恢复证据、授权调用限额。

### S7-03 资产引用版本与本书适配提案（5 点）

- 用户价值：作者可复用世界/写法等资产，并理解本书采用了什么、做了哪些适配。
- 状态/前置：待解锁；S3-03、S4世界闭环、S5委托门禁；资产类型能力清单冻结。
- Owner/模块：资产 Runtime Agent；`server/src/services/novel/worldContext/{NovelWorldInstanceService,NovelWorldLibrarySaveService}.ts`公开门面；拟建 `server/src/modules/novel/collaboration/assets/` owned policy/adapter。V1适配仅世界样本和写法资产。
- 实施任务：保存assetId/sourceVersion、本书副本revision、adaptationDecision和用途；AI形成适配proposal不直接污染源资产；世界形成副本，写法保存本书引用/偏好适配记录，既有写法资产版本门面不足时本卡先交付所需记录，不承诺共享写法反向同步。
- AC：①同资产用于两本书形成独立适配且剧情不串；②提案保留源版本和保留要求；③未采用不改资产或本书事实；④旧来源版本可读且历史任务不重算；⑤不支持类型返回明确只读能力，不伪装可同步。
- 测试隔离/安全：mock source/version与隔离本书副本，mock结构化提案；worldGateway/sync聚焦回归。
- 非范围：角色、视觉、题材基底、推进模式、参考作品和知识资料的适配/同步；资产原型等于角色当前事实；自动沉淀每个章节事件。上述类型保持现有能力，不计入本卡Done。
- 交付证据：类型能力矩阵、引用manifest、适配差异与隔离测试。

### S7-04 选择性同步、沉淀与发布保护（3 点）

- 用户价值：作者可选择复用哪些新成果，素材更新不破坏正在连载的书。
- 状态/前置：待解锁；S7-03；两侧revision/CAS与S3同步合同可用。V1同步仅世界样本与本书世界；写法仅引用/本书偏好，不开放反向同步。
- Owner/模块：资产 Runtime Agent；`NovelWorldSyncService.ts`、`NovelWorldLibrarySaveService.ts`门面及资产来源UI，同一sync owner。
- 实施任务：push/pull分别显示方向、字段范围、两侧baseVersion；更新先提案；发布稿与作者保护阻断自动覆盖；沉淀决定可追溯。
- AC：①更新样本不自动改关联小说；②作者只选字段仅改选中范围；③任一侧版本失效返回冲突零写；④已发布稿和保护事实不自动覆盖；⑤同步失败不推进syncBaseVersion、不将旧报告冒充当前成功。
- 测试隔离/安全：隔离双侧CAS、两书引用、失败事务，UI由作者验收。
- 非范围：写法与其他资产类型的push/pull、双向无冲突自动合并、整书正文随资产同步改写、删除历史版本。
- 交付证据：方向/选择示例、版本冲突与发布保护报告、来源记录。

### S7-05a 正文修订版本、选区和发布保护 Spike（2 点）

- 用户价值：作者审阅的改稿只应用于当时的正文与选区，新编辑不会被旧候选覆盖。
- 状态/前置：Spike；S5委托门禁、S6调用预算、现有chapterEditor生产/保存入口审计。
- Owner/模块：根集成人与正文Runtime owner只读审计；`server/src/services/novel/chapterEditor/`、production completion及Chapter版本/发布状态持久化。
- 实施任务：核实正文revision与hash、选区锚点、候选base、所有正文写入入口、发布/作者保护；冻结同章并发与partial apply的原子合同和旧客户端策略。
- AC：①列出手动保存、生成保存、候选采用三类写入口；②同revision竞争仅一方成功策略明确；③选区漂移不靠错误偏移覆盖文本；④锁定/发布/外部新编辑拒绝错误与来源反馈明确；⑤旧客户端处理方案不隐式重建正文。
- 测试隔离/安全：mock正文/选区例与隔离版本读取，不修改作者库或发布状态。
- 非范围：生产实现、正文批量重写、开放简易手动写权限。
- 交付证据：入口矩阵、候选/partial apply API样例、原子事务及缺失能力记录。

### S7-05b 正文修订的原子版本与幂等提交（5 点）

- 用户价值：采用改稿不会覆盖作者新写的内容，双击或重启不会重复替换。
- 状态/前置：待解锁；S7-05a冻结、root增量schema/共享API接线。
- Owner/模块：正文Runtime Agent；chapterEditor提交门面、正文持久化adapter、production completion写适配；root改schema与HTTP挂载。
- 实施任务：所有相关写入口递增revision；candidate携带baseRevision/文本锚点；事务CAS、局部选择、operationId与before/after证据；旧客户端按冻结策略兼容。
- AC：①同base并发仅一方提交；②幂等键同请求仅一次、异请求冲突；③选区漂移/保护/发布/越权零正文写；④生成/手动新保存使旧候选过期；⑤partial apply精确只改所选且保留外部新稿，失败事务不改revision。
- 测试隔离/安全：隔离SQLite事务/竞态、mock候选；无作者库写入，PG隔离兼容。
- 非范围：生成文学内容、UI先开放采用、把hash当完整历史撤回。
- 交付证据：CAS/幂等/选区报告、写入口revision矩阵、历史证据与兼容结果。

### S7-05 正文口述反馈形成局改并验证（5 点）

- 用户价值：“这段紧张一点，别改变他的决定”能在原章节得到可读改稿。
- 状态/前置：待解锁；S5-03、06、07，S6-03，S7-05b；正文版本安全建设不再隐含于本卡。
- Owner/模块：正文 Runtime Agent；`server/src/services/novel/chapterEditor/{ChapterEditorWorkspaceService,NovelChapterEditorService}.ts`与对应PromptAsset；UI复用chapterEditor差异/候选工作台。
- 实施任务：对具体章节/选区形成候选，审阅部分采用；提交校验baseRevision/保护/范围；复核人物与规划影响；失败保留已保存稿和待验证状态。
- AC：①模糊反馈通过AI定位片段并提供推荐，不关键词选工具；②“保留决定”进入required context；③过期、锁定、越范围零写；④部分采用仅改指定文本且重复提交幂等；⑤复核失败不撤掉已保存可用稿，刷新回同结果。
- 测试隔离/安全：mock candidate/validation与隔离CAS；复用chapterEditorPreview/chapterPatchRepair；UI作者验收。
- 非范围：全书自动重写、简易手动编辑门禁放开、将风格偏好覆盖情节。
- 交付证据：反馈→候选→采用→复核链、diff/CAS报告、保留要求验证。

### S7-06a 人物事实、认知与计划写入边界 Spike（2 点）

- 用户价值：调整人物不会把原型、认知或未来计划误写成已发生事实。
- 状态/前置：Spike；S3-06、S5委托；人物当前profile/mind/preparation/state及资产来源审计。
- Owner/模块：根集成人与人物Runtime owner；只读 `server/src/services/novel/{novelCoreCharacterService.ts,characterProfile/,characterMind/,characterPrep/}`、state门面及`server/src/modules/novel/characters/`。
- 实施任务：明确当前本书角色事实source、各可修改字段与revision、人物认知/计划独立记录、对话人格保护、资产原型隔离；冻结有限采用仅人物合同/未执行计划的事务与引用。
- AC：①事实/认知/计划三类写路径与source明确；②人物资产与本书实例不混写；③动机重大变化要作者决定；④发布事实/锁定字段与旧revision拒绝条件明确；⑤调整对话人格或后续准备的失效规则有实例。
- 测试隔离/安全：mock人物与隔离source读取，不对已有角色批量回填或改稿。
- 非范围：生产写入、对话人格全重构、将试演入正史。
- 交付证据：人物source/字段矩阵、revision和API样例、认知/计划依赖图。

### S7-06b 人物合同的版本安全提交与计划隔离（5 点）

- 用户价值：作者确认的人物调整只应用一次，并保留事实与未来方案的区别。
- 状态/前置：待解锁；S7-06a、S5-03；root冻结schema与人物revision共享合同。
- Owner/模块：人物Runtime Agent；人物public mutation facade及拟建collaboration `characters/` owned提交adapter；state/人物profile经门面调用。
- 实施任务：新增/复用本书人物content revision；同步相关写入口；角色事实、认知、计划分别落对应记录；事务CAS、operationId、保护及来源证据。
- AC：①同人物同base竞争只一方成功；②重复采用不多改事实或追加计划；③资产原型和别书角色零写；④锁定/发布/过期/越权拒绝且revision不变；⑤认知/计划不覆盖世界真相，generation context读取已采用版本。
- 测试隔离/安全：隔离事务与mockcontext；覆盖来源、跨书、幂等、回滚；不写作者人物库。
- 非范围：文学方案生成、自动改已写正文、人物动态状态全表迁移。
- 交付证据：字段source/CAS/隔离报告、context选定版本证据、旧数据兼容结果。

### S7-06 人物调整的影响提案与有限采用（5 点）

- 用户价值：“主角太被动”能获得人物和场景调整方案，作者决定改变到哪里。
- 状态/前置：待解锁；S7-05、S5-06、S3-06、S7-06b。仅接已冻结的人物合同/未执行计划，其他变化只读提案。
- Owner/模块：人物 Runtime Agent；现有角色公开服务、`server/src/modules/novel/characters/`及chapterEditor门面；人物PromptAsset由Prompt owner/root登记。
- 实施任务：AI解释偏离证据，区分人物本性/认知/计划；列影响章与候选；有限修改人物当前合同或未执行场景计划；已写正文另走S7-05提案，不级联自动改。
- AC：①引用具体人物/章节证据；②世界真相未定时人物误解保留；③改变动机等重要方向需作者决定；④锁定/发布/过期人物revision零写；⑤采用后后文影响有待处理列表，人物事实与计划不混写。
- 测试隔离/安全：mock结构化影响/非法引用和隔离人物提交；角色事实/认知上下文回归。
- 非范围：自动复活/杀人、人物资产原型改动自动传播、已发布章节自动重写。
- 交付证据：人物前后合同、影响列表、边界保护与验证报告。

### S7-07a 规划版本、兑现窗口与导演边界 Spike（2 点）

- 用户价值：调整节奏时能保留已写章与伏笔，知道改动何时开始生效。
- 状态/前置：Spike；S5授权、S6恢复；现有卷计划、章合同、JIT、导演lease及source command审计。
- Owner/模块：根集成人与规划Runtime owner只读审计；`server/src/services/novel/volume/{NovelVolumeService,VolumeChapterSyncService,ChapterExecutionContractService}.ts`及director commands/runtime门面。
- 实施任务：盘点计划sourceVersion、章顺序与未执行边界、兑现窗口、当前worker持有版本；决定暂停/保存边界采用和旧章合同失效；冻结范围revision与幂等。
- AC：①已有稿/执行中/未执行三类章处理明确；②新计划不能被旧worker提交覆盖；③秘密/兑现窗口变化需结构化影响与作者决定；④邻章停止只有明确replan规则；⑤quality-first暂停/预算恢复不被计划采用清除。
- 测试隔离/安全：mock worker/plan/lease与隔离源读取，禁止停止用户运行任务或改现有计划。
- 非范围：自动重建全书、规划生产代码、局部质量债升级全局replan。
- 交付证据：保存边界图、计划/章合同版本矩阵、冲突/恢复API例。

### S7-07b 未执行规划的版本与租约安全提交（5 点）

- 用户价值：作者采用的调整在明确章边界生效，不和后台生产竞争覆盖。
- 状态/前置：待解锁；S7-07a、S5-03、S6-05；root冻结schema、lease和source API合同。
- Owner/模块：规划Runtime Agent；volume公开写门面、director commands/lease与拟建collaboration `planning/` owned事务adapter。
- 实施任务：计划revision递增、未执行章range CAS、锁定保存边界；同步章合同失效标记；operationId重放；旧worker版本fencing；已写稿不写。
- AC：①只改授权未执行范围；②同base竞争一方成功且事务失败全不写；③旧worker/lease或正在写章冲突零采用；④重复请求不重复重排/失效章合同；⑤保存后恢复读新计划并保留原稿、人工暂停与预算累计。
- 测试隔离/安全：隔离plan事务、mock lease/worker并发、crash恢复；不操作用户导演任务。
- 非范围：文学节奏生成、已发布章改写、把新计划当全书质量已通过。
- 交付证据：范围/CAS/fencing报告、plan与contract版本记录、保存/恢复证据。

### S7-07 卷章规划调整的范围审阅与边界提交（5 点）

- 用户价值：“中段太拖，提前一次兑现”能看见节奏调整及要保留的伏笔，不必自己改表格。
- 状态/前置：待解锁；S7-06、S5-03、S6恢复、S7-07b。规划revision与lease建设由前两张明确卡交付，不允许UI替代合同。
- Owner/模块：规划 Runtime Agent；`server/src/services/novel/volume/`、director commands/recovery与既有planner门面；不直接深调内部worker。
- 实施任务：结构化调整proposal列范围、章顺序/兑现窗口、保护成果和影响；执行前校验任务在保存边界，变化落新计划版本；已写章单独提出修订；恢复不重复重排。
- AC：①至少两种可比较方案与推荐依据；②只改授权未执行范围，已保存稿保留；③秘密与卷尾兑现仍有明确窗口或待决定冲突；④旧worker/过期规划提交零写；⑤局部质量债不变全局replan，只有结构化明确replan才停止邻章。
- 测试隔离/安全：mock planner/task/lease和隔离plan版本；directorManualEditImpact/issueGovernance/生产范围回归。
- 非范围：重建全书计划、取消已发布事实、绕过quality-first人工暂停。
- 交付证据：方案差异、计划版本/边界事务、恢复与兑现窗口测试。

## Sprint 8：有限撤回、导航过渡与长链验收

Goal：作者能理解和恢复真实可撤回范围，创作/资产两区职责清晰，新入口完成真实长链验证。候选 27 点：窗口 8为S8-01～03（13点），8A为S8-04～07（14点）。撤回Spike可能否决某些范围，否决时明确不开放入口，而非降低一致性要求。

### S8-01 撤回与下游依赖能力 Spike（3 点）

- 用户价值：作者知道能撤回哪次修改、会影响什么，系统不承诺做不到的“全部恢复”。
- 状态/前置：Spike；S3/S4版本证据、S5委托、S7修改链完成。
- Owner/模块：根集成人；只读 `worldSnapshotService.ts`、`novelCoreSnapshotService.ts`、worldContext与state/plan/artifact门面。拟建 collaboration `reversal/{domain,application,infrastructure}/`。
- 实施任务：盘点正文/世界/人物/规划/决定/索引依赖和版本覆盖；界定单事务回退、下游标失效、补偿修复三种能力；给冲突/发布/并发/未覆盖对象的拒绝合同。
- AC：①列每种对象的实际before/after证据及缺口；②证明可支持范围及不可回退依赖，不拿旧快照覆盖整书；③公开稿/新编辑/未覆盖对象不承诺恢复；④两本书共用资产回退互不自动改；⑤运行任务暂停边界与回退审阅明确。
- 测试隔离/安全：隔离样本快照检查/mock依赖；不对作者库恢复旧数据，不执行删除。
- 非范围：生产代码、全系统撤回按钮、自动回退未来章节。
- 交付证据：依赖覆盖表、反向补偿状态图、可开放范围/拒绝例、生产卡解锁记录。

### S8-02 版本安全的有限修改回退（5 点）

- 用户价值：作者能撤回一项尚未被新工作覆盖的局部修改。
- 状态/前置：待解锁；S8-01仅解锁被证明的世界局改与正文局改类型，其他不支持。
- Owner/模块：Runtime回退 Agent；拟建reversal facade，经world/chapter公开写入门面事务提交；root管理增量schema/API。
- 实施任务：生成回退preview，保存target operationId与当前版本；反向操作产生新revision，不改写历史；幂等、归属、锁定、发布、依赖保护；不删旧证据。
- AC：①回退前审阅具体范围及影响；②当前revision不符返回409零写；③重复回退只创建一次新revision；④跨作品/已发布/保护冲突拒绝；⑤历史版本/操作与回退关系可追溯，索引仅标需更新不假装已回滚。
- 测试隔离/安全：隔离事务、重放、双窗口与历史保留测试；任何真实恢复先授权和验证备份。
- 非范围：删除版本、数据库reset、人物/规划未证明范围、静默回退他书。
- 交付证据：before/after/new revision、拒绝与幂等报告、真实可用类型列表。

### S8-03 回退后的依赖失效与补偿恢复（5 点）

- 用户价值：作者看到回退造成的后文影响，能决定重新复核或修订，而不是读到混乱正文。
- 状态/前置：待解锁；S8-01、02；依赖引用和来源恢复门面可用。
- Owner/模块：Runtime回退 Agent；reversal application及state/plan/context/index公开adapter；来源UI消费依赖manifest。
- 实施任务：由真实引用依赖标记stale/待复核；AI分析创作影响并提案；分离内容回退、复核、索引重建；checkpoint恢复只续未完成补偿。
- AC：①未覆盖依赖明确标unknown且不能声称全书一致；②已写稿保留可读不自动改；③失效范围仅真实关联对象，不扩到所有书；④补偿失败保留回退成果/历史并可续复核，不重复回退；⑤quality-first暂停与预算累计不被补偿清除。
- 测试隔离/安全：mock依赖与AI影响、隔离stale标记；crash/重复恢复与unknown链覆盖。
- 非范围：AI猜测依赖当确定事实、自动重写整书、将索引失败作为已保存回退失败。
- 交付证据：依赖manifest、unknown说明、补偿恢复报告与保护结果。

### S8-04 创作与资产两区的情境入口（3 点）

- 用户价值：作者进入作品继续写，进入资产积累资源，按当前目标找到所需能力。
- 状态/前置：待解锁；S2工作现场、S7对应功能已联通；未联通能力保留旧入口。
- Owner/模块：UI导航 Agent；`client/src/components/layout/{Sidebar,NovelWorkspaceRail}.tsx`、home和作品工作台presentation；API/types仅root改。
- 实施任务：创作展示作品/继续/待决定；资产展示复用价值/关联书/维护版本；本书资产入口直接到实例；拆书/雷达结果提供开书或收藏，不触发隐式执行。
- AC：①创作/资产两区保留且名称可理解；②继续作品回原章节成果；③本书资产与源资产明确区分；④正常首屏一个推荐动作；⑤收藏/使用动作各有结果，不以进入页触发生成或检测。
- 测试隔离/安全：route/view model行为与client typecheck；作者UI验收；不新建边框密集卡片或安装UI组件。
- 非范围：删模块能力、首章前强制建全世界、全部页面重新绘制。
- 交付证据：入口映射、实例/来源示例、旧能力保留清单、UI验收缺口。

### S8-05 深链接和只读全局入口过渡（3 点）

- 用户价值：历史链接和失败任务仍能回到正确作品现场，不迷失在新导航。
- 状态/前置：待解锁；S8-04及各功能sourceRoute合同。
- Owner/模块：UI导航 Agent；creativeHub routing、layout recovery与tasks只读view model；HTTP深链映射由root接线。
- 实施任务：旧URL参数映射/兼容；绑定要求但不执行；运行记录导航作品lane；无URL directorTaskId时仍查书级最新失败/等待恢复任务；区分workspace lane。
- AC：①旧世界/角色/章节深链接有效；②全局表达要求只导航且零写状态；③运行记录刷新/选择/打开来源不变任务；④无directorTaskId仍显示真实导演恢复入口且不用workspaceTaskId替代；⑤错书/失效目标显示解释，不路由至另一书执行。
- 测试隔离/安全：mock routing/task projection与历史URL矩阵；client typecheck，UI作者验收。
- 非范围：运行记录审批/继续/取消按钮、全局Chat直接写、删除历史任务。
- 交付证据：旧→新映射表、查询零副作用及lane恢复测试。

### S8-06 十章持续创作确定性验收（5 点）

- 用户价值：作者在连续写作、调整与故障中仍得到完整成果，并保留意图与伏笔。
- 状态/前置：待解锁；S5～7已解锁能力、S8-05；需要回退场景时S8-02/03可用。
- Owner/模块：验证 Agent；`server/tests/`中owned collaboration integration目录及隔离fixtures，复用director/production/world/context公开门面。测试子目录先确定责任，不平铺几十同级文件。
- 实施任务：建立十章mock transport/workflow fixture；中段口述调整、一次生成失败、重启恢复、预算不足、作者留白、锁稿与卷尾兑现；保存每步artifact/version/ledger/source证据。
- AC：①十章顺序完成且失败恢复不重复采用/章节保存；②中途要求变化形成新授权并保留已写稿；③秘密/认知/留白进入后续上下文且兑现窗口保留；④budget累计/取消/lease竞态正确；⑤只读中枢与运行记录零写、简易权限不越权、已发布保护不破。
- 测试隔离/安全：专用临时SQLite/mock clock/transport，PG隔离补兼容；不得复用用户库或连接真实模型。
- 非范围：通过mock证明文学质量、全套浏览器截图默认执行、打包上传。
- 交付证据：可重放fixture、断点/恢复/版本/计数报告、失败截图可由用户提供、未覆盖路径。

### S8-07 可选真实模型与三作者验收（3 点）

- 用户价值：确认新手能推进、连载作者能持续生产、表达型作者的意图得到保留。
- 状态/前置：待解锁；S8-06通过；作者明确选择测试作品/模型/调用预算/资料范围后才运行真实调用，未授权状态为等待样本评测而非默认执行。
- Owner/模块：根集成人组织，验证 Agent运行受控Prompt/工作流评测；三作者视角代理可独立审阅同一结果，真实作者访谈另行安排。
- 实施任务：固定新手首章、模糊反馈、十章连载、刻意未知四类样本；记录开始至成果时间、人工决定数、误改保护、重复调用、Token unknown；把文学质量与运行正确性分开评。
- AC：①调用只用明确选择模型/范围且遵守总预算；②三作者独立给结论，至少两票认可才确定本轮交互验收方向，代理票不冒充真实访谈；③任何数据完整性/越权/保护破坏仍阻塞Done，不能由多数票豁免；④未通过样本形成具体修正卡再评，不只改宣传；⑤未实测的模型/恢复/平台明确记录，不虚构耗时改善比例。
- 测试隔离/安全：优先专用虚构作品与测试凭证；不上传作者私稿或自动调用付费服务；UI由作者验收，真实调用结果脱敏。
- 非范围：自动切换默认模型、公共发布/桌面上传、将所有新卡一次直接合入main。
- 交付证据：样本/授权预算、三份独立评审票、PO吸收矩阵、实测结果及未测缺口；晋级仍遵守feature→beta组合测试→main。

## 多 Agent Wave 与集成门

| Wave | 可并行工作 | 串行/根集成人工作 | 解锁证据 |
| --- | --- | --- | --- |
| 5.0 | Runtime/Prompt/UI只读提供权限与上下文证据 | 根完成S5-01和共享合同 | 权限、模块边界与revision矩阵 |
| 5.1 | Runtime S5-02；平台 S5-04准备mock适配；Prompt S5-06准备schema | 根schema/Registry/types接线；生产执行等待依赖 | S5-02事务、S5-03门禁完成 |
| 5A | 平台S5-04→05；Prompt S5-06；UI S5-07在冻结接口后联通 | 根审阅来源lane、简易权限；同文件单owner | 真实委托/提案/策略/恢复闭环 |
| 5B | 平台评测S5-08；UI评测视图消费冻结合同；验证Agent评测fixture复核 | 可选授权后S5-09；有适用证据才S5-10实测推荐，未测保持自定义；与factory改动串行 | 四任务回归、实测/未知标记、推荐明确采用 |
| 6.0 | 三owner提供调用、worker与usage清单 | 根完成S6-01 | 账本状态机及unknown/并发决策 |
| 6.1 | 平台预算S6-02；Runtime准备checkpoint适配；UI准备view model | S6-02后平台调用S6-03，同factory/usage文件串行 | 每类内部调用预留与结算测试 |
| 6A | Runtime S6-04→05；UI S6-06；验证Agent竞态复核 | 根检查quality-first恢复、数据迁移、累计 | 暂停/取消/重启不重复执行 |
| 7.1 | 记忆S7-01→02；资产S7-03→04；正文S7-05 | root types/Prompt接线，预算call adapter单owner | 每条独立闭环验收，未联通不启用入口 |
| 7A | 正文S7-05a→05b→05；Prompt/验证owner在合同后并行候选/测试 | root版本schema/权限/发布保护接线 | 正文局改、CAS、选区安全 |
| 7B | 人物S7-06a→06b→06；Prompt/验证owner在合同后并行 | root事实/认知/计划版本接线；共用UI串行 | 人物事实/计划与资产不混写 |
| 7C | 规划S7-07a→07b→07；验证owner复核worker竞态 | root保存边界/租约/plan contract接线 | 兑现、range CAS、旧worker fencing |
| 8.0 | 依赖审计、UI旧路由审计、验证fixture准备 | 根S8-01 | 回退可支持类型与拒绝范围 |
| 8.1 | Runtime S8-02→03；UI S8-04→05；验证S8-06准备 | root接口/任务lane接线，集成统一构建 | 回退/来源/十章确定性验收 |
| 8A | 验证S8-06完成；三作者独立评审结果 | 根按明确样本预算执行S8-07、整理多数结论 | 实测与未测缺口，beta组合验收 |

每个窗口只承诺已冻结和可验收的卡。单一checkout内子Agent不switch/merge/commit；独立worktree由根指定。卡完成后根审scope、维护长期Wiki；用户可见变化按“新增/优化/修复”合并发布摘要并使用对应提交主语。合入beta前审查继承未晋级提交的完整差异，不能把本文或一次typecheck当成整批验收。

## 最窄验证与退出条件

代码改动后由根集成人选择实际聚焦测试文件，统一完成shared构建、server构建及对应node测试；前端做client typecheck，UI验收缺口明确交作者。文档/Spike只跑路径、链接、样例与合同审阅，不为其跑全量构建。

新回归必须覆盖至少四种行为AC及错误路径，而非只断言源码文本。可复用的现有聚焦证据包括 modelRouter、llmRequestBudget、llmFactoryRetryPolicy、llmUsageTracking、directorUsageTelemetryProjection、chapterEditorPreview、chapterPatchRepair、directorManualEditImpact、directorIssueGovernance、ragJobListing、ragCompatibilityBootstrap、ragRetrievalTrace；复用前确认branch/产物时间与改动范围，不能把旧测试通过当新合同已实现。

Done要求运行调用、内容写入、版本、投影、恢复和权限都符合该卡；不足的真实模型/PG/桌面/UI验收记录具体缺口。S8多数评审确定产品方向，不能替代数据/权限/并发的技术退出门。未证明的撤回、角色/规划安全写入或跨模型费用能力保持受限，并有明确可继续的下一张卡。
