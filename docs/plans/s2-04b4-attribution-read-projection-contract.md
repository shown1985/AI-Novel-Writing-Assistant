# S2-04b4：首批身份归因与内部读投影合同

## Story 合同

- Release / Sprint：Release 1 / R1-S2G。
- 状态 / 点数：Done（R1-S2G）/ 5 点。
- 用户价值：自动导演、本书世界生成和章节改稿预览的每次模型调用能归属于真实作品与任务上下文；调用证据缺失时显示明确的“未记录/无匹配记录”状态，而不是从当前配置、URL 或按钮文案猜一个来源。
- 依赖：S2-04b3 已 Done；复用既有 `ModelAttemptStore`、repository、request scope、lineage 和脱敏字段。S2-04c 不是本卡依赖，也不在本卡实现。
- Owner：单一模型平台全栈 owner。该 owner 独占本卡必要的 platform/runtime/三个入口 wiring/内部 read service/定向测试；根集成人只做合同审阅、组合验证和阶段集成，不拆第二 owner。

## Definition of Ready

1. Story ID、Release、Sprint、5 点估算、用户价值和本页范围已经冻结；父里程碑 S2-04b 的 04b1/04b2/04b3 生产底座均有完成证据。
2. 三个且仅三个本窗口入口已命名：自动导演 runtime frame、本书 `novel-world-generate`、章节 `ai-revision-preview`。任何其他入口不因本卡存在而自动纳入。
3. 归因字段和优先级已确定为内部合同：请求开始时显式提供 context；director 必须使用完整 runtime frame；world/chapter 必须提供显式 novel/chapter/entrypoint；未提供不从其他信号推断。
4. 读取边界已确定为内部 service/测试：不新增 HTTP/API、client UI、公开/shared DTO、Prisma schema、迁移、调用历史产品页面或模型调用。
5. 已列出失败、并发、历史、重启与零模型读取验收；测试可使用隔离 repository/fixture，不写用户桌面库、不发送真实模型请求。
6. owner 文件边界与不变项已列明：不改 retry/fallback/repair/semantic 策略，不改 attempt store 终态语义，不回填旧历史，不做 04c 展示。

## 冻结决策

### 1. 归因 context 只有三类

本卡只接三种显式 `ModelAttemptAttribution` context，并在同一 request scope 贯穿所有物理 attempt：

| 入口 | 必要身份 | 归因来源 | 备注 |
| --- | --- | --- | --- |
| 自动导演 | `novelId`、`taskId`、`directorRunId`、step idempotency key、node key、entrypoint | `director_runtime` | 以完整 runtime frame 为整体事实源 |
| 本书世界生成 | `novelId`、entrypoint=`novel-world-generate` | `prompt_invocation` | 不从世界名称、当前 URL 或模型设置推断小说 |
| 章节改稿预览 | `novelId`、`chapterId`、entrypoint=`ai-revision-preview` | `prompt_invocation` | 入口先显式补齐 `novelId/chapterId/entrypoint`，不能只靠 chapter label |

三个 context 之外的调用继续使用 `unattributed / legacy_unknown`，不能为了提高覆盖率修改其他业务入口或把本卡宣称为全系统归因。

### 2. Director 完整 frame 整体优先

- 自动导演在进入模型 request scope 时传递一份完整、同一时点的 runtime frame；frame 内的 novel/task/run/step/node/entrypoint 共同构成一个不可拆的归因快照。
- 完整 frame 存在时，不允许把 frame 与旧 telemetry、URL、当前选项、live interaction 或其他局部对象逐字段拼接。
- frame 内身份冲突、跨小说字段或缺少完整必需项时，返回明确的归因缺失/冲突证据；不能选取“看起来最新”的字段继续写入。
- 此优先级只约束 attempt attribution，不改变 director 的任务状态、恢复、质量策略或模型路由。

### 3. 严格区分 execution evidence 与 attribution status

`evidenceStatus` 是 S2-04b3 已冻结的执行观察状态，只表示 attempt start/finalize 观察写入是否完整：`complete | partial | missing`。本卡不得重新定义、复用或由读 service 推断它。归因读取另用内部 `attributionStatus`：`complete | partial | unattributed`。

