# R1-S1：配置、安全阅读与升级兼容 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S1；一个 1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：先解除 SQLite 升级阻断，再让作者获得可恢复的简易阅读现场和跨世界零误写；同时冻结诊断共享门与世界维护恢复合同，为后续 AI 配置和可信世界闭环解锁。
- 承诺容量：15 点；Stretch：无。
- 容量依据：R1-S0 完成 16 点，但只有一个已完成 Sprint，尚未形成两轮实际速度；本 Sprint 继续低于 25 点上限。
- 产品边界：只做 Release 1 本机 SQLite、阅读、世界与诊断合同；不引入账号、MFA、MySQL、LAN 或真人协作。

## R1-S0 Review 与 Retrospective

### Review

- Sprint Goal：达成。最新 `main` 已对账，R1 仅回环与本地数据边界已冻结，十章确定性基线和 Release 验证矩阵均可执行，首个实施窗口满足 DoR。
- 承诺 / 完成：16 / 16 点；R1-00～04 全部完成；无 carryover。
- 行为证据：R1-01 的服务端边界 6/6、客户端边界 7/7；R1-02 的隔离 SQLite 长链 2/2；R1-03 静态门 `PASS=8 / BLOCKED=3 / REVIEW=1`。
- UI 验收：本 Sprint 未新增交互界面；浏览器、桌面安装包和真实模型验收均未执行，也未据此宣称 Release 1 可发布。
- 发现但未逸出的缺陷：双视觉资产迁移历史、非标准 tag/手动触发可公开发布、公开工作流缺 macOS job；均在发布前被矩阵阻断。

### Retrospective

- 有效做法：长链 fixture 必须声明真实生产边界与 deterministic mock 边界，避免把固定产物误报成公共 idea→导演或真实模型证据。
- 改进 1：每个后续 Sprint 开始时先运行 R1-03 静态门，新增发布阻断必须进入独立 Story，不能夹带进无关功能卡。
- 改进 2：数据库 Story 统一使用隔离临时库和历史副本；测试名称、日志和验收记录必须指出所覆盖的迁移历史。

## 承诺 Backlog

| Story | 点数 | 初始状态 | Owner | 依赖 | 用户结果 |
| --- | ---: | --- | --- | --- | --- |
| R1-MIG01 视觉资产双迁移历史兼容 | 5 | Done | 根数据集成人 | R1-00、R1-03 | [空库、双历史、部分 schema 与 pending record 已通过](./r1-mig01-visual-asset-migration-compatibility.md) |
| S1-00 诊断共享接线与存储契约门 | 2 | Ready | 根集成人 | R1-MIG01 | 后续诊断读取、探测与建议应用只使用一份可持久化、可并发保护的合同 |
| S1-04 简易书架阅读现场恢复 | 3 | Ready | 阅读体验 Agent | 无 | 刷新、前进后退和重新进入作品后继续同章同位置阅读 |
| S1-05 世界问题归属校验 | 2 | Ready | 世界安全 Agent | 无 | 对一个世界的问题操作不能写到另一个世界 |
| S1-06 世界维护与恢复契约 Spike | 3 | Ready | 世界契约 Agent | S1-05 | 后续提案、采用、复核和恢复有可实现的版本与幂等合同 |

未承诺：S1-01 当前是 `Partial`，需把剩余行为重新 refinement 后再估点；S1-02a/02b/03 仍依赖 S1-00 完成；S2-01a/S2-02 虽为 Ready，但不属于本 Sprint Goal。它们不是 Stretch，也不能在本 Sprint “顺手”实现。

## 新增阻断 Story：R1-MIG01

