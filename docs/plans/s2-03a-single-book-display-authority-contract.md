# S2-03a0：单书展示事实与动作权威合同

## Background

本合同是 R1-S2C 中的 S2-03a0（3 点 Spike），冻结后续单书成果、进度和推荐动作展示所消费的**既有结构化事实**。源码冻结基线为 `codex/r1-s2c-next-action-evidence@7c399acaa267`；本文件只记录读取结论，不改变页面、共享类型、API/query key、Runtime 或命令。

它解决的风险是：一次局部导演任务成功不能被解释为整书完成；来自 dashboard、runtime、抽屉或局部工作区的多个动作不能由文案猜测出“下一步”。本 Spike 不等于 UI 能力完成，也不表示作者已经看到单一推荐动作。S2-03a/03b 仍须在本合同签认后重新进入 Ready，并各自完成行为验收。

## Current source evidence

| 事实 | 当前源码证据 | 合同结论 |
| --- | --- | --- |
| 单书持久内容 | `client/src/pages/novels/workspace/application/useWorkspaceResources.ts` 以 `queryKeys.novels.detail(id)` 调用 `getNovelDetail(id)`；`NovelDetailResponse` 包含 `Novel` 与 `chapters`，`Chapter` 有 `novelId`、`content`、`order`（`client/src/api/novel/shared.ts`、`shared/types/novel.ts`） | 已保存正文只能从当前 `novelId` 的持久章节读取。 |
| 整书目标 | `Novel.estimatedChapterCount?: number | null`（`shared/types/novel.ts`） | 只能用有效的该字段；局部 runtime 的范围、章节列表长度和 UI 默认值都不能补造整书目标。 |
| 书级自动化投影 | `getDirectorBookAutomationProjection(novelId)` 请求 `/novels/director/book-automation/${novelId}`（`client/src/api/novelDirector.ts`）；`DirectorBookAutomationProjection` 含 `novelId`、`focusNovel`、`latestTask`、`status`、`primaryAction`（`shared/types/directorRuntime.ts`） | 这是书级状态与唯一动作候选的来源。服务端按 `novelId` 查询 auto-director 最新任务并建模其 `primaryAction`（`server/src/services/novel/director/projections/DirectorBookAutomationProjectionService.ts`）。 |
| 当前导演任务 / snapshot | `useWorkspaceDirectorState` 分别读取 active director task、book projection、指定任务详情和 `getDirectorTaskSnapshot(selectedDirectorTaskId)` | 当前任务是身份与当前范围的来源；snapshot 的 `task.novelId` 或 `run.novelId` 必须能验证它属于当前书。 |
| runtime / fact | `DirectorTaskSnapshot.projection`、`factSummary`、`chapterProgress` 与 `DirectorRuntimeProjection.progressBreakdown` / `scopeSummary` 都是结构化字段（`shared/types/directorRuntime.ts`） | 它们只解释同一导演任务的当前范围、阶段、质量状态和影响，不定义整书完成，也不独立生成主动作。 |
| URL 身份分道 | `readNovelEditWorkflowTaskIds` 将 `directorTaskId`（兼容旧 `taskId`）与 `workspaceTaskId` 分开；`NovelWorkflowLane` 指明 manual_create 使用 `workspaceTaskId`，auto_director 使用 `directorTaskId`（`client/src/pages/novels/hooks/novelEditWorkflowParams.ts`、`shared/types/novelWorkflow.ts`） | `workspaceTaskId` 是手动工作区 lane，永远不是导演身份，不能替代、拼接或回退为 `directorTaskId`。 |
| 已有动作分散 | `DirectorBookAutomationProjection`、`DirectorDashboardView`、`DirectorRuntimeProjection` 都有动作/推荐字段；`useWorkspaceDirectorCommands` 还保存现有命令绑定 | dashboard/runtime/局部动作只能提供说明、原因、影响范围或既有命令适配；不再成为展示模型的独立推荐来源。 |

## Frozen input DTO and identity gate

03a 的纯转换输入必须先收敛为下列概念 DTO。这里的字段名是消费合同，不要求本 Spike 新增共享类型；根集成人仍拥有共享类型和 query key。

