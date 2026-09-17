# S1-02a：诊断读取、显式探测与持久化完成证据

## Story 结论

- Release / Sprint：Release 1 / R1-S2A。
- Story：S1-02a 诊断读取、显式探测与持久化（3 点）。
- 状态：Done。
- 用户结果：服务端可以被动读取模型路由与知识库最近诊断，只有显式检测命令会调用模型、embedding 或向量库；结果、失败和过期状态可跨进程重启追溯。
- 非范围：设置页与知识库页的完整状态消费属于 S1-02b；检测建议的事务应用属于 S1-03。

## 已实现合同

| 入口 | 行为 | transport | 配置写入 |
| --- | --- | ---: | ---: |
| `GET /api/llm/model-routes/connectivity` | 读取当前指纹、最近完成报告与活动检测 | 0 | 0 |
| `POST /api/llm/model-routes/connectivity` | 显式检测并保存报告；响应暂时投影为旧 `statuses` 合同 | 仅显式调用 | 0 |
| `GET /api/rag/readiness` | 读取知识库最近诊断 | 0 | 0 |
| `POST /api/rag/readiness` | 显式检测 embedding 与 Qdrant 并保存报告 | 仅显式调用 | 0 |
| `GET /api/rag/health` | 旧接口的被动兼容投影 | 0 | 0 |

被动读取区分 `not_checked / healthy / failed / stale`。检测进行中通过 `pending` 表达，不会用未知或旧结果冒充成功；最近一次检测失败时，`previousReport` 保留严格上一份完成证据。

模型连接检测不再把探测得到的协议或结构化输出格式自动写入模型路由。建议只进入诊断报告；作者确认后的 guarded batch 应用仍由 S1-03 实施。旧手动保存继续可用，并推进目标 `revision`，使旧建议和旧报告失效。

## 持久化、并发与安全

- `DiagnosticRun`、`DiagnosticTargetResult` 和为 S1-03 预留的 `DiagnosticRecommendationApplication` 同步加入 SQLite 与 PostgreSQL schema。
- 同一 `scope + configurationFingerprint` 只允许一个活动 claim；单进程共享 Promise，跨进程依靠唯一 `activeClaimKey` 合并。
- claim 使用 15 分钟租约；过期 claim 会先结算为失败再创建新运行，迟到完成不能覆盖新结果。
- 每个 scope 保留最近 20 个完成运行，并保护活动、最近成功、最近失败及被建议应用引用的运行。
- 配置指纹由本机持久化随机密钥计算 HMAC；密钥目录和文件在支持的平台尽力限制为 `0700/0600`，接口和数据库只保存不透明摘要。
- provider 错误可能包含凭证、URL、Prompt 或响应正文；持久化边界统一收敛为稳定的用户提示，测试确认秘密内容不会进入报告。

## 行为与迁移证据

最终聚焦验证使用新建临时目录 `/tmp/ai-novel-s102a-final.CTe1n2`，未读取、重置或迁移用户数据库：

```text
pnpm --filter @ai-novel/shared build                         PASS
pnpm --filter @ai-novel/server build                         PASS
pnpm --filter @ai-novel/client typecheck                     PASS
SQLite / PostgreSQL Prisma schema validate                   PASS / PASS
server/tests/diagnosticReadiness.test.js                     6/6
LLM/RAG readiness route tests                                2/2
modelRouter + runtime migration + migration completeness    19/19
client/tests/diagnosticsContract.test.mjs                     5/5
git diff --check                                             PASS
```

额外隔离演练证明：

- 新建 SQLite 完整 schema 后，模型路由与 RAG 两类健康报告可写入并在新 service 实例读取；路由行数在检测前后保持为 0。
- SQLite 与 PGlite PostgreSQL 均可直接执行本 Story 的增量 SQL；已有 `ModelRouteConfig` 行保留，`revision` 初始化为 0，三张诊断表及索引完整。
- HMAC 密钥为 32 字节；支持 POSIX 权限时文件模式为 `0600`。
- 两个独立 store 并发 claim 只获得一个执行权；租约过期后可以安全接管。

## 兼容与残余边界

- 现有设置概览和模型路由页仍把 POST 当作自动查询。为避免在 S1-02b 前破坏页面，本 Story 保留 POST 的旧响应结构；真正将页面首次进入、聚焦和刷新改为被动 GET，必须由 S1-02b 完成并做 Computer Use 验收。因此 R1-S2A 的“查看 AI 状态零模型调用”目标只在服务端能力和知识库旧 GET 上达成，尚未在模型设置 UI 全面达成。
- 仓库旧 SQLite 原生 `prisma migrate deploy` 历史中，`20260916090000_comic_character_gender` 会与更早的视觉兼容迁移重复添加 `gender`。该问题早于本 Story；桌面受控 runtime migration 与本 Story 增量迁移演练通过。本卡未越界修改既有迁移历史，后续发布门仍需按 R1 迁移矩阵处理。
- 本 Story 没有真实付费模型调用，也不宣称厂商质量；transport 行为由 mock 和隔离持久化证据覆盖。

## 文档判断

读/检分离、指纹、租约和脱敏持久化是长期架构边界，已沉淀到 [诊断就绪读写边界](../wiki/architecture/diagnostic-readiness.md)。用户可见的知识库被动状态与模型检测不自动改写路由需要进入发布说明；S1-02b 未完成的页面行为不能提前写成已交付能力。
