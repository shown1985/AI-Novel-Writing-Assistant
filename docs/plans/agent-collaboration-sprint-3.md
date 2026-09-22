# Sprint 3：可信世界与可持续评估任务卡

## 范围、状态与估点

本页展开[路线图](./agent-collaboration-sprints.md)的 S3-00～S3-06，目标是可靠 Prompt 登记、内容版本、可信评估来源、持续问题历史和作者留白。S3-01、S3-02a 与 R1-S2G 的 S3-02b1 已分别完成 Prompt 能力边界、世界样本安全提交边界和两条既有保存路径 CAS 接线。原 `S3-02b` 父项其余旧入口留在 Refinement，其他生产卡仍须在 S1-06 的版本、来源、运行承接和可空决定合同满足后按依赖推进，不能把已完成的底座解释为全部世界维护能力已上线。

原候选总量为 28 点。展开后对 Prompt 静态登记门、版本接线、双侧同步、历史兼容和上下文消费分别验收，当前按 **43 相对点**校准，不是单个验收窗口的承诺或工时。每张不超过 5 点；拆分不会把原 Story 的保护条件移出 Done。

| 原 ID | 任务卡 | 点数 | Owner | 解锁依赖 |
| --- | --- | --- | --- | --- |
| S3-00 | S3-00 世界 Prompt 静态登记一致性门 | 2 | 根集成人 | S1-06；R1-S2C |
| S3-01 | S3-01 Prompt 维护能力边界 | 3 | Prompt Agent | S1-06、S3-00 |
| S3-02 | S3-02a 样本安全提交；S3-02b1 两条既有保存路径 CAS 接线 | 3 + 3 | Runtime Agent | S1-06；02b1 依赖 02a；原 02b 其余入口 Refinement |
| S3-03 | S3-03a1 实例内容版本与兼容迁移；S3-03a2 切片缓存与 Gateway 版本消费；S3-03b 双侧同步保护 | 5 + 5 + 5 | Runtime Agent | a1 依赖 S1-06、S3-02a；a2 依赖 a1；03b 依赖 a1/a2、02b |
| S3-04 | S3-04 AI 结构化评估 | 5 | Prompt + Runtime 串行接线 | S3-01、02b；S2-04a/b来源合同与存储；S1-06 可空决定合同 |
| S3-05 | S3-05a 问题身份与观察史；S3-05b 旧记录和并发评估 | 3 + 3 | Runtime Agent | S3-04；05b 依赖 05a |
| S3-06 | S3-06a 作者决定持久化；S3-06b 按用途消费决定 | 3 + 3 | Runtime + Prompt 串行接线 | 原 S3-02b 父项剩余入口 Refinement；06b 依赖 06a、S3-04、S3-03a1/a2 |

S3-04 读取 S1-06 冻结的可空决定集合，不等待 S3-06 的写操作。S3-06a 可与评估 Prompt 并行；S3-06b 才完成评估和生成中的实际保护，避免循环依赖。

## 路径与共享 ownership

真实入口：`server/src/services/world/WorldService.ts`、`worldImprovementService.ts`、`worldSnapshotService.ts`、`worldStructure.ts`；HTTP 位于 `server/src/modules/setup/world/http/`。本书世界位于 `server/src/services/novel/worldContext/`。Prompt 位于 `server/src/prompting/prompts/world/`。

拟建模块为 `server/src/services/world/maintenance/{domain,application,infrastructure}/` 及 `maintenance/index.ts`；它们是规划路径，S1-06 可调整归属，不能据此假定已有 store 或 API。Prompt 拟建 `server/src/prompting/prompts/world/maintenance/`。外部调用走业务门面，不深链 store。不要在已有高密度 world 根目录继续添加同前缀文件。

根集成人独占 `shared/types/world.ts`、`shared/types/novelWorld.ts`、拟建共享维护合同、`server/src/prisma/schema.prisma`、迁移、Registry/catalog loader、HTTP挂载和 API facade。子 Agent 提出结构化接线请求；Prompt 输出 schema 与共享 API schema 的边界由根集成人冻结，避免重复事实源。

## S3-00：世界 Prompt 静态登记一致性门

作为作者，我希望世界生成使用唯一、可审计的 Prompt 版本，避免静态登记错误被运行时容错掩盖。

