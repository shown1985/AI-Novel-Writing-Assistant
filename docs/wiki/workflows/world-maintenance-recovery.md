# 世界维护提交与恢复边界

## 背景

世界样本与本书世界已经有结构化内容、同步、快照、深化问答和一致性检查，但这些入口尚未共享统一的内容版本、提交身份与恢复协议。部分旧入口只写扁平字段，部分归一化会过滤悬空引用，一致性检查也会替换旧观察。若直接在此基础上增加“AI 修正并采用”，容易覆盖作者刚保存的内容，或在响应丢失、刷新和服务重启后重复应用同一修改。

本页记录已经签认的长期设计边界。它是后续 S3/S4 实施的约束；已接入的保存路径包括 `updateWorld`、`updateAxioms` 和手动结构保存，不能把这些路径理解为全量 maintenance schema、API、Prompt、worker 或 UI 已经上线。完整评审证据见 [S1-06 合同](../../plans/s1-06-world-maintenance-recovery-contract.md)。

## 决策

世界维护使用独立的 `WorldMaintenanceWorkflowService` 门面，不进入 `NovelWorkflowTask`、自动导演运行时或章节生产链。世界维护失败只影响对应世界来源页，不能被投影为整本小说生产失败。

目标依赖方向是：

```text
HTTP / 来源 UI
      ↓
WorldMaintenanceWorkflowService
      ↓
application orchestration
   ↙        ↓          ↘
domain   Prompt port   persistence / lease / index ports
                         ↓
                    Prisma / worker
```

- `World` 与 `NovelWorld` 是两个独立 aggregate，各自拥有单调 `contentRevision`。
- run、proposal、commit、verification、operation 和 lease 使用 maintenance 专属增量记录，不伪装成世界骨架生成或导演任务。
- `WorldContextGateway` 仍是小说生成消费本书世界的唯一门面；maintenance 不建立平行的生成上下文来源。
- 运行记录只读并提供稳定 `sourceRoute`；采用、拒绝、恢复和继续复核只能在世界来源页操作。

## 内容权威与版本

世界样本以有效的 `World.structureJson` 为内容权威，本书世界以有效的 `NovelWorld.structuredDataJson` 为内容权威。扁平字段、binding、Story Slice、overview、可视化和 RAG 索引是兼容或派生投影，不能反向覆盖结构化权威源。

只有完全没有结构化内容时，才能从旧扁平字段构造 `legacy_derived` 兼容视图。结构化 JSON 已存在但损坏时必须返回明确错误，不能偷偷回退到旧字段掩盖数据损坏。旧深化回答、问题状态、报告和快照属于历史证据，不是当前权威内容。

五类版本各自承担单一语义：

- `contentRevision`：aggregate 的当前内容版本；正式内容提交与快照恢复递增，缓存、报告、租约和索引状态不递增。
- `evaluatedRevision`：评估实际读取的内容快照，创建后不可变。
- `baseRevision`：proposal 建立时所依据的内容版本，proposal 创建后不可变。
- `syncBaseVersion`：本书世界最近一次成功导入或同步时的来源世界版本；不能替代任一侧 CAS。
- `decisionRevision`：目标范围内有效作者决定集合的版本；空集合为 `0`，改变决定会使相关评估和 proposal 过期。

诊断配置 fingerprint、Prompt 版本和模型来源属于调用证据，不进入上述内容版本体系。

### 本书世界切片的派生缓存

`NovelWorld.storySliceJson`、override、digest 与 builtAt 是派生缓存，刷新它们不递增 `NovelWorld.contentRevision`。`storySliceDigest` 是实例内部的 freshness 指纹，固定绑定实例 ID、`contentRevision`、`sourceWorldId`、`syncBaseVersion`、故事输入 digest 和切片 schema 版本；公开切片中的 `metadata.storyInputDigest` 仍只表示故事输入，`rawSlice.worldId` 仍保留来源世界或既有兼容标识，不承担实例版本语义。不得以 `updatedAt`、来源样本后续修改或切片构建时间代替内容版本。

切片读取与写入以 `NovelWorld` 为唯一实例来源。生成或刷新开始时冻结指纹输入；提交时按实例版本、来源与同步基线条件更新同一行的全部派生字段。条件不匹配时丢弃晚到结果，仅读一次最新状态；Gateway 只将与当前指纹匹配的切片组装为上下文，不把 stale 切片作为回退来源，也不重复写缓存。模型或缓存提交失败保留旧缓存供检查，但旧缓存不能因失败被标为 current。同步 pull 在双侧 CAS 实施前仍由其既有清空缓存与同步基线变化触发失效；这不等于同步已完成版本保护。

