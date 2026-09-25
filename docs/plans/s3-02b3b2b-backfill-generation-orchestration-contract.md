# S3-02b3b2b：AI 世界结构补全从模型调用到持久结果的编排

## 身份、价值与状态

- Release / Epic：Release 1 / S3 可信世界；Story ID：`S3-02b3b2b`；估算 5 点（不拆分，见“估算”）；优先级 P1；状态 Refinement；PO 已于 2026-09-25 确认范围；首次独立 DoR 未通过（3 项阻断、3 项非阻断），已按“DoR 修订”补齐，待独立复核。规划基线 `beta@cb169a52`。
- 用户价值：作为发起“AI 补全世界结构”的作者，我希望同一次操作只会让系统向模型发出一次请求；生成出的结构先安全保存下来，即使页面断开、服务重启或多次点击，也能按同一次操作读回结果，或明确知道“生成失败”“状态待确认”，而不会被再次扣费。
- 前置（均 Done）：[S3-02b3s](./s3-02b3s-structure-backfill-idempotency-spike.md) 冻结的状态/恢复矩阵；[S3-02b3a](./s3-02b3a-backfill-store-contract.md) 持久 claim/result store；[S3-02b3b1](./s3-02b3b1-backfill-result-commit-contract.md) 已持久 result→世界 CAS/回执；[S3-02b3b2a](./s3-02b3b2a-backfill-single-attempt-prompt-contract.md) `singleProviderTransportAttempt` 单次物理调用门。
- 本卡输出止于 `model_succeeded_pending_commit`（或失败/未知终态）。不调用 `commitPersistedResult`，不写 World。本卡完成后，现有 `/backfill` 仍走旧路径、仍不受保护。

## 范围

1. **编排服务**：在 backfill owned `application/` 提供 `generatePersistedResult({ worldId, operationId, baseContentRevision, provider?, model? })`。服务按以下顺序执行：
   - 先 `store.read`。已有 operation 时进入重放分支（第 5 项），不重新 claim。
   - 否则读取 World，要求 `contentRevision == baseContentRevision`。
   - 用已登记的 `world.structure.backfill` 资产 id/version、backfill 自有 `generationPolicyVersion` 常量和 `sourceDigest` 组成冻结请求，再 `store.claim`。`sourceDigest` 是 `buildWorldStructurePromptSource(world)` 的 SHA-256。
   - 在外层 `runWithModelAttemptRequestContext` 内取得 `requestId`。外层上下文须自带 `mode: "invoke"` 与 `prompt: { promptId, promptVersion }`（取自已登记资产），因为嵌套的 `runStructuredPrompt` 不会覆盖外层已建立的 prompt 身份。
   - 调用 `store.startModel`（带 `onNotAcquired: "return_current"`，见第 3 项），写入 `modelRequestId` 与 lease；此时 `modelAttemptId` 为 null。只有 `acquired: true` 的一方可以继续；落败方按 `current` 状态返回生成中、已存 result 或终态，provider 调用为 0。
   - 调用 `runStructuredPrompt`，选项为 `singleProviderTransportAttempt: true`，不能使用流式或文本入口。
   - 成功输出按旧路径同样的规则归一化：`normalizeWorldStructuredData`（以 legacy 结构为基底，`seededFrom: "ai-backfill"`）和 `buildWorldBindingSupport`。`lastBackfilledAt` 取自注入时钟，不调用 `nowISO()`，保证同一输入与时钟下 digest 可复现。
   - 调用 `store.persistResult`，带上 `modelRequestId` 与 attempt 的 `lastAttemptId`。store 在同一事务内补绑 attempt id（见第 3 项）。
2. **失败到状态的确定映射**：映射只作用于已结构化的错误，由 backfill `domain/` 中的一张表完成，属于 AGENTS.md 允许的确定性后处理。
   - provider 已经返回响应、但内容不可用时置 `failed_terminal`。这类 `StructuredOutputError.category` 包括 `malformed_json`、`empty_content`、`incomplete_json`、`schema_mismatch`、`thinking_pollution`、`output_truncated`、`reasoning_budget_exhausted`。
   - 其他情况一律 `markUnknown(unknown_result)` → `model_unknown`，宁可保守。其他情况包括：`transport_error`、取消/超时、未在白名单中的类别、非结构化异常，以及归一化或 `persistResult` 失败。
   - 服务返回的 outcome 带上失败类别。类别不持久化（PO 已批准）；持久化由 S3-02b3c 承担。
