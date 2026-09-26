# 当前模型选择与厂商默认模型边界

## 背景

顶部模型选择会影响 Creative Hub、自动导演、章节生产、写法引擎、世界观与角色生成等多条 AI 调用入口。过去如果当前选择只存在浏览器本地存储，项目重启、桌面 userData 变化、浏览器 origin 变化或本地缓存被清理后，界面会回到前端内置默认值。内置默认值又可能落到某个厂商的旧模型名，导致新手用户在不理解模型配置细节时直接遇到不可用模型。

模型厂商配置和当前模型选择必须分清事实源：厂商配置说明“这个厂商如何连接、默认模型是什么、是否可运行”；当前模型选择说明“顶部工作区现在要用哪一个厂商和模型”。

## 决策

当前顶部模型选择以服务端 `AppSetting` 为主要事实源。前端状态只作为本次页面运行时的投影，不再用浏览器 localStorage 决定长期默认模型。

当没有已保存的当前选择，或已保存的厂商不可运行时，系统从已配置、启用且有模型列表的厂商中解析一个可运行选择。解析顺序优先尊重用户保存的厂商和模型；只有保存值缺失或失效时，才使用可运行厂商列表的首个候选。

内置厂商的静态模型清单只能作为设置页的候选提示或已有配置的兜底，不应在未保存模型时直接成为顶部当前模型。未保存模型时应优先使用服务端能获取到的模型目录；获取不到目录时，让厂商保持不可运行状态，引导用户在设置页明确选择或填写模型。

## 当前规则

- 顶部当前模型选择保存到 `AppSetting` 的 `llm.currentSelection`，内容包含 provider、model、temperature 和可选 maxTokens。
- 前端 `useLLMStore` 保存的是运行时投影；页面启动后由设置接口和当前选择接口共同水合。
- 水合期间如果厂商配置或当前选择仍在刷新，选择器不得把暂时不可见的厂商当作失效并持久化首个候选；快速配置完成后先刷新这两份事实源，再写入运行时选择。
- `LLMSelector` 只展示已配置、启用、且存在可用模型的厂商。
- 用户在顶部切换厂商或模型后，前端应同步保存到服务端当前选择。
- 没有保存模型的内置厂商不应因为 `PROVIDERS.*.defaultModel` 存在就被视为可运行；需要保存模型、环境模型或可拉取的模型目录。
- 模型路由、结构化兜底和各任务的显式模型覆盖仍属于独立配置；它们不等同于顶部当前模型。
- 设置入口保持职责分离：“模型与厂商”只管理连接、鉴权和模型目录；“模型路由管理”独立管理任务路由与结构化备用模型。两页可共享同一厂商数据，但不应重新合并成长页面。
- 自定义厂商的鉴权方式属于厂商连接合同，模型目录、连接测试和正式生成必须读取同一设置。当前只支持常见的 `Authorization: Bearer`、`x-api-key` 和无需鉴权三种模式；不得让模型目录能连接而正式生成仍固定发送 Bearer。
- 用户填写的 API 地址可以是版本根地址，也可以直接是 `/models` 地址。模型目录请求只在路径尚未以 `/models` 结尾时追加该段，避免 Gemini 或网关地址变成重复路径。
- DeepSeek 的新配置推荐值是 `deepseek-flash`。旧名 `deepseek-v4-flash` / `deepseek-v4-pro` 仍按同一套思考开关和结构化能力处理，这个推荐只影响未保存模型时的配置引导与内置候选顺序，不覆盖已有厂商配置、顶部当前选择或任务级路由。
- 隐藏模型属于候选目录维护：设置页、模型刷新和新选择入口不再展示隐藏项，但不会删除厂商资源，也不会改写历史任务或路由。
- 当前使用模型不能隐藏。已有模型路由引用隐藏项时，该路由仍应显示并继续运行，直到用户主动切换。
- 厂商级思考深度是普通请求的默认值。DeepSeek V4 使用低、高、最大三档，空值按高处理；关闭时不得继续发送深度参数。
- 结构化任务的输出稳定性高于厂商级思考偏好。能力档案要求关闭思考时，运行时必须覆盖用户默认值，避免推理内容破坏结构化结果。
- 顶部保存的 temperature 是用户偏好，不是绕过模型参数约束的最终请求值。正式调用必须先经过模型能力兼容层；例如 Kimi K3 的 temperature 固定为 `1.0`，即使经由自定义中转厂商调用、当前选择仍保存其他值，请求也必须按模型身份收敛到允许值。