- 点数2，P0；**Done（R1-S2C）**；根集成人独占 Registry loader 与 Prompt 治理测试。验收见 [S3-00 静态登记一致性门](./s3-00-world-prompt-registry-alignment.md)。
- 完成事实：`novel.world.generate_from_theme` 资产、loader 和测试统一为 v3；全量静态门同时对齐另外 8 处历史版本漂移，运行时重绑不再掩盖这些声明错误。
- 子任务：loader/测试统一到 v3；增加全部 loader 声明 key 与实际加载资产 key 一致且唯一的静态检查；确认 Registry/模型选择行为不变。
- 非范围：不修改 Prompt 文案/schema，不拆 `world.prompts.ts`，不迁 `worldDraft.prompts.ts`，不补 maintenance 能力，不调用真实模型。
- AC：静态 key 不再漂移；重复 key 失败；现有 Prompt 资产和消费者继续加载同一实际版本；检查不靠运行时自修复通过。
- 最窄验证：Prompt governance、世界模型选择、Registry loader 一致性和相关世界 Prompt 测试；零数据库写入。

## S3-01：Prompt 维护能力边界

作为作者，我希望相同世界在检查与修改中遵守同一套约束，避免不同按钮生成互相矛盾的设定。

- 点数3，P0；**Done（R1-S2E）**，S1-06 与 S3-00 均已完成。Prompt Agent 独占现有 `world.prompts.ts`、`world.promptTypes.ts`、`world.promptSchemas.ts` 与拟建能力责任子目录；Registry/catalog 交根集成人。为守住 3 点，只迁现有 `world.prompts.ts` 的 14 个资产，`worldDraft.prompts.ts` 留在原位且不改。
- 子任务：列出旧文件的参考、骨架、分层、评估、导入、可视化职责；抽出维护/评估能力并保留旧 export；同步类型、schema和资产加载；补模块边界说明。
- 非范围：改变模型默认策略、生成世界正文、新增业务能力、放宽旧 schema。
- AC1：旧世界生成、深化、评估消费者可继续从兼容门面导入，资产 ID/版本不无故改变。
- AC2：扩展维护前将超硬阈值文件拆到责任模块；不以 generic utils 或新巨型文件替代。
- AC3：产品 Prompt 具有 Registry、management/catalog、输出 schema 与上下文合同，service 不新增裸 LLM/inline Prompt。
- AC4：拆分后调用仍使用原 Runner、budget/telemetry和repair策略，任何未纳管路径显式记录而非隐藏。
- 检查：针对资产加载/目录与现有世界 Prompt 的兼容行为检查；server typecheck；复用 `server/tests/worldSkeletonGeneration.test.js` 的相关路径，必要时集中构建后运行。
- Done证据：`world.prompts.ts` 从 1,316 行收敛为 33 行兼容门面；14 个资产声明块与拆分前逐字一致，并按 `inspiration`（4）、`presentation`（1）、`maintenance`（3）、`structure`（4）、`transfer`（1）、`generation`（1）归属。六个实现文件均低于 500 行，无 service 深导入、无 `worldDraft.prompts.ts`/Registry/schema/Runtime 改动。server build、门面 14/14 元数据、Registry loader 一致性、模型选择与战力合同均通过；完整 Prompt governance 仍只报已登记的 `ComicFactService` 两处既有 inline Prompt 债，不扩入本 Story。模块边界记录在 `server/src/prompting/prompts/world/README.md` 与 Prompt Wiki；无用户行为变化，发布条目明确跳过。

## S3-02a：世界样本安全提交边界

作为作者，我希望 AI 或其他页面修改世界时，不能覆盖我刚保存的内容。

- 点数3，P0；**Done（R1-S2F）**。`worldMaintenanceCommit.test.js` 单文件 11/11；与 `runtimeMigrations`、`prismaMigrationCompleteness` 组成三套组合检查共 22/22，AC1～AC5 均有证据；双 schema validate 与 SQLite runtime migration 通过。真实 PostgreSQL apply 保留为 Release gate，不作为本 Story 当前阻断。依赖 S1-06 的 contentRevision、提交身份、旧客户端策略、快照/事务合同，均由 [S3-02a 安全提交合同](./s3-02a-world-sample-safe-commit-contract.md) 冻结。Runtime Agent owned maintenance domain/application/infrastructure；schema、迁移与共享合同由根集成人。为守住 3 点，本卡不接管 `WorldService.ts` 的全部旧写入口；其余入口属于原 S3-02b 父项，继续 Refinement。
- 子任务：建立受资源范围约束的提交入口；实现版本条件、提交幂等、内容与前后证据原子提交；定义冲突和未知提交结果的读取方式；明确报告/缓存与内容写入区别。
- 非范围：AI提案、部分采用、跨小说同步、全系统撤回。
- AC1：相同 baseRevision 的两个不同提交仅一个成功，另一个得到可解释冲突且零内容写入。
- AC2：同一提交重放返回同一结果，不递增两次版本、不复制快照。
- AC3：内容、兼容投影、revision、提交证据任一持久化失败，整笔事务不留半完成世界。
- AC4：提交已成功但响应丢失可按提交身份查询；重启重试不覆盖随后的人工作品。
- AC5：旧客户端的缺版本请求按 Spike 明确策略处理；不得默认绕过新入口的冲突保护。
- 检查：拟建 `server/tests/worldMaintenanceCommit.test.js`，mock persistence或隔离临时SQLite验证双写竞争、重放、事务回滚、响应丢失。禁止用户桌面库写测。
- Done证据：冻结提交合同、并发/重放结果、事务前后证据与旧客户端策略。提交证据不是可调用的全局回滚能力。

