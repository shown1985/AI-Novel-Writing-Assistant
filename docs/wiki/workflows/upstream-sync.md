# 上游同步流程

## Background

本仓库是长期独立演进的分支（fork），`origin/main` 代表上游发布线。本地 `beta` 承载 Release 1 等独立功能，同时需要周期性吸收上游的模型兼容、稳定性修复和新功能。两条线会同时修改发布说明、Prompt 注册表、模型能力表和数据库迁移，同步时最容易出错的是：历史说明被一侧覆盖、Prompt 版本回退、迁移时间戳交错。

## Decision

- 采用 merge 而非 rebase：保留上游提交原貌，便于下一次同步只处理增量，也便于追溯某个行为来自上游还是本地。
- 同步在从 `beta` 切出的短期分支上完成，验证后再合入 `beta`，遵循正常的 `beta` -> `main` 晋级路径。
- 不重命名上游迁移。迁移目录名就是 `_prisma_migrations` 中的记录键，改名会让已经安装上游版本的数据库重复执行同一迁移。

## Current Rule

- 执行 `git merge origin/main --no-ff`，禁止 force、rebase 或改写任何一侧已发布的提交。
- 冲突处理保留双方意图：
  - `docs/releases/release-notes.md` 按日期标题合并，同日期内容归入同一标题，保留两侧全部历史；`README.md` 只保留最新日期块和完整历史链接。
  - Prompt 加载表保留两侧全部资产；同一资产版本冲突时，以该资产源文件中的 `version` 为准，并检查引用该键的测试，禁止出现重复键。
  - wiki 规则取并集，去掉重复表述。
  - 测试文件冲突时保留两侧用例，不删除任一侧断言。
  - 桌面身份字段（`desktop/package.json` 的 version/productName、builder 的 appId/productName 与发布 owner/repo、更新配置 owner/repo、数据目录名）一律保留本发行版的值，不接受上游值；以 `r1-03-static-gate-audit.cjs --strict` 的 fork 身份 finding 不为 `BLOCKED` 作为合入 `beta` 的前提，见 [R1-G02 合同](../../plans/r1-g02-fork-desktop-identity-contract.md)。
- 迁移时间戳交错（上游新迁移早于本地已有迁移）时：
  - 桌面运行时迁移器 `server/src/db/runtimeMigrations.ts` 按目录名排序、逐条检查是否已记录，未记录的迁移会被补执行，因此可以接受晚到的旧时间戳迁移。
  - 必须用临时 SQLite 文件验证两条路径：全新库执行完整合并迁移集；先执行本地 `beta` 迁移集、再执行合并迁移集的升级库。两者最终 `sqlite_master` 必须一致，并且相对 `schema.sqlite.prisma` 的差异不能比同步前更多。
  - PostgreSQL 迁移至少做静态审查：确认晚到迁移操作的表、索引没有被本地后续迁移修改或删除。
- 验证只使用临时目录中的数据库，不得指向用户数据库，不得执行 `migrate reset`。依赖模型配置的路由测试应使用隔离库运行，不得为了通过测试调用真实模型。

## Failure Modes

- 用一侧版本整体覆盖发布说明：另一侧同日期的用户可见修复会从历史中消失。
- Prompt 版本取了旧值：加载表键与源文件 `version` 不一致，注册表测试失败或运行时找不到资产。
- 晚到迁移与本地后续迁移修改同一张表：升级库与全新库的结构会分叉，必须停止并人工设计兼容迁移，而不是改名或跳过。
- 直接用 `prisma migrate deploy` 验证 SQLite 全新库：视觉资产两条迁移历史合流后，标准命令会在重复列上失败；SQLite 迁移验证应以运行时迁移器为准。

## Related Modules

- `server/src/db/runtimeMigrations.ts`
- `server/src/prisma/migrations/`、`server/src/prisma/migrations.sqlite/`
- `server/src/prompting/registry/promptAssetLoaderEntries.ts`
- [数据库迁移漂移](../debugging/database-migration-drift.md)
