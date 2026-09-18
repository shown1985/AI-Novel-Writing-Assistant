# Sprint 3：可信世界与可持续评估任务卡

## 范围、状态与估点

本页展开[路线图](./agent-collaboration-sprints.md)的 S3-00～S3-06，目标是可靠 Prompt 登记、内容版本、可信评估来源、持续问题历史和作者留白。除静态登记门外，业务代码尚未实施。各生产卡在 S1-06 的版本、来源、运行承接和可空决定合同冻结前为 **Not Ready**；下文的依赖还必须分别通过。

原候选总量为 28 点。展开后对 Prompt 静态登记门、版本接线、双侧同步、历史兼容和上下文消费分别验收，重新估算为 **36 相对点**，不是单个验收窗口的承诺或工时。每张不超过 5 点；拆分不会把原 Story 的保护条件移出 Done。

| 原 ID | 任务卡 | 点数 | Owner | 解锁依赖 |
| --- | --- | --- | --- | --- |
| S3-00 | S3-00 世界 Prompt 静态登记一致性门 | 2 | 根集成人 | S1-06；R1-S2C |
| S3-01 | S3-01 Prompt 维护能力边界 | 3 | Prompt Agent | S1-06、S3-00 |
| S3-02 | S3-02a 样本安全提交；S3-02b 既有写入口收敛 | 3 + 3 | Runtime Agent | S1-06；02b 依赖 02a |
| S3-03 | S3-03a 本书内容版本；S3-03b 双侧同步保护 | 3 + 5 | Runtime Agent | S3-02a；03b 依赖 03a、02b |
| S3-04 | S3-04 AI 结构化评估 | 5 | Prompt + Runtime 串行接线 | S3-01、02b；S2-04a/b来源合同与存储；S1-06 可空决定合同 |
| S3-05 | S3-05a 问题身份与观察史；S3-05b 旧记录和并发评估 | 3 + 3 | Runtime Agent | S3-04；05b 依赖 05a |
| S3-06 | S3-06a 作者决定持久化；S3-06b 按用途消费决定 | 3 + 3 | Runtime + Prompt 串行接线 | S3-02b；06b 依赖 06a、S3-04、03a |

S3-04 读取 S1-06 冻结的可空决定集合，不等待 S3-06 的写操作。S3-06a 可与评估 Prompt 并行；S3-06b 才完成评估和生成中的实际保护，避免循环依赖。

## 路径与共享 ownership

真实入口：`server/src/services/world/WorldService.ts`、`worldImprovementService.ts`、`worldSnapshotService.ts`、`worldStructure.ts`；HTTP 位于 `server/src/modules/setup/world/http/`。本书世界位于 `server/src/services/novel/worldContext/`。Prompt 位于 `server/src/prompting/prompts/world/`。

拟建模块为 `server/src/services/world/maintenance/{domain,application,infrastructure}/` 及 `maintenance/index.ts`；它们是规划路径，S1-06 可调整归属，不能据此假定已有 store 或 API。Prompt 拟建 `server/src/prompting/prompts/world/maintenance/`。外部调用走业务门面，不深链 store。不要在已有高密度 world 根目录继续添加同前缀文件。

根集成人独占 `shared/types/world.ts`、`shared/types/novelWorld.ts`、拟建共享维护合同、`server/src/prisma/schema.prisma`、迁移、Registry/catalog loader、HTTP挂载和 API facade。子 Agent 提出结构化接线请求；Prompt 输出 schema 与共享 API schema 的边界由根集成人冻结，避免重复事实源。

## S3-00：世界 Prompt 静态登记一致性门

作为作者，我希望世界生成使用唯一、可审计的 Prompt 版本，避免静态登记错误被运行时容错掩盖。

- 点数2，P0；Ready（R1-S2C）；根集成人独占 Registry loader 与 Prompt 治理测试。
- 当前事实：`novel.world.generate_from_theme` 资产因战力体系输入已升级为 v3，loader 和既有测试仍声明 v2；运行时重绑不能替代静态治理。
- 子任务：loader/测试统一到 v3；增加全部 loader 声明 key 与实际加载资产 key 一致且唯一的静态检查；确认 Registry/模型选择行为不变。
- 非范围：不修改 Prompt 文案/schema，不拆 `world.prompts.ts`，不迁 `worldDraft.prompts.ts`，不补 maintenance 能力，不调用真实模型。
- AC：静态 key 不再漂移；重复 key 失败；现有 Prompt 资产和消费者继续加载同一实际版本；检查不靠运行时自修复通过。
- 最窄验证：Prompt governance、世界模型选择、Registry loader 一致性和相关世界 Prompt 测试；零数据库写入。