3. **store 最小扩展**（均在 `prismaWorldStructureBackfillStore.ts` 与 contracts 内）：
   - 新增状态 `failed_terminal`，新增 `markFailed(worldId, operationId)`，只能从 `model_in_flight` 进入，进入后不能重新取得调用权。`status` 列是无 CHECK 的 TEXT，因此**不改 schema、不加 migration**。
   - 新增错误码 `BASE_REVISION_MISMATCH`，用于首次请求与 `model_not_called` 重放时的世界漂移（第 1、5 项）。
   - **attempt id 补绑**：`persistResult` 在事务内，若已存 `modelAttemptId` 为 null、`modelRequestId` 与入参一致且入参带非空 `modelAttemptId`，则把该 attempt id 同时写入 operation 与 result。已存 attempt id 非空但不一致、或 `modelRequestId` 不一致，仍抛 `MODEL_REFERENCE_MISMATCH`。
   - **并发落败方**：`startModel` 新增可选输入 `onNotAcquired: "return_current"`。设置时，条件更新未命中（他人已持有 claim 或已推进状态）返回 `{ acquired: false, current }`（当前 operation 与 result），不做引用比对、不抛错。不设置时保持 b3a 既有语义，因为 `worldStructureBackfillStore.test.js` 约 461–468 行断言“不同引用的落败方抛 `MODEL_REFERENCE_MISMATCH`”，本卡不改该测试文件。`MODEL_REFERENCE_MISMATCH` 在 b2b 编排路径上只用于真正的完整性违例。
4. **单次模式解析分类修正（QA 强制）**：`structuredInvokeParser.ts` 在单次模式（JSON 修复预算为 0）下的处理（修复预算为 0 并非单次模式独有，见“边界修订”）：
   - 非空但无法解析的输出须立即抛出 `malformed_json`。
   - 空正文保持 `empty_content`。
   - 两者都不得落入 schema 校验被归为 `schema_mismatch`。
   - 修复预算 ≥1 的普通调用分类与行为不变。
5. **重放与恢复**，均为零次新调用：
   - `model_not_called`：先重新读取 World，要求 `contentRevision` 等于已存 `baseContentRevision`，且重新计算的 `sourceDigest` 等于已存值；任一不同返回 `BASE_REVISION_MISMATCH`，0 次调用，operation 行不变。两者都一致时才调用 `startModel`，由唯一胜者继续。
   - `model_in_flight` 且 lease 未到期：返回“生成中”。
   - `model_in_flight` 且 lease 已到期：`markUnknown(lease_expired)`。
   - `model_succeeded_pending_commit`、`committed`、`conflict_result_retained`：只读返回 result（及状态）。
   - `model_unknown`、`failed_terminal`：只读返回状态。
   - 调用方冻结字段（base revision、provider/model）与已存 operation 不一致时返回 `OPERATION_ID_REUSED`。

## 明确非范围

- 不改 `POST /worlds/:id/structure/backfill`、`WorldService.backfillStructure`、`worldStructureWorkspace.backfillWorldStructure`、HTTP 请求/查询/错误码（S3-02b3c）、来源页 UI 与恢复投影（S3-02b3d）、组合发布门与真实 PostgreSQL apply（S3-02b3e）。
- 不调用 `commitPersistedResult`，不写 World、snapshot、RAG；不改 Prompt 资产内容/版本、路由默认、文本/流式入口，也不开发通用调用预算（`R1-PROMPT02`）。
- 不运行真实模型、用户数据库、migration/reset；不引入 Release 2。

## 生产文件边界（单一 owner）

一名 GPT-6 Luna Max 全栈工程师独占：

