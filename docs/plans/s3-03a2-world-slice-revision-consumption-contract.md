# S3-03a2：本书世界切片缓存与 Gateway 版本消费合同

## Story 身份

- Release / Epic：Release 1 / S3 可信世界
- 点数：3
- 状态：Refinement（Not Ready，依赖 S3-03a1）
- 用户价值：作者刷新或阅读世界上下文时，系统不会把缓存动作算成创作修改；本书世界内容改变后，生成链会读取当前实例而不是继续使用旧切片。
- 依赖：S3-03a1 完成并冻结 `NovelWorld.contentRevision`、内容/缓存字段分类、legacy 停止条件和失效输入；S1-06、S3-02a 间接满足。

## 当前 DoR blocker

本卡不能独立 Ready：当前 `NovelWorldSliceService` 同时读写 `Novel.storyWorldSlice*` 与 `NovelWorld.storySlice*`，`WorldContextGateway` 通过 `ensureFromLegacyNovel`、切片 service 和 `persistStorySlice` 串接；在 a1 字段和兼容停止条件冻结前，无法确定唯一失效比较面。另缺少“缓存前后 revision 不变、内容变化后旧 slice 必失效”的行为证据。

## 范围

- 让 `NovelWorldSliceService.persistSlice`、`ensureStoryWorldSlice`、`refreshWorldSlice` 明确把切片 JSON、override、digest、builtAt 作为派生缓存处理，不递增 a1 的实例 `contentRevision`。
- 以 a1 冻结的实例内容版本/来源版本/故事输入 digest 组成失效判断；实例内容改变后旧 slice 不得继续作为当前上下文。
- 让 `WorldContextGateway.getWorldContextBlock`、`hasActiveWorld` 和按 purpose 的上下文组装读取当前 `NovelWorld` 实例；保留 `outline`、`character`、`chapter`、`bible`、`optimize` 五种 purpose。
- 对 legacy 过渡记录沿用 a1 的兼容读取停止条件，不新增第二套世界上下文源。

## 非范围

- 世界库与本书世界双侧同步、push/pull、sync record/pending；归 S3-03b。
- 提案、AI 评估、作者决定、章节新事实写回、普通编辑入口和原 S3-02b 剩余旧入口。
- 改变切片 Prompt、模型策略、质量规则或新增安全体系。

## 权威源与兼容停止条件

- `NovelWorld.contentRevision`（a1）是实例内容变化的失效主依据。
- `storySliceDigest`、`storySliceBuiltAt`、override 和切片 JSON 是派生缓存，不得被视为作者内容版本。
- Gateway 读取必须优先使用 `NovelWorld`；legacy `Novel.storyWorldSlice*` 只在 a1 规定的过渡条件下读取，完成初始化后不再作为并行事实源。

## Owner 与文件边界

- Runtime Agent 单 owner：
  - `server/src/services/novel/storyWorldSlice/NovelWorldSliceService.ts`
  - `server/src/services/novel/worldContext/WorldContextGateway.ts`
  - 必要时 `server/src/services/novel/worldContext/novelWorldProjection.ts` 仅用于稳定投影字段。
- 不修改 schema/migration；不修改 `NovelWorldSyncService.ts`、同步 routes、评估/提案模块或原 S3-02b 剩余入口。
- 测试 owner 仅新增/调整切片与 Gateway 聚焦测试，不扩展 UI 或全局任务链。

## 验收标准

1. 切片刷新、ensure、状态读取、摘要缓存和 override 写入前后，实例 `contentRevision` 保持不变。
2. 实例内容版本改变后，旧 slice 按冻结的版本/来源/digest 规则判定 stale；Gateway 不把旧 slice 组装为当前上下文。
3. Gateway 五种 purpose 均读取当前 `NovelWorld` 内容，并继续输出同一 `WorldContextBlock` 结构；无世界时仍安全返回 `null`。
4. legacy 记录首次读取/初始化后可重复获得同一实例与切片结果；不删除旧字段、不因缓存刷新重复创建实例。
5. 读取与缓存写入不触发世界样本同步、评估、提案或其他创作任务。

## 最窄验证与缺口

- SQLite 隔离 fixture：缓存刷新前后 revision 不变、内容版本变化使 slice stale、Gateway 五种 purpose、legacy 初始化重复读取。
- server build/typecheck 与 `worldContextGateway.test.js`、`storyWorldSlice.test.js`、`novelWorldProjection.test.js` 聚焦行为检查。
- 不新增 migration；a1 的 SQLite migration 验证必须先通过。
- PostgreSQL apply 不是本卡可替代的通过条件，保留为 Release gate；不能以 SQLite 行为结果宣称 PostgreSQL apply 已验证。

## Definition of Done

- a1 已 Done 且版本/兼容合同稳定；AC1～AC5 有行为证据。
- 缓存不递增、旧 slice 失效、Gateway 当前实例消费和 legacy 幂等均有隔离 fixture 结果。
- 不引入同步、评估、提案、旧入口或过度安全设计；未解除依赖不得标记 Ready/Done。
