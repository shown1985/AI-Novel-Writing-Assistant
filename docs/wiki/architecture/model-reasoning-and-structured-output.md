# 模型推理预算与结构化输出边界

## Background

世界骨架生成要求模型在一次调用中返回多个受数量约束的数组和嵌套对象。推理型模型可能先消耗完整的 completion budget 进行隐藏思考，最终正文为空；这类失败如果被当成普通传输错误，用户只能看到笼统的“too big”或重复重试，无法判断是规模、推理深度还是网络问题。

## Decision

- 业务任务只声明任务级策略，例如世界骨架使用低推理档位；模型参数由统一 LLM Runtime 根据模型能力映射。
- GLM-5 系列（包括 GLM-5.3 Flash）通过 `reasoning_effort` 传递推理档位，不伪装成其他客户端或供应商。
- 结构化调用保留一次流式调用中的正文、token 用量和思考字符数，解析层据此区分输出失败原因。
- 空正文且 completion tokens 达到 max tokens 时：有思考内容归为 `reasoning_budget_exhausted`，没有思考内容归为 `output_truncated`；没有预算证据的空正文归为 `empty_content`。真实网络或服务端异常仍为 `transport_error`。
- 推理档位沿 Prompt Runner、结构化调用、JSON 修复调用完整传递，避免主调用已降档而修复调用又恢复为高推理。
- 供应商返回的请求超限错误统一归类为 `request_too_large`；HTTP 413、上下文长度码和常见 payload/context 文案优先于 JSON 解析分类，但 Zod 的数组数量 `Too big` 必须继续归为 schema 校验问题。
- 长阶段任务只能把“当前阶段所需的短摘要 + 稳定实体 ID”送入下一次 Prompt；持久化世界结构不裁剪，完整内容仍由装配器和后续页面使用。
- OpenCode Go 是兼容 OpenAI 协议的网关能力，不应伪装成 Trae、Claude Code 或其他客户端；端点能力由统一 LLM 能力层识别，业务模块只声明结构化任务。
- OpenCode Go 的 DeepSeek V4、GLM-5.3 等推理模型在结构化 JSON 任务中默认关闭思考，把额度留给可解析正文；普通文本或流式任务仍沿用调用方明确指定的思考设置。

## Current Rule

- 世界骨架入口在保留现有 6,000 token 上限的前提下请求 `reasoningEffort: "low"`，不通过盲目提高上限掩盖思考预算问题。
- 结构化调用遇到推理耗尽、输出截断或空正文时停止同一模型的格式策略轮换；切换备用模型仍由既有 fallback 配置决定。
- 世界向导将上述三类可恢复失败映射为 422，并给出降低思考深度、降低规模、重试或切换模型的下一步建议；不会保存不完整世界数据。
- 只有模型能力适配器读取模型名称和端点信息，世界业务模块不堆叠模型名称分支。
- `reasoningEnabled` 必须从业务阶段策略经 Prompt Runner 传到 `resolveLLMClientOptions`；仅在阶段编排器设置标志而未进入客户端的改动视为无效。

## Failure Modes

- `reasoning_budget_exhausted`：模型主要返回思考增量，正文为空，且 completion 用量触顶。优先降低推理档位。
- `output_truncated`：正文为空且 completion 用量触顶，但没有可识别思考增量。优先降低生成规模或调整预算。
- `empty_content`：正文为空但没有额度触顶证据。优先重试或切换模型，并检查服务端响应。
- `transport_error`：网络、认证、服务端 HTML 错误等调用级故障，不应被误报为 JSON 结构问题。
- `request_too_large`：供应商拒绝了过大的上下文或 payload；优先缩减可选参考内容、使用阶段投影或拆分任务，不通过盲目增加输出额度解决。
- 若结构化结果已有正文但 JSON 不完整，继续使用现有 `incomplete_json`、`malformed_json` 和修复边界，不把所有解析失败归为预算耗尽。

## Gateway Capability Boundary

### Current Rule

- `resolveStructuredOutputProfile` 可以根据受信任的端点路径识别网关能力，但不能仅凭模型名称把未知自定义接口当成上游厂商官方接口。
- OpenCode Go 识别条件是 `opencode.ai/zen/go` 路径；只有同时识别到 DeepSeek V4、GLM-5 系列等已知推理模型时，才标记结构化任务需要非思考模式。
- `factory.ts` 根据 profile 统一计算 `reasoningForcedOff` 和供应商参数：DeepSeek 使用 `thinking: { type: "disabled" }`，GLM 在关闭时不发送 `reasoning_effort`。这一映射不应复制到世界生成或其他业务服务。
- 未知网关继续采用可移植的 Prompt JSON 策略，并保留调用方请求的思考设置；新增端点时必须同时补充能力识别、参数映射和普通文本不受影响的回归测试。

### Failure Modes

- 只在业务服务里按模型名关闭思考，会导致同一模型在不同端点产生不一致行为，也会让后续章节、修复和其他结构化任务重复维护分支。
- 把 OpenCode Go 当成某个上游厂商官方接口，可能发送网关不支持的 `response_format` 或推理字段，进而把网关拒绝误显示为 JSON 解析错误。
- 仅验证结构化调用而没有验证普通文本调用，会意外削弱聊天、正文续写等需要思考的流程；能力层测试必须覆盖两种执行模式。

## Related Modules

- `server/src/llm/reasoning.ts`：模型推理能力识别与参数映射。
- `server/src/llm/factory.ts`：统一解析 LLM 客户端选项。
- `server/src/prompting/core/promptRunner.ts`：任务策略向结构化、文本和语义重试链路传递。
- `server/src/llm/structuredInvoke.ts`、`structuredInvokeParser.ts`：流式用量采集、分类与结构校验。
- `server/src/llm/structuredOutput.ts`：端点能力 profile、结构化策略与 OpenCode Go 能力边界。
- `server/src/modules/setup/world/http/worldGenerationRoutes.ts`：世界向导的用户提示与状态码映射。