### 解析来源证据

- 模型来源必须由实际 resolver 在解析 provider、model、temperature 和 maxTokens 时同步生成；实况中的“预计模型”只能来自该次调用显式提供的 live context；客户端或历史查询不得根据“当前设置”反推一次旧调用。
- 每个字段分别记录 `requested / effective / source / adjustments`。同一次调用允许字段来自不同来源，例如厂商由显式请求指定、模型来自厂商配置、温度和 Token 上限来自任务路由。
- source 只表达确定事实：显式请求、任务路由、任务默认、厂商配置、环境配置、内建默认、备用默认、系统默认或未知。旧记录没有证据时使用 `unknown`，不能补造来源。
- adjustment 保存发生修正前后的值、执行修正时的 provider 与结构化原因。provider 必须归属于产生该修正的解析层；如果任务路由先按 DeepSeek 限制 Token、随后显式请求把最终厂商覆盖为 OpenAI，限制记录仍归因于 DeepSeek。当前覆盖厂商 Token 上限、历史 4096 占位、固定/最小/最大温度，以及结构化输出的 Token 截断或省略。
- `routeDegraded` 保留严格任务缺路由时的既有语义；`routeDegradedReason` 独立说明严格路由未配置或路由存储查询失败，因此非严格任务可以保持 `routeDegraded=false` 同时记录查询失败原因。
- 共享 provenance 是脱敏投影，不是 `ResolvedLLMClientOptions` 的序列化结果。API Key、Base URL、authMode、modelKwargs、Prompt 与 session 信息禁止进入该结构。
- attempt lineage 在来源合同中只定义关联形状。实际请求 ID、重试/修复/备用尝试和持久化属于后续调用证据能力，不能在解析阶段伪造。

### 实际调用尝试证据边界