## S3-02b1：世界编辑与公理保存的最小 CAS 兼容接线

作为作者，我希望现有世界字段和公理保存不会覆盖我刚保存的内容，并能在冲突后沿来源页安全重试。

- 状态：**Done（R1-S2G）**；3 点，依赖 S3-02a 已 Done。Terra 代码级 PASS：maintenance/runtime/migration/service/route `25/25`、client CAS `3/3`，shared/server/client build/typecheck PASS；Computer Use PASS。隔离路径 `/tmp/ai-novel-qc-s3-runtime-20260920000000` 成功保存 `revision 1→2` 并刷新持久；并发合法写使 `2→3`，旧页面保存得到 `CONTENT_REVISION_CONFLICT`，草稿即时保留且数据库保留较新内容，仅两条 committed operation；client retry harness `3/3`。服务已停止，UI QC 结束时工作树干净。单一世界 Runtime 全栈 owner 独占 `WorldService.updateWorld`、既有 world HTTP/API、`updateAxioms` client/API/UI 与定向测试。
- 详细合同：[S3-02b1 世界编辑与公理保存 CAS 合同](./s3-02b1-world-edit-axiom-cas-contract.md)。本卡只接 `WorldService.updateWorld` 兼容 HTTP/API 与 `updateAxioms` 既有公理来源页，不新增普通编辑 UI；原 S3-02b 父项其余旧入口留 Refinement。
- 冻结业务保护：请求 schema 可选解析 `operationId`/`expectedContentRevision`，但业务缺任一字段返回 428/`REVISION_REQUIRED` 且零写入；revision 冲突和 operationId/hash 冲突返回 409；客户端公理保存显式传当前 revision 与稳定 operationId，网络重试复用该 ID。
- 统一写门面：两个方法都构造完整 candidate aggregate 并复用 S3-02a CAS/operation/receipt；不在客户端/路由复制 CAS，不保留无条件 `prisma.world.update` 旁路。
- 非范围：其他普通编辑、结构/分层/深化/导入/素材/快照/生成/整理入口、提案/评估/同步、schema/migration、批量历史修复和新 UI；原 S3-02b 父项的其余入口全部进入 Refinement/非范围，不宣称 S3-02 全部完成。
- AC：两个路径共享 CAS；缺保护字段 428、冲突 409、同 operation 重放不重复递增；公理 UI 请求含显式 revision/稳定 operationId 且重试复用；RAG 失败不回滚内容；跨世界不串数据。
- 检查：`WorldService`/HTTP 428-409 行为、CAS 并发/重放/事务失败、`WorldAxiomsCard` payload/retry/409 草稿保留与跨世界隔离；复用现有 runtime migration 证据但不新增 migration。完整 DoR/AC/验证见 `S3-02b1` 详细合同。

R1-S2G 已完成 `8/8`：S2-04b4 `5` 点与 S3-02b1 `3` 点均为 Done，且 S3-02b1 已完成真实来源页 UI QC。原 S3-02b 父项其余入口继续 Refinement，不启动或承诺下一 Story。

原 S3-02b 的手动结构保存子卡 [S3-02b2](./s3-02b2-world-structure-cas-contract.md) 已在 R1-S3C 完成 `5/5` 点：代码级 QA/QC、beta 组合验证与隔离 Chrome 来源页验收均 PASS，范围只覆盖既有手动 `PUT /structure`。AI backfill 与其他写入口仍为父项 Refinement，不因 b2 完成自动承诺。b2 是父项滚动拆分，不与原 S3-02 概要点数重复累计；后续子卡的 Sprint 承诺和点数另列。