## S3-01：Prompt 维护能力边界

作为作者，我希望相同世界在检查与修改中遵守同一套约束，避免不同按钮生成互相矛盾的设定。

- 点数3，P0；Not Ready，依赖 S1-06 与 S3-00。Prompt Agent 独占现有 `world.prompts.ts`、`world.promptTypes.ts`、`world.promptSchemas.ts` 与拟建 maintenance Prompt 子目录；Registry/catalog 交根集成人。为守住 3 点，`worldDraft.prompts.ts` 留在原位且不改。
- 子任务：列出旧文件的参考、骨架、分层、评估、导入、可视化职责；抽出维护/评估能力并保留旧 export；同步类型、schema和资产加载；补模块边界说明。
- 非范围：改变模型默认策略、生成世界正文、新增业务能力、放宽旧 schema。
- AC1：旧世界生成、深化、评估消费者可继续从兼容门面导入，资产 ID/版本不无故改变。
- AC2：扩展维护前将超硬阈值文件拆到责任模块；不以 generic utils 或新巨型文件替代。
- AC3：产品 Prompt 具有 Registry、management/catalog、输出 schema 与上下文合同，service 不新增裸 LLM/inline Prompt。
- AC4：拆分后调用仍使用原 Runner、budget/telemetry和repair策略，任何未纳管路径显式记录而非隐藏。
- 检查：针对资产加载/目录与现有世界 Prompt 的兼容行为检查；server typecheck；复用 `server/tests/worldSkeletonGeneration.test.js` 的相关路径，必要时集中构建后运行。
- Done证据：职责清单、依赖方向、原资产到新文件映射、加载检查结果；无业务变化时不强加用户发布条目。失败时保留兼容门面，不修改用户世界数据。

## S3-02a：世界样本安全提交边界

作为作者，我希望 AI 或其他页面修改世界时，不能覆盖我刚保存的内容。

- 点数3，P0；依赖 S1-06 的 contentRevision、提交身份、旧客户端策略、快照/事务合同。Runtime Agent owned maintenance domain/application/infrastructure；`WorldService.ts` 门面接线由同一 Runtime owner串行完成；schema由根集成人。
- 子任务：建立受资源范围约束的提交入口；实现版本条件、提交幂等、内容与前后证据原子提交；定义冲突和未知提交结果的读取方式；明确报告/缓存与内容写入区别。
- 非范围：AI提案、部分采用、跨小说同步、全系统撤回。
- AC1：相同 baseRevision 的两个不同提交仅一个成功，另一个得到可解释冲突且零内容写入。
- AC2：同一提交重放返回同一结果，不递增两次版本、不复制快照。
- AC3：内容、兼容投影、revision、提交证据任一持久化失败，整笔事务不留半完成世界。
- AC4：提交已成功但响应丢失可按提交身份查询；重启重试不覆盖随后的人工作品。
- AC5：旧客户端的缺版本请求按 Spike 明确策略处理；不得默认绕过新入口的冲突保护。
- 检查：拟建 `server/tests/worldMaintenanceCommit.test.js`，mock persistence或隔离临时SQLite验证双写竞争、重放、事务回滚、响应丢失。禁止用户桌面库写测。
- Done证据：冻结提交合同、并发/重放结果、事务前后证据与旧客户端策略。提交证据不是可调用的全局回滚能力。

## S3-02b：现有世界写入口收敛

作为作者，我希望手动编辑、AI整理和历史操作得到同样的版本保护。

