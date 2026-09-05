# GitHub Issue 修改预期台账

## 用途

本台账在代码实施或对外回复前，集中记录 GitHub Issue 的问题边界、产品决策、验收条件与推进状态，避免讨论中的建议直接变成未审查的需求。

本台账与 `docs/issue-fix-record.md` 分工不同：

- 本台账记录尚未发布的修改预期与决策依据，可包含待实现、实现中和待验收事项。
- `docs/issue-fix-record.md` 记录已经合入并具有回归依据的问题修复，不承担需求评审和方案管理。

建议使用 `待评估`、`已确认`、`本地实现中`、`待验收`、`已合入`、`不采纳` 作为状态。只有完成目标分支合入并具备回归依据后，才把对应结果写入修复记录。

## Issue #126：模型清理与思考深度优化

- 优先级：P1
- 实施状态：本地实现与代码验证完成，待用户界面验收及后续合入决策
- 关联 PR：无
- 实施分支：`codex/issue-126-model-controls`
- 对外动作：暂不回复 Issue、暂不推送分支、暂不创建 PR

### 原始问题

模型厂商设置会长期堆积已经不用或已经废弃的模型，用户缺少低风险的清理方式。DeepSeek V4 只提供统一的思考开关，无法按创作成本和任务复杂度选择思考深度。

### 当前缺口

- 模型目录没有持久化的隐藏与恢复机制。
- DeepSeek 内置候选仍包含 `deepseek-chat`、`deepseek-reasoner`、`deepseek-coder` 等旧推荐项。
- DeepSeek V4 的普通请求没有把用户选择的思考深度传给兼容接口。
- 设置页、模型选择器和模型路由对隐藏模型缺少一致的展示边界。

### 产品决策

- “删除模型”采用本地隐藏语义，不操作厂商远程资源。
- 当前使用模型不能隐藏，用户需要先切换模型。
- 隐藏只影响新选择时的候选展示；已有任务路由继续显示并运行其已选模型，历史配置不被改写。
- DeepSeek V4 提供关闭、低、高、最大四档，旧数据与空值默认按高处理。
- 结构化任务优先保证 JSON 稳定性，现有能力判断可以强制关闭思考，并覆盖厂商默认设置。

### 实现预期

- 厂商配置持久保存 `hiddenModels` 与可空的 `reasoningEffort`，PostgreSQL 与 SQLite 使用非破坏性新增字段迁移。
- 模型标签支持快捷隐藏；高级维护区支持逐个恢复和全部恢复。
- 模型刷新、设置页和通用模型选择器过滤隐藏项，同时保留当前模型与已有路由使用的模型。
- DeepSeek V4 普通 OpenAI 兼容请求在启用思考时发送 `thinking.type=enabled` 和 `reasoning_effort`，关闭时只发送关闭参数。
- 保存设置后同步更新运行时缓存，使后续请求直接采用新设置。

### 非目标

- 不删除厂商远程模型或用户历史任务配置。
- 不增加任务级思考深度覆盖。
- 不扩展 Anthropic 或 Responses 协议的思考深度。
- 不把同一厂商的不同模型拆成多套独立连接。

### 验收条件

- 隐藏结果在页面刷新和应用重启后保留，模型刷新不会让隐藏项重新进入候选。
- 当前模型隐藏请求被界面阻止并由服务端拒绝。
- 已有路由使用的隐藏模型仍可查看和运行，新路由候选不主动推荐该模型。
- DeepSeek V4 的低、高、最大分别生成对应请求参数；关闭时不发送 `reasoning_effort`。
- 结构化任务仍可强制关闭思考；不支持该能力的模型不接收 DeepSeek 专用参数。
- 非法思考深度和格式异常的隐藏列表被接口校验拒绝。
- PostgreSQL 与 SQLite Schema 校验、服务端相关测试和前端类型检查通过。
- 隐藏、刷新、重启、恢复和四档切换由用户完成人工界面验收。

## World Generation Runtime Stories（个人仓库 Issue 暂不可用）

