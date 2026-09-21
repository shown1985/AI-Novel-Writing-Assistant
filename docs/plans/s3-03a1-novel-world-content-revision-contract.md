# S3-03a1：本书世界实例内容版本与兼容迁移合同

## Story 身份

- Release / Epic：Release 1 / S3 可信世界
- 点数：5
- 状态：Ready（PO/QC 已确认 DoR；已进入 R1-S3A 承诺，实施未开始）
- 用户价值：作者修改本书世界时，系统能区分本书实例内容版本与世界库样本版本；旧作品升级后仍能安全读取，不会把缓存刷新或来源样本更新误报为本书修改。
- 依赖：S1-06 已冻结内容版本与兼容原则；S3-02a 已完成 `World.contentRevision` 样本 CAS。a2 依赖本卡完成；S3-03b 不属于本卡依赖或范围。

## 当前证据与阶段边界

当前 `NovelWorld` 没有独立 `contentRevision`，只有 `syncBaseVersion`；`World.contentRevision` 不能复用为本书实例版本。PostgreSQL 与 SQLite 的 `20260529120000_novel_world_instance` migration 也没有该字段。

本卡只覆盖四个已存在的实例写入口：`ensureFromLegacyNovel`、`importFromWorldLibrary`、`generateFromNovelTheme`、`createManualNovelWorld`。当前没有独立的实例编辑 API，不能把原 S3-02b 的旧入口视为本卡入口。导入、生成、手动创建显式替换已有实例时，实例内容与版本在原事务内一起更新；lazy 初始化的 `ON CONFLICT DO NOTHING` 保持幂等，不覆盖已有实例。

四类旧数据的兼容下限按现有初始化行为冻结：仅 `Novel.worldId` 时复制关联 `World` 已有的可空结构 JSON，并保留 `sourceWorldId` 与旧世界读取路径；仅旧 `storyWorldSlice*` 时建立无结构的 manual 实例并保留切片；两者兼有时复制已有可空结构 JSON 且保留旧切片与世界引用；两者皆无时不创建实例。旧 `World` 可能仅有扁平字段，a1 不把它们合成或回填为新结构。前三类首次创建的 `contentRevision=1`；已有 `NovelWorld` 历史行迁移后以 `1` 为兼容起点，后续 lazy 读取不回填覆盖。旧字段均保留，不做清理或推测性重建。

这是阶段性版本覆盖，不是全系统写入收敛：现有 `NovelWorldSyncService.syncWithLibrary` 的 pull 会修改实例结构，归 `S3-03b` 接入版本/CAS；push 的样本版本保护也由该卡处理。`NovelWorldSliceService` 当前双读/双写旧 `Novel` 切片，`WorldContextGateway` 仍沿现有读取；切片停止兼容读取与失效消费归 `S3-03a2`。在这两卡完成前，不得声称所有实例内容变更都由 `contentRevision` 捕获。

## 范围

- 在 `NovelWorld` 增加独立实例 `contentRevision`，与 `syncBaseVersion`、`World.version`、`World.contentRevision` 分离。
- 为 PostgreSQL 与 SQLite 增加同等增量 migration；历史行按冻结的兼容下限初始化，不删除旧字段。
- 为下列已存在写路径接入实例版本初始化/递增与事务边界：
  - `NovelWorldInstanceService.ensureFromLegacyNovel`
  - `NovelWorldInstanceService.importFromWorldLibrary`
  - `NovelWorldInstanceService.generateFromNovelTheme`
  - `NovelWorldManualService.createManualNovelWorld`
- 明确实例内容变更与缓存/状态读取的分类；为 a2 输出稳定的版本字段和失效输入契约。
- `NovelWorldLibrarySaveService.saveNovelWorldToLibrary` 只改变外部样本关联与同步元数据，不修改本书实例结构，不增加本地 `contentRevision`。

## 非范围

- `NovelWorldSyncService` 双侧同步、同步历史和引用完整性；归 S3-03b。
- 原 S3-02b 剩余世界旧写入口、普通编辑新 UI、提案、评估、作者决定、章节新事实回写。
- 新的安全体系、全局回滚、批量历史修复、第二套世界上下文源。

