# 诊断就绪读写边界

## Background

模型路由和知识库连接状态既要帮助作者判断“现在能否创作”，又可能触发付费模型、embedding 或外部向量库请求。如果页面读取与真实检测共用同一路径，刷新、聚焦和自动轮询都会产生隐藏调用；检测期间自动保存协议建议还会把观察动作变成配置修改。

诊断结果还必须面对桌面进程重启、多窗口并发、配置变化和包含凭证的 provider 错误。单纯内存缓存或公开 hash 都不能成为可信事实源。

## Decision

诊断采用 Command / Query 分离：

- Query 只装配当前有效配置指纹并读取持久化报告，不调用 transport，不领取执行权，也不修改模型路由。
- Command 显式领取一次检测 claim，调用 transport，脱敏后保存结果，再通过同一 Query 投影返回。
- 检测建议是报告的一部分，不是配置事实；只有独立、带前置条件的应用命令才能修改路由。

诊断状态由 owned `modules/diagnostics` 模块负责。HTTP 层只选择 read/check 用例并处理旧接口投影；模型和 RAG 服务不直接管理诊断表。

## Current Rule

### 状态与读取

- 状态仅使用 `not_checked / healthy / failed / stale`。未知和过期不是失败，存储读取异常也不能包装成检测失败。
- `configurationFingerprint` 是当前有效配置的服务端不透明标识。已完成运行的指纹与当前指纹不同，整份报告及其目标能力投影为 `stale`。
- 活动运行通过独立 `pending` 元数据表达；读取仍保留最近完成报告，不能让页面永久停在没有证据的 loading。
- 最新运行失败时可附带一份非递归 `previousReport`，让用户同时看到本次失败和严格上一份完成证据。

### 并发与恢复

- 单进程对相同 `scope + fingerprint` 共享同一个 Promise。
- 跨进程使用可空唯一 `activeClaimKey`；同一配置只有一个活动 claim，其他请求只读取其 pending 状态。
- claim 必须有有限租约。过期运行先确定结算，再允许接管；旧执行者的迟到完成必须因活动 claim 已失效而失败，不能覆盖新报告。
- 清理只删除非保护历史。最近窗口、活动运行、最近成功、最近失败及仍被建议应用引用的运行必须保留。

### 指纹与秘密

- 指纹覆盖会影响真实调用的 provider、model、有效 base URL、鉴权模式、协议、输出策略、任务类型、目标 revision、启用状态和凭证版本；RAG 还覆盖 embedding、Qdrant 与 collection。
- 环境凭证和数据库凭证可以参与 HMAC 输入，但不得以明文、可公开比较的裸 hash、日志字段或 API 字段保存。
- HMAC 密钥属于本机应用数据，不进入数据库导出。密钥丢失或轮换应使旧报告过期，而不是继续显示健康。
- transport 错误属于不可信秘密边界。持久化前必须归一化为有限的用户提示，不能保留请求头、查询参数、Prompt 或响应正文。

### 建议与配置写入

- 检测路径不得调用模型路由保存命令。协议和结构化输出方式只能作为建议保存。
- 旧手动保存仍可独立工作，但必须推进目标 revision，使旧报告与建议无法继续应用。
- 建议应用必须携带诊断 ID、当前指纹、目标 revision、唯一目标集合和幂等 operation ID；指纹或任一目标冲突时整批零写入。

## Examples

```text
页面进入或聚焦
  -> GET readiness
  -> 读取当前配置 + 最近报告
  -> transport 0 / route write 0

作者点击“检测”
  -> POST check
  -> claim(scope, fingerprint)
  -> probe -> sanitize -> persist
  -> 返回当前报告

作者在另一窗口修改模型路由
  -> revision + 1
  -> fingerprint 改变
  -> 旧报告 stale，旧建议不能提交
```

## Failure Modes

- 用 GET 或 React Query 自动查询调用真实模型，会把浏览状态变成付费命令。
- 把 `not_checked` 映射为红色失败，会误导新手并阻塞本可开始的创作。
- 检测成功后自动保存协议，会使“检查”拥有隐藏写副作用。
- 仅靠进程内 mutex 无法处理桌面多进程或服务重启；仅靠数据库唯一键但没有租约会形成永久 pending。
- 保存原始 provider 错误可能泄露 API Key、URL 查询参数、Prompt 或用户正文。
- 让迟到检测响应覆盖当前指纹，会把新配置误显示为健康。

## Related Modules

- `server/src/modules/diagnostics/`
- `server/src/routes/llm.ts`
- `server/src/routes/rag.ts`
- `shared/types/diagnostics.ts`
- `server/src/llm/modelRouter.ts`

## Source Documents

- [S1-00 诊断共享接线与存储契约门](../../plans/s1-00-diagnostics-contract.md)
- [S1-02a 完成证据](../../plans/s1-02a-diagnostic-readiness-backend.md)
- [Sprint 1 实施卡](../../plans/agent-collaboration-sprint-1.md)
