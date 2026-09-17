# S1-01：缺省数值配置完成证据

## 交付结论

- Release / Sprint：Release 1 / R1-S2A。
- Story：S1-01 缺省数值配置正确生效（3 点）。
- 状态：Done。
- 用户结果：未配置、空白和坏值会采用声明的可靠默认值；作者明确保存的合法低值和允许的 `0` 会保持，读取配置不会回写设置或创建索引任务。

## 行为矩阵

| 输入 | 结果 |
| --- | --- |
| env 与 AppSetting 均未配置 | 使用切片 800、重叠 120、候选 40、TopK 8、embedding batch 64、timeout 30 秒、retry 2、trace 1、写法提取 10 分钟 |
| 空字符串、空白、`null` 或非数值 | 使用对应有效默认值，不再把空字符串误解析为 `0` |
| AppSetting 空白但 env 合法 | 保留 env 的有效值；暂停的 RAG 不会被读取路径重新开启 |
| 合法低值和允许的 `0` | 原样保留，包括 overlap、embedding retry 与 trace 采样 |
| 有限但越界的值 | 沿用既有上下界截断，不改变保存记录 |
| 任意读取场景 | AppSetting 写入 0、事务 0、索引任务创建 0 |

## 验证

```text
pnpm --filter @ai-novel/server build
node --test server/tests/settingsNumericDefaults.test.js
```

- server build：通过。
- 配置行为检查：7/7 通过。
- 测试使用 mock Prisma 与 `/tmp/ai-novel-s1-01-*` 隔离路径，没有访问或迁移用户数据库。

## 边界与文档判断

- 本 Story 不改变保存命令、模型选择、RAG 开关策略或索引流程。
- 默认值解析属于现有配置合同的缺陷修复，没有形成新的长期架构边界；无需新增 Wiki，用户可见结果记录到发布说明。