- “预计使用模型”来自 resolver 并随该次调用的 live context 显式提供；“实际调用模型”只能来自真实 provider transport 尝试，并以 adopted persisted attempt 作为作者可见事实。Token 用量表、十分钟 live interaction 和当前模型配置都不能回填历史 attempt。
- 生产 text invoke/stream 与 structured invoke/stream 共享同一 request/attempt 运行时边界：每次物理 transport 调用先建立 attempt，再以 `succeeded / failed / cancelled` 结束；结构化校验、修复或语义协调完成后另记录 `adopted / not_adopted`。这样可以区分“服务商完成了响应”和“该候选被业务采用”，避免重试或修复覆盖真实来源。
- attempt recorder 是旁路观测能力。start/finalize/repository 失败时，调用结果、调用次数、重试/备用策略、正文和任务状态保持不变，并通过 `complete / partial / missing` 标识证据完整度；原因是证据缺失不应触发一次新的创作调用或改变作者已得到的结果。
- 一个逻辑 request 可以包含多个有序 attempt。每次 invoke/stream、transport retry、structured strategy retry、JSON repair、semantic retry 和 fallback 都有独立 `attemptId`、`attemptIndex`、role、route tier 与 parent；transport 状态和最终是否被采用必须分开记录。
- usage 可以为 null，仍必须保留 attempt。旧历史缺证据时只能是 `legacy_unknown` 或未记录，不能把 null 当成零用量，也不能按当前默认模型补造来源。
- 通用 attempt store 与导演 Token 表职责分离。前者是跨产品入口的调用事实，采用 append/finalize 模型；后者仍服务导演用量投影，不能因为已有 task/run 外键就泛化成全局事实源。
- 通用 store 的数据库行只保存冻结的标量白名单；API key、Base URL、鉴权/header、Prompt/上下文/正文、模型输出、reasoning 和 provider 错误正文不能进入表。失败码使用显式有限集合，旧未知值只读为 `legacy_unknown`。
- `startAttempt` 与 `finalizeAttempt` 的幂等、终态不可改写和单 request 唯一 adopted 必须在 request 可串行化事务内完成；数据库 adapter 使用 started-only CAS finalize，遇到唯一键或序列化冲突时重开整个事务，而不是局部重放写入。
- repair、semantic retry 和 fallback 属于同一 request lineage，但每个 attempt 可以有自己的 Prompt 身份和模型选择；跨 attempt 只固定调用模式与完整归因 frame，不能把首次 Prompt id/version 错当成 request 恒等字段。
- 首版 attempt 表只保存归因标量 ID，不建立指向小说、任务或章节的 Cascade 外键，也不自动清理或从导演 Token 表回填历史。删除业务对象不能顺带抹掉模型调用证据。
- 归因按完整 frame 选择：有效自动导演 runtime frame 优先，其次是调用点显式传入的 Prompt invocation frame；冲突或缺失时保持 unknown，不得从 label、entrypoint 关键词、URL 或 live taskId 做字段级拼接。
- attempt 观测是 side channel。存储 start/finalize 失败不得重发模型、改写正文、改变任务状态、升级质量债或清除人工暂停；调用结果应显式携带 `complete|partial|missing` 观测状态。
- `promptRunner.ts` 超过硬阈值时，先按 execution context、text execution 与 structured execution 拆分并保持 facade 等价，再接 attempt recorder；不得继续把观测逻辑堆进巨型核心文件。

### 首批显式归因入口与内部读投影

模型 attempt 的归因必须来自调用开始时捕获的显式 context，而不是从当前页面、按钮文案、默认设置或实况订阅倒推。首批生产接线只覆盖以下三个入口：

| 入口 | 必要归因 | 事实来源与边界 |
| --- | --- | --- |
| 自动导演 runtime | `novelId`、`taskId`、`directorRunId`、step idempotency key、node key、entrypoint | 使用同一时点的完整 runtime frame；frame 内字段必须整体一致，不能与旧 telemetry 或局部对象拼接 |
| 本书世界生成 | `novelId`、`entrypoint=novel-world-generate` | 使用 prompt invocation context；不从世界名称、URL 或顶部模型选择推断作品 |
| 章节改稿预览 | `novelId`、`chapterId`、`entrypoint=ai-revision-preview` | 使用 prompt invocation context；chapter label 或当前页面不能替代显式身份 |

读投影必须把“没有持久记录”和“有记录但身份不完整”分开：

- `reconstructRequest(...) === null` 只表示 `not_found`，不得由此制造 `evidenceStatus=missing`。
- 持久记录缺少可靠身份时使用独立的 `attributionStatus=unattributed|partial`；必要身份完整时才是 `attributionStatus=complete`。
- `evidenceStatus=complete|partial|missing` 仍属于实际执行观察事实，只能透传调用方同时提供的真实 `ModelAttemptExecutionEvidence`，不能由读服务按归因缺失、空投影或 repository 读取结果推断。
- 未覆盖入口和历史旧记录保留 `legacy_unknown/unattributed`；不得回填新身份，也不得因为读投影完成而扩大为公开 API 或调用历史 UI。

这套读投影是内部平台能力，供后续受控消费；public read DTO 必须显式白名单映射，不能直接序列化内部投影。实况 requestId 必须从 attempt scope 显式传入；读取只读，不反查调用历史，也不等于作者已经能在界面查看所有调用来源。只读显示应另行冻结数据合同、身份隔离和用户验收，不得把内部归因 PASS 夸大为全系统透明度已交付。