- 点数3，P0；依赖 S3-02a，所有待接线写入口清单由 S1-06 复核。Runtime Agent独占 `WorldService.ts`、`worldImprovementService.ts`、`worldSnapshotService.ts` 的接线；结构投影复用 `worldStructure.ts`。
- 子任务：盘点普通编辑、公理、分层、深化、结构编辑、素材使用、快照恢复和导入写入；接到安全提交；确定可信骨架与 legacy-text 的来源策略；分离只改报告/缓存的更新。
- 非范围：把旧 QA 自动重写成骨架；修改快照恢复产品权限；清理或删除历史数据。
- AC1：所有内容编辑递增版本且写入提交证据，无某按钮继续无条件写入的旁路。
- AC2：可信结构派生兼容字段；编辑旧字段不会静默把可信结构降为 legacy-text 或重建第二套内容。
- AC3：尚未提供安全结构化整合的旧入口按冻结策略保留兼容、限制或提示；不能显示“已进入生成链”而只追加旧字段。
- AC4：旧 QA、历史快照和文本世界可读取；迁移不删除来源、不自动覆盖作者设定。
- AC5：RAG 刷新失败不撤销已保存内容，留下可重试的资料债；重放内容提交不重复生成索引任务。
- 检查：世界写入口行为矩阵；复用 `worldPersistence.test.js`、`worldStructure.test.js`、`worldDeepening.test.js` 并补安全提交行为。集中确认 dist 新鲜后运行。
- Done证据：写入口覆盖矩阵、可信/legacy源样例、版本与证据、索引失败结果。尚未收敛入口逐一列为发布阻塞。

## S3-03a：本书世界独立内容版本

作为作者，我希望本书世界的修改与世界样本更新能分清楚，阅读缓存刷新不会被算成创作修改。

- 点数3，P0；依赖 S1-06、S3-02a。本书世界版本模型、评估输入版本、来源版本由根集成人冻结。Runtime Agent owned `NovelWorldInstanceService.ts`、`NovelWorldManualService.ts`、`WorldContextGateway.ts` 与 `novelWorldProjection.ts`，同一owner串行接线。
- 子任务：增加独立内容版本并适配导入/生成/手动创建/实例编辑；保存引用来源版本；区分切片缓存digest与内容revision；适配历史无实例初始化。
- 非范围：改变当前创建自动关联样本行为；章节新事实自动写回样本；增加另一套世界上下文源。
- AC1：本书内容版本与 syncBaseVersion 分开，来源更新不自动改变实例内容。
- AC2：切片刷新、状态查询与摘要缓存写入不推进内容版本；必要缓存副作用不被显示为作者修改。
- AC3：实例内容变化使旧 slice 失效，Gateway 后续读取新实例并按 purpose 组装。
- AC4：历史仅 worldId/旧slice的作品按明确兼容路径初始化且可重复执行，不删除旧字段。
- AC5：生成/手动创建样本与本书绑定仍事务一致；失败不产生本书有内容但来源绑定半完成状态。
- 检查：复用 `worldContextGateway.test.js`、`storyWorldSlice.test.js`、`novelWorldProjection.test.js`；补版本/缓存/旧数据幂等行为。
- Done证据：版本来源样例、缓存前后版本、旧作品读取结果；数据库变更采用增量迁移并同时说明SQLite/PostgreSQL验证缺口。

## S3-03b：双侧同步安全与引用完整性

作为作者，我希望比较两边差异后，只同步我选中的部分，而且不会破坏关系或覆盖期间的新修改。

- 点数5，P0；依赖 S3-03a、S3-02b及双revision CAS合同。Runtime Agent独占 `NovelWorldSyncService.ts`、`novelWorldSyncRecords.ts` 和 `novelWorldSyncPending.ts`；共享同步请求、HTTP/API由根集成人接线。
- 子任务：差异返回两侧依据版本；同步事务检验两边；合并后检查稳定实体引用；解释缺失依赖分区；原子记录方向、范围、版本和结果；pull清理对应缓存。
- 非范围：自动push/pull、按名称合并实体、AI替作者决定同步范围、全局回滚。
- AC1：差异查看之后任一侧内容改变，原同步请求零写入并提示重新比较。
- AC2：同版本同步重放幂等，不重复记录或递增；两次不同同步竞争只有符合版本者成功。
- AC3：只拉地点或只推势力造成跨引用缺失时，拒绝并说明依赖；normalization不能静默丢关系。
- AC4：事务失败不留下内容已改、syncBaseVersion或历史未写的半状态。
- AC5：方向none仅关闭提示、保留来源；手工明确同步仍可用；发布正文与关联资产不被隐式修改。
- 检查：复用 `novelWorldSync.test.js`、`novelWorldSyncRecords.test.js`、`novelWorldSyncPending.test.js`；补双侧竞争、引用丢失、同名异ID、失败重放。
- Done证据：差异/冲突样例、双侧版本、明确范围、历史和slice失效结果。测试使用隔离持久化。

