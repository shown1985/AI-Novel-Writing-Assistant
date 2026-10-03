# 数据库 Schema 与迁移漂移

## Background

Prisma schema 描述应用当前期望的数据结构，但已安装桌面版和长期运行的服务只能通过迁移目录逐步得到该结构。如果功能只更新 `schema.prisma` / `schema.sqlite.prisma`，没有同步 PostgreSQL 与 SQLite 迁移，类型检查和 Prisma Client 生成仍可能通过，运行时却会因缺表或缺列失败。

这类故障尤其容易出现在跨模块读取中：项目级视觉资源目录会同时读取图片、漫画和短剧来源，其中任一来源的表结构缺失都会让整次目录刷新失败。它不是页面容错问题，必须在数据库迁移层修复。

## Decision

数据库结构变更必须同时维护以下三个事实源：

- `server/src/prisma/schema.prisma`：PostgreSQL 当前结构。
- `server/src/prisma/schema.sqlite.prisma`：SQLite 当前结构。
- `server/src/prisma/migrations/` 与 `server/src/prisma/migrations.sqlite/`：从历史版本升级到当前结构的路径。

补漏迁移应保持增量，不重建业务表、不删除字段、不覆盖已有内容。多个可能被用户手工补齐的对象应拆成可独立判定的迁移单元，避免一个重复字段阻断其余缺失对象的修复。

## Current Rule

- 新增或修改 Prisma model 时，必须在同一开发阶段同步两种 schema 和对应数据库迁移。
- SQLite 桌面运行时依赖迁移 SQL 中的 `CREATE TABLE`、`CREATE INDEX` 和 `ALTER TABLE ... ADD COLUMN` 结构判断迁移是否已满足；补漏迁移应保持这些语句可识别。
- 一条兼容迁移只负责一个可独立存在的字段，或一张表及其索引。不要把多张表和多个字段塞进同一条补漏迁移。
- 发布前至少验证三种状态：从空库执行全部迁移、从上一发布版本升级、部分对象已存在而其余对象仍缺失。
- 合并长期分支前必须比较两侧新增迁移实际创建的表、字段和索引，而不能只比较目录名。若不同迁移 ID 覆盖同一对象，应把它视为迁移历史分叉：保留所有可能已经发布的历史记录，单独设计兼容方案，并分别验证“只应用左侧历史”“只应用右侧历史”“空库应用合流历史”和“部分对象已存在”四类 fixture。
- 已发布的复合迁移与后续细分修复迁移同时存在时，不改写或删除任一历史 SQL。空库完整性测试必须调用与桌面启动相同的运行时迁移入口；若复合迁移只完成一部分，运行器可在明确登记该历史后，让后续逐对象修复迁移补齐剩余结构。此兼容只适用于有明确细分修复集合和双历史 fixture 的迁移，不能作为跳过任意失败 SQL 的通用规则。
- 迁移验证必须检查目标表、字段、索引、已有行保留情况，以及 SQLite 的 `integrity_check` 和 `foreign_key_check`。
- 在临时库上应用迁移的测试夹具必须按真实升级顺序执行：先应用排序在被测迁移之前的迁移，再执行被测迁移并完成其断言，最后应用排序在其后的迁移。不能用“除被测迁移外全部先跑”：之后任何对被测迁移所建表执行 `ALTER TABLE` 的迁移都会在表存在前运行而失败，而漏掉后续迁移又会让按当前 schema 生成的 Prisma Client 读到缺列。
- SQLite 迁移完整性测试必须确认全部 Prisma model、表和字段都存在于迁移重建结果中，不能只维护当前故障对象的固定清单；历史增量迁移留下的旧表或旧字段不视为缺失故障。
- 桌面发布流程必须运行迁移回归测试，并逐条确认 `migrations.sqlite` 中的源码迁移已进入最终 `app.asar`；仅检查 PostgreSQL 迁移目录或任意迁移文件存在不足以证明桌面升级安全。
- 业务读取层不得用捕获 `P2021` / `P2022` 后忽略某个来源的方式掩盖迁移缺失；否则用户会得到不完整资源而数据库问题继续扩散。

## Examples

如果一次功能新增 `ComicCharacter.gender`、`ComicScene` 和 `ComicCharacterAsset`，推荐分别建立字段迁移和两张表迁移。这样某个用户曾手工加入 `gender` 时，桌面运行时可以只记录该字段迁移已满足，再继续创建两张缺失表。

如果从全部 SQLite 迁移重建出的数据库缺少 schema 已声明的 model 或字段，即使 Prisma schema 校验和 TypeScript 构建通过，也必须视为发布阻断。

## Failure Modes

- 只运行 `prisma validate`：它验证 schema 自身合法性，不证明迁移能够得到该结构。
- 只测试全新开发库：开发库可能经过 `db push` 或手工操作，无法代表安装包从迁移重建的结果。
- 只检查源码迁移目录：部署或打包规则仍可能漏掉新增迁移，必须核对最终产物中的 SQLite 迁移集合。
- 把多个补漏对象放进单条 SQLite 迁移：部分对象已存在时，首个重复列会回滚整条迁移。
- 仅靠 Git 自动合并迁移目录：不同分支可分别用复合迁移和细分迁移创建同一列；文件层面无冲突，空库或升级时却会因重复列失败。
- 完整性测试直接顺序执行原始 SQL，而桌面启动使用“已满足即登记”的运行器：两条路径会给同一迁移历史相反结论。应共享运行时迁移入口，再用 schema/索引/数据与迁移记录断言结果。
- 只补 SQLite：服务端 PostgreSQL 部署会继续漂移。
- 迁移夹具“排除自身、其余先跑”：新增迁移若 `ALTER` 该夹具的表，旧测试会报 `no such table`；这是夹具顺序错误，不是新迁移错误，应改为真实升级顺序。
- 在读取层忽略缺表异常：表面恢复页面，但会隐藏数据不完整并扩大后续诊断成本。

## Related Modules

- `server/src/prisma/schema.prisma`
- `server/src/prisma/schema.sqlite.prisma`
- `server/src/prisma/migrations/`
- `server/src/prisma/migrations.sqlite/`
- `server/src/db/runtimeMigrations.ts`
- `server/tests/runtimeMigrations.test.js`
- `server/tests/prismaMigrationCompleteness.test.js`

## Source Documents

- [项目级视觉资源目录](../architecture/visual-asset-catalog.md)
- [重复故障模式与排查路径](./recurring-failure-modes.md)
