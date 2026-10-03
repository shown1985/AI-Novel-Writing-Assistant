# Prompting Registry

`server/src/prompting/` 是本项目产品级 prompt 的唯一新增管理入口。

## Hard Rules

- 新增产品级 prompt 必须定义为 `PromptAsset`。
- 新增产品级 prompt 必须放在 `server/src/prompting/prompts/<family>/` 下。
- 新增产品级 prompt 必须在 `server/src/prompting/registry.ts` 注册。
- 新增产品级 prompt 必须进入提示词管理目录，并支持目录检索、版本查看、上下文预览和受控测试；只注册运行时资产不算完成纳管。
- 新增业务能力不得在 service 内直接拼 `systemPrompt/userPrompt` 后调用 `invokeStructuredLlm`。
- 新增业务能力不得在 service 内直接使用裸 `getLLM()` 发起产品级 prompt 调用。
- 修改到旧的未纳管 prompt 业务链路时，默认一并迁入 registry，而不是继续在原文件扩写。

## Allowed Exceptions

- `server/src/llm/structuredInvoke.ts` 内部 JSON repair prompt。
- `server/src/llm/connectivity.ts` 这类探活/连通性探针。
- 二期范围内的 `graphs/*`、`routes/chat.ts`、`services/novel/runtime/*`、以及其他流式桥接代码。

## Asset Checklist

新增 prompt 时必须同时提供：

- `id`
- `version`
- `taskType`
- `mode`
- `language`
- `contextPolicy`
- `outputSchema` 或 text 模式的 `postValidate`
- `render()`

可选但推荐同时评估：

- `repairPolicy`：控制结构化 JSON/schema repair 次数
- `semanticRetryPolicy`：控制 `postValidate` 失败后的统一语义重试次数

正文生成 Prompt 还必须提供：

- 安全的基础编辑 slots，用于调整语气、节奏、段落、对话、描写、钩子和禁用倾向；
- 高级 System / Human 模板编辑能力，支持作品范围、上下文 token、预览、测试、版本、回滚和恢复官方模板；
- required context 保护，确保角色硬事实、任务、连续性、世界规则、平台写法和风格合同不能被模板静默移除；
- PromptAsset / catalog 能力声明，禁止在前端通过固定 Prompt ID 决定是否支持高级编辑。

`PromptAsset.management` 是提示词管理能力的可信声明：

- `productPrompt` 表示该资产必须进入目录、预览和受控测试；
- `proseGeneration` 表示它属于小说正文治理门禁；
- `editModes` 声明 `readonly`、`slots`、`advanced_template`，前端只能按该能力渲染；
- `advancedTemplate.requiredContextGroups` 定义高级模板不能静默移除的正式上下文。

结构化正文 Prompt 使用高级模板时，自定义模板先编译，结构化输出提示随后由运行时追加，最终输出仍必须通过注册资产的 Schema。用户模板不能覆盖或删除 Schema、repair、postValidate 和输出字段合同。

## Naming

- 使用 `family.capability` 风格的 `id`
- `version` 使用 `v1`、`v2`
- 示例：
  - `audit.chapter.full@v2`
  - `world.structure.generate@v1`
  - `style.recommendation@v1`

## Family Layout

- 单个 prompt 文件超过项目 1300 行上限时，按生成阶段或用途拆到 family 下有明确归属的子目录，原文件保留为 facade 重新导出，保证 service 和 `registry/promptAssetLoaderEntries.ts` 的 import 路径不变。
- `world` family：
  - `world/world.prompts.ts`：facade，只做重新导出；外部模块继续从这里 import。
  - `world/inspiration/`：参考作品灵感、概念卡生成与本地化、世界属性选项。
  - `world/generation/`：按小说主题生成世界种子。
  - `world/structure/`：分层生成、本地化、结构分区补全与世界公理。
  - `world/maintenance/`：深化追问、一致性检查与既有结构回填。
  - `world/transfer/`：外部世界文本导入抽取。
  - `world/presentation/`：世界可视化展示数据抽取。
  - `world/worldDraft.prompts.ts`：世界骨架生成与展示、世界草稿生成与润色（含候选改写）。
  - `world/world.promptSchemas.ts`、`world/world.promptTypes.ts`：各阶段共用的输出 schema 与输入类型，阶段文件单向依赖它们，不反向依赖 facade。

## Runner Usage

- 结构化输出使用 `runStructuredPrompt`
- 纯文本输出使用 `runTextPrompt`
- 流式文本输出使用 `streamTextPrompt`
- 流式结构化输出使用 `streamStructuredPrompt`
- 调用方继续保留原 service 的 public method、数据库写入和返回 shape

### Execution Module Boundary

`core/promptRunner.ts` 是业务模块与测试使用的稳定 facade。它保留公开的 `runStructuredPrompt`、`runTextPrompt`、`streamTextPrompt`、`streamStructuredPrompt` 和 `setPromptRunner*ForTests` 函数；业务模块不得绕过它深导入 execution 内部文件。测试会替换 facade 的导出函数，公开执行入口不能改成只读 re-export。

`preparePromptExecution` 仍从 facade 导出，具体的注册校验、上下文选择和渲染归 `execution` 所有。

- `core/execution/promptExecutionContext.ts`：注册校验、上下文选择、slot overlay、结构化提示与调用元数据组装。
- `core/execution/textPromptExecution.ts`：text invoke/stream、live session、文本/reasoning/token usage 汇聚以及流式完成、失败、取消收尾。
- `core/execution/structuredPromptExecution.ts`：结构化流解析协调、postValidate、JSON repair 计数、semantic retry 和候选结果采纳。
- `core/execution/requestBudget.ts`：渲染后的字符估算与 `[prompt.budget]` 快照日志。预算判定由 `llm/requestBudget.ts` 承担，超限拒绝由 facade 根据 `options.requestBudget.mode` 编排。
- `core/execution/promptTelemetry.ts`：`[prompt.runner]` 日志、质量事件与失败分类、统一结果收尾，包括实际执行的 `attemptEvidence`。

依赖方向为 `promptRunner.ts` → `execution/*` → Prompt 上下文、`llm/` 与平台 provenance。execution 不反向导入 facade，不维护第二套 runner。LLM 工厂与结构化调用的测试替换状态由 facade 持有，并在每次调用时传给执行模块；首轮、语义重试和空流兜底使用同一注入来源。

### Retry And Provenance Contracts

- `repairPolicy` 负责 JSON 解析或 schema 校验失败后的 repair。
- `semanticRetryPolicy` 负责 JSON 合法但 `postValidate` 未通过时的再生成。
- `singleProviderTransportAttempt` 只适用于非流式结构化执行，同时关闭 provider transport fallback、JSON repair 和 semantic retry；流式入口必须明确拒绝该选项。
- 实际 transport 必须通过平台 provenance 记录，禁止用 Prompt 调用次数推算或伪造模型 attempt。流式延迟完成与失败处理保留原 request state，避免把 token usage 或采纳结果归入其他请求。
- `postValidate` 接受结果之后才标记候选已采纳；重试、修复和废弃结果必须保留父子关系与未采纳状态。取消流也必须完成终态收尾。

## Core Layout

外部模块从 `core/promptRunner`、`core/promptTypes` 等稳定入口消费能力；注册元数据与运行时资产必须一致。新增执行职责放入 `core/execution/` 中已有责任模块或明确归属的新模块，不能把文件布局暴露为业务调用合同，也不能把大块执行实现重新塞回 facade。

## Migration Default

- 如果一个 prompt 还没有资产化，不要在原 service 里继续加分支。
- 先创建资产，再把 service 切到 registry + runner。
