# S3-03a2：本书世界切片缓存与 Gateway 版本消费合同

## Story 身份

- Release / Epic：Release 1 / S3 可信世界
- 点数：5
- 优先级：P0
- 状态：In Review（R1-S3B；AC1～7 已经 Terra QA/QC 复核，等待 beta 组合验证）
- 用户价值：作为作者，我希望刷新或读取世界上下文不会被算作一次创作修改，并且本书世界内容改变后，后续规划、角色和章节生成只使用当前实例对应的切片，从而避免旧设定继续影响正文。
- 依赖：S3-03a1 已 Done 并在 `beta@f96386fd` 通过组合验证；S1-06、S3-02a 的版本/缓存分类已满足。当前同步 pull 未接实例版本/CAS，仍由 S3-03b 收敛；本卡只消费其既有“更新同步基线并清空切片”结果。

## DoR 结论与实施前基线

本卡的前置阻断已解除，但不能按原 3 点直接实施。代码审计确认：

- `NovelWorldSliceService` 当前以 `updatedAt` 与 `StoryWorldSlice.metadata.sourceWorldUpdatedAt` 判断内容变化，同时把 `Novel.storyWorldSlice*` 与 `NovelWorld.storySlice*` 作为双读/双写来源。
- `WorldContextGateway` 先执行 `ensureFromLegacyNovel`，切片 service 已持久化后又调用 `NovelWorldInstanceService.persistStorySlice`，存在重复缓存写入；后一次写还会把 `storySliceDigest` 重新写成单独的 story-input digest。
- `storySliceDigest` 当前只保存 `metadata.storyInputDigest`，尚不能证明切片对应哪个实例内容版本；`contentRevision` 已由 a1 提供给内部实例行，但 Slice service 尚未读取。
- 仅有旧 slice、没有可重建结构的 legacy 作品必须保留可读路径；不能为满足“首次失效”强行调用模型或丢掉仅存的兼容上下文。
- 模型构建期间实例可能被替换；若不校验开始时的版本，晚到切片可能覆盖新版缓存。该竞态直接影响“不得消费旧切片”的用户结果，属于本卡最小正确性边界，不是新增安全体系。

因此估点调整为 5。失效键、legacy 退场、失败、并发和精确返回语义已经独立 QA/QC 复核，Story 已由 Sprint Planning 承诺进入 R1-S3B；实现不得改写下述范围与返回合同。

## 范围

- 让 `NovelWorldSliceService` 的读取、ensure、refresh、override 与缓存持久化以当前 `NovelWorld` 实例为主，停止在实例已存在后继续把 `Novel.storyWorldSlice*` 作为并行切片事实源。
- 将 `storySliceJson`、`storySliceOverridesJson`、`storySliceDigest`、`storySliceBuiltAt` 明确作为派生缓存更新；这些更新不递增 `NovelWorld.contentRevision`，也不修改实例权威结构、来源样本或同步记录。
- 使用下文冻结的缓存指纹判断 freshness；内容版本、同步基线或 story input 改变后，旧 slice 只能作为 stale 观察，不能进入 `WorldContextBlock`。
- 收敛 `WorldContextGateway.getWorldContextBlock` 与 `hasActiveWorld` 的实例读取顺序，保留 `outline`、`character`、`chapter`、`bible`、`optimize` 五种 purpose 和既有 `WorldContextBlock` 输出结构。
- 去掉 Gateway 对同一切片的重复持久化；缓存只由 Slice service 对 `NovelWorld` 执行一次条件更新，不再更新 `Novel.storyWorldSlice*`。若构建期间实例版本改变，拒绝晚到缓存写入，不把旧结果标成当前。
- 对四类 a1 legacy 输入执行下文的单向兼容：允许首次创建/归一化，成功后只读 `NovelWorld` 缓存；不删除旧列、不回写或清理历史 `Novel` 字段。

## 非范围