## S3-04：AI 结构化世界评估

作为作者，我希望 AI 基于真实世界和我的要求说明风险，模型没完成时也直说，而非宣称体检通过。

- 点数5，P0；依赖 S3-01、S3-02b、S2-04a/b实际来源记录及 S1-06 可空决定输入。Prompt Agent负责资产/输出契约；Runtime Agent在Prompt合同冻结后接 `worldImprovementService.ts` 与维护应用服务，避免同时改同文件。
- 子任务：组装结构、可信旧文本、来源证据和可空决定；扩展风险实体引用/证据/影响/检查完成状态；移除语义regex和rule-only兜底；保存评估输入版本与模型来源；处理失败和不完整结果。
- 非范围：固定关键词判题材冲突；硬编码规则给可开书结论；自动修正；宣称无需真实模型抽样验证。
- AC1：中文、英文或换名称的相同设定走同一结构化AI评估，确定性校验只检查schema/引用/安全边界。
- AC2：AI超时、格式失败或能力不足显示未完成，保留最近报告且区分其版本，不增加“通过”证据。
- AC3：每项风险含目标实体或明确旧文本定位、输入证据与故事影响；无效引用不进入正式风险事实。
- AC4：可空决定集合正常评估；有决定时区分硬事实、人物认知、待定和试演，不能把角色误认直接当世界真相。
- AC5：内容或决定输入版本改变时旧评估失效；该报告不能作为新版通过证明。
- 检查：拟建 `worldMaintenanceAssessment.test.js` 与现有 `worldConsistency.test.js`；mock Runner验证上下文、失败保留、引用、版本。真实模型抽样另记授权范围与结果，不用source regex断言代替语义质量。
- Done证据：完成/失败/过期投影、证据定位、模型来源、AI输入样例；未抽样时明确语义质量验收缺口。

## S3-05a：稳定问题身份与观察历史

作为作者，我希望同一问题换了表述仍能找到原来的处理过程，而不是反复从头决定。

- 点数3，P0；依赖 S3-04 与 S1-06 问题identity/观察/决定合同。Runtime Agent owned maintenance domain/store；Prompt Agent按冻结合同提供身份理解输出，不共享改registry。
- 子任务：分开问题身份、本轮观察和作者决定；AI判定新旧风险对应，记录引用与不确定性；确定性验证资源归属/引用/唯一约束；按运行读取本轮结果及历史。
- 非范围：message字符串相等或关键词指纹作为语义主识别；自动把相似问题合并；删除旧问题。
- AC1：同一实体相同根因换措辞保留同一问题历史，观察仍有独立运行和版本。
- AC2：同一code但不同实体/根因不误合并；AI无法确认时保留待确认对应关系，不伪造确定匹配。
- AC3：重检保留决定、采纳证据和旧观察；本轮未出现不直接等于已验证修复。
- AC4：跨world的问题候选不可匹配或写入，服务端原子约束资源范围。
- 检查：拟建 `worldMaintenanceIssueHistory.test.js`；mock结构化身份结果覆盖改措辞、同code异实体、不确定、重放与归属。
- Done证据：身份/观察/决定三者映射样例、历史读取与匹配来源；身份算法真实质量需单独抽样验收。

## S3-05b：历史声明兼容与并发评估

作为作者，我希望已有问题记录继续可查，多次体检不会让过期结果覆盖新编辑。

- 点数3，P0；依赖 S3-05a、S3-02b。Runtime Agent负责维护历史适配与评估提交；schema/增量迁移根集成人。
- 子任务：适配旧 open/resolved/ignored；区分历史手工声明与新验证证据；评估完成提交检验输入版本；重复运行去重；失败保留旧报告。
- 非范围：批量删除旧记录；把旧resolved升级为验证通过；世界内容回退。
- AC1：旧resolved可读并标为历史处理声明，未生成的新验证时间不得填造。
- AC2：慢检查返回时内容或作者决定已变，结果保留为过期观察但不成为最新有效结论。
- AC3：重复提交同一评估不复制观察；同时检查不同版本不串运行来源。
- AC4：报告事务失败/进程中断可恢复相同运行；旧报告与作者决定不消失。
- 检查：问题历史兼容、重复运行、评估竞态、故障恢复行为；迁移用临时SQLite和适用PostgreSQL检查，不对桌面库试迁移。
- Done证据：历史显示样例、版本失效结果、运行恢复与迁移兼容说明。