```ts
type SingleBookDisplayInput = {
  novelId: string;
  resolvedDirectorTaskId: string | null;
  novel: { id: string; estimatedChapterCount: number | null } | null;
  savedChapters: Array<{ novelId: string; order: number; content?: string | null }> | null;
  bookAutomationProjection: DirectorBookAutomationProjection | null;
  directorTask: UnifiedTaskDetail | null;
  directorSnapshot: DirectorTaskSnapshot | null;
  runtimeProjection: DirectorRuntimeProjection | null;
  chapterQualityDebt: ChapterQualityDebtDetails[];
  freshness: Record<
    "novel" | "savedChapters" | "bookProjection" | "directorTask" | "snapshot" | "runtime",
    "fresh" | "stale" | "loading" | "error" | "empty"
  >;
};
```

身份必须按下列顺序解析，并在任何动作选择之前完成：

1. 将路由 `directorTaskId`（或已有兼容的旧 `taskId`）视为“已请求导演任务”；绝不读取 `workspaceTaskId` 作为候选。当前 `resolveRequestedDirectorTaskId` 的顺序——URL director id、当前 auto-director task、可 autofocus 的投影任务——是可复用的身份解析方向（`workspaceSessionPolicy.ts`）。
2. 只有当前书 scoped 的 active auto-director task，或 book projection 在 `failed`、`blocked`、`waiting_recovery` 等需要保留来源恢复时指向的 `latestTask.id`，可补足缺失 URL 的候选 id。它必须随后被指定任务详情 / snapshot 验证，不可仅因“最近”而信任。
3. `resolvedDirectorTaskId` 非空，且下列恒等式全部成立，才得到 `sameBookSameDirectorTask=true`：`projection.novelId === novelId`、`projection.focusNovel.id === novelId`、`projection.latestTask.id === resolvedDirectorTaskId`，并且 snapshot 的 `task.novelId === novelId` 或 `run.novelId === novelId`。缺少任一可验证字段即为未知，不作乐观推断。
4. action 的 `target.novelId` 必须等于 `novelId`；若 `target.taskId` 或 `commandPayload.taskId` 有值，必须等于 `resolvedDirectorTaskId`。二者同时存在时也必须彼此相等。身份不匹配、任务为空或查询不确定时为零可执行动作。

`novelId` 是作用域边界，而不是只用于 query key 的提示。03a/03b 必须延续 `useBookScopedMutation` / current-book request scope 的隔离原则，避免旧书响应覆盖当前书的读数或动作。

## Three progress authorities

三层可同屏出现，但不得互相代算、互相覆盖：

| 层 | 权威输入与计算 | 可表达 | 明确禁止 |
| --- | --- | --- | --- |
| 已保存成果 | `savedChapters` 中 `chapter.novelId === novelId` 且 `content?.trim()` 非空的章节数；正文和章节排序也来自同一持久响应 | “已保存正文 N 章”、可阅读的成果 | 不能用流式草稿、内存候选、任务 progress、`artifactSummary.activeCount` 或局部执行范围充数。 |
| 当前任务范围 | 仅限 `sameBookSameDirectorTask` 的 snapshot/runtime/fact projection：`scopeSummary`、`factSummary`、`chapterProgress`、`progressBreakdown`、当前阶段和结构化 checkpoint | “本轮任务正在/已处理的范围、阶段与当前进度” | 不能将任务 `succeeded`、runtime `completed` 或范围分母解释为整书完成。任务事实不完整时显示范围未知。 |
| 整书目标 | 当前小说持久 `Novel.estimatedChapterCount`，仅当为有限正整数时有效 | “全书目标 M 章”以及在已保存正文 fresh 时的 `N / M` | 不得从任务范围、章节计划长度、`progressBreakdown.totalChapters`、默认表单值或局部成功反推 M。字段缺失/无效时显示“整书目标未知”。 |

因此，整书完成展示的最小证据是：已保存成果与有效整书目标都 fresh，且二者满足产品后续明确规定的完成规则。03a 不可把“`N >= M`”自行扩展为剧情、审校或导演完成的语义；若没有独立的书级完成结构化字段，只能陈述数量达标，不能宣称“整书已完成”。

## Structured severity and coexistence matrix

以下优先级只决定展示严重度与是否抑制动作，绝不改写 runtime。它只读取结构化 status、checkpoint、`pendingManualRecovery`、policyMode、质量闭环的 `terminalAction/rootCauseCode/recommendedAction`；禁止从 `label`、`headline`、`detail`、`currentAction`、`includes`、关键词或正则推断状态或推荐。

