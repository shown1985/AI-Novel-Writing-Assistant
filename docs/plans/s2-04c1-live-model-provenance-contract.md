# S2-04c1 实况模型来源只读显示合同

## Story 身份

- Story：`S2-04c1`
- Release / Epic：Release 1 / S2 模型透明度
- 点数：3
- 状态：Done（R1-S2H；代码、自动化与 Terra Computer Use 验收完成）
- 用户价值：作者在模型运行时能区分“准备使用的模型”和“这次实际采用的模型”，发生重试或备用时能看懂结果，不需要理解内部路由实现。
- 依赖：`S2-04a`、`S2-04b1～04b4` 均 Done；`S2-04b4` 已提供持久 request 读投影和首批显式身份归因。

实现收口证据：shared/server/client build/typecheck PASS；server 聚焦 `5/5`、client 最终 `4/4`，Terra QC 已修复预计文案 P1 并复验 PASS。Terra Computer Use 在隔离路径 `/tmp/ai-novel-s2-04c1-ui-IwRF6R` 完成五场景：预计 `openai/gpt-expected`、实际 adopted `deepseek/deepseek-chat`、首选失败与备用采用顺序详情、无 requestId/not_found/error 文案、A→B→C 切换不串线。固定 mock 验收未使用真实库或付费模型；4174/API 4100 已停止，隔离路径已移入废纸篓。

原 `S2-04c` 作为父范围不再重复计点。它被拆为本卡与仍在 Refinement 的历史任务展示范围；本卡完成不能宣称任务抽屉、运行记录或全系统调用历史已完成。

## 范围

1. 新增最小脱敏公共读合同：`GET /api/llm/attempt-requests/:requestId/provenance`。
2. 在 shared 中新增专用公共 DTO；服务端从内部 `ModelAttemptReadProjection` 显式映射，禁止直接序列化内部 record/projection。
3. `LlmLiveContext` 增加可空 `requestId`，由现有 attempt request scope 显式提供；不得从 `interactionId`、label、URL、当前小说或当前设置猜测。
4. 新增可复用的只读来源摘要/详情组件，仅接入 `LiveExecutionDialog`：
   - 请求前或没有 requestId：显示当前实况中明确提供的预计 provider/model，并说明实际调用可能变化；
   - 请求证据存在：显示 adopted attempt 的实际 provider/model；
   - 有 retry/fallback lineage：按顺序显示角色、结果和稳定失败类别；
   - not found、读取失败、归因不完整分别表达，不把缺记录写成“实际模型”。
5. 切换 task、session 或 requestId 时，旧响应不得覆盖当前实况；读取不触发模型调用，也不写模型配置或 attempt 记录。

## 公共 DTO 冻结

公共 DTO 只包含 UI 所需的白名单字段：

- `status: found | not_found | error`
- `requestId`
- `attributionStatus: complete | partial | unattributed`
- `adoptedAttemptId`
- `attempts[]`：`attemptId`、`parentAttemptId`、`attemptIndex`、`role`、`routeTier`、`status`、`finalAdoption`、`provider`、`model`、`failureCode`、`failureCategory`、`retryable`、`startedAt`、`finishedAt`、`durationMs`

不公开 attribution 内部身份字段、Prompt 标识/正文、usage 之外的供应商响应、原始错误、baseURL、API key、仓储错误或内部 observation issue。`evidenceStatus` 只有在服务端确有真实 execution evidence 时才能出现；本 GET 仅重建持久记录，默认不生成或伪造该字段。

HTTP 语义：合法 requestId 无论 found/not_found/error 均返回 `200` 与上述状态，避免把“未记录”误作网络失败；参数为空或超出允许长度返回 `400`。repository 读取失败只返回稳定 `status=error`，不透传内部错误文本。

## Owner 与文件边界

单一 Luna xhigh 全栈 owner 串行完成服务端、shared、client 和测试，避免公共 DTO 与 UI 分叉。

- 服务端：`server/src/routes/llm.ts`、`server/src/platform/llm/provenance/attempts/runtime/` 内新增明确公共 mapper/查询适配器；不修改 Prisma schema/migration。
- shared：`shared/types/llm.ts` 与 `shared/types/llmLive.ts`；只增加本卡 DTO 和可空 requestId。
- client：`client/src/api/` 下明确 provenance read client、`client/src/components/common/` 下只读展示组件、`client/src/components/liveExecution/LiveExecutionDialog.tsx` 与必要 hook。
- 测试：服务端 route/mapper、live requestId 传播、client 展示模型与 stale response 行为测试。

若实现发现需要修改 Task Center、`NovelTaskDrawer`、数据库 schema/migration、app 路由挂载或其他业务入口，立即停止并退回 PO；这些不属于本卡。

## 验收标准

1. 有 requestId 且 adopted attempt 存在时，摘要显示该 attempt 的 provider/model；顶部选择或路由设置随后变化不会改写历史结果。
2. primary 失败后 fallback 成功时，摘要显示最终采用的 fallback，详情保留有序 lineage 与白名单失败类别；没有 adopted attempt 时不猜测成功模型。
3. 没有 requestId、合法 requestId 未找到、repository 读取失败、归因 partial/unattributed 四种状态文案可区分。
4. UI 读取不会新增模型调用、配置写入、attempt 写入或任务状态变化；运行记录仍是只读列表，没有新增恢复、重试、取消或其他任务动作。
5. 切换 task/session/requestId 后，迟到响应不能覆盖当前摘要；关闭再打开实况时，以当前 session 的 requestId 读取。
6. 公共响应不含 Prompt、输出正文、凭证、地址、原始错误、内部 attribution 身份或 repository 细节。
7. UI 使用低边框层级；详情按需展开，默认只呈现“预计”和“实际”两项及备用提示，文案从作者视角说明本次调用。

## 最窄验证

- shared build。
- server build/typecheck。
- 服务端聚焦测试：公共 mapper 白名单、found/not_found/error、fallback lineage、零模型/零写入、live requestId 显式传播。
- client typecheck。
- client 行为测试：预计/实际/备用/未记录/读取失败、切换 requestId 丢弃迟到响应、详情脱敏。
- `git diff --check`。
- Computer Use 用户验收：在隔离运行目录打开实况窗口，至少观察一次成功调用和一次受控 fallback 或 fixture 注入；确认预计与实际区分、详情展开、切换任务不串线。若稳定触发 fallback 会调用真实付费模型，则只用隔离 fixture，不为 UI 验收发起额外付费请求。

## 非范围

- Task Center、`NovelTaskDrawer` 或全局调用历史检索；按 task/novel 反查 request 的索引/API。
- 覆盖 S2-04b4 之外的调用入口、旧记录回填或按当前配置重算历史。
- 模型选择、路由、重试、fallback、Prompt、生成结果或任务状态的行为修改。
- Prisma schema/migration、新持久表、批量查询、分页、导出。
- R1-S3、R1-RC、发布 workflow、账号/MFA、MySQL 或多人协作。

## DoD 与文档判断

业务 AC、聚焦自动化和 Computer Use 均通过后才能 Done；本 Story 已满足三者并标记 Done。该能力对用户可见，release notes/README 记录为已完成用户结果；public DTO/实况 requestId 传播形成的长期边界已记录到模型调用归因 Wiki。该完成不代表父 S2-04c、Release 1 或发布门完成，不扩张为全系统历史能力。