#### 失败模式

- runtime frame 与 telemetry 字段冲突：保留冲突/缺失证据，不选择“看起来最新”的字段继续归因。
- repository 找不到 request：返回 `not_found`，不显示为执行失败，也不触发模型重试。
- 记录存在但归因不完整：返回 `attributionStatus=partial|unattributed`，保留可用的脱敏记录，不补造 novel、task 或 chapter 身份。

## 示例

推荐做法：

- 用户在顶部从 DeepSeek 切到 Qwen 后，重启项目仍从服务端读取 Qwen 和对应模型。
- 某厂商配置了 API Key 但没有保存模型时，服务端先尝试读取该厂商模型目录，并把目录首项作为当前可用模型。
- 如果模型目录无法读取，设置页继续允许用户手动填写模型，但顶部不自动选择内置旧模型名。

禁止或不推荐做法：

- 在前端状态初始化时写死 `deepseek/deepseek-chat`。
- 因为某个 provider 的静态 defaultModel 存在，就把未完成配置的厂商显示为可运行。
- 用关键词、特殊厂商分支或一次性迁移脚本掩盖模型目录和当前选择事实源不一致的问题。

## 失败模式

- 重启后顶部模型跳回旧默认：先查 `AppSetting.llm.currentSelection` 是否存在，再查前端是否完成水合，最后查当前厂商是否仍在 `/api/settings/api-keys` 的可运行列表中。
- 顶部显示的模型不可用：检查厂商是否只有静态默认模型、是否没有保存模型、模型目录是否拉取失败。
- 快速配置完成后顶部厂商短暂跳回 Ollama：检查 `/api/settings/api-keys` 是否仍在刷新，以及 `llm.currentSelection` 是否被选择器在旧缓存上执行了回退写入。配置完成流程必须等待厂商列表和当前选择刷新后再更新运行时投影。
- 设置页能看到厂商但顶部没有它：确认 `isConfigured`、`isActive` 和模型列表是否同时满足，未配置模型的厂商不应进入顶部候选。
- 隐藏模型仍出现在普通候选：检查厂商的 `hiddenModels` 是否正确解析，并确认该模型是否被当前选择或已有路由保护。
- DeepSeek 思考深度未生效：先确认使用的是 Flash/Pro（含 `deepseek-flash`、`deepseek-pro` 及旧的 V4 名称）和 OpenAI 兼容协议，再检查结构化任务是否按能力档案强制关闭了思考。
- 自定义厂商返回 401/403：先核对鉴权方式是否与接口文档一致，再分别检查模型目录、连接测试和正式生成是否使用同一 `authMode`；不要只在刷新模型接口临时改请求头。
- 模型目录地址出现 `/models/models`：检查地址归一函数是否把用户填写的完整目录地址再次拼接，不要为单个厂商增加硬编码例外。
- Kimi K3 返回 temperature 参数错误：先确认实际模型名进入 Kimi 能力兼容层（包括自定义中转厂商），再检查最终客户端配置是否在构造请求前把 temperature 收敛为 `1.0`；不要要求用户反复调整顶部偏好来规避固定参数约束。

## 相关模块

- `server/src/services/settings/LLMSelectionSettingsService.ts`
- `server/src/routes/settings/llmSelectionRoutes.ts`
- `server/src/routes/settings.ts`
- `server/src/llm/modelCatalog.ts`
- `server/src/llm/capabilities.ts`
- `server/src/llm/modelRouter.ts`
- `server/src/llm/factory.ts`
- `server/src/platform/llm/provenance/`
- `shared/types/llm.ts`
- `client/src/components/layout/LLMSelectionBootstrap.tsx`
- `client/src/components/common/LLMSelector.tsx`
- `client/src/store/llmStore.ts`

## 来源文档

- [模块边界与文档治理](./module-boundaries.md)
- [项目协作规则](../../../AGENTS.md)
