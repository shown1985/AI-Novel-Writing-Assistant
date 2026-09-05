# 模型推理预算与结构化输出边界

## Background

世界骨架生成要求模型在一次调用中返回多个受数量约束的数组和嵌套对象。推理型模型可能先消耗完整的 completion budget 进行隐藏思考，最终正文为空；这类失败如果被当成普通传输错误，用户只能看到笼统的“too big”或重复重试，无法判断是规模、推理深度还是网络问题。

## Decision

- 业务任务只声明任务级策略，例如世界骨架使用低推理档位；模型参数由统一 LLM Runtime 根据模型能力映射。
- GLM-5 系列（包括 GLM-5.3 Flash）通过 `reasoning_effort` 传递推理档位，不伪装成其他客户端或供应商。
- 结构化调用保留一次流式调用中的正文、token 用量和思考字符数，解析层据此区分输出失败原因。
- 空正文且 completion tokens 达到 max tokens 时：有思考内容归为 `reasoning_budget_exhausted`，没有思考内容归为 `output_truncated`；没有预算证据的空正文归为 `empty_content`。真实网络或服务端异常仍为 `transport_error`。
- 推理档位沿 Prompt Runner、结构化调用、JSON 修复调用完整传递，避免主调用已降档而修复调用又恢复为高推理。

## Current Rule

- 世界骨架入口在保留现有 6,000 token 上限的前提下请求 `reasoningEffort: "low"`，不通过盲目提高上限掩盖思考预算问题。
- 结构化调用遇到推理耗尽、输出截断或空正文时停止同一模型的格式策略轮换；切换备用模型仍由既有 fallback 配置决定。
- 世界向导将上述三类可恢复失败映射为 422，并给出降低思考深度、降低规模、重试或切换模型的下一步建议；不会保存不完整世界数据。
- 只有模型能力适配器读取模型名称和端点信息，世界业务模块不堆叠模型名称分支。

## Failure Modes

- `reasoning_budget_exhausted`：模型主要返回思考增量，正文为空，且 completion 用量触顶。优先降低推理档位。
- `output_truncated`：正文为空且 completion 用量触顶，但没有可识别思考增量。优先降低生成规模或调整预算。
- `empty_content`：正文为空但没有额度触顶证据。优先重试或切换模型，并检查服务端响应。
- `transport_error`：网络、认证、服务端 HTML 错误等调用级故障，不应被误报为 JSON 结构问题。
- 若结构化结果已有正文但 JSON 不完整，继续使用现有 `incomplete_json`、`malformed_json` 和修复边界，不把所有解析失败归为预算耗尽。

## Related Modules

- `server/src/llm/reasoning.ts`：模型推理能力识别与参数映射。
- `server/src/llm/factory.ts`：统一解析 LLM 客户端选项。
- `server/src/prompting/core/promptRunner.ts`：任务策略向结构化、文本和语义重试链路传递。
- `server/src/llm/structuredInvoke.ts`、`structuredInvokeParser.ts`：流式用量采集、分类与结构校验。
- `server/src/modules/setup/world/http/worldGenerationRoutes.ts`：世界向导的用户提示与状态码映射。