- `reconstructRequest(...) === null` 只能映射为 `not_found`：没有找到持久化 request/attempt 记录。它不能推断执行缺失，也不能自动输出 `evidenceStatus=missing`。
- 持久记录存在但为 legacy/unattributed，或必要归因字段不完整时，read service 返回 `attributionStatus=unattributed`（字段局部可用但无法形成可靠归因）或 `attributionStatus=partial`；这不是 `not_found`，也不改变已有持久行的 `evidenceStatus`。
- 只有调用方同时携带真实的 `ModelAttemptExecutionEvidence`，并且该 evidence 明确为 `evidenceStatus=missing` 时，内部投影才可透传 `evidenceStatus=missing`。不能因为 `reconstructRequest` 为 null、归因缺失或读结果为空而制造这个值。
- 持久请求及必要身份完整时，归因状态才为 `attributionStatus=complete`；已有执行 evidence 若同时存在则原样保留 `complete|partial|missing`，不跨字段推断。

因此测试必须保留三类不可混淆的结果：`not_found`（reconstruct 为 null）、`persisted unattributed`（有持久记录但 attributionStatus=unattributed）、`execution writes all failed/missing`（调用方真实携带 evidenceStatus=missing 后才显示 evidenceStatus=missing）。

### 4. 内部 read service 复用既有持久事实

- read service 只读取现有 `ModelAttemptRepository.reconstructRequest` / `findAttempt` 等门面以及 request context 归因投影；不新建第二个 attempt store 或 Token 账本。
- 返回内部聚合包含 request、attempt lineage、adopted attempt 和 `attributionStatus`；调用方若同时提供真实 execution evidence 才原样携带其 `evidenceStatus`。字段继续遵守既有脱敏合同，不带 Prompt 正文、模型输出、凭证、header、URL secret 或 provider 原始错误 body。
- 默认模型、顶部设置或路由变化不得改写旧记录；重启后读取与进程内读取同义。

## 范围与文件 ownership

范围：

- `server/src/platform/llm/provenance/attempts/` 内部 attribution context、request scope 与 read service 的必要扩展；保持 facade 和 store 语义兼容。
- 自动导演 runtime 的显式完整 frame 传递；只改必要的调用边界，不改 director workflow、checkpoint、recovery 或 issue policy。
- 世界 `novel-world-generate` 与章节 `ai-revision-preview` 的显式 context 接线；后者补齐 novel/chapter/entrypoint 所需的内部调用参数。
- 归因状态、request 聚合、adopted 选择、旧记录和并发隔离的定向测试。

非范围：

- 公开 HTTP/API、shared/public DTO、client UI、运行记录/Creative Hub 展示、调用历史页面、API query key 或新的用户入口。
- Prisma schema、SQLite/PostgreSQL migration、attempt store/repository 结构变化、Token/cost/budget 账本。
- S2-04c 预计/实际模型 UI；本卡完成的是内部读投影合同，不能宣称作者已经可见。
- 其他世界写入口、batch、多小说推断、旧记录回填、从 URL/label/自由文案/当前设置/live interaction 猜 novel/task/chapter 身份。
- 改变模型选择、retry/fallback/repair/semantic 策略、调用次数、任务状态、正文或人工恢复状态。

## 实施任务与顺序

1. 盘点现有 request context、attempt store/repository 和三个入口的实际调用边界，建立三入口输入/输出矩阵；确认未覆盖入口继续 `legacy_unknown`。
2. 在内部 platform contract 中定义显式 attribution context 与 read projection 状态；优先保证 context 在请求 scope 创建时捕获并由所有 retry/stream attempt 复用。
3. 先接自动导演完整 runtime frame，验证 frame 整体优先和冲突拒绝；不得先做局部字段兜底。
4. 接入 `novel-world-generate` 与 `ai-revision-preview` 的显式 context，补齐章节预览所需 `novelId/chapterId/entrypoint`，确保两个入口并发不会共享上一个 request 的归因。
5. 实现内部 read service：按 request 重建 attempts、adopted attempt 与 attribution status；只透传调用方同时提供的真实 execution evidence，保留 `not_found`、`attributionStatus=unattributed|partial|complete` 与 `evidenceStatus=complete|partial|missing` 的区别。
6. 运行定向测试与受影响 server build/typecheck；审阅没有新增 public surface、schema/migration 或 UI 后交付根集成人验收。

## 验收标准