- 世界库与本书世界双侧同步、push/pull、sync record/pending、双侧 CAS；归 S3-03b。
- 原 S3-02b 剩余普通编辑/深化/导入等旧写入口，以及它们的实例版本接线。
- 提案、AI 评估、作者决定、章节新事实写回、RAG/index、任务中心或 UI 改造。
- 改变切片 Prompt、模型/provider 策略、自动重试策略、质量规则、共享 `StoryWorldSlice` DTO/schema、现有方法返回类型或数据库 schema/migration。
- 为缓存引入新表、租约、全局锁、队列或新的安全体系。

## 冻结的失效与兼容规则

### 唯一缓存指纹

- `NovelWorld.contentRevision` 是实例内容版本；`StoryWorldSlice.metadata.storyInputDigest` 继续只表示故事输入，不改变共享 DTO。
- `NovelWorld.storySliceDigest` 改为内部缓存指纹，按固定字段顺序对 `{ novelWorldId, contentRevision, sourceWorldId, syncBaseVersion, storyInputDigest, sliceSchemaVersion }` 计算 SHA-256。空值必须稳定序列化，不使用 `updatedAt`、`storySliceBuiltAt` 或模型配置。
- 当前实例行存在有效 slice，且已存 `storySliceDigest` 与当前指纹完全一致时，才可作为 current。空 digest、旧版单独 story-input digest、版本/来源/同步基线/输入任一不符，均为 stale。
- S3-03b 前的 sync pull 仍会更新 `syncBaseVersion` 并清空实例 slice；两者任一变化都会令旧缓存不可用。本卡不得修改 sync service，也不得把此阶段兼容解释为同步 CAS 已完成。
- `StoryWorldSlice.worldId` 保持既有共享 DTO 的必填字符串语义，不承载实例版本：有来源世界时继续写 `sourceWorldId`；无来源的 generated/manual 实例继续使用 `NovelWorld.id`。从旧 slice 兼容接管时保留其中可解析的原值，不改写成 revision 或 digest；实例身份与 freshness 只由内部缓存指纹承担。

### 主读取与 legacy 停止条件

1. `ensureFromLegacyNovel` 返回实例后，Gateway 与 Slice service 只把该 `NovelWorld` 作为实例身份和切片缓存位置；旧 `Novel.storyWorldSlice*` 不再参与常规 fallback 或后续双写。
2. 四格 legacy 矩阵只有以下预期，不允许实现自行增加第五种 fallback：
   - 仅 `worldId`：a1 初始化带 `sourceWorldId` 的实例；a2 可一次性读取所引用 `World` 的现有结构或扁平兼容投影生成 slice，`rawSlice.worldId=sourceWorldId`，只写实例缓存。
   - 仅旧 slice：a1 初始化 manual 实例并把 slice 复制到实例；a2 验证实例中的 slice，保持 `rawSlice.worldId` 原值与其余可见内容不变，仅写内部当前指纹，不调用模型、不再读取旧 `Novel` slice。
   - `worldId + slice`：a1 同时复制来源引用和 slice；旧 digest 视为 stale，a2 使用实例内容或其一次性来源兼容投影重建，成功后 `rawSlice.worldId=sourceWorldId` 并只写实例缓存。模型失败时保留实例中的旧 slice 供检查，但它仍是 stale，不能进入 Gateway 上下文。
   - 两者皆无：`worldId` 与旧 slice 字段均无时不创建实例；仅剩 `storyWorldSliceOverridesJson` 也归此格，偏好字段本身不构成可用世界或第五种切片来源。所有读取/刷新/override 路径按“无世界精确语义”返回且绝对零写入。a1 的独立初始化入口保持原合同，本卡不修改它。
3. 仅旧 slice 的实例是明确兼容终点：有效 raw slice 可继续形成 `WorldContextBlock`，其 `worldId` 只保留历史来源标识，不代表当前 `NovelWorld.id` 或版本；内部指纹把它绑定到当前实例。无法按现有 schema 解析的 JSON 返回不可用，不写指纹、不调用模型。
4. 旧 `Novel` 字段保留供历史兼容/回退检查，但一旦实例初始化成功便不是并行权威源；本卡不做数据清理 migration。

### 无世界精确语义