- 新增 `server/src/services/world/backfill/application/WorldStructureBackfillGenerationService.ts`：编排逻辑，Prisma client、store、时钟与 lease 时长均可注入。
- 新增 `server/src/services/world/backfill/domain/worldStructureBackfillGeneration.ts`：失败类别→状态表、`generationPolicyVersion`、`sourceDigest`、lease 策略。
- 修改 `backfill/domain/worldStructureBackfillContracts.ts`（状态与错误码）、`backfill/infrastructure/prismaWorldStructureBackfillStore.ts`（`markFailed`、`startModel` 的 `onNotAcquired` 选项、`persistResult` 的 attempt id 补绑）、`backfill/application/index.ts`、`backfill/index.ts`（facade 增加 `createWorldStructureBackfillGenerationService`）、`backfill/README.md`。
- 修改 `server/src/llm/structuredInvokeParser.ts`，仅限 `parseStructuredLlmRawContentDetailed` 的零修复解析失败分支。
- 测试：新增 `server/tests/worldStructureBackfillGeneration.test.js`；在 `server/tests/backfillSingleAttemptPrompt.test.js` 增补分类用例。

只读导入、不得修改：`worldStructure.ts`（`normalizeWorldStructuredData`、`buildWorldStructureFromLegacySource`、`buildWorldBindingSupport`）、`worldServiceShared.ts`（`buildWorldStructurePromptSource`）、`prompting/prompts/world` 的 `worldStructureBackfillPrompt`、`prompting/core/promptRunner.ts` 的 `runStructuredPrompt`、`platform/llm/provenance` facade（`runWithModelAttemptRequestContext`、`getModelAttemptRequestState`）、`llm/structuredOutput.ts` 的 `StructuredOutputError`。Prisma schema、migration、PromptRunner/structuredInvoke、World HTTP/UI 都不在边界内。需要越界时先回 PO Refinement。根 PM/PO 独占 `TASK.md`、Roadmap、合同、Wiki、发布记录、提交与 beta 集成；GPT-6 Luna Medium QA/QC 只读验收。

## 边界修订（2026-09-25，PO 批准）

- 更正：修复预算为 0 并非单次模式独有。`worldDraft`、`worldGeneration`、`ideaInspiration`、`ideaConstellation` 等生产 Prompt 也用 `repairPolicy.maxAttempts: 0`。
- 独立 QA 阻断：未加守卫的解析改动会把这些零修复 Prompt 在 `prompt_json` 下的非 JSON 输出改判为 `malformed_json`。策略循环只在 `prompt_json` 的 `schema_mismatch` 处提前停止，所以物理调用会从 1 次升到 3 次（流式空输出回退硬编码 `prompt_json`，可以触达该路径）。
- PO 批准唯一越界改动：在 `structuredInvoke.ts` 中增加一行 `classifyZeroRepairParseFailure: singleProviderTransportAttempt === true`。解析器新增同名可选开关，只有开启时才抛 `malformed_json`；其他零修复调用方保持原分类与调用次数，策略停止条件不改。回归测试位于 `backfillSingleAttemptPrompt.test.js`。

## 验收条件

1. **分类（QA 强制）**：单次模式、修复预算 0 时：
   - 非空非 JSON 输出抛出 `StructuredOutputError.category === "malformed_json"`，纯空白输出抛出 `empty_content`；合法 JSON 但违反 schema 的输出仍为 `schema_mismatch`。
   - 三者均恰好一次 provider `stream()`，无修复调用。
   - 普通模式下同一非 JSON 输出仍会触发修复路径。
   - 用例写在 `backfillSingleAttemptPrompt.test.js`。
2. **成功路径**：新 operation 恰好产生一次 provider `stream()`。
   - 最终状态为 `model_succeeded_pending_commit`，result digest 可读。
   - `modelRequestId` 与 attempt 证据的 `requestId` 一致；`startModel` 后 `modelAttemptId` 为 null，`persistResult` 后 operation 与 result 的 `modelAttemptId` 都等于该请求的 attempt id（补绑路径不抛 `MODEL_REFERENCE_MISMATCH`）。
   - 补绑负例：已存非空 attempt id 被不同 id 覆盖、或 `modelRequestId` 不一致时仍抛 `MODEL_REFERENCE_MISMATCH`，零写入。
   - 同一世界输入与注入时钟下，两次独立运行（不同 operation）得到相同 result digest。
   - World 的内容、`contentRevision`、`version` 不变，零 snapshot/RAG/commit receipt。
