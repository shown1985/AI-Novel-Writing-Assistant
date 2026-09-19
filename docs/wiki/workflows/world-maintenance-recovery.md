# 世界维护提交与恢复边界

## 背景

世界样本与本书世界已经有结构化内容、同步、快照、深化问答和一致性检查，但这些入口尚未共享统一的内容版本、提交身份与恢复协议。部分旧入口只写扁平字段，部分归一化会过滤悬空引用，一致性检查也会替换旧观察。若直接在此基础上增加“AI 修正并采用”，容易覆盖作者刚保存的内容，或在响应丢失、刷新和服务重启后重复应用同一修改。

本页记录已经签认的长期设计边界。它是后续 S3/S4 实施的约束，不表示 maintenance schema、API、Prompt、worker 或 UI 已经上线。完整评审证据见 [S1-06 合同](../../plans/s1-06-world-maintenance-recovery-contract.md)。

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

## 提交与幂等

正式链路固定为 `evaluation → proposal → commit → verification`。AI 负责语义评估、方案和复核；Runtime 负责归属、版本、保护范围、引用完整性、patch 应用、事务、幂等和租约。Prompt 不能宣称内容已经提交。

每个持久化意图携带客户端首次生成的 `operationId`。服务端按 `{targetType, targetId, operationType, operationId}` 保存 canonical request hash：

- 相同 operationId 与相同请求返回原 operation/receipt，不重复调用模型、递增版本、写快照或派发索引。
- 相同 operationId 与不同请求返回确定冲突，零业务写入。
- 响应丢失后先查询服务端 operation/commit receipt；只有确认没有提交结果时才允许按原 operationId 与 CAS 重试。

commit 必须在一个事务中完成 ownership、proposal 状态、`contentRevision`、`decisionRevision`、保护范围和引用完整性校验，再写完整 aggregate、兼容投影、新 revision、before/after 证据、commit receipt 与 `committed_pending_verification`。任一校验失败整笔零内容写入。

世界样本安全提交的运行时门面固定接收完整且已验证的 aggregate、`expectedContentRevision`、`expectedDecisionRevision` 与 `operationId`，通过 CAS 在同一事务内写入内容、兼容投影、revision、operation 和 receipt。相同 operation 重放原 receipt，不重复递增或派发索引；revision 冲突、缺少版本或 operation hash 复用冲突均在内容写入前结束。该边界将作者内容保护与后续旧写入口收敛分开，避免新安全入口静默改变既有编辑语义。

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
- 有结构的旧 `NovelWorld` 初始化 revision 1，无内容初始化 0；初始化必须幂等。
- 旧 `integrated` 回答、`resolved/ignored` 问题与 consistency report 保留为历史声明，但不补造 verifiedAt、输入版本或当前通过证据。
- 旧同步记录可读，但 revision 与 operation 身份为 unknown；下一次同步必须重新 diff 并携双侧 expected revision。
- 快照恢复产生新的当前 revision，不把版本号倒退到快照中的旧值。

所有 schema 改动都必须增量覆盖 SQLite、PostgreSQL 和桌面 runtime migration，并只在隔离数据库演练；不得 reset、覆盖或删除用户数据库。

## 常见失败模式

- 把 `updatedAt`、`syncBaseVersion` 或 Story Slice 构建时间当作内容版本。
- 在 request handler 中直接跑完整 AI 链，或用 `void Promise` 假装可恢复后台执行。
- 响应超时后生成新 operationId 再提交，导致同一 patch 重复应用。
- 先 normalization 过滤悬空关系，再把结果保存为“修复成功”。
- AI 复核失败时回滚已提交内容，或把局部世界风险升级成整本导演失败。
- 在运行记录加入继续、采用、拒绝、撤销等任务写操作。
- 让旧 worker 在 lease 失效后用晚到响应覆盖新现场。
- 用固定词表或正则替代世界语义评估与问题分类。

## 相关模块与来源

- [S1-06 完整合同与审阅记录](../../plans/s1-06-world-maintenance-recovery-contract.md)
- [世界上下文门面](../architecture/world-context-gateway.md)
- [Prompt Registry 与结构化输出](../prompts/prompt-registry-and-structured-output.md)
- [运行记录产品边界](../product/task-center-role.md)
- `server/src/services/world/`
- `server/src/services/novel/worldContext/`
- `server/src/prompting/prompts/world/`