- `getWorldSliceView`、`refreshWorldSlice`、`updateWorldSliceOverrides` 均返回同一空世界 view：`hasWorld=false`、`worldId/worldName/slice/storyInputSource=null`、`overrides={}`、三个 available 列表为空、`isStale=false`。
- `ensureStoryWorldSlice` 返回 `null`；Gateway 的 `hasActiveWorld` 返回 `false`，normal 与 `forceRefresh` 的 `getWorldContextBlock` 都返回 `null`。
- 上述路径不得创建 `NovelWorld`，不得写 `Novel` 或 `NovelWorld`，不得保存调用参数中的 override，也不得调用模型。只有 `worldId` 或旧 slice 字段属于四格矩阵前三类时，a2 才可调用既有 `ensureFromLegacyNovel` 创建一次实例；旧 slice JSON 损坏仍按不可用处理，不标 current。仅剩 overrides 和真正全空都必须在 a2 路径绝对零写入。

## 失败、并发与恢复语义

- stale slice 重建的模型调用失败时，方法沿既有异常路径失败，实例内原 slice、digest、builtAt 和 overrides 全部保持原值；本次显式 refresh/override 请求中的新 overrides 不得先行保存。Gateway 不捕获后组装旧 slice，普通 ensure 不新增隐藏模型重试循环。
- 构建开始时冻结 `{ novelWorldId, contentRevision, sourceWorldId, syncBaseVersion, storyInputDigest }`；缓存提交以这些输入为条件，只用一次 SQL 更新同一 `NovelWorld` 行的 slice JSON、overrides、schemaVersion、builtAt 与 digest。零命中不得再写 `Novel` 或无条件补写实例，也不得保存本次新 overrides。
- `ensureStoryWorldSlice` 条件写零命中时只允许一次只读重读：若最新实例已有与调用方 story input 对应且指纹匹配的 current slice，则返回该 slice；否则返回 `null`。不得返回本次晚到 candidate 或旧 stale slice。
- `refreshWorldSlice` 条件写零命中时只允许一次只读重读并返回现有 `StoryWorldSliceView`：最新缓存匹配当前输入则 `isStale=false`；否则保留最新已存 slice 供检查并标 `isStale=true`，或在无 slice 时返回 `slice=null/isStale=true`。返回 view 不代表本次 candidate 已采用。
- Gateway normal 路径收到 ensure 的 `null` 时返回 `null`；`forceRefresh` 路径只有在 refresh view 的 `slice` 非空且 `isStale=false` 时才组装 `WorldContextBlock`，否则返回 `null`。两条路径均不得调用 `persistStorySlice` 补写或组装 stale candidate。
- 相同输入的重复 ensure 在已有 current 缓存时不调用模型、不重复写缓存；本卡不承诺跨进程 single-flight，也不增加分布式锁。
- 缓存写入只更新派生字段；SQL/事务失败沿既有异常路径失败并保持原 slice、digest、builtAt、overrides，不得留下 `storySliceDigest` 已指向新输入而 `storySliceJson` 仍是旧内容的半状态。

## Owner 与文件边界

- Runtime Agent 单 owner：
  - `server/src/services/novel/storyWorldSlice/NovelWorldSliceService.ts`
  - `server/src/services/novel/storyWorldSlice/storyWorldSlicePersistence.ts`（仅确定性指纹/legacy slice 归一化所需）
  - `server/src/services/novel/worldContext/WorldContextGateway.ts`
- 测试 owner 与 Runtime owner 为同一 Agent，可新增 `server/tests/novelWorldSliceRevision.test.js`，并调整 `server/tests/worldContextGateway.test.js`、`server/tests/storyWorldSlice.test.js`；不得扩展到 UI 或全局任务链。
- 根集成人只负责计划/验收与 beta 组合验证，不与 Runtime owner 并发修改上述生产文件。
- 不修改 `shared/types/storyWorldSlice.ts`、`novelWorldProjection.ts`、`NovelWorldInstanceService.ts`、schema/migration、`NovelWorldSyncService.ts`、同步 routes、评估/提案模块或原 S3-02b 剩余入口。若实现证明必须越过该边界，Story 返回 Refinement，不得顺手扩围。