3. **调用前持久 claim**：使用 `/tmp/ai-novel-s3-02b3b2b-*` 下同一个文件型临时 SQLite 库上的两条独立连接（禁止 `:memory:`）。mock provider 的 `stream()` 被调用时，用另一条连接读取，operation 已是 `model_in_flight`，且带 `modelRequestId`。注入 `claim` 或 `startModel` 失败时，provider 调用为 0。
4. **并发**：在同一文件型临时 SQLite 库（禁止 `:memory:`）的两条独立连接上，各建一个服务实例（各自随机 `requestId`）并发执行同一 operation：
   - provider 调用总数为 1。
   - 落败方的 `startModel` 返回 `acquired: false` 与 `current`，不抛 `MODEL_REFERENCE_MISMATCH`；服务按 `current` 返回生成中（`model_in_flight`）、已存 result（`model_succeeded_pending_commit`）或终态，provider 调用为 0。
   - operation 上的 `modelRequestId` 始终是胜者的值，未被落败方改写；两方最终读到同一 result。
5. **重放/重启/响应丢失**：新连接重放 `model_succeeded_pending_commit`、`committed`、`conflict_result_retained`、`model_unknown`、`failed_terminal` 时，新增调用为 0，并只读返回对应事实。`model_not_called` 重放在世界 revision 与 `sourceDigest` 均未变时才继续（恰好 1 次调用）；任一变化返回 `BASE_REVISION_MISMATCH`，0 次调用、行不变。`model_in_flight` 在 lease 未到期时返回生成中；在注入时钟使 lease 到期后变为 `model_unknown`，两种情况都是 0 次调用。
6. **失败映射**：provider 打开后，以下场景都只有 1 次调用、无 result 行、零 World 写入：
   - `malformed_json`、`empty_content`、`schema_mismatch` → `failed_terminal`，outcome 带对应类别。
   - `transport_error`、调用中取消、非结构化异常、`persistResult` 注入失败 → `model_unknown`。
   - 两类终态重放都不能重新开调用。
7. **冻结身份**：
   - 首次请求时 `baseContentRevision` 与世界不符 → `BASE_REVISION_MISMATCH`，零 operation、零调用。
   - `model_not_called` 重放时世界 `contentRevision` 或 `sourceDigest` 与已存值不同 → `BASE_REVISION_MISMATCH`，零调用，operation 行（状态、lease、引用、`updatedAt`）不变。
   - 外层请求上下文带有已登记 Prompt 的 id/version：attempt 证据中的 prompt 身份等于资产 id/version。
   - 同 operationId 换 provider/model/base 重放 → `OPERATION_ID_REUSED`，零调用。
   - request hash 中的 Prompt id/version 来自已登记资产，不是手写字符串。
8. **回归与边界**：
   - b3a store（含约 448–495 行引用比对用例，文件不改）、b3b1 commit、b2a 单次门与普通 `structuredInvoke` 测试全部仍通过。
   - `git diff --stat` 只包含上述文件边界；Prisma schema/migration、`/backfill`、`WorldService`、`worldStructureWorkspace.ts`、HTTP 与 client 零改动。

## 失败与并发要点

- 结果不明时绝不重调：lease 只用于发现 owner 失联，不能证明 provider 未收到请求。“provider 未打开”只在 operation 仍为 `model_not_called` 时成立。
- `startModel` 之后、provider 打开之前发生的确定性错误也按 `model_unknown` 处理（保守）。本卡不引入 `failed_retryable`。
- 归一化或 `persistResult` 失败时，模型输出只存在于内存，状态记为 `model_unknown`。如果连 `markUnknown` 也失败，由后续重放在 lease 到期后收敛。
- 测试只用 `/tmp/ai-novel-s3-02b3b2b-*` 文件型隔离库（AC3/AC4 必须文件型、两条连接；其他 AC 可用 `:memory:`），以及 `dist/llm/factory.js` provider seam（同 b2a）。调用计数必须在 provider `stream()` 层统计，不能用编排层 mock 计数代替。时钟与 lease 通过注入控制。