1. **三入口显式归因**：自动导演、`novel-world-generate`、`ai-revision-preview` 各自产生的 attempt 能携带正确 novel/task/run/step/chapter/entrypoint 身份；缺失身份不会由 URL、label、当前设置或 live 状态猜出。
2. **Director frame 优先**：完整 runtime frame 提供时，attempt 使用 frame 的整体身份；旧 telemetry 或局部字段与 frame 冲突时不得拼接或覆盖，结果标为冲突/缺失并保留调用结果。
3. **章节显式身份**：章节预览的 novelId/chapterId/entrypoint 在调用前明确进入 context；同 chapter label 或当前页面切换不能替代这些字段。
4. **并发隔离**：两个小说、两个 director task 或 world/chapter 入口并行执行时，requestId、attempt lineage、novelId、taskId、chapterId 互不串联；stream/deferred callback 仍复用原 scope。
5. **内部读取**：read service 可按 request 重建 attempts、lineage 和唯一 adopted attempt；重启后与默认模型改变后读取结果不变；不读取模型、不重发生成、不写业务内容。
6. **状态区分**：没有持久 request 记录（`reconstructRequest=null`）时只返回 `not_found`；持久但 legacy/unattributed 时返回 `attributionStatus=unattributed`；字段不全时返回 `attributionStatus=partial`；只有真实 execution evidence 明确报告所有观察写入失败时才透传 `evidenceStatus=missing`。测试必须覆盖 `not_found`、persisted unattributed、execution writes all failed/missing 三类。
7. **旧记录兼容**：已有 unattributed/legacy_unknown 记录可读但不伪造新身份；后改 provider/model/default route 不改历史 attribution。
8. **脱敏与旁路失败**：read projection 不暴露密钥、鉴权 header、秘密 URL、Prompt/输出正文或原始错误载荷；repository/observation 读取失败不改变模型结果、重试次数、任务状态或 pendingManualRecovery。
9. **严格范围**：本卡最终 diff 不新增 HTTP/API、client UI、shared/public DTO、Prisma schema、migration 或其他入口；三个入口和内部 read service 之外的需求有明确 Refinement 记录，而非顺手实现。

## 最窄验证

- 新增/扩展 `server/tests/modelAttemptAttribution.test.js`（或 owner 模块同名定向测试）：覆盖三入口身份矩阵、director 完整 frame 优先/冲突、chapter 显式三字段、双小说并发、stream scope、重启/默认模型变化、`not_found`（reconstruct 为 null）、persisted unattributed、execution writes all failed/missing（真实 evidenceStatus=missing）、旧 legacy 记录、零模型读取和脱敏。
- 复用 `server/tests/modelAttemptWiring.test.js`、`server/tests/directorUsageTelemetryProjection.test.js` 的相关 attempt/adopted/lineage 回归；不重复改变其既有重试语义。
- 运行 `pnpm --filter @ai-novel/shared build`（仅确认现有共享类型未被破坏）与 `pnpm --filter @ai-novel/server build`，再执行上述定向 Node 测试；以当前源码重建 dist 后运行，避免陈旧产物误导。
- 检查 `git diff --check`，并静态审阅新增文件/exports 不出现 API route、UI 文件、Prisma schema/migration 或第二仓库。
- 不发送真实模型调用、不写用户桌面库、不执行 reset/drop/truncate；并发与故障使用隔离 repository/fixture。

## 失败、恢复与数据边界

- attribution context 缺失只降级为 `attributionStatus=unattributed|partial`，不把它改写成 execution `evidenceStatus=missing`，也不为了补身份重发模型请求、重跑任务或重新采用正文。
- read service 找不到 request（`reconstructRequest=null`）只返回 `not_found`；repository 短暂故障保留已知 attribution/evidence 状态并返回可诊断错误，不把空结果伪装为 execution 缺失。
- recorder best-effort 失败仍遵守 S2-04b3：模型结果、任务状态、人工暂停和正文不受影响；本卡只读取/归因，不增加补偿队列。
- 不修改任何用户库数据，不回填历史身份，不新增 schema/migration；需要数据库改造的发现退回 Refinement。

## Definition of Done 与交付证据

- 三入口真实生产边界均有显式 context wiring；测试证实 director frame 优先、并发隔离和状态区分。
- 内部 read service 能从既有持久记录生成聚合 projection；无公开 API/UI/schema/migration；不把 S2-04c 或全系统透明度标为完成。
- Terra 最终 PASS：shared/server build 通过，三文件定向检查 `20/20`；失败/重启/旧记录/脱敏证据可复现。
- `git diff --check` 作为阶段集成检查。
- UI 验收：不适用（本卡无新增 UI）；未来 S2-04c 的 UI 验收必须另卡另审。
- 长期文档/发布判断由根集成人在阶段集成时处理；本 Story 不自行修改 Wiki、README 或 release notes。

## 未完成与后续边界

S2-04c 保持其既有依赖状态，不能因为内部 read service 完成就自动 Ready 或实现 UI；其他未覆盖入口继续 `unattributed/legacy_unknown`，待后续 Refinement 决定是否建立新 Story。
