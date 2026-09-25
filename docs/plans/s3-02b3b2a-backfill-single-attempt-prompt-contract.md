# S3-02b3b2a：结构补全单次物理模型调用门

## 身份、价值与状态

- Release / Epic：Release 1 / S3 可信世界；Story ID：`S3-02b3b2a`；估算 3 点；优先级 P1；状态 Done（R1-S3I）。独立 GPT-6 Scrum 与 QA DoR PASS；实现经独立 QA/QC PASS（逐一移除各守卫的变异测试均被捕获），beta 快进复核由根集成人执行。
- 用户价值：作为发起 AI 世界结构补全的作者，我希望同一次操作在模型结果不明时不会因内部重试再次产生供应商调用，从而能按明确的操作身份恢复或重新决定是否生成。
- 前置：`S3-02b3s` 的调用前 claim/结果恢复决策、`S3-02b3a` 持久 store 已 Done。本卡只提供运行器的可选执行约束；`S3-02b3b2b` 才将它接到 backfill，现有 `/backfill` 在本卡后仍不受保护。
- PO 决策：历史 Spike 的“每 operation 最多一次供应商调用”不能由一次 `runStructuredPrompt` 推出。当前结构化运行器可执行传输、策略、备用模型、JSON 修复和语义重试。本卡先使该强保证可执行，不削弱普通 Prompt 的既有重试能力，也不把模型 attempt 观察表当作费用 claim。

## 范围与唯一 Owner

单一 GPT-6 Luna Max Prompt/LLM 工程师独占本卡的生产文件：`server/src/prompting/core/promptTypes.ts`、`server/src/prompting/core/promptRunner.ts`、`server/src/prompting/core/execution/structuredPromptExecution.ts`、`server/src/llm/structuredInvoke.ts`，以及对应的新增或定向聚焦测试。根 PM/PO 独占 `TASK.md`、Roadmap、Sprint/Story 合同、Wiki、发布记录、提交与 beta 集成；独立 GPT-6 Luna Medium Scrum/QA/QC 只读验收。

1. 在已登记结构化 Prompt 的执行选项上增加仅由调用方显式开启的“最多一次物理供应商调用”约束。它覆盖从 `runStructuredPrompt` 到 transport 的完整逻辑请求，包括首选策略、传输重试、策略切换、备用模型、JSON 修复和语义重试；不能只限制顶层函数进入次数。
2. 单次模式允许在模型调用前解析配置和选择一次结构化策略；一旦开始第一次物理调用，任何返回、异常、取消、解析/schema/后校验失败都不得产生第二次物理调用。结果成功仍走已登记 Prompt 的结构化输出和校验。失败由调用方后续处理，本卡不替 backfill 推断“供应商肯定未收到请求”。
3. 未显式开启该模式的所有既有 Prompt 保持现有重试、修复、fallback 与模型路由行为；不得改默认策略、Prompt 内容/版本、路由设置或普通结构化调用的错误语义。若现有控制点不足以在本文件边界内保证物理调用上限，退回 Refinement，不扩到通用预算/任务平台。
4. 该 opt-in 只适用于非流式 `runStructuredPrompt`。`streamStructuredPrompt` 如收到该选项，必须在打开 provider 前明确拒绝，不能默默忽略或假称也受一次调用保证；文本调用、流式实现与其默认行为不在本卡范围。

## 验收条件

1. 在传输重试数大于零、备用模型启用且结构化策略存在备选的隔离设置下，通过 preflight 并成功返回的显式单次模式恰好发生一次底层 provider `stream()`/transport 调用，输出仍经 Prompt Schema 校验；同一逻辑 request 的 attempt 证据最多一条物理尝试。
2. 首次调用出现可重试传输错误、策略不兼容、空/非法 JSON、schema 或后校验失败，以及调用开始后的取消时，每个场景都至多一次底层 provider `stream()`/transport 调用，不触发修复、策略/模型 fallback 或语义重调。JSON 修复的另一条 `getLLM().stream()` 路径也计入同一总数。调用前的确定性失败可以是零次；不能用顶层 PromptRunner mock 调用计数代替 transport 计数。
3. 未开启单次模式的现有结构化调用仍保留传输重试与至少一种原有修复/备选策略行为；既有测试不得通过改变全局配置而“假通过”。并发独立请求不共用调用额度。
4. 本卡没有 World、operation、result 或 receipt 写入。现有 `/backfill`、其他世界入口、HTTP、UI、schema/migration、snapshot/RAG 均不改；UI 验收不适用。
5. 对 `streamStructuredPrompt` 传入单次选项的负例在 transport 前拒绝，物理调用数为零；普通流式调用保持既有行为。

## 最窄验证与退出门

- 新增 `server/tests/backfillSingleAttemptPrompt.test.js`，通过 runner/structured invoke 的真实内部 transport seam 与 mock provider，按 `.stream()` 等实际物理调用计数验证 AC1～3、AC5；复用 `server/tests/structuredInvoke.test.js` 证明普通模式仍重试。固定命令：`pnpm --filter @ai-novel/server build && node --test server/tests/backfillSingleAttemptPrompt.test.js server/tests/structuredInvoke.test.js`，然后 `git diff --check`。测试不能访问真实模型或用户数据库。
- 独立 QA/QC 核查物理调用上限、普通调用回归及文件边界；根 PM 对 stable Prompt 执行规则作 Wiki 决策。仅内部执行约束且未接产品入口时，发布说明按技能检查后决定是否跳过。
- 本卡的完成只解除 `S3-02b3b2b` 的技术前置，不代表生产 `/backfill` 已具备幂等、版本保护或结果恢复。阶段提交、feature→beta 和 beta 最窄复核后才能标 Done。

## 非范围

- 不接世界结构生成、持久 result、CAS/回执、HTTP/来源页，不改普通 Prompt 默认能力，不新增供应商计费账本或安全平台。
- 不运行真实模型、真实 PostgreSQL apply、用户数据库迁移或任何破坏性数据操作；Release 2 保持原队列。
