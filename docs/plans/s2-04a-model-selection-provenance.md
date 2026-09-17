# S2-04a 模型选择来源与有效参数完成证据

## Story 结果

- Release / Sprint：Release 1 / R1-S2B。
- Story：S2-04a 模型选择来源与有效参数合同（3 点）。
- 用户价值：后续界面和调用记录可以解释厂商、模型、温度与 Token 上限从哪里来，以及哪些值因模型能力发生了确定性修正，而不再按当前设置猜测历史调用。
- 当前状态：`Done`。真实 resolver 已产出字段级脱敏来源合同，解析值和既有优先级保持不变。

## 已实现边界

- `resolveModel` 与 `resolveLLMClientOptions` 在产生实际配置的同一条路径同步生成 `selectionProvenance`；客户端或后续持久层不需要重新计算来源。
- provider、model、temperature、maxTokens 分别记录 requested、effective、source 与 adjustments，允许同一次调用的字段来自显式请求、任务路由、厂商配置、环境变量或默认值。
- 确定性调整覆盖厂商 Token 上限、历史 4096 占位、固定/最小/最大温度，以及结构化输出的 Token 截断或省略。
- 任务路由保留 routeKey、既有 strict-only `routeDegraded` 语义和独立原因；路由存储查询失败不会改变回退结果，但会留下 `route_lookup_failed`。
- 对外投影只复制共享 provenance 字段，不包含 API Key、Base URL、鉴权方式、model kwargs、Prompt、session 或 OpenCode session ID。
- 旧历史可显式投影为 `unknown`；attempt lineage 只冻结类型，不在本 Story 生成或保存标识。

## 非范围与后续门

- 没有增加 API、UI、usage/live 字段、数据库 schema、迁移或历史回填。
- 没有调用模型、embedding，亦未修改用户模型路由或厂商配置。
- S2-04b 仍需先冻结实际 attempt 证据的存储、失败降级和非导演入口覆盖；S2-04c 等 04b 后再展示预计与实际来源。

## 验证证据

- `pnpm --filter @ai-novel/shared build`：通过。
- `pnpm --filter @ai-novel/server build`：通过。
- `node --test server/tests/modelRouter.test.js server/tests/modelSelectionProvenance.test.js`：17/17 通过。
- `node --test --test-name-pattern='kimi k2 and k3|minimax clamps temperature' server/tests/llmProviders.test.js`：2/2 通过。
- 聚焦矩阵覆盖显式选择、任务路由、provider 配置、环境、内建/备用/系统默认、严格与非严格路由失败、全部 adjustment、unknown legacy、脱敏 detached projection、零 fetch transport 与零 route upsert。
- 验证使用 mock Prisma、secret、env 和 fetch；没有真实模型调用，也没有用户数据库写入。

完整 `llmProviders.test.js` 仍有两条与当前 GLM structured-output profile 不一致的既有断言。相关 profile、reasoning 与测试文件和 `HEAD` 完全一致，失败不经过本 Story 新增来源逻辑；本卡未越界修改该能力档案。

## Wiki 与发布判断

- 稳定的字段来源、调整原因和脱敏边界已写入[当前模型选择与厂商默认模型边界](../wiki/architecture/model-selection.md)。
- 本 Story 只建立内部可信合同，没有直接用户界面变化；Release Notes 等 S2-04c 实际显示能力时统一记录。