个人仓库 `shown1985/AI-Novel-Writing-Assistant` 当前关闭了 GitHub Issues（API 返回 410）。以下稳定编号作为本地索引；仓库启用 Issues 后再补录远程 Issue 号，不改变 story 边界。

### WGR-001：模型级 reasoning 策略接入世界骨架

- 优先级：P0
- 状态：待验收
- 关联 PR：个人 fork #1（阶段 1）
- 范围：在统一 LLM Runtime 中识别 GLM-5.3-Flash 等支持 reasoning effort 的模型；世界骨架任务请求低 reasoning 档位；不在业务服务中堆叠模型名称分支。
- 验收：请求包含 provider 认可的低 reasoning 参数；GLM standard 世界骨架返回合法 JSON；DeepSeek 与非目标模型保持兼容。
- 当前证据：GLM 推理参数与世界骨架低档策略已接入；服务端类型检查、构建和推理/结构化定向测试通过；隔离数据库的真实 OpenCode Go 调用返回 HTTP 200，生成 5 条规则、3 个阵营、5 个势力、6 个地点和 3 个故事入口。实际 UI 生成仍待验收。

### WGR-002：结构化输出耗尽与空正文错误分类

- 优先级：P0
- 状态：待验收
- 关联 PR：个人 fork #1（阶段 1）
- 范围：区分 reasoning 耗尽、输出截断、空正文和传输失败；保留现有恢复与错误摘要兼容性。
- 验收：GLM `finish_reason=length` 且正文为空时归类为 reasoning 耗尽；真正网络失败仍归类为传输错误；世界向导给出可执行提示。
- 当前证据：已覆盖 reasoning-only、预算截断和普通空正文的分类测试；真实调用以 `finish_reason=stop` 返回正文，世界向导已映射可执行提示，实际 UI 展示仍待验收。

### WGR-003：世界骨架分阶段生成与确定性组装

- 优先级：P1
- 状态：本地实现与定向测试完成，待验收
- 关联 PR：个人 fork #2（阶段 2，基于阶段 1 分支）
- 范围：蓝图、规则/阵营、势力/地点、关系/入口分阶段生成；以结构契约组装，不改变现有世界数据结构。
- 验收：单阶段失败只重试该阶段；ID 引用、数量、长度和 JSON Schema 在组装阶段统一校验。
- 当前证据：标准与复杂规模已按五个结构阶段加一个开局整理阶段执行；阶段分别使用独立 token 预算和低推理档位，统一装配器检查数量、唯一 ID、地图字段及跨实体引用，轻量规模仍走原有单次路径。服务端构建与隔离定向测试通过。

### WGR-004：世界生成检查点与源页面恢复