## 最窄验证

前置：`pnpm --filter @ai-novel/server prisma:generate`（确认 shared dist 与 Prisma client 已随上游重新生成，只生成 client、不连库）。

固定命令：`pnpm --filter @ai-novel/server build && node --test server/tests/worldStructureBackfillGeneration.test.js server/tests/backfillSingleAttemptPrompt.test.js server/tests/structuredInvoke.test.js server/tests/worldStructureBackfillStore.test.js server/tests/worldStructureBackfillCommit.test.js`，然后运行 `git diff --check`。

不调用真实模型，不访问 `DATABASE_URL` 用户库，不执行 migration。无产品 UI 改动，UI 验收不适用。

## DoR 核对（待独立 Scrum/QA 签认）

- [x] Story ID、用户价值、前置 Done、非范围、单 owner 与文件边界已写明。
- [x] 已核对复用 seam 存在：store `claim/read/startModel/persistResult/markUnknown`，`startModel` 可携带 `modelRequestId`；`status` 为无 CHECK 的 TEXT；`runWithModelAttemptRequestContext` 与 `getModelAttemptRequestState` 已由 provenance facade 导出；零修复时解析失败落入 `safeParse(null)` 的缺陷位于 `structuredInvokeParser.ts`。
- [x] 错误分类契约与状态映射在 DoR 同时列出（R1-S3I 改进项①）。
- [x] PO 已确认下方两项决定（2026-09-25）。
- [x] 首次独立 DoR 的阻断项已写入范围与 AC：attempt id 补绑（范围 3、AC2）、落败方 `{ acquired: false, current }`（范围 1/3、AC4）、`model_not_called` 重放的世界漂移校验（范围 5、AC5/AC7）；非阻断项：AC3/AC4 文件型双连接、外层上下文 prompt 身份、注入时钟。
- [ ] 独立 GPT-6 Scrum 与 QA DoR 复核 PASS。

## DoD

- [ ] AC1～8 均有行为测试并通过固定命令；`git diff --check` 通过。
- [ ] 独立 QA/QC PASS，重点核对 provider 层调用次数、调用前 claim、并发、lease/unknown 不重调、分类，以及文件边界。
- [ ] 根 PM 作 Wiki 决策（状态表新增 `failed_terminal` 与失败映射，属于稳定恢复规则，预计更新世界维护恢复 Wiki）。发布说明预计跳过：没有用户可见入口。
- [ ] 阶段提交，feature→beta 快进后在 beta 复跑同一合同命令。

## 估算

5 点，不拆分；DoR 修订的全部改动仍在原文件边界内。其中编排与重放/lease/漂移分支约 2.5 点，store 扩展（`failed_terminal`、落败方返回、attempt 补绑）约 1 点，解析分类修正与测试约 1 点，文件型双连接与 provider 层计数夹具约 0.5 点。已无缓冲。

实施中出现以下任一情况，停回 Refinement 拆为 b2b1（解析分类 + store 扩展）与 b2b2（编排），不扩大范围：

- 需要改 schema 或 migration；
- 需要改 PromptRunner 或 structuredInvoke；
- 需要持久化失败类别；
- 需要修改 `worldStructureBackfillStore.test.js` 等 b3a/b3b1 既有测试。

## PO 决定（2026-09-25 已确认）

1. result→World 提交与提交后 snapshot/RAG 不属于 b2b，归 S3-02b3c；b3b1 合同的前向引用已同步。
2. b2b 只返回失败类别、不持久化；S3-02b3c 追加范围：持久化失败类别（必要时带 migration），使来源页重启后仍能说明“为何失败”。S3-02b3c 保持 Not Ready。