## 权威源与兼容停止条件

- `NovelWorld.contentRevision` 是本卡四个写入口的本书实例内容版本权威源；S3-03b 完成前，同步 pull 是明确未覆盖入口，不得用该字段单独判断它造成的变化。
- `World.contentRevision` 仅表示外部世界样本内容版本；`syncBaseVersion` 仅表示同步基线，不得作为实例修改版本。
- `NovelWorld.structuredDataJson`、`bindingContractJson`、标题/摘要等本书实例内容由实例版本保护；`storySlice*`、digest、builtAt、override 仅是缓存/派生状态。
- 旧 `Novel.storyWorldSlice*` 在 a1 继续按现有规则兼容读取/过渡写入，但从不充当实例内容版本。S3-03a2 负责将主读取和失效判断切到 `NovelWorld`，成功初始化后停止把旧字段当作并行事实源；a1 不提前修改 Slice/Gateway。
- a1 只向内部 `NovelWorldInstanceRow`/服务投影提供 `contentRevision` 供 a2 消费，不扩大 shared public DTO 或新增 UI；a2 的失效判断还须考虑来源/同步基线与 `storySliceDigest`，不能仅看 a1 的本地版本。

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

1. `NovelWorld.contentRevision` 在两套 Prisma schema 中存在，新建与已有历史实例的兼容起点均为 `1`；`syncBaseVersion` 与样本 `World.contentRevision` 不被替代。
2. 导入、主题生成、手动创建新实例时版本为 `1`；显式替换已有实例时 `1→2` 且每次成功内容替换只递增一次，不被 upsert 的 INSERT 默认值重置。legacy lazy 初始化首次为 `1`，重复执行保持原版本且不丢失旧结构或切片来源。
3. 每个纳入范围的实例内容写入与版本更新在同一事务边界内；任一持久化失败不得留下实例内容已变而版本未变，或版本已变而绑定未完成。
4. 来源世界样本更新不会自动递增本书实例版本；缓存、状态查询和摘要读取不会递增本书实例版本。
5. 旧记录（仅 worldId、仅旧 slice、两者同时存在、无世界）均有可重复的初始化/兼容读取证据；旧 World 仅有扁平字段时结构 JSON 仍可为空并沿用现有兼容读取，不伪造结构。前三类首次建实例为版本 `1`，无世界不建实例，已有实例不被 lazy 初始化覆盖，旧字段保留。
6. 内部版本投影可被 a2 使用；合同明确哪些字段是内容、哪些字段是缓存，并显式记录 sync pull、旧切片双读/双写仍属后续卡，不以 `updatedAt` 或 `syncBaseVersion` 冒充本卡的实例版本。

## 最窄验证与缺口

- SQLite 隔离 fixture：四类 legacy 输入（包含 worldId 指向仅有扁平字段的旧 World）、重复 lazy 初始化版本不变、导入/生成/手动创建已有实例的 `1→2` 与事务失败结果。
- PostgreSQL/SQLite schema validate、migration completeness 和新增字段默认值检查。
- 服务端聚焦测试：`NovelWorldInstanceService`、`NovelWorldManualService`、`novelWorldSaveToLibrary` 相关路径；不得写用户桌面库，不得 reset/drop/truncate。
- PostgreSQL apply 仍是 Release gate；本 Story 只要求 schema/migration 可验证，不以 SQLite 结果冒充真实 PostgreSQL apply。

## Definition of Done

- AC1～AC6 有行为级证据；双 schema migration 与旧记录兼容证据齐全。
- a2 所需版本/内容/缓存边界已由根集成人确认；sync pull 与旧切片消费分别留给 S3-03b、S3-03a2，未覆盖的实例编辑入口明确进入后续 Refinement。
- 通过 server build/typecheck、定向测试和 migration completeness；更新相关长期架构 Wiki 的必要性由集成人判断。
- 不包含同步、评估、提案、原 S3-02b 旧入口或过度安全设计；未满足上述 DoR 不得标记 Ready/Done。