## S3-06a：作者决定与留白持久化

作为作者，我希望“这是人物误解”或“真相尚未决定”被记住，不必在每次检查重复解释。

- 点数3，P1；依赖 S1-06 可空决定schema和 S3-02b。Runtime Agent负责 maintenance 决定应用/存储；共享类型根集成人；UI正式入口在 S4-05。
- 子任务：持久化作者来源、scope/目标、认知主体、含义、有效窗口和撤销历史；版本化决定；明确对评估输入版本的影响；提供范围校验门面。
- 非范围：对话自动提升为正史；自动将“不是问题”设为永远通过；固定字符串判断决定种类。
- AC1：明确作者决定可保存/撤销并读取，历史不丢；自由表达分类使用注册结构化AI合同或作者显式选项。
- AC2：人物认知、世界事实、计划和试演相互区分，保存试演不会改世界真相。
- AC3：越界目标、缺失主体或无效窗口不写入；决定仅影响指定资源范围。
- AC4：决定改变令对应评估依据失效；旧报告仍可查，不能继续展示为当前通过。
- 检查：拟建 `worldAuthorDecision.test.js`；分类mock、显式类型校验、范围/窗口、撤销、版本和旧记录无决定集合。
- Done证据：决定记录/撤销历史、影响范围与失效版本；没有UI消费不能宣称作者已能使用完整功能。

## S3-06b：评估与生成按用途消费决定

作为作者，我希望留白不仅显示在界面，也会保护后续写作和检查。

- 点数3，P1；依赖 S3-06a、S3-04、S3-03a。Runtime Agent owned `WorldContextGateway.ts`及小说世界投影；Prompt Agent更新维护评估资产；小说上下文组装接线由根集成人协调该模块owner。
- 子任务：按outline/character/chapter/bible/optimize用途输出相关决定；处理窗口与内容版本；避免多权威来源；评估required context保护；保留角色对话软影响链。
- 非范围：让角色访谈、基础角色库对话、拆书访谈或思路线成为正史；第二套章节生产链。
- AC1：“人物相信神迹不可伪造，真相未决定”进入相应上下文，评估不强制把未知改成确定事实。
- AC2：已撤销/窗口外决定不继续注入；同名角色或跨书资源不共享决定。
- AC3：Gateway仍是本书世界权威门面；Bible或canonicalState不作为平行规则覆盖决定。
- AC4：世界样本决定进入本书时遵守显式适配/来源合同，样本变更不自动改变已导入实例。
- AC5：角色对话保持原确认和有限窗口影响；试演记录只用于讨论，正式提交前不进入canonical事实。
- 检查：Gateway与GenerationContextAssembler行为检查、required context保护；复用 `worldContextGateway.test.js`、`characterConversationPrompt.test.js`、`chapterLayeredContextCanonicalState.test.js`。
- Done证据：三种purpose上下文样例、未知保护/撤销/隔离结果；真实模型未抽样的缺口单列。

## 并发 Wave 与验收门

1. Wave 0：S1-06、共享schema/迁移和写入口覆盖表冻结。未证明版本或运行恢复能力的卡保持Not Ready。
2. Wave 1：Prompt Agent做S3-01；Runtime Agent做S3-02a/b；UI Agent可依据冻结合同做只读投影联调，mock不计业务Done。
3. Wave 2：Prompt Agent做S3-04资产；Runtime Agent做S3-03a/b及S3-06a，彼此串行。根集成人只做共享接线与隔离测试，不抢Runtime owned文件。
4. Wave 3：Runtime Agent接S3-04与S3-05a/b；Prompt Agent做S3-06b Prompt消费，Runtime后接Gateway；UI Agent验证来源/过期/未知状态的消费。相同文件不并发写。

通用Done：真实持久化/投影/版本行为、定向检查、迁移兼容和源码最新构建证据；更新长期wiki；用户可见行为进入发布记录。根集成人review并阶段提交，子Agent不commit/switch/merge。UI验收交用户，不默认浏览器/截图。未通过beta组合验收不晋级main。

数据库行为检查仅mock或临时隔离库；禁止reset、删除、截断、覆写桌面世界。completion-first局部质量债可继续，quality-first明确人工暂停仅显式恢复；世界维护不得悄悄改变小说链的质量策略。运行记录和CreativeHub保持只读，修改和恢复位于来源现场。