## 验收标准

1. refresh、ensure、状态读取和 override 更新前后，实例 `contentRevision` 保持不变；切片 JSON、builtAt、override 与 digest 作为一组更新，不出现 digest/JSON 半状态。
2. 相同实例版本与故事输入重复 ensure 复用 current slice；`contentRevision`、`sourceWorldId`、`syncBaseVersion` 或故事输入任一改变，旧 slice 均 stale，Gateway 不将其组装为当前上下文。
3. 构建期间实例从 revision 1 变为 2 时，revision 1 的晚到结果不能覆盖或被标记为 revision 2 的 current cache；ensure、refresh view、Gateway normal/forceRefresh 分别遵守已冻结的重读、stale 标记、`null` 与不组装语义。
4. Gateway 的五种 purpose 都从当前 `NovelWorld` 实例取得同一版本的 slice，并继续输出既有 `WorldContextBlock` 结构；无世界时所有 GET/refresh/override/Gateway 路径返回冻结的空结果且绝对零写入、零建实例、零模型调用。
5. 四类 legacy fixture 严格对应唯一矩阵：有可重建内容的旧 slice 首次失效并重建；仅 slice 的有效记录保留 raw 内容和 `worldId`、只补内部指纹且不调用模型；无效 JSON 不标 current；初始化成功后不再读取/双写旧 `Novel` 切片字段。
6. Slice service 每次成功 rebuild 只执行一次缓存提交；Gateway 不再重复调用实例 service 持久化同一 slice。读取与缓存写入不触发世界样本同步、评估、提案或其他创作任务。
7. 模型失败、无效 legacy JSON、条件写零命中或 SQL 失败都不删除当前实例、不递增内容版本、不提前保存新 overrides，也不把 stale/损坏切片作为 current 返回。

## 最窄验证

- 新增隔离 SQLite 行为 fixture：缓存写前后 revision 不变、指纹命中复用、内容/同步基线/story input 失效、晚到构建拒写、写入失败无 digest/JSON/override 半状态。
- 条件写零命中矩阵：ensure 返回最新 current 或 `null`；refresh 返回最新 current view 或 stale view；Gateway normal/forceRefresh 仅组装 current；四条路径均不补写。
- legacy 四格唯一矩阵：仅 `worldId`、仅旧 slice、两者同时存在、两者皆无；覆盖 raw `worldId` 值、重复读取、首次重建/补指纹、无模型调用分支、无效 JSON 和停止旧字段双写。另测无世界 GET/refresh/override/Gateway 的精确空结果及零写入。
- `worldContextGateway.test.js`：五种 purpose、单次缓存提交、stale 不组装；`storyWorldSlice.test.js`：固定指纹与 raw slice 兼容；a1 的 `novelWorldContentRevision.test.js` 作为内容版本/缓存不递增回归。
- `pnpm --filter @ai-novel/shared build`、`pnpm --filter @ai-novel/server build` 与上述聚焦测试；不运行全量 UI/浏览器验证，本卡无新增用户界面，UI 验收不适用。
- 不新增 migration；复用 a1 已通过的双 schema/migration 证据。真实 PostgreSQL apply 继续是 Release gate，SQLite 结果不能代替。

## Definition of Done

- AC1～AC7 有行为级证据，且 beta 组合验证通过；阶段提交只包含本 Story 范围。
- `NovelWorld` 主读、唯一缓存指纹、legacy 退场、失败保留和晚到结果拒写均有隔离 fixture 结果。
- 不引入同步实现、评估/提案、原 S3-02b 旧入口、UI、schema/migration 或过度安全设计。
- 本卡澄清了稳定的切片 freshness/legacy 规则，完成时应更新世界维护恢复 Wiki；它没有新增用户入口，README/release notes 默认跳过，除非实现产生额外可见行为。
- 本卡已通过 DoR 并进入 R1-S3B；AC、QA/QC 与 Wiki 已完成，阶段提交和 beta 组合验证仍须通过后才能标记 Done。本卡进入实施不代表 Release 1 已完成。
