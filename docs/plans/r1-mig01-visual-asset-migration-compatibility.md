# R1-MIG01：视觉资产双迁移历史兼容

## Story 结论

- Release / Sprint：Release 1 / R1-S1。
- Story：R1-MIG01 视觉资产双迁移历史兼容（5 点）。
- 用户价值：新安装和分别经历两条视觉资产升级历史的作者都能保留作品并正常启动。
- 结果：空库、宽迁移历史、六个细分迁移历史、部分 schema 与 pending record 共用同一运行时入口，聚焦迁移测试 10/10 通过。

## 原因分类

- 主因：历史兼容问题。长期分支分别加入一个复合迁移和六个细分迁移，合流后覆盖相同列、表与索引。
- 次要因素：验证路径不一致。桌面运行器会识别已满足对象，空库完整性测试却直接逐个执行原始 SQL；部分 schema fixture 还在复合迁移已执行后再次手工加列，未进入被测恢复逻辑就失败。
- 正常产品路径能否再次产生：合流前可以；本修复后，相同两条历史由共享运行器与回归 fixture 保护。新的迁移分叉仍须按 Wiki 规则单独评审。

## 修复边界

1. 提取 `applyRuntimeMigrationsToDatabase`，桌面启动和空库完整性测试使用同一迁移编排。
2. 保留全部既有迁移 SQL 和迁移 ID，不改变已安装版本的 checksum 历史。
3. 仅对明确由六个细分迁移覆盖的复合视觉资产迁移识别“部分已满足”：登记复合历史后继续执行逐字段/逐表修复，不能推广为忽略任意 SQL 失败。
4. 双历史 fixture 分别保存已有角色行，并验证 schema、索引、迁移完成记录、`integrity_check` 与 `foreign_key_check`。
5. 部分 schema fixture 带未完成的复合迁移记录，验证重启可补齐其余对象并把 pending record 收束为完成。

## 数据安全

- 未读取、复制或修改任何用户数据库。
- 所有行为测试使用内存库或 `os.tmpdir()` 下的临时 SQLite，结束后删除临时目录。
- 未运行 `prisma migrate reset`、删库、回滚或数据清理。
- 未修改 `server/src/prisma/migrations.sqlite/` 下的历史 SQL。

## 验收证据

```text
pnpm --filter @ai-novel/server build
node --test --test-concurrency=1 server/tests/prismaMigrationCompleteness.test.js server/tests/runtimeMigrations.test.js
```

结果：10 tests passed，0 failed。R1-D01 的空库与双历史视觉资产冲突已解除；R1-D02 的正式支持版本清单、完整作品/章节/世界/任务计数和备份恢复仍属于 R1-RC01，不能由本 Story 冒充完成。

## 相关文档

- [Release 1 验证矩阵](./r1-03-release-verification-matrix.md)
- [数据库 Schema 与迁移漂移](../wiki/debugging/database-migration-drift.md)
- [R1-S1 Sprint 承诺](./r1-s1-sprint-commitment.md)
