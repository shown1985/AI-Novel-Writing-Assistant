# OpenCode 请求身份与会话缓存

## Background

OpenCode Go 需要客户端在每个请求中提供 `x-opencode-session`，并使用稳定值代表一次会话。缺少该标识会影响服务端的提示词缓存与流量识别，未来可能导致请求失败。小说平台同时支持 OpenAI 兼容协议和 Anthropic 兼容协议，因此请求身份不能只修补某一个 SDK。

## Decision

请求身份由 `server/src/llm/opencode/session.ts` 统一解析，LLM 工厂负责把解析结果注入具体传输客户端：

- 仅当目标主机为 `opencode.ai` 或其子域名时添加 OpenCode 专用请求头。
- `x-opencode-session` 使用 provider 与会话范围的 SHA-256 截断值，避免把小说、任务或用户标识原样发送给第三方。
- 优先使用调用链传入的 `sessionId`，其次使用任务、小说、章节和入口元数据；缺少这些信息时使用进程生命周期内稳定的回退值。
- 自有 Anthropic 适配器使用平台自身的产品标识；OpenAI 兼容通道保留 LangChain SDK 的真实标识，不伪装成 Trae、Claude Code 或其他客户端。
- OpenAI 兼容请求通过 LangChain 客户端配置注入；Anthropic 兼容请求通过自有 HTTP 适配器注入。

## Current Rule

所有新建的 LLM 调用应沿用 `resolveLLMClientOptions`、`runStructuredPrompt` 或 `runTextPrompt`，并在存在用户会话标识时传递 `sessionId`。业务模块不应自行拼接 `x-opencode-session` 或直接修改底层请求头。

世界观生成等历史入口暂时没有独立会话字段，会使用任务/小说元数据或进程回退值；后续若要实现严格的一次向导一次会话，应先扩展共享请求契约，再由客户端贯穿传递。

## Failure Modes

- OpenCode 请求仍缺少请求头：检查是否绕过 LLM 工厂直接实例化 SDK，或是否新增了未接入 Prompt Runner 的流桥接。
- 不同会话得到相同标识：检查调用方是否复用了错误的 `sessionId`，而不是修改哈希逻辑。
- 非 OpenCode 服务收到 OpenCode 头：检查 base URL 主机识别逻辑，禁止用“所有兼容 API 都添加”的宽泛判断。

## Related Modules

- `server/src/llm/opencode/session.ts`：请求身份解析与脱敏。
- `server/src/llm/factory.ts`：统一解析并注入 OpenAI/Anthropic 客户端。
- `server/src/llm/anthropicClient.ts`：Anthropic 兼容 HTTP 请求适配。
- `server/src/prompting/core/promptRunner.ts`、`server/src/llm/structuredInvoke.ts`：会话标识在提示词执行链中的传递。