| 优先级 | 结构化条件（同一导演身份已验证） | 可与其共存的事实 | 展示结论 | 对全局链与动作的影响 |
| ---: | --- | --- | --- | --- |
| 1 | 明确 `checkpointType === "replan_required"`，或 runtime 的 `rootCauseCode === "replan_required"` / `recommendedAction === "replan"` | 已保存正文、局部任务产物、质量债 | “需要重规划”；保留成果和原因 | 这是结构化重规划，不能被 running/completed 遮蔽。仅可保留合格 book projection `primaryAction`；不从其他来源创造 continue/repair。 |
| 2 | `pendingManualRecovery === true`，或 book projection `status === "waiting_recovery"` | 任务可能仍显示 queued/running 的旧状态；已保存正文和局部产物 | “等待你明确恢复” | 手工恢复状态优先于普通运行/完成。后台轮询和 worker recovery 不得清除它；仅显式恢复命令可改变状态。 |
| 3 | quality-first policy 的统一 issue decision 为 `pause_for_manual`，并已投影为等待人工处理 | 已保存正文、局部审校结果、质量债 | “质量优先：在保存边界暂停，等待处理” | 不是 completion-first 的自动继续；必须保留人工暂停，不得用普通 running/completed 覆盖。 |
| 4 | 任务 `failed` / `blocked` / `cancelled`，或结构化 runtime requires-user-action / blocked 状态 | 已保存正文、局部范围信息和质量债 | “本次任务受阻/已停止”，给出结构化原因 | 不等于整书失败。合格 projection action 可以引导到来源上下文；没有 fresh 身份则零动作。 |
| 5 | `waiting_approval`、`queued`、`running`，且不存在以上更高条件 | 已保存成果和历史任务完成均可并存 | “等待确认/排队/进行中” | 普通进行中不覆盖 replan 或人工暂停；只消费书级 primaryAction。 |
| 6 | runtime/章节质量结果为 `terminalAction === "defer_and_continue"` 的 local quality debt，且没有 1–3 的结构化升级信号 | 保存正文、任务 running/completed、后续章节范围 | “局部质量债：可继续，待回收” | completion-first 下是可见警告和局部修复线索，不进入 `replanAlertDetails`、`PIPELINE_REPLAN_REQUIRED` 或全局 `replan_required`；不得宣布全书失败或阻断剩余范围。 |
| 7 | 同一任务的局部范围 `completed` / task `succeeded` | 已保存正文、整书目标、质量债 | “最近一次任务已完成” | 只能表述本轮完成；不覆盖 1–6，也不推出整书完成。 |
| 8 | 无任务或 idle | 已保存正文、目标未知 | “没有正在推进的导演任务” | 仅展示事实；按本合同零可执行导演动作。 |

质量债的证据边界已在 `shared/types/chapterQualityLoop.ts`：`terminalAction === "defer_and_continue"` 被分类为 non-blocking quality debt；明确 `replan_required` / `recommendedAction === "replan"` 才是 blocking。服务端 `ChapterQualityLoopService` 也将 `defer_and_continue` 的有正文章节收敛为可继续状态。这一合同保留该区分，不能在客户端重新升格本地审校问题。

## Action authority and allowed degradation

### Unique action rule

可执行主动作的候选集合固定为至多一个元素：

```text
candidate = bookAutomationProjection.primaryAction
  only if sameBookSameDirectorTask
  and all action-basis queries are fresh
  and candidate.target.novelId === novelId
  and every supplied task id equals resolvedDirectorTaskId
otherwise candidate = null
```

“action-basis queries”至少包括 book projection、导演任务身份验证 snapshot，以及若动作携带 task id 时该任务详情；03b 绑定命令前还必须确认对应命令可用且当前书 scope 未失效。`primaryAction` 是已经由服务端 `buildPrimaryAction` 根据结构化 status/checkpoint 构造的动作，不允许客户端读取其 label 来重新分类或改写含义。`secondaryActions`、`dashboardView.primaryAction`、`runtimeProjection.recommendedAction`、`nextActions` 和 local panel callbacks 不能并入候选集合。

一旦候选存在，03a 只能把它呈现为一个推荐主动作，并将其结构化 `type`、`target`、`commandPayload`、原因和影响范围交给 03b 的命令适配。动作不存在或不可验证时，03a 输出“无可执行导演动作”，可继续保留来源页、运行记录或诊断的**只读导航说明**，但不能把导航/说明伪装为恢复、继续、重试或修复。

### Query state / artifact preservation matrix