- 优先级：P1
- 状态：本地实现与定向测试完成，待用户验收
- 关联 PR：[个人 fork #3](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/3)（阶段 3，基于阶段 2 分支）
- 范围：保存阶段状态和可恢复结果；任务中心只读展示，恢复动作留在世界生成源页面。
- 验收：应用重启后可从最近成功阶段继续；失败记录带稳定源路由；不修改既有用户数据。
- 当前证据：新增世界生成运行与阶段检查点模型及 SQLite/PostgreSQL 迁移文件（尚未执行迁移）；标准/复杂规模每阶段成功后保存结构快照，失败响应携带运行 ID 与阶段信息；世界生成页面通过本机存储或最近未完成运行查询恢复，并提供继续入口；“运行记录”只读展示状态、阶段、错误与来源页面。服务端类型检查、客户端类型检查、服务构建与 3 项检查点/分阶段定向测试通过。

### WGR-005：调用前预算观测与运行诊断

- 优先级：P0
- 状态：本地实现与定向测试完成，待用户验收
- 关联 PR：[个人 fork #4](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/4)（阶段 4，基于 WGR-004 分支）
- 范围：在统一 Prompt Runner 记录渲染后提示的估算输入 Token、软上限、输出预算和预算状态；世界骨架各阶段显式使用观测模式；为后续硬门禁保留结构化错误契约。
- 验收：预算估算不调用供应商；未配置上限时状态为 `unknown`；达到 80% 时标记 `near_limit`；超过软上限时可在显式 `reject` 模式下阻断，默认 `observe` 不改变既有请求；遥测不包含 API Key、正文或完整 Prompt。
- 当前证据：新增 provider-agnostic 预算评估模块；结构化 Prompt Runner 返回预算快照并记录 near/exceeded 计数；世界骨架单次与分阶段请求均传入 12,000 Token 软上限和 512 Token 安全余量；预算、拒绝和世界骨架回归定向测试通过。完整提示工作台测试仍受当前 Node 24 与 `better-sqlite3` 原生 ABI 环境问题影响。

### WGR-006：推理额度耗尽的阶段级自适应重试

- 优先级：P0
- 状态：本地实现与定向测试完成，待用户验收
- 关联 PR：[个人 fork #5](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/5)（阶段 5，基于 WGR-005 分支）
- 范围：世界骨架某阶段明确被分类为 `reasoning_budget_exhausted` 时，仅对同一阶段执行一次关闭推理的重试；其他错误不改变既有同阶段重试策略。
- 验收：推理额度耗尽时前置阶段不重新调用；第二次请求保持同一 section、携带 `reasoningEnabled=false`；第二次仍失败时立即结束并保留检查点；不得按模型名称增加业务分支或无限重试。
- 当前证据：阶段编排器读取结构化错误分类，在当前阶段第二次调用关闭推理；新增回归测试验证只重试 profile 阶段且不影响后续阶段；世界骨架定向测试 4/4 通过。

### WGR-007：macOS SQLite 集成测试与兼容门

- 优先级：P1
- 状态：本地实现与定向测试完成，待集成回归与用户验收
- 关联 PR：[个人 fork #6](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/6)
- 实施分支：`fix/world-generation-prisma-harness`
- 范围：让临时 SQLite 集成测试在 macOS/Prisma 7 下显式创建数据库文件；修复兼容门面代理丢失应用服务实例的问题；为已有章节计划写入执行契约哈希，避免真实链路测试意外调用外部模型。
- 非目标：不改变生产数据库文件、不执行用户数据库迁移、不改变世界生成业务协议、不为测试注入真实 API Key。
- 验收：临时 SQLite 数据库可以完成 `prisma db push`；兼容门面调用卷级服务时保留正确接收者；p0b 真实链路中导演恢复场景和 RAG 兼容场景不因工具链或未配置模型失败；剩余失败必须能归类为既有产品测试缺陷。
- 当前证据：空 SQLite 文件预创建已使 Prisma schema push 成功；兼容门面回归测试通过；在独立且预创建、已完成 schema push 的 SQLite 数据库上，全量 integration 套件为 136 项，其中 132 项通过、2 项跳过、2 项失败；剩余失败分别是既有 legacy source 断言（`volume` 与测试期望的 `legacy` 不一致）和既有 Prompt governance 白名单缺口（`ComicFactService.ts` 的两个内联消息构造器），均未指向本阶段工具链修复回归；RAG 兼容测试 2 项通过；世界骨架与预算定向测试保持通过。

### WGR-008：世界生成请求超限识别与阶段上下文投影

- 优先级：P0
- 状态：本地实现与定向测试完成，待用户真实模型验收
- 关联 PR：无（待本阶段验证后创建个人 fork PR）
- 实施分支：`fix/world-generation-budget-preflight`
- 范围：在统一结构化 LLM Runtime 中识别供应商返回的 413、`context_length_exceeded`、`payload too large`、`too big` 等请求超限错误；世界生成向导给出“减少参考内容或拆分生成”的可执行提示；将思考关闭选项从 Prompt Runner 传递到实际结构化客户端；世界骨架各阶段只向模型发送当前阶段需要的短摘要和稳定 ID，不改变持久化结构、用户输入和跨阶段装配规则。
- 非目标：不把“Too big: expected array to have <=N items”的 Zod 数组校验误报为请求超限；不伪装 Trae/Claude Code 客户端；不调整数据库结构、不删除或覆盖用户数据；不把所有小说生成任务一次性迁移到新上下文投影。
- 验收：请求超限能稳定归类为 `request_too_large` 并在结构化策略轮换前停止；世界生成与恢复接口返回明确的缩小上下文/拆分建议；思考关闭重试实际传到 provider adapter；阶段提示保留跨实体引用所需 ID 且不会携带完整历史长文本；已有世界骨架阶段、检查点和 fallback 定向测试保持通过；使用 GLM-5.3 Flash 与 DeepSeek V4 Flash 各完成一次 standard 规模世界生成后再进入用户验收。
- 当前证据：结构化错误分类、非误报 Zod “Too big”、思考参数传递、世界阶段上下文投影、轻量长输入裁剪和既有世界骨架编排定向测试共 35 项全部通过；根 `typecheck`（shared/server/client/desktop）通过。使用全新临时 SQLite 完成 schema push 后，集成套件 136 项中 132 项通过、2 项跳过、2 项失败；失败仍是既有 legacy source 断言与 ComicFactService Prompt 白名单缺口，未涉及本切片。真实模型重现尚未在本阶段执行。

### WGR-009：OpenCode Go 结构化请求能力识别与思考预算保护

- 优先级：P0
- 状态：待用户真实模型验收
- 关联 Issue：个人仓库 Issues 当前关闭（GitHub API 返回 410），以下编号继续作为本地索引
- 实施分支：`codex/world-generation-opencode-capability`
- 范围：在统一 LLM 能力层识别 OpenCode Go 端点；对 DeepSeek V4 Flash 结构化 JSON 请求采用非思考策略，对 OpenCode Go 的 GLM-5.3 Flash 使用网关支持的低推理档位，避免发送该端点拒绝的关闭思考参数；普通文本/流式请求保留显式思考配置。新增端点、模型组合与未知自定义端点的回归测试。
- 非目标：不伪装 Trae/Claude Code 等客户端；不改变 API Key 存储、数据库结构、世界持久化结构或所有任务的 Agent Runtime；不在业务服务中堆叠模型名称分支。
- 验收：OpenCode Go + DeepSeek V4 结构化请求的 resolved options 标记 `reasoningForcedOff=true` 并携带关闭思考参数；OpenCode Go + GLM-5.3 Flash 使用 `reasoning_effort=low` 且不发送 `thinking.type=disabled`；普通文本请求不被强制关闭；官方端点和未知自定义端点保持既有行为；LLM/世界生成定向测试与服务端类型检查通过。
- 当前证据：OpenCode Go 端点识别、DeepSeek V4/GLM-5.3 Flash 结构化关闭思考、普通文本保留思考、官方与未知自定义端点回归测试均已覆盖；服务端构建、根 typecheck，以及 LLM/推理/会话/结构化调用/世界骨架定向测试共 49 项全部通过。GitHub Issues 当前关闭，远端 Issue 无法创建（API 410）；个人仓库 PR：[shown1985/AI-Novel-Writing-Assistant#8](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/8)，当前未合并。真实 OpenCode Go 模型和 UI 世界生成仍需用户验收。

### WGR-010：GLM 思考开关参数映射

- 优先级：P0
- 状态：本地实现完成，待合并与用户真实模型验收
- 关联 Issue：个人仓库 Issues 当前关闭（GitHub API 返回 410），以下编号继续作为本地索引
- 实施分支：`codex/opencode-glm-thinking-toggle`
- 范围：在统一推理适配器中区分官方 GLM 与 OpenCode Go 网关的思考契约：官方 GLM 显式发送 `thinking.type`，OpenCode Go GLM-5.3 Flash 使用网关要求的 `reasoning_effort`，不发送被网关拒绝的 `thinking.type=disabled`。DeepSeek、其他模型和会话身份保持既有映射。
- 非目标：不改变 DeepSeek、MiniMax 或其他模型参数；不在世界生成服务中增加模型分支；不调整数据库、提示词业务结构或 OpenCode 会话身份。
- 验收：官方 GLM 结构化请求 resolved options 中出现 `thinking: { type: "disabled" }` 且不带 `reasoning_effort`；OpenCode Go GLM-5.3 Flash 结构化请求使用 `reasoning_effort: "low"`，即使调用方请求关闭也降为网关可接受的最低档位；普通文本请求保留显式推理档位；推理适配器、世界骨架定向测试与真实 OpenCode Go 标准规模回放通过。
- 当前证据：官方 GLM 与 OpenCode Go 分支参数映射、DeepSeek 保持思考开关、普通文本行为的回归测试已通过；服务端构建与根 typecheck 通过，LLM/推理/会话/结构化调用/世界骨架定向测试共 49 项全部通过。真实 OpenCode Go 回放确认 GLM-5.3 Flash 拒绝 `thinking.type=disabled`（返回错误码 1210，要求使用 low/high/max），该端点契约已按官方网关行为调整；完整标准规模回放还被地点阶段提示契约缺陷阻断，转入 WGR-011 修复。提交：`1b6c5ba1`；个人仓库 PR：[shown1985/AI-Novel-Writing-Assistant#9](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/9)，当前未合并。

### WGR-011：地点阶段提示与地图字段契约对齐

- 优先级：P0
- 状态：本地实现与真实模型回放完成，待合并与用户验收
- 关联 Issue：个人仓库 Issues 当前关闭（GitHub API 返回 410），以下编号继续作为本地索引
- 实施分支：`codex/world-location-prompt-contract`
- 范围：让地点阶段的 JSON 示例与装配校验保持同一份字段契约，明确要求 `x`、`y`、`directionHint`、`terrain`、`narrativeFunction`、`risk`、`riskLevel`、`entryConstraint`、`exitCost`，不改变世界持久化结构或其他阶段策略。
- 非目标：不放宽地图字段校验；不在前端补造地点坐标；不调整数据库、模型路由、OpenCode 会话身份或其他世界生成阶段。
- 验收：地点提示契约回归测试通过；服务端构建通过；使用 OpenCode Go GLM-5.3-Flash 的 standard 科幻世界真实回放完成规则 5、阵营 3、势力 5、地点 6、势力关系 6、地点控制 6、故事入口 3，`readyForNovelUse=true`，完整度 0.92。
- 当前证据：地点阶段此前因提示示例缺少地图字段而在装配校验失败；补齐示例后，真实回放耗时约 54.6 秒并完整通过，无 `too big`、无错误码 1210。服务端构建与地点/世界骨架定向测试 8 项全部通过。提交：`85a48454`；个人仓库 PR：[shown1985/AI-Novel-Writing-Assistant#10](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/10)，当前未合并。

### WGR-012：开局展示上下文与具体势力 ID 约束

- 优先级：P0
- 状态：本地实现与双模型真实回放完成，待合并与用户验收
- 关联 Issue：个人仓库 Issues 当前关闭（GitHub API 返回 410），以下编号继续作为本地索引
- 实施分支：`codex/world-presentation-context-contract`
- 范围：为开局展示阶段建立独立的最小上下文投影，只传递世界摘要、具体势力和地点的必要字段；在提示中明确 `recommendedLocationIds` 与 `involvedForceIds` 的可选 ID 清单，避免将 faction ID 当作 force ID。
- 非目标：不改变前五个世界生成阶段的上下文；不放宽入口引用校验；不在前端把阵营名称转换为势力 ID；不调整数据库或模型协议。
- 验收：展示阶段上下文不包含完整 relations/factions；提示明确列出具体势力 ID；GLM-5.3-Flash 与 DeepSeek V4 Flash 的 OpenCode Go standard 科幻世界回放均完成全部数量约束并通过入口引用校验。
- 当前证据：小型展示探针从约 1,600 字符输入在 4.9 秒内完成；压缩上下文后 DeepSeek 入口 ID 仍暴露 faction 引用，补充具体 ID 清单并移除 factions 后，完整回放成功。DeepSeek standard 回放耗时约 64.5 秒，规则 5、阵营 3、势力 5、地点 6、势力关系 6、地点控制 6、故事入口 3，`readyForNovelUse=true`；GLM standard 回放耗时约 54.6 秒同样通过。提交：`55dfd7e8`；个人仓库 PR：[shown1985/AI-Novel-Writing-Assistant#11](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/11)，当前未合并。

### WGR-013：世界骨架完整度评分量纲

- 优先级：P1
- 状态：本地实现与双模型真实回放完成，待合并与用户验收
- 关联 Issue：个人仓库 Issues 当前关闭（GitHub API 返回 410），以下编号继续作为本地索引
- 实施分支：`codex/world-assessment-score-contract`
- 范围：在世界骨架生成和开局展示 Prompt 中明确 `completenessScore` 使用 0-100 的百分制整数，避免不同模型返回 0-1 或 1-10 量纲后在界面显示失真。
- 非目标：不重算模型对世界质量的判断；不修改 `readyForNovelUse`、缺口列表或世界结构；不引入固定关键词评分。
- 验收：Prompt 回归测试覆盖百分制整数要求；GLM-5.3-Flash 与 DeepSeek V4 Flash 的 OpenCode Go standard 回放均返回整数百分制，并完成全部结构和入口校验。
- 当前证据：服务端构建与根类型检查通过，相关回归测试 52/52 通过；DeepSeek 回放返回 `85`，耗时约 43.2 秒；GLM 回放返回 `92`，耗时约 79.0 秒，均为整数且 `readyForNovelUse=true`。提交：`7ba8fcf6`；个人仓库 PR：[shown1985/AI-Novel-Writing-Assistant#12](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/12)，当前未合并。

## Next Runtime Stabilization Stories（个人仓库 Issues 暂不可用）

个人仓库的 Issue 列表可以读取 Pull Request，但创建 Issue 仍返回 GitHub API 410（`Issues has been disabled in this repository`）。以下编号先作为本地索引；仓库启用 Issues 后按原编号补录，不能用 PR 号冒充 Issue。

### WGR-014：Provider 能力矩阵与请求预算契约

- 优先级：P0
- 状态：个人 fork PR #14 待验收
- 关联 Issue：创建失败，个人仓库 API 返回 410
- 实施分支：`codex/world-generation-budget-runtime`
- 范围：为 Provider/Model/Endpoint 建立统一能力描述，覆盖输入上下文上限、最大输出上限、JSON 能力、reasoning 契约和未知能力状态；让统一 Prompt Runner 在调用前读取能力并生成预算快照；保留 observe/reject 两种策略；区分本地预算错误、供应商 413 和 schema 数组 Too big。
- 非目标：不修改数据库结构、世界骨架持久化结构或用户数据；不在世界服务中增加 provider/model 分支；不把供应商文档上限当作精确 tokenizer 结果。
- 验收：OpenCode Go、内置 Provider、自定义端点使用同一能力契约；未知上限不误阻断；reject 才抛出本地预算错误；日志不含 API Key、完整提示词或正文；既有 WGR-001～013 回归保持通过。
- 当前证据：新增统一能力快照与请求预算来源字段，覆盖显式上限、Provider 默认输出上限、未知自定义端点、OpenCode Go reasoning 能力和端点查询参数脱敏；预算与能力定向测试通过，根类型检查通过。
- 个人 fork PR：[shown1985/AI-Novel-Writing-Assistant#14](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/14)，基于 `codex/macos-wgr-acceptance`，未合并。

### WGR-015：世界阶段上下文预算器与降级策略

- 优先级：P0
- 状态：个人 fork PR #14 待验收
- 关联 Issue：创建失败，个人仓库 API 返回 410
- 实施分支：`codex/world-generation-budget-runtime`
- 范围：将世界骨架各阶段的上下文选择、摘要、可选块丢弃和请求重试收敛为独立预算器；超预算时按必选约束、稳定 ID、关系引用、用户约束的优先级降级；保留成功阶段和检查点，不重复生成前置阶段。
- 非目标：不扩展到所有小说生成链路；不在前端猜测缺失实体或坐标；不通过关键词匹配替代 AI 结构化决策；不修改数据库结构。
- 验收：小、中、大规模和长参考输入均有可追踪预算快照；必选上下文不会静默丢失；可选上下文按策略摘要或丢弃；请求过大时能给出缩小规模/拆分阶段提示；增加预算边界、降级、重试和脱敏日志测试。
- 当前证据：请求过大时同一阶段只重试一次，第二次使用最小上下文、截短用户意图/参考约束并降低输出预算；开局整理阶段和轻量单次流程同样受保护；新增阶段与展示重试回归测试，世界骨架测试通过 13/13，组合 LLM/预算/会话/结构化测试通过 60/60。
- 个人 fork PR：[shown1985/AI-Novel-Writing-Assistant#14](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/14)，基于 `codex/macos-wgr-acceptance`，未合并。

### WGR-016：Mac 世界生成端到端验收门

- 优先级：P1
- 状态：自动验收脚本完成，待用户验收首次配置、世界生成和 Dock
- 关联 Issue：创建失败，个人仓库 API 返回 410
- 实施分支：`codex/macos-runtime-acceptance`
- 范围：验证 DMG 安装、首次配置、GLM/DeepSeek 中等规模世界生成、保存、重启恢复、Dock 再激活和故障提示。
- 非目标：不在未签名开发包上执行公开发布；不上传上游；不修改用户数据库。
- 验收：自动脚本完成 DMG 挂载、独立复制、本地服务启动、首次写入、重启恢复并保留临时测试目录；用户再完成首次配置、中等规模世界生成、Dock 再激活和故障提示，失败时能返回世界生成源页面继续，而不是停留在任务中心操作。
- 当前证据：`pnpm verify:desktop-package:mac:reuse-stage` 通过；`pnpm verify:desktop:runtime:mac` 首次启动与重启均通过并解析到不同的动态端口，临时数据目录会由脚本输出并保留供排查。
- 个人 fork PR：[shown1985/AI-Novel-Writing-Assistant#15](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/15)，基于 WGR-014/015 PR #14，未合并；真实模型、首次配置和 Dock 再激活仍待用户验收。

### WGR-017：Agent Runtime 控制平面 MVP

- 优先级：P1
- 状态：架构审查完成，现有 Runtime 已满足 MVP 控制面；待 WGR-016 人工验收后按需补适配器
- 关联 Issue：创建失败，个人仓库 API 返回 410
- 关联 PR：[个人 fork #16](https://github.com/shown1985/AI-Novel-Writing-Assistant/pull/16)
- 实施分支：`codex/agent-runtime-control-plane`
- 范围：验证并固化现有 `DirectorRuntimeService`、`DirectorRuntimeStore`、`DirectorNodeRunner`、`WorkflowStepModule`、`DirectorPolicyEngine` 与任务投影的控制面边界；只有出现明确缺口时，才增加单一职责的步骤适配器。
- 非目标：不重写现有 Director；不新增第二套队列、状态机、重试计数或万能 Agent 门面；不迁移 MySQL；不新增通用聊天分支；不改变现有 Prompt Registry 规则。
- 验收：现有 Runtime 可恢复阶段任务、区分可重试与需人工处理的失败、保留局部质量债务不阻断全局链；世界 `world_setup` 已通过现有 StepModule 接入；新增能力可以通过统一 Runtime 和 Provider Adapter 承载；世界生成与章节生产兼容回归保持通过。
- 当前证据：`DirectorRuntimeService` 提供 `runNode`、`runNextStep`、`continueRuntime`、`runUntilGate`；`DirectorRuntimeStore` 持久化运行、步骤、事件、产物和策略；`DirectorNodeRunner` 执行策略、幂等和步骤状态；`directorPlanningStepModules` 已将 `world_setup` 注册为工作流步骤；Runtime 定向测试 51 项中 45 项通过、0 项失败、6 项跳过。基于证据不新增重复 Runtime，下一步只保留人工验收和必要适配器。
