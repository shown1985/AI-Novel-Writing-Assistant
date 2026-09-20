# S3-03a1：本书世界实例内容版本与兼容迁移合同

## Story 身份

- Release / Epic：Release 1 / S3 可信世界
- 点数：5
- 状态：Refinement（Not Ready）
- 用户价值：作者修改本书世界时，系统能区分本书实例内容版本与世界库样本版本；旧作品升级后仍能安全读取，不会把缓存刷新或来源样本更新误报为本书修改。
- 依赖：S1-06 已冻结内容版本与兼容原则；S3-02a 已完成 `World.contentRevision` 样本 CAS。a2 依赖本卡完成；S3-03b 不属于本卡依赖或范围。

## 当前证据与 DoR blocker

当前 `NovelWorld` 没有独立 `contentRevision`，只有 `syncBaseVersion`；`World.contentRevision` 不能复用为本书实例版本。PostgreSQL 与 SQLite 的 `20260529120000_novel_world_instance` migration 也没有该字段。

本卡尚未 Ready，必须先冻结：

1. “实例编辑”当前权威写入口。现有代码明确存在手动创建、世界库导入、主题生成和 `ensureFromLegacyNovel` lazy 初始化，但没有单独的 NovelWorld 实例编辑 API；不得把 S3-02b 剩余旧入口或同步入口默认吸收进来。
2. 旧记录的初始化规则：仅 `Novel.worldId`、仅旧 `storyWorldSlice*`、两者同时存在、无任何世界数据四类输入分别如何初始化版本。
3. `Novel` 旧切片字段与 `NovelWorld` 新字段的权威读取/兼容写入停止条件；不能无限期维护两个可变事实源。

## 范围

- 在 `NovelWorld` 增加独立实例 `contentRevision`，与 `syncBaseVersion`、`World.version`、`World.contentRevision` 分离。
- 为 PostgreSQL 与 SQLite 增加同等增量 migration；历史行按冻结的兼容下限初始化，不删除旧字段。
- 为下列已存在写路径接入实例版本初始化/递增与事务边界：
  - `NovelWorldInstanceService.ensureFromLegacyNovel`
  - `NovelWorldInstanceService.importFromWorldLibrary`
  - `NovelWorldInstanceService.generateFromNovelTheme`
  - `NovelWorldManualService.createManualNovelWorld`
- 明确实例内容变更与缓存/状态读取的分类；为 a2 输出稳定的版本字段和失效输入契约。

## 非范围

- `NovelWorldSyncService` 双侧同步、同步历史和引用完整性；归 S3-03b。
- 原 S3-02b 剩余世界旧写入口、普通编辑新 UI、提案、评估、作者决定、章节新事实回写。
- 新的安全体系、全局回滚、批量历史修复、第二套世界上下文源。

## 权威源与兼容停止条件

- `NovelWorld.contentRevision` 是本书实例内容版本的唯一权威源。
- `World.contentRevision` 仅表示外部世界样本内容版本；`syncBaseVersion` 仅表示同步基线，不得作为实例修改版本。
- `NovelWorld.structuredDataJson`、`bindingContractJson`、标题/摘要等本书实例内容由实例版本保护；`storySlice*`、digest、builtAt、override 仅是缓存/派生状态。
- 旧 `Novel.storyWorldSlice*` 只作为兼容读取/过渡写入来源。停止条件必须写入实现证据：新建/成功 lazy 初始化后，主读取走 `NovelWorld`；旧字段保留但不再单独推进版本。

## Owner 与文件边界

- Runtime Agent 单 owner：
  - `server/src/services/novel/worldContext/NovelWorldInstanceService.ts`
  - `server/src/services/novel/worldContext/NovelWorldManualService.ts`
  - 必要时仅调整 `server/src/services/novel/worldContext/NovelWorldLibrarySaveService.ts` 的版本投影。
- 根集成人独占：
  - `server/src/prisma/schema.prisma`
  - `server/src/prisma/schema.sqlite.prisma`
  - 对应 PostgreSQL/SQLite 增量 migration 与 schema/migration completeness 检查。
- `WorldContextGateway.ts`、`NovelWorldSliceService.ts`、`novelWorldProjection.ts` 不在本卡扩展行为；a2 单 owner 接消费。
- 不修改同步、评估、提案或原 S3-02b 剩余入口。

## 验收标准

1. `NovelWorld.contentRevision` 在两套 Prisma schema 中存在，默认值和历史初始化规则一致；`syncBaseVersion` 与样本 `World.contentRevision` 不被替代。
2. 导入、主题生成、手动创建与 legacy lazy 初始化均能创建/保留实例版本；重复初始化不重复创建、不丢失旧结构或切片来源。
3. 每个纳入范围的实例内容写入与版本更新在同一事务边界内；任一持久化失败不得留下实例内容已变而版本未变，或版本已变而绑定未完成。
4. 来源世界样本更新不会自动递增本书实例版本；缓存、状态查询和摘要读取不会递增本书实例版本。
5. 旧记录（仅 worldId、仅旧 slice、两者同时存在、无世界）均有可重复的兼容读取证据，并保留旧字段。
6. 版本投影可被 a2 使用；合同明确哪些字段是内容、哪些字段是缓存，禁止以 `updatedAt` 或 `syncBaseVersion` 代替实例版本。

## 最窄验证与缺口

- SQLite 隔离 fixture：四类 legacy 输入、重复初始化、导入/生成/手动创建事务失败与版本结果。
- PostgreSQL/SQLite schema validate、migration completeness 和新增字段默认值检查。
- 服务端聚焦测试：`NovelWorldInstanceService`、`NovelWorldManualService`、`novelWorldSaveToLibrary` 相关路径；不得写用户桌面库，不得 reset/drop/truncate。
- PostgreSQL apply 仍是 Release gate；本 Story 只要求 schema/migration 可验证，不以 SQLite 结果冒充真实 PostgreSQL apply。

## Definition of Done

- AC1～AC6 有行为级证据；双 schema migration 与旧记录兼容证据齐全。
- a2 所需版本/内容/缓存边界已由根集成人确认；未覆盖的实例编辑入口明确进入后续 Refinement。
- 通过 server build/typecheck、定向测试和 migration completeness；更新相关长期架构 Wiki 的必要性由集成人判断。
- 不包含同步、评估、提案、原 S3-02b 旧入口或过度安全设计；未满足上述 DoR 不得标记 Ready/Done。
