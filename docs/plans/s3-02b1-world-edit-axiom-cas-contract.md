# S3-02b1：世界编辑与公理保存 CAS 兼容合同

## Story 合同

- Release / Sprint：Release 1 / R1-S2G。
- 稳定 Story ID：`S3-02b1`。原 `S3-02b` 是更宽的父项；其余未接入旧入口留在 Refinement，不由本合同隐式继承或完成。
- 状态 / 点数：User Acceptance / 3 点（代码级验证通过，尚未计入 Done）。
- 用户价值：作者在世界来源页保存普通世界字段或核心公理时，系统会依据作者看到的内容版本安全提交；保存请求缺少版本或操作身份时不会静默覆盖，重复/过期请求能得到可理解的 428/409 结果并安全重试。
- 依赖：S3-02a 已 Done；复用已存在的 `World.contentRevision`、`WorldMaintenanceOperation`、`WorldMaintenanceCommitReceipt`、CAS/幂等提交门面和既有迁移。无新 migration。
- Owner：单一世界 Runtime 全栈 owner。该 owner 覆盖 `WorldService.updateWorld`、既有 world HTTP/API 兼容映射、`updateAxioms` 来源页的 client API/UI 接线和定向测试；根集成人只做合同审阅、组合验证与阶段集成。

## Definition of Ready

1. Story ID、Release、Sprint、3 点估算、用户价值、范围/非范围和完成证据形式已固定；S3-02a 的 CAS/operation/receipt 行为证据可复用。
2. 本卡只承诺两个真实保存路径：`WorldService.updateWorld` 的兼容 HTTP/API 与既有世界工作台的 `updateAxioms` 公理保存；不把“所有旧入口收敛”压进 3 点。
3. 业务规则已冻结：请求 schema 可以解析可选 `operationId`/`expectedContentRevision`，但业务服务不接受缺失值；缺失返回 428，版本/operation 冲突返回 409，均零内容写入。
4. 客户端规则已冻结：公理保存从当前 `World.contentRevision` 生成显式 expected revision，并为一次用户保存生成稳定 operationId；网络重试复用同一 operationId，不在每次重试生成新操作。
5. 已有路由、API client、`WorldWorkspace`、`WorldAxiomsCard` 和隔离 world/CAS 测试位置明确；不新增普通编辑 UI、不新增数据库表/字段/迁移。
6. 失败、重放、跨世界和刷新恢复均有 AC；不写用户桌面库、不 reset/drop/truncate、不用真实模型通过本卡。

## 冻结决策

### 1. 两条写路径统一一个 CAS 门面

- `WorldService.updateWorld` 继续作为现有普通世界字段的业务门面，但在实际写入前构造完整且已验证的 candidate aggregate，委托已有世界维护 CAS/operation/receipt 门面；不得保留无条件 `prisma.world.update` 旁路。
- `WorldService.updateAxioms` 同样构造公理结构与兼容字段的 candidate aggregate，复用同一 CAS 门面；不在公理方法内复制 revision 比较、operation 去重或 receipt 持久化。
- 两条路径仍保留现有来源页和 HTTP/API 形态；本卡只补安全合同接线，不改世界提案、评估、同步或快照产品语义。

### 2. 可选请求解析不等于可选业务保护

- `updateWorld` / `updateAxioms` 的 HTTP body 可为了旧客户端解析而接受缺失 `operationId` 或 `expectedContentRevision`，但业务层必须在任何读后写前拒绝缺失。
- 缺任一必需保护字段返回 HTTP `428`、稳定错误码 `REVISION_REQUIRED`，不创建 operation、不写 `World`、不刷新 RAG、不创建 snapshot。
- `expectedContentRevision` 不匹配返回 HTTP `409`、稳定错误码 `CONTENT_REVISION_CONFLICT`；相同 operationId 不同 request hash 返回 HTTP `409`、`OPERATION_ID_REUSED`。所有拒绝均不得覆盖当前作者内容。
- 同一 operationId、同一请求 hash 的重放返回原有 receipt/结果，不再次递增 `contentRevision`，也不复制提交证据。

