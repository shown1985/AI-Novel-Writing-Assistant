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
  - `world/stages/inspiration.prompts.ts`：参考作品灵感、概念卡生成与本地化、世界属性选项。
  - `world/stages/layers.prompts.ts`：深化追问、一致性检查、分层生成与本地化、世界公理建议。
  - `world/stages/structure.prompts.ts`：结构化世界数据（导入抽取、结构回填、按小说主题生成世界、结构分段生成）与世界可视化。
  - `world/worldDraft.prompts.ts`：世界骨架生成与展示、世界草稿生成与润色（含候选改写）。
  - `world/world.promptSchemas.ts`、`world/world.promptTypes.ts`：各阶段共用的输出 schema 与输入类型，阶段文件单向依赖它们，不反向依赖 facade。

## Runner Usage

- 结构化输出使用 `runStructuredPrompt`
- 纯文本输出使用 `runTextPrompt`
- 流式文本输出使用 `streamTextPrompt`
- 流式结构化输出使用 `streamStructuredPrompt`
- 调用方继续保留原 service 的 public method、数据库写入和返回 shape

说明：

- `repairPolicy` 负责 JSON 解析 / schema 校验失败后的 repair
- `semanticRetryPolicy` 负责 JSON 已合法但 `postValidate` 未通过时的再生成

## Core Layout

`core/` 是 runner 与上下文治理的运行时，外部模块只从 `core/promptRunner`、`core/promptTypes` 等顶层入口导入，不直接依赖 `core/runner/` 内部文件。

- `core/promptRunner.ts`：公开入口与编排 facade。持有 `runStructuredPrompt`、`runTextPrompt`、`streamTextPrompt`、`streamStructuredPrompt`、`preparePromptExecution` 以及 `setPromptRunner*ForTests`。这些导出必须定义在本文件内：测试会直接替换 `dist/prompting/core/promptRunner.js` 的导出对象属性（例如 `promptRunner.runStructuredPrompt = ...`），服务端调用方也经由该模块对象调用，改成 re-export 会让替换失效。
- `core/runner/llmBindings.ts`：可替换的 LLM 依赖（`getLLM` 工厂与 `invokeStructuredLlmDetailed`）及调用选项。runner 各模块在调用时通过 getter 读取，保证 `setPromptRunner*ForTests` 对首轮调用、语义重试和空流兜底同时生效。
- `core/runner/promptPreparation.ts`：注册校验、上下文块选择后的 `PromptRenderContext` 组装、`PromptInvocationMeta` 构建。
- `core/runner/slotOverlays.ts`：按作品解析 prompt slot overrides，把追加块并入上下文、把内联 slot 交给渲染。
- `core/runner/requestBudget.ts`：渲染后 prompt 字符估算与请求预算快照日志（`[prompt.budget]`）。预算判定本身在 `llm/requestBudget.ts`，是否拒绝超限请求由编排层按 `options.requestBudget.mode` 决定。
- `core/runner/outputResolution.ts`：`postValidate` 应用、语义重试消息构建与结构化结果解析循环（含 `postValidateFailureRecovery`）。
- `core/runner/promptTelemetry.ts`：`[prompt.runner]` 日志、质量遥测事件（completed / failed / 失败分类）以及统一的 `PromptRunResult` 收尾。
- `core/runner/streamCapture.ts`：流式输出的文本、token usage 与 reasoning 采集。

依赖方向：`promptRunner.ts` → `runner/*` → `core/` 其他模块与 `llm/`；`runner/*` 不反向导入 `promptRunner.ts`。新增运行时职责时放入 `runner/` 下对应文件或新建有明确归属的文件，不要回填到 facade。

## Migration Default

- 如果一个 prompt 还没有资产化，不要在原 service 里继续加分支。
- 先创建资产，再把 service 切到 registry + runner。
