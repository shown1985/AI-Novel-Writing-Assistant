# S1-05：世界问题归属校验

## Story 结论

- Release / Sprint：Release 1 / R1-S1。
- Story：S1-05 世界问题归属校验（2 点）。
- 用户价值：在一个世界里处理一致性问题时，不会改写另一个世界的问题状态。
- 状态：Done；正常 `open / resolved / ignored` 行为保持兼容。

## 原因与修复

- 主因分类：实现缺陷。
- 原逻辑先按 `issueId` 写入，再比较返回记录的 `worldId`；跨世界请求会先改状态再报错。
- 更新入口改为以 `{ id, worldId }` 作为同一次数据库写入条件。零命中后只读查询用于区分“不存在”和“错归属”，查询不能产生补偿写入。
- 若记录在条件更新与只读确认之间发生竞争变化，返回确定的冲突错误，不把未知结果伪装为成功。

## 验收证据

```text
pnpm --filter @ai-novel/server build
node --test server/tests/worldConsistency.test.js
```

结果：6 tests passed，0 failed。mock persistence 证明不存在和跨世界请求均为零行写入，并覆盖三种合法状态的原子条件与返回值。

## 边界

- 未访问真实数据库，未修改 schema、迁移、Prompt、问题历史或提案能力。
- 本 Story 落实既有世界归属安全合同，没有新增长期架构知识；无需更新 Wiki。