### 3. 公理客户端显式 revision 与稳定 operationId

- 公理保存控件仍是现有 `WorldAxiomsCard`，不新增第二套普通编辑 UI；`WorldWorkspace` 保存 mutation 必须把当前世界 `contentRevision` 和该次用户保存的稳定 operationId 送入 `updateWorldAxioms`。
- operationId 在一次用户点击/保存意图内固定；网络超时、HTTP 202/未知响应或用户按既有重试动作时复用同一 ID，先查询/重放原操作，不生成新提交绕过 CAS。
- 成功后以服务器返回的 world/receipt 刷新 revision；409 保留用户草稿并要求重新读取/处理冲突；428 提示请求需要当前版本，不以刷新或猜测版本自动重试。

## 范围与非范围

范围：

- `server/src/services/world/WorldService.ts` 的 `updateWorld` 与 `updateAxioms` CAS 接线、candidate aggregate 构造和错误传播。
- `server/src/modules/setup/world/http/worldCoreRoutes.ts` 与 `worldStructureRoutes.ts` 的兼容请求解析/错误映射；保持现有 endpoint，不新增公开 endpoint。
- `client/src/api/world.ts`、`client/src/pages/worlds/WorldWorkspace.tsx`、`WorldAxiomsCard.tsx` 的公理保存 request/retry 参数接线；仅使用现有 UI。
- server/client 定向行为测试：缺字段 428、revision/operation 冲突 409、同 operation 重放、双提交竞争、RAG 失败不回滚、刷新/跨世界隔离和公理 UI 请求参数。

非范围：

- 新普通世界编辑器、WorldStructure/Layer/Deepening/Import/Library/Snapshot/Generate/Refine 等入口的全面收敛；它们全部进入 Refinement/非范围清单。
- AI proposal/evaluation、问题状态、世界样本同步、本书世界实例、快照权限/恢复、全局 rollback 或自动 repair。
- 新 Prisma schema、SQLite/PostgreSQL migration、旧数据批量回填/清理、用户库修复、RAG 新队列；复用 S3-02a 已有数据模型和 best-effort 行为。
- 任何通过按钮文案或旧客户端默认值绕过 revision/operation 的兼容路径；兼容只限请求解析，不能放宽业务保护。

## 实施任务与顺序

1. 对照 S3-02a 维护门面，确认 `updateWorld` 与 `updateAxioms` 的 candidate aggregate、sourceRef、expected revision 和 operationId 映射；禁止在两个方法复制 CAS 规则。
2. 先改 `updateWorld` 的业务接线和 world core HTTP/API：schema 可选解析，service 统一返回 428/409，确认零写入与不刷新旁路。
3. 改 `updateAxioms` 复用同一门面，并为既有公理保存 client 传递显式 revision/稳定 operationId；成功、冲突、未知响应均保留草稿和可恢复状态。
4. 补路由/服务/API client/工作台定向测试，覆盖两个世界并发、同 operation 重放、不同 hash、刷新后 revision 和 RAG 失败。
5. 运行 server/client 最窄 typecheck/build 与行为检查，审阅没有新增 migration、普通编辑 UI 或未授权旧入口接线。

## 验收标准

