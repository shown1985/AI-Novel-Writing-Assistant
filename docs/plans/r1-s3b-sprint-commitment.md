# R1-S3B Sprint 承诺：世界切片版本消费

## Sprint Goal 与承诺

世界切片只对应当前本书世界实例版本；刷新缓存不会被计为内容修改，旧切片、失败或晚到模型结果不会进入后续规划、角色与章节生成上下文。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@24f34333`；DoR 在 `codex/r1-s3a2-refinement` 经 PO、Scrum Master、Terra QA/QC 复核。
- 承诺：仅 [S3-03a2 切片缓存与 Gateway 版本消费](./s3-03a2-world-slice-revision-consumption-contract.md)，5 点；Stretch：无。
- 当前状态：Done；承诺/完成 `5/5`，无 carryover。
- 容量：单卡 5 点，不把同步、其他旧写入口、UI 或发布门算作本 Sprint 产出。

## 依赖、Owner 与顺序

- S3-03a1 已 Done 并通过 beta 组合验证；a2 的缓存指纹、精确返回、legacy 四格与失败边界已经独立 DoR 复核。
- 单一 Luna xhigh Runtime 全栈 Agent 独占 `NovelWorldSliceService.ts`、`WorldContextGateway.ts`、必要的 `storyWorldSlicePersistence.ts` 与本 Story 聚焦测试；一次只做本 Story。
- 根 PM 负责计划、范围门、阶段提交与 beta 集成，不与 Runtime owner 并发修改生产文件。Terra medium QA 逐项验收 AC1～7，Terra medium QC 独立挑战实现、范围和证据。
- 不使用用户真实数据库；SQLite 行为验证只能使用内存或隔离 fixture。不得执行 reset、drop、truncate 或真实库升级。

## 验收与退出门

1. 唯一内部缓存指纹、相同输入复用、内容/同步基线/story input 失效与 revision 变化后的晚到结果拒写均有行为证据。
2. 四类 legacy 输入、无世界 GET/refresh/override/Gateway 零写入、无效 JSON、模型/SQL 失败和 override 保持均符合 Story 精确语义。
3. Slice service 是唯一实例缓存 writer，Gateway 不重复持久化；五种 purpose 只组装 current slice，公开 DTO 与方法返回类型不扩张。
4. shared/server build、定向 SQLite fixture、Gateway/Slice 测试和 a1 回归通过；本卡无 UI，UI 验收不适用。功能分支合入 beta 后再做组合验证，不直接晋级 main。
5. QA/QC PASS；稳定的 freshness/legacy 规则更新到世界维护恢复 Wiki；提交范围仅包含本 Story。

## 明确不承诺

- S3-03b 世界库与本书世界同步、双侧 CAS、push/pull 或同步记录。
- 原 S3-02b 剩余旧写入口、评估、提案、作者决定、章节新事实回写或 RAG/index。
- shared `StoryWorldSlice` DTO/schema、数据库 schema/migration、新接口、UI、任务中心或模型/provider 策略。
- 新表、租约、全局锁、队列、新安全体系、真实 PostgreSQL apply、桌面包装、公开发布或 Release 2。

## Review 与 Retrospective 出口

- Review：Sprint Goal 达成；AC1～7 已由 Terra QA/QC PASS。隔离 SQLite 覆盖条件写零命中、晚到拒写与失败保留，Gateway 五种 purpose 和 legacy 矩阵通过。`beta@67361baf` 完成 shared/server build、五文件定向检查 `40/40` 与 `git diff --check`。无新增 UI，UI 验收不适用；真实 PostgreSQL apply 仍为 Release gate。S3-03b、原 S3-02b 旧入口和其他非范围均未接入。
- Retrospective：承诺/完成 `5/5`，carryover `0`。QA/QC 曾退回未覆盖的竞态/legacy 分支，并澄清 overrides-only 属无世界。改进：① Planning 时把边缘旧字段放进唯一 legacy 矩阵；②工程初稿即按 AC 配置行为 fixture，不用测试总数代替验收覆盖。