旧作品首次读取允许 `worldId`、旧 slice 或两者兼有按既有 a1 规则建立实例；有效的仅旧 slice 可在实例内无模型补指纹，后续不再读取或双写 `Novel.storyWorldSlice*`。仅有 overrides 而无 `worldId`/旧 slice，不是可用世界：a2 的读取、刷新与偏好更新均返回空世界且零写入。a1 独立初始化入口仍保留自己的兼容规则，本节不修改它。旧 slice JSON 损坏时不可标 current，也不能伪造结构或调用模型来掩盖损坏。

## 提交与幂等

正式链路固定为 `evaluation → proposal → commit → verification`。AI 负责语义评估、方案和复核；Runtime 负责归属、版本、保护范围、引用完整性、patch 应用、事务、幂等和租约。Prompt 不能宣称内容已经提交。

每个持久化意图携带客户端首次生成的 `operationId`。服务端按 `{targetType, targetId, operationType, operationId}` 保存 canonical request hash：

- 相同 operationId 与相同请求返回原 operation/receipt，不重复调用模型、递增版本、写快照或派发索引。
- 相同 operationId 与不同请求返回确定冲突，零业务写入。
- 响应丢失后先查询服务端 operation/commit receipt；只有确认没有提交结果时才允许按原 operationId 与 CAS 重试。

commit 必须在一个事务中完成 ownership、proposal 状态、`contentRevision`、`decisionRevision`、保护范围和引用完整性校验，再写完整 aggregate、兼容投影、新 revision、before/after 证据、commit receipt 与 `committed_pending_verification`。任一校验失败整笔零内容写入。

世界样本安全提交的运行时门面固定接收完整且已验证的 aggregate、`expectedContentRevision`、`expectedDecisionRevision` 与 `operationId`，通过 CAS 在同一事务内写入内容、兼容投影、revision、operation 和 receipt。相同 operation 重放原 receipt，不重复递增或派发索引；revision 冲突、缺少版本或 operation hash 复用冲突均在内容写入前结束。该边界将作者内容保护与后续旧写入口收敛分开，避免新安全入口静默改变既有编辑语义。

### 首批世界写入口：updateWorld 与 updateAxioms

R1-S2G 的首批生产接线只覆盖 `WorldService.updateWorld` 的既有 HTTP/API 兼容路径和世界来源页的 `updateAxioms` 公理保存。两条路径都必须先构造完整 candidate aggregate，再调用同一 CAS/operation/receipt 门面；客户端或路由不得复制 revision 比较、幂等去重或 receipt 持久化。

- 请求可为了旧客户端解析而接受缺失的 `expectedContentRevision` 或 `operationId`，但业务层必须在任何读后写前拒绝，返回 HTTP `428` 与 `REVISION_REQUIRED`，且零 World、revision、operation、receipt、snapshot 和 RAG 写入。
- 过期 `expectedContentRevision` 返回 HTTP `409` 与 `CONTENT_REVISION_CONFLICT`；相同 `operationId` 搭配不同 request hash 返回 HTTP `409` 与 `OPERATION_ID_REUSED`。拒绝不能覆盖后来作者内容。
- 相同 `operationId` 与相同 request hash 的重试返回原结果/receipt，不重复递增 `contentRevision`，也不重复派发提交副作用。公理来源页在网络超时、未知响应或既有重试动作中复用同一 operationId；不能用新 ID 绕过冲突。
- 服务器成功保存后，即使 RAG enqueue 失败，也保留已保存 World 与 revision，并把资料债交给既有恢复机制；不能回滚内容或创建第二次提交。

这不是所有世界写入口的收敛：结构手动保存由后续独立合同接入；结构生成/补全、分层/深化/导入/素材/快照/整理、提案/评估/同步、批量历史修复和新普通编辑 UI 均不在首批范围，继续进入 Refinement/后续 Story。运行记录仍然只读，恢复、重试和保存动作仍回到来源页完成。

### 结构手动保存的来源页与快照边界

既有 `PUT /worlds/:id/structure` 与世界手册、高级结构视图共用一次保存意图：提交时冻结结构、使用建议、`operationId` 和预期内容版本；网络结果未知只重试同一意图。原始结构的引用必须先校验，不能先归一化并静默删掉悬空关系。维护门面生成兼容投影时要使用候选中已验证的使用建议，不能用默认建议覆盖作者提交值；内容、投影、revision 和 receipt 保持同一 CAS 事务。结构生成、AI 补全和其他旧写入口仍须分别收敛，不能把本路径的保护视为全世界写入已安全。

