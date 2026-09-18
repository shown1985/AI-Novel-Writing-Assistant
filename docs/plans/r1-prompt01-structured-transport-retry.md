# R1-PROMPT01：结构化调用瞬态传输失败重试

## Story 合同

- Release / Epic：Release 1 / 模型调用可靠性。
- Sprint：R1-S2E。
- 点数 / 优先级 / 状态：2 点 / P0 / Ready。
- 用户价值：当模型服务商短暂过载或返回可重试的传输错误时，作者的结构化生成会按既有配置重试，而不会被误报成“模型没有返回正文”。
- Owner：Prompt 平台 owner 独占 `server/src/llm/structuredOutput.ts` 与 `server/tests/structuredInvoke.test.js`；不与 S3-01 共用文件。

## 当前证据与决策

`invokeStructuredLlmDetailed retries transport failures using the configured retry count` 当前失败：mock transport 抛出服务商过载错误，但 `classifyStructuredOutputFailure` 在无 `rawContent` 时落入 `empty_content`，导致 `tryStructuredStrategiesWithTransportRetries` 不执行已配置的 transport retry。

决定把 HTTP 429/5xx、明确的 rate-limit / overload / temporarily-unavailable / timeout / connection 类 provider 异常归为 `transport_error`。这属于对已发生异常的确定性分类，不承担产品意图识别，也不新增业务关键词路由。

## 范围

1. 在空正文判断前识别稳定的瞬态 transport 状态、错误码和消息形态。
2. 保持 context/payload 超限、structured format 不支持、JSON/schema 与真实空正文的既有优先级。
3. 增加 table-driven 分类和端到端 retry 证据，覆盖过载、429、503、超时与不可重试空正文。

## 非范围

- 不改变 retry 次数、退避、fallback、repair、semantic retry 或模型路由。
- 不接 attempt repository，不保存 provider 错误正文，不增加 Prompt 或 UI。
- 不把任意错误统一归为可重试，也不吞掉 AbortSignal 取消。

## 验收条件

1. 明确瞬态传输异常分类为 `transport_error`，并由既有配置执行一次重试后成功。
2. 真实空响应仍为 `empty_content`，不会错误进入 transport retry。
3. 413/context limit、unsupported native JSON 和 schema/JSON 错误分类保持不变。
4. retry 用尽后返回原有结构化错误，不泄露凭证、请求体或原始响应正文。
5. 取消信号不重试；未配置 retry 时调用次数保持一次。

## 最窄验证与文档判断

- `pnpm --filter @ai-novel/server build`
- `node --test server/dist/tests/structuredInvoke.test.js`（以实际构建输出路径为准）
- 定向分类测试覆盖状态码、错误码、消息、空正文和取消。
- 无 UI，UI 验收不适用；纯可靠性修复有用户可见影响，提交前更新发布说明。
- 若分类合同形成稳定维护知识，更新 Prompt/调试 Wiki；不得把本卡并入 S2-04b3。