AI 结构补全的下一步只进入 [S3-02b3s 幂等与费用边界 Spike](./s3-02b3s-structure-backfill-idempotency-spike.md)，2 点候选、未承诺。该入口在模型输出产生前没有最终 candidate，现有 commit receipt 不能证明模型是否已经调用或保存其结果；必须先冻结调用前 claim、生成后 CAS 和响应丢失恢复合同，再判断实施卡能否保持 5 点。单区块 `POST /structure/generate` 与其他旧入口均不并入该 Spike。

## S3-03a 拆分：本书世界独立内容版本与上下文消费

原 S3-03a 的 3 点父范围不再计点，拆为两张可独立验收的垂直 Story：

- [S3-03a1 实例内容版本与兼容迁移](./s3-03a1-novel-world-content-revision-contract.md)：5 点，负责实例版本字段、双 schema 增量迁移、现有创建/导入/生成/legacy 初始化写路径和事务边界。
- [S3-03a2 切片缓存与 Gateway 版本消费](./s3-03a2-world-slice-revision-consumption-contract.md)：5 点，依赖 a1，负责唯一缓存指纹、legacy 主读退出、晚到缓存拒写和 Gateway 按用途读取当前实例。

`S3-03a1` 已在 R1-S3A 完成 `5/5`，四个现有写入口、四类旧记录、版本递增和同步/旧切片阶段例外均有证据，且通过 beta 组合验证。`S3-03a2` 已在 R1-S3B 完成 `5/5` 并通过 `beta@67361baf` 组合验证：内部版本化缓存指纹、仅 slice legacy 的 raw slice 兼容、实例缓存单写、条件写零命中和无世界绝对零写入均有行为证据。S3-03b 仍为独立 5 点卡，不因 a2 完成而提前启动。

## S3-03b：双侧同步安全与引用完整性

作为作者，我希望比较两边差异后，只同步我选中的部分，而且不会破坏关系或覆盖期间的新修改。

- 点数5，P0；依赖 S3-03a1/a2、原 S3-02b 父项剩余入口及双revision CAS合同。Runtime Agent独占 `NovelWorldSyncService.ts`、`novelWorldSyncRecords.ts` 和 `novelWorldSyncPending.ts`；共享同步请求、HTTP/API由根集成人接线。
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

- 点数5，P0；依赖 S3-01、原 S3-02b 父项剩余入口、S2-04a/b实际来源记录及 S1-06 可空决定输入。Prompt Agent负责资产/输出契约；Runtime Agent在Prompt合同冻结后接 `worldImprovementService.ts` 与维护应用服务，避免同时改同文件。
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

- 点数3，P0；依赖 S3-05a、原 S3-02b 父项剩余入口。Runtime Agent负责维护历史适配与评估提交；schema/增量迁移根集成人。
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

- 点数3，P1；依赖 S1-06 可空决定schema和原 S3-02b 父项剩余入口。Runtime Agent负责 maintenance 决定应用/存储；共享类型根集成人；UI正式入口在 S4-05。
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
2. Wave 1：Prompt Agent做S3-01；Runtime Agent已完成S3-02a。R1-S2G 仅由同一 Runtime 全栈 owner 接稳定 ID `S3-02b1` 的 `updateWorld`/`updateAxioms` 两条保存路径；不借此启动原 S3-02b 父项其他旧入口，也不新增普通编辑 UI。
3. Wave 2：R1-S3A 只承诺 Ready 的 S3-03a1，由 Runtime Agent 在计划冻结后领取；a2 等待 a1 完成。S3-03b、S3-04 与 S3-06a 仍等待原 S3-02b 父项其余入口的 Refinement/解锁，不因 S3-02b1 完成自动 Ready。Prompt 与 Runtime owned 文件彼此串行接线；根集成人只做共享合同、迁移与隔离验证，不抢 Runtime owned 文件。
4. Wave 3：Runtime Agent接S3-04与S3-05a/b；Prompt Agent做S3-06b Prompt消费，Runtime后接Gateway；UI Agent验证来源/过期/未知状态的消费。相同文件不并发写。

通用Done：真实持久化/投影/版本行为、定向检查、迁移兼容和源码最新构建证据；更新长期wiki；用户可见行为进入发布记录。R1-S2G 的 S3-02b1 不新增迁移，复用 S3-02a 数据底座；原 S3-02b 父项其余旧入口仍是 Refinement/非范围。根集成人review并阶段提交，子Agent不commit/switch/merge。UI验收交用户，不默认浏览器/截图。未通过beta组合验收不晋级main。

数据库行为检查仅mock或临时隔离库；禁止reset、删除、截断、覆写桌面世界。completion-first局部质量债可继续，quality-first明确人工暂停仅显式恢复；世界维护不得悄悄改变小说链的质量策略。运行记录和CreativeHub保持只读，修改和恢复位于来源现场。