同一操作重放只确认旧 receipt，不保证那次操作的结构仍是当前世界内容。来源页必须重新读取当前世界，并仅在结果与服务器持久化结构匹配时采用；重放后的单次同步结束后恢复脏草稿保护。冲突或结果未知时保留当前视图草稿，后台刷新不能隐式替换；作者可在来源页明确选择放弃草稿并读取已保存内容。切换世界或后发起的重读会使旧回包失效，避免旧世界结果清除新世界的保存状态。此规则只覆盖当前挂载视图，不建立跨手册/高级视图的草稿仓库。

`structure-saved` 快照不属于 CAS 事务：只在首次 committed 后尝试，失败时内容与 receipt 仍成功，来源页说明历史快照未完成；重放既不补建也不声称快照存在。响应中的 `created`、`failed`、`unknown` 只表明这次调用可证明的快照状态，不能据此推断全局快照历史。RAG 失败继续作为资料债处理，不回滚已保存内容。

### AI 结构补全的生成事实与费用边界

手动结构 PUT 的 operation/receipt 只能证明内容提交，不能证明 AI 已调用或找回生成结果。当前 `POST /worlds/:id/structure/backfill` 仍是模型输出后直接更新 `World` 的旧路径，尚未接入以下合同；不能把隔离原型或通用模型 attempt 记录解释为生产幂等保证。后续生产接线须以 [S3-02b3s Spike 决策](../../plans/s3-02b3s-structure-backfill-idempotency-spike.md) 和独立实施卡验收。

一次 AI 补全意图由来源页生成稳定 `operationId`，请求身份绑定世界、基线 `contentRevision`、来源内容 digest、Prompt ID/版本、有效 provider/model 与生成策略版本；相同 operation 搭配不同意图必须在模型调用与世界写入前拒绝。只有持久化 claim 的唯一 owner 能在供应商调用前推进 `model_not_called → model_in_flight`。从进入 `model_in_flight` 起，进程重启、超时和 lease 到期都不能证明供应商未调用；未知结果进入 `model_unknown`，同一 operation 禁止自动再次发起付费调用。这里限制的是本系统对同一 operation 的发起次数，不承诺第三方 exactly-once 计费。

模型成功后的归一化结构必须先以独立 result record 持久化，并绑定原 request hash 与基线 revision；通用 attempt 只记录调用证据，不能当作 result store。提交时以该基线 revision 做 CAS，首次成功在同一事务内写世界内容、兼容投影、新 revision、operation 与 commit receipt。生成期间作者修改了世界时，旧结果保留为未保存候选，世界内容零覆盖；不得自动套用到最新 revision。receipt 证明“已保存”，result record 才能找回“生成了什么”。提交后 HTTP 响应丢失先按 operation 读回两种事实，不重新调用模型或再次提交。

来源页须区分生成中、已生成但未保存、已保存、冲突保留和模型状态待确认；未知调用、冲突或确定失败后的新生成只能由作者显式创建新 operation。运行记录仍只读。快照与 RAG 属提交后的派生结果，失败不应把已保存世界误报为未保存，也不能把索引或快照记录当作生成结果仓库。SQLite/PostgreSQL 的最小 owned store 与迁移由后续实施卡负责，不能因这段设计规则而声称当前 backfill 已完成保护。

本机 SQLite runtime migration 是安全提交可运行的必要条件；PostgreSQL apply 属 Release gate，在发布组合验证时单独执行，不把发布环境尚未 apply 混同为本地提交合同失败。两套 schema 仍须保持可验证的一致性，且任何迁移演练都只使用隔离数据库。

引用校验必须发生在任何会丢弃无效引用的 normalization 之前。分区同步若会破坏跨分区引用，应返回最小依赖分区供作者重新确认，不能自动扩大用户选择，也不能把过滤后的结构当作修复成功。

## 复核与恢复

commit 成功后内容已经保存；AI 复核和索引失败都不得回滚内容：

- `verified`：复核完整且没有残留问题。
- `verified_with_findings`：复核完整但仍有风险；风险成为后续提案输入，不阻断整本小说。
- `verification_incomplete`：模型、Schema、传输或持久化导致复核未完成；来源页显示“内容已保存，复核未完成”，并允许继续同一 commit 的复核。
- `indexDebt`：资料索引未完成；独立恢复，不伪装成语义复核完成。

每个可执行 run 使用 `leaseOwner + leaseEpoch + leaseExpiresAt` fencing。阶段推进、证据和终态写入必须匹配有效 lease；旧 worker 的晚到结果只能进入调用遥测，不能写 proposal、问题、验证结果或世界内容。

恢复只续未完成工作：commit receipt 已存在时不再应用 patch，verification 只重跑缺失检查，索引只重试债务项。后台扫描不得越过作者等待、拒绝、冲突或过期 proposal。

## Prompt 与 AI-first 边界