1. **统一 CAS**：`updateWorld` 和 `updateAxioms` 都只能经已有 CAS 提交门面写入；成功更新 candidate、contentRevision、operation/receipt 事实，失败不留半完成写入。
2. **428 缺保护**：HTTP body 缺 `operationId` 或 `expectedContentRevision` 时，解析可通过但业务返回 428/`REVISION_REQUIRED`，零 World 内容、revision、operation、receipt、snapshot 和 RAG 写入。
3. **409 版本冲突**：过期 expected revision 返回 409/`CONTENT_REVISION_CONFLICT`，同 operationId 不同 hash 返回 409/`OPERATION_ID_REUSED`；不覆盖后来作者内容。
4. **稳定重放**：同 operationId + 同 request hash 重试返回同一 receipt/结果，不重复递增 revision、不重复保存 snapshot/提交证据；响应丢失后可从既有 operation 查询恢复结果。
5. **公理 UI 显式请求**：既有 `WorldAxiomsCard` 的保存调用携带当前 `contentRevision` 与稳定 operationId；一次用户保存的失败/超时重试复用同一 operationId；成功用服务器 revision 更新，409 保留草稿并提示重新读取，不能静默覆盖。
6. **并发与隔离**：同一 world 的两个不同提交只允许一个 CAS 成功；不同 world 的 revision、operation、草稿和错误互不串联；刷新不会用旧响应覆盖当前 world。
7. **资料债不回滚**：CAS 内容事务成功后 RAG enqueue 失败只留下既有资料债/可重试状态，不回滚已保存 World，不重复创建内容提交。
8. **严格范围**：HTTP/API 只兼容现有 `updateWorld` 与 `updateAxioms` 路径；不新增普通编辑 UI、schema、migration 或其他旧写入口。所有未接入口在 Story 证据中列为 Refinement/非范围，不能宣称 S3-02 全部完成。

## 最窄验证

- 扩展 `server/tests/worldMaintenanceCommit.test.js` 或新增同 owner 定向测试：`updateWorld`/`updateAxioms` 缺字段 428、revision 冲突 409、operation hash 冲突 409、相同 operation 重放、双提交竞争、事务失败零写入、响应丢失查询、RAG 失败不回滚。
- 扩展 world HTTP route/API 测试：请求解析可选但业务拒绝缺字段，错误状态/错误码保持 428/409；不增加新 route。
- 扩展客户端定向测试（`WorldWorkspace`/`WorldAxiomsCard` 或 API mock）：保存 payload 含 `contentRevision` 与稳定 operationId，重试复用 ID，409 保留草稿且跨 world 不污染。
- 复用 `server/tests/runtimeMigrations.test.js`、`server/tests/prismaMigrationCompleteness.test.js` 的现有证据确认本卡没有新增迁移；不要把 PostgreSQL Release gate 冒充本 Story 完成。
- 运行受影响 server build/typecheck、client typecheck 与定向行为测试；`git diff --check`。不跑真实模型、不写用户桌面库、不执行 reset/drop/truncate。

## 失败、恢复与数据边界

- 428/409 均在业务写入前产生；客户端不以换 operationId 或猜新 revision 绕过冲突，先读取当前来源页状态再由用户决定重试。
- 同 operation 重放优先返回已有 receipt；结果未知时读取 operation 状态，不创建第二次内容提交。
- 客户端网络超时不代表失败；重试复用同一 operationId。服务器响应成功后即使 RAG 失败，也保持 World 内容和 revision，记录资料债。
- 旧入口不会因本卡自动获得 CAS；实现中发现的入口改造需求进入 Backlog/Refinement，不能塞进 3 点卡。

## Definition of Done 与交付证据

- 两条路径真实调用同一 CAS 门面；428/409、重放、并发、RAG 资料债和跨 world 隔离均有行为证据。
- Terra 代码级 PASS：maintenance/runtime/migration/service/route 定向检查 `25/25`、client CAS 检查 `3/3`，shared/server/client build/typecheck PASS；无新增 migration，未宣称其他旧写入口已收敛。
- 公理来源页请求携带显式 revision/稳定 operationId，并能在冲突/重试后保留草稿；但 Computer Use 工具不可用，真实来源页点击尚未验收，因此本 Story 保持 User Acceptance，3 点不计 Done。
- `git diff --check` 作为阶段集成检查。
- 本 Story 不新增 schema/migration；长期 Wiki、README/release notes 判断由根集成人在阶段集成时处理，本页不代替这些记录。

## 后续边界

S3-03～S3-06、S4 提案/采用/复核及原 S3-02b 父项的所有未接入旧世界写入口保持原依赖/Refinement 状态；S3-02b1 完成不能把它们自动标为 Ready，也不能把 S3-02 父项宣称全部完成。