| 状态 | 读模型处理 | 保存正文 / 旧事实 | 可执行动作 |
| --- | --- | --- | --- |
| fresh | 当前响应成功，身份与当前 book request scope 验证成立 | 显示当前持久成果与结构化范围 | 仅在唯一动作规则通过时显示一个 `primaryAction`。 |
| stale | 相同 `novelId` 与同一已验证 director id 的已保存响应正在刷新、或不能证明为当前请求结果 | 旧正文、旧任务范围和时间/“正在更新”提示可继续只读；不可清空 | 零。等待 fresh 重新验证，不能使用陈旧 action 再次提交。 |
| loading | 首次尚无可验证响应 | 不把缺失数组解释为零；先显示加载占位 | 零。 |
| error | 请求失败或错误响应 | 相同书/同一已验证任务的最后已保存正文与先前范围可读，并清晰标记读取失败；错误不清正文 | 零。错误不等价于 empty、completed 或任务失败。 |
| empty | 请求成功且明确返回无小说/无章节/无导演任务或字段为空 | 成功空章节可显示“尚无已保存正文”；目标缺失显示“未知” | 零；特别是没有 director task 时，禁止采纳 projection 的无任务 `open_novel` 作为导演动作。 |
| identity mismatch | book、projection、task 或 snapshot 指向不同 novel/task | 不展示另一书内容；当前书先前验证的正文可继续只读 | 零，并显示安全诊断/重新读取入口。 |

保存成果的保护优先于展示刷新：任何 loading、stale、error、暂停或任务受阻都不得清掉相同书的已保存正文。不同书、不同任务的旧数据不可以被当作当前事实复用。

## Complete state examples

| 情形 | 三层输出 | 严重度 / 推荐 | 必须满足的安全结果 |
| --- | --- | --- | --- |
| 最近任务 `succeeded`，但持久正文 8 章、目标 80 章 | 保存成果 `8`；当前任务“本轮已完成”；整书 `8/80` | 优先级 7；书级 primaryAction 若 fresh 且身份一致才显示 | 不显示“整书完成”。 |
| 同任务 `running`，范围投影为第 9–12 章 | 保存成果照持久响应；当前任务显示范围与阶段；目标单列 | 优先级 5 | 不用范围 9–12 替代全书目标；只有 projection primaryAction。 |
| `defer_and_continue` 的局部质量债，同时后续任务 running | 正文与范围继续显示；质量债为局部提醒 | 优先级 6，低于真实暂停/重规划 | completion-first 可继续，不能变全局 failed/replan。 |
| 结构化 `replan_required`，任务也曾显示 completed | 成果仍可读；当前任务显示重规划边界；整书目标不变 | 优先级 1 | replan 覆盖普通 completed；只读取投影主动作，不能自造“继续”。 |
| quality-first `pause_for_manual` / `pendingManualRecovery`，后台仍有旧 running | 成果与暂停边界均可读 | 优先级 2/3 | 必须等待显式恢复；不得由轮询显示为自动继续。 |
| URL 没有 `directorTaskId`，但本书投影为 failed/blocked/waiting_recovery 且 latest task 可经 snapshot 验证 | 选择该真实 director id；成果、范围和原因可读 | 相应优先级；可显示一个投影主动作 | `workspaceTaskId` 不参与；验证失败即零动作。 |
| URL director id 或 snapshot 指向另一书 | 当前书正文独立；任务范围未知 | identity mismatch | 不展示或调用另一书动作。 |
| book projection / snapshot loading、error 或 stale | 旧同书成果可读，未证实的新状态不下结论 | 查询状态优先于动作 | 不把 `undefined` 当 empty，不输出动作。 |
| 无任务、无 projection、章节成功为空、目标缺失 | 已保存正文 `0`；当前任务未知；整书目标未知 | 优先级 8 | 零导演动作，不使用默认值或“打开小说”冒充推荐恢复。 |
| dashboard/runtime/local action 同时存在且与 projection action 不同 | dashboard/runtime 作为诊断、原因、影响；只接受 projection | 唯一 action rule | 不按标签相同/不同、关键词、正则或 callback 存在与否仲裁。 |

## 03a / 03b ownership and file boundaries