世界维护 Prompt 必须位于 `server/src/prompting/prompts/world/maintenance/`，通过 Registry 与 Runner 使用结构化 Schema。现有超长 `world.prompts.ts` 先按 generation、import、visualization、maintenance 责任拆分，并保留兼容导出。

评估、问题身份、提案和复核使用职责单一的资产。模型或 Schema 失败必须返回 incomplete，不能用固定英文正则、关键词、固定问题池或 rule-only pass 伪装语义成功。确定性代码只处理 schema、资源归属、权限与保护、引用存在、版本和事务安全。

当前 `novel.world.generate_from_theme` 的静态 loader key 为 `v2`、资产实际版本为 `v3`；Registry 会在加载时重绑定到实际 key，但这只是运行时容错。扩展 maintenance Prompt 前必须统一静态登记与资产版本，不能依赖自修复掩盖治理漂移。

## UI 与运行记录

世界样本来源路由是 `/worlds/:worldId/workspace`，本书世界来源路由是 `/novels/:novelId/edit?stage=world`。深链接还应携带适用的 tab、run、proposal 或 issue 标识，刷新和浏览器前进后退都按 URL 重新读取服务端投影。

UI 不自行判断 proposal 是否仍可提交，也不把本地 pending 当作幂等事实。query key 必须包含资源与现场身份；资源切换时取消或失效旧查询，慢回包只有在目标与 operation/receipt 同时匹配当前 URL 时才能更新现场。

运行记录只展示状态、错误、恢复位置与来源导航，不提供采用、拒绝、继续复核、重试或撤销等写操作。UI 必须区分“标记已处理”“作者认为不是问题”“保留留白”“复核通过”，不能把这些事件合并成一个“已解决”。

## 旧数据兼容

- 现有 `World.version` 只作为迁移初始下界，不能补造历史每次编辑都已计数的证据。
- S3-03a1 为所有已存在的 `NovelWorld` 行统一初始化 `contentRevision=1`；有无结构都使用同一兼容起点，不用 `0` 暗示可证明的历史状态。
- 旧小说首次 lazy 创建实例时：仅 `worldId`、仅旧切片、两者兼有均从 revision 1 开始，两者皆无则不创建；已有实例不得被重复初始化覆盖。仅有旧 World 扁平字段时保留来源和现有兼容读取，不在迁移中伪造结构 JSON。
- 内容版本递增目前只覆盖 legacy 初始化、世界库导入、主题生成和手动创建/替换。S3-03a2 将切片双读/双写收敛为实例缓存单写与 Gateway 主读，但不接入其他旧内容写入口。同步 pull 的版本/CAS 归 S3-03b；它与其他旧入口完成前不得宣称所有实例内容变化均由 `contentRevision` 捕获。
- 旧 `integrated` 回答、`resolved/ignored` 问题与 consistency report 保留为历史声明，但不补造 verifiedAt、输入版本或当前通过证据。
- 旧同步记录可读，但 revision 与 operation 身份为 unknown；下一次同步必须重新 diff 并携双侧 expected revision。
- 快照恢复产生新的当前 revision，不把版本号倒退到快照中的旧值。

所有 schema 改动都必须增量覆盖 SQLite、PostgreSQL 和桌面 runtime migration，并只在隔离数据库演练；不得 reset、覆盖或删除用户数据库。

## 常见失败模式

- 把 `updatedAt`、`syncBaseVersion` 或 Story Slice 构建时间当作内容版本。
- 在 request handler 中直接跑完整 AI 链，或用 `void Promise` 假装可恢复后台执行。
- 响应超时后生成新 operationId 再提交，导致同一 patch 重复应用。
- AI 结构补全把模型 attempt 或提交 receipt 当作可恢复生成结果，或在 `model_in_flight` lease 到期后自动再次调用模型。
- 先 normalization 过滤悬空关系，再把结果保存为“修复成功”。
- AI 复核失败时回滚已提交内容，或把局部世界风险升级成整本导演失败。
- 在运行记录加入继续、采用、拒绝、撤销等任务写操作。
- 让旧 worker 在 lease 失效后用晚到响应覆盖新现场。
- 用固定词表或正则替代世界语义评估与问题分类。

## 相关模块与来源

- [S1-06 完整合同与审阅记录](../../plans/s1-06-world-maintenance-recovery-contract.md)
- [S3-02b1 世界编辑与公理保存 CAS 合同](../../plans/s3-02b1-world-edit-axiom-cas-contract.md)
- [世界上下文门面](../architecture/world-context-gateway.md)
- [Prompt Registry 与结构化输出](../prompts/prompt-registry-and-structured-output.md)
- [运行记录产品边界](../product/task-center-role.md)
- `server/src/services/world/`
- `server/src/services/novel/worldContext/`
- `server/src/prompting/prompts/world/`
