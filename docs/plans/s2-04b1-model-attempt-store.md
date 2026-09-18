# S2-04b1：通用 Model Attempt Store 与 Repository 证据

## Story 结果

- Release / Sprint：Release 1 / R1-S2D。
- 状态：Done（3 点）。
- 用户价值：模型没有返回 Token、进程中断或默认模型日后改变时，真实调用尝试仍可从独立持久事实重建；本 Story 建立底座，尚未接真实 transport 或用户界面。
- 依赖：[S2-04b0 实际模型调用尝试证据合同](./s2-04b-model-attempt-evidence-contract.md)已完成。
- UI 验收：不适用；本 Story 没有 UI 或公开 API。

## 已交付范围

1. PostgreSQL 与 SQLite Prisma schema 同步增加独立 `ModelAttemptEvidence` 表和同构增量 migration；只保存标量归因 ID，不修改、回填或关联导演 Token 表，不建立 Cascade 外键。
2. `PersistedModelAttemptRepository` 实现相同 start/finalize 幂等、冲突终态不可改写、连续 lineage、started orphan 保留、usage=null、request 聚合、novel 隔离和 legacy unknown 读取。
3. request 可串行化事务内检查单 request 最多一个 adopted；生产 `PrismaModelAttemptStore` 使用 `status=started` CAS finalize，并在唯一键、序列化、busy 或 deadlock 冲突时有限重开完整事务。
4. 持久输入只映射冻结字段白名单。API key、Base URL、鉴权/header、Prompt/上下文/正文、输出、reasoning 和 provider 错误正文不会持久化；失败码只能来自显式有限集合。
5. repair / semantic retry 可拥有自己的 Prompt 身份；request 只固定调用模式与完整归因 frame，避免错误限制真实 repair 链。

## 非范围确认

- 未连接 factory、structured invoke、Prompt Runner、live broker、application Prisma singleton、HTTP 或真实模型 transport。
- 未新增公开读 API/UI，未改变 retry/fallback/repair/semantic 策略，未写任何用户数据库。
- S2-04b3 仍等待 S2-04b2 完成后再进入 Ready；本卡不能被解释为“用户已看到实际模型”。

## 验证证据

### Schema 与精确增量 migration

- PostgreSQL / SQLite schema `prisma validate` 均通过。
- 两套新 migration 分别在临时 SQLite 和临时 PostgreSQL 16 容器执行成功；两边均确认 37 列、10 个索引，预先写入的 `ExistingUserData` 哨兵值保持 `preserved`。
- 临时 PostgreSQL 容器完成后删除，OrbStack 恢复为原先停止状态。

### Repository 与 adapter 行为

```text
pnpm --filter @ai-novel/server build

node --test \
  server/dist/platform/llm/provenance/attempts/PersistedModelAttemptRepository.test.js \
  server/dist/platform/llm/provenance/attempts/PrismaModelAttemptStore.test.js \
  server/dist/platform/llm/provenance/attempts/prototype/attemptSeamPrototype.test.js
```

结果：20/20 通过。覆盖幂等、冲突终态、started orphan、并发唯一 adopted、连续 lineage、repair 独立 Prompt 身份、重启重建、novel 隔离、usage=null、字段脱敏、有限 failure code、legacy unknown 和 Prisma 事务/CAS/重试。

### 双库真实 Prisma runtime smoke

使用生成的 Prisma Client、生产 `PrismaModelAttemptStore` 与 `PersistedModelAttemptRepository` 分别连接临时 SQLite 和临时 PostgreSQL，均通过：

- 同一 request 两个并发 adopted finalize 只有一个成功；
- adopted 行的 usage 保持 null；
- 断开并创建新 client 后可重建 2 条有序 attempts；
- `novel-a` / `novel-b` 查询互不污染；
- 未 finalize 的 `attempt-b0` 重启后仍为 `started + pending`。

### 全迁移历史兼容

直接逐个执行原始 SQLite SQL 会在到达本次 migration 之前遇到既有双历史：`20260916090000_comic_character_gender` 与 `20260910140000_visual_asset_source_compatibility` 都声明 `ComicCharacter.gender`。这不是产品使用的权威迁移路径；R1-MIG01 已规定空库与升级必须走和桌面启动相同的运行时迁移编排，由它识别已满足对象并保留两条已发布历史。

基于最终 schema 运行权威完整性回归：

```text
node --test server/tests/prismaMigrationCompleteness.test.js
```

结果：2/2 通过，包括空 SQLite 经运行时迁移编排后覆盖当前 schema 的全部模型/字段，以及视觉资产双历史修复 migration 完整性。本 Story 的新表已进入该覆盖，不新增迁移兼容缺口。

## 文档与发布判断

本 Story 明确了长期持久化事务、脱敏、legacy 和无级联边界，已更新模型选择架构 Wiki。它尚无用户可见行为，发布说明与 README 最新更新不应增加噪音。