| 后续 Story | Owner / 顺序 | 可拥有的文件边界 | 消费本合同的责任 | 不可做的事 |
| --- | --- | --- | --- | --- |
| S2-03a 单书展示模型 | Agent A；03a 后才可启动 03b | `client/src/pages/novels/workspace/presentation/` 的新纯展示模型与其 table-driven 测试；现有展示消费点按详细计划所列 `NovelEditView.tsx`、`NovelTaskDrawer.tsx`、`NovelAutoDirectorProgressPanel.tsx`、`novelEditAutomationStatus.ts`、`novelWorkspaceNavigation.ts` | 将本 DTO 转为三层进度、严重度、原因、影响与至多一个 action view model；保存 query state 与旧正文保护 | 不改 shared/types、API/query keys、runtime checkpoint 或命令；不发起 AI 调用；不从文字推断语义。 |
| S2-03b 来源现场动作接线 | Agent A，与 03a 串行；根集成人独占 API facade 共享边界 | 来源页面/移动页面/抽屉的既有绑定点：`NovelEditView.tsx`、`mobile/MobileNovelEditView.tsx`、`NovelTaskDrawer.tsx`、`hooks/useNovelEditWorkflow.ts`；可调用既有 `useWorkspaceDirectorCommands` | 只把 03a 已验证的一个 `primaryAction` 映射到现有来源页 continue/recovery/approval 命令；处理 pending、失败、刷新和跨书隔离 | 不新增第二 continue/repair API、不在 Creative Hub 或运行记录增加 mutating action、不以 toast 代替持久状态、不改变 issue policy。 |
| 根集成人 | 后续集成阶段 | `shared/types/directorRuntime.ts`、`client/src/api/novelWorkflow.ts`、`client/src/api/novelDirector.ts`、query keys、Runtime/HTTP、TASK/Roadmap/Wiki/Release Notes | 决定类型/API 缺口、路由和最终接线；审阅 action 的命令可用性 | 不将 Spike 文档视为生产完成证据。 |

当前 `useWorkspaceDirectorCommands` 的 `handleTaskDrawerProjectionAction` 已演示“拿到结构化 action 后调用现有命令/导航”的适配位置；它也含 fallback task 选择，因此 03b 必须受本合同的已验证 task id 约束，不能把现存 fallback 自动视为权威。

## Narrowest verification for the production stories

S2-03a 最小验证是展示模型的 table-driven 单测（无需浏览器、模型或数据库写入），至少覆盖：

1. 本文“完整状态示例”的十种情形；特别是局部成功、running、local quality debt、replan、quality-first 人工暂停、无 URL 的真实失败/暂停任务、身份不匹配、loading/error/stale/empty 与多动作源冲突。
2. `workspaceTaskId` 永不进入身份解析；不同 `novelId` 的章节、projection、task/snapshot 和旧响应都不污染当前书。
3. 每行至多一个 action，且只有 fresh 的同书同 task `bookAutomationProjection.primaryAction` 能通过；任一依据 stale/error/loading/empty 或不可验证时 action 数为零。
4. 已保存正文在 stale/error/pause/replan 下仍可读；任务 `succeeded` 但不足目标不会显示整书完成；目标缺失不会被范围或默认值填补。

S2-03b 最小验证是在 mock 既有命令下断言一次调用的 task id、参数、pending 去重、失败保留、刷新后以服务器投影为准和跨书响应隔离；复用 workflow params/source navigation 回归。两张生产 Story 再按改动范围运行 client typecheck。UI 浏览器/截图验收由用户完成。本 Spike 本身的验证仅为本文与上述类型、投影服务、query/命令边界的只读交叉核对：零模型调用、零数据库写入。

## Decision, residual risk, and readiness

**决定：**三层进度、身份 gate、结构化严重度、降级策略和唯一动作来源已冻结；03a 的消费边界清楚，03b 的命令适配边界清楚。该结论不改变现有页面行为。

**残余风险：**当前共享契约没有一个专门的“全书创作语义已完成”字段，故后续只能安全显示保存数量相对目标，不能把数量达标称为作品完成；snapshot 的 `task.novelId` 为可选字段，服务端/根集成人需确认 `run.novelId` 的覆盖是否足以满足每个 action 身份验证；既有 `useWorkspaceDirectorCommands` 中的 fallback 与文本派生逻辑需要在 03b 实施时逐一收口到本合同，不能由本 Spike 偷改。

**是否解锁：**S2-03a 解除“展示权威未冻结”的 DoR 阻塞，进入根集成人签认后的 Ready 复核；S2-03b 仍被 S2-03a 的生产实现与既有命令列表冻结所阻塞，当前**未解锁实施**。只有 03a/03b 都完成行为级验收，才能宣称推荐动作用户能力交付。