- 用户价值：新安装和从 v0.4.24/v0.4.25 升级的作者都能保留作品并正常启动，不因重复字段或表迁移失败。
- 范围：SQLite 运行时迁移判定、空库迁移完整性测试、宽迁移历史与六个细分迁移历史的兼容 fixture、pending migration record 恢复。
- 非范围：修改用户真实数据库、reset/删库、PostgreSQL/MySQL 重构、备份恢复全流程、其他 schema 清理。
- Owner / 文件边界：根数据集成人独占 `server/src/db/runtimeMigrations.ts`、`server/tests/prismaMigrationCompleteness.test.js`、`server/tests/runtimeMigrations.test.js`；现有迁移 SQL 默认只读，只有证据证明兼容无法在运行门解决时才单独评审变更。
- 依赖：R1-00 的冲突证据与 R1-03 的 R1-D01/D02 门；不得依赖用户库。
- AC：
  1. 空临时 SQLite 经真实运行时迁移入口应用全部目录，最终 schema、索引、完整性和外键一致，所有迁移有完成记录。
  2. “宽迁移已应用、六个细分迁移未记录”与“细分 schema/记录已存在、宽迁移未记录”两条历史都零重复建列/表、零数据丢失。
  3. 部分满足的视觉资产 schema 和未完成 `_prisma_migrations` 记录可恢复；重跑幂等。
  4. 迁移测试验证关键样本行、表/列/索引和迁移记录，不通过删除历史、跳过完整性检查或只改测试预期掩盖冲突。
  5. 不读取、复制、迁移或删除用户真实数据库。
- 最窄验证：先构建 server，再串行运行 `server/tests/prismaMigrationCompleteness.test.js` 与 `server/tests/runtimeMigrations.test.js`；所有数据库均为内存库或临时副本。
- 失败处理：保留第一处失败和 fixture；若必须改变已发布迁移 SQL，停止 Story 并重新 refinement 兼容/校验和策略，不能直接覆盖历史。

## 既有 Story 冻结说明

- S1-00、S1-04、S1-05、S1-06 的用户价值、范围、非范围、AC 和最窄检查由 [Sprint 1 实施卡](./agent-collaboration-sprint-1.md) 与 [R1-00 对账](./r1-00-implementation-reconciliation.md)共同冻结。
- S1-00 的 schema、迁移、共享 DTO、API/query keys 和诊断存储入口只由根集成人修改；执行 Agent 不接触这些共享文件。
- S1-04 独占 `client/src/pages/novels/simpleCreation/` 下的阅读状态能力与行为测试，不改 `NovelEdit.tsx`。
- S1-05 独占 `server/src/services/world/worldImprovementService.ts` 和聚焦测试；不得扩大为世界问题历史或提案系统。
- S1-06 只产出 owned 契约文档/状态图/兼容清单，不写生产 schema、API 或 Prompt；若决策仍不足，返回 Refinement，不能把设计稿标为运行能力。

## 依赖与并行波次

```text
Wave 1
  根数据集成人：R1-MIG01
  阅读体验 Agent：S1-04
  世界安全 Agent：S1-05

Wave 2
  根集成人：S1-00（等待 R1-MIG01）
  世界契约 Agent：S1-06（消费 S1-05 的最终归属边界）
```

- 同一 Agent 同时最多一张 In Progress Story；完成、验证并交回 review 后才能领取下一张。
- 根集成人独占 `TASK.md`、Roadmap、README、Release Notes、Wiki 索引、共享 schema/迁移/types/API 接线与阶段提交。
- Agent 不 commit、不切分支、不修改其他 Owner 文件；越界需求先交给根集成人。
- Sprint 中发现的新范围进入 Backlog；只有根集成人明确交换同点数/更低点数 Story 时才改变承诺。

## 验收顺序与 DoD

1. R1-MIG01 先解除 R1-D01/D02 的当前冲突，再允许 S1-00 增加任何诊断存储迁移。
2. S1-04 与 S1-05 可独立进入 In Review；UI 卡必须记录用户验收状态，代码级检查不能代替交互验收。
3. S1-06 必须基于最终 S1-05 归属边界完成 Runtime/Prompt/UI 三方契约审阅；它不产生虚假的业务 Done。
4. 每张 Story 均需行为级证据、适用失败/重试/并发/恢复检查、Wiki 判断和阶段提交；文档、typecheck 或隐藏按钮不能单独建立业务 Done。
5. Sprint 结束时记录 Goal 结果、承诺/完成点数、carryover、返工/逸出缺陷、UI 验收状态和最多两项流程改进。

R1-S1 完成只代表首个实施窗口通过；仍须经过后续 Sprint、R1-RC、beta 组合验证和用户验收，才能晋级 main 或发布。
