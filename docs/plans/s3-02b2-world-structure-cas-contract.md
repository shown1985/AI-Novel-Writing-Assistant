# S3-02b2：世界手册手动结构保存接入 CAS（Done）

## Story 身份与拆分决定

- 稳定 ID：`S3-02b2`；Release 1 / S3 可信世界；P0；**Done，代码级 QA/QC、beta 组合验证与隔离 Chrome 来源页验收均 PASS**。
- 估点：**5 点**。作为作者，我希望在既有世界手册编辑处保存结构时，不覆盖另一处刚保存的内容；若保存结果未知或版本冲突，草稿和已保存世界均可辨认。
- 前置：S1-06、S3-02a 和 S3-02b1 已 Done；复用 `World.contentRevision`、`WorldMaintenanceOperation`、receipt 与 `commitWorldSample`，不增加 schema/migration。
- 拆分理由：`PUT /worlds/:id/structure` 是现有作者手动保存；`POST /worlds/:id/structure/backfill` 会先调用模型再直接写库。两者虽位于同一 `worldStructureWorkspace.ts`，但 backfill 的模型结果、响应丢失后是否重算、重放结果与费用边界需要独立合同。若同卡覆盖两者，除 CAS 外还必须改变生成/重试语义，无法有把握维持 5 点。本卡只接手动保存；backfill、单区块生成后的保存以及其他旧写入口留在原 `S3-02b` 父项 Refinement，后续另建稳定子卡，不在本卡计点或默认为 Ready。

## 当前代码事实与范围

- `WorldService.updateStructure` 委托 `worldStructureWorkspace.updateWorldStructure`；后者归一化 `structure/bindingSupport`，直接 `prisma.world.update`，递增旧 `version`，随后创建 `structure-saved` snapshot 与 RAG 更新。现有请求 schema、client API、`WorldWorkspace` 两个结构编辑视图的保存调用均未传 `operationId/expectedContentRevision`。
- 范围仅为上述 `PUT` 的业务门面、兼容解析和既有来源页保存接线：以完整结构候选及兼容投影调用 S3-02a 的同一 CAS/operation/receipt 门面；保存成功后保留现有手册结果、snapshot 和 RAG 行为。两处编辑视图共用一个保存 mutation/保护身份，不建立第二套保存流程。
- 非范围：AI backfill、`POST /structure/generate`、分层/深化/导入/素材/快照恢复、世界样本与本书实例同步、评估/提案/作者决定、普通编辑新 UI、任务中心动作、全局回滚、额外锁/队列/表、Release 2。不得借此宣称原 `S3-02b` 全部完成。

## 拟冻结的最小写入合同

1. 请求沿用原 `PUT`，增量解析 `operationId` 与 `expectedContentRevision`；为旧客户端可选解析，但业务层在任何内容写入、snapshot 或 RAG 前要求两者，缺失返回 `428 REVISION_REQUIRED`。世界不存在返回既有样本级 404；不添加新公开端点。
2. 作者的一次保存意图固定 `operationId`、目标 world ID、基于当前 `World.contentRevision` 的 expected revision，以及提交时的 `structure/bindingSupport`。网络失败或结果未知时只能重放同一 payload/operationId；若作者修改草稿，则属于新的保存意图，不得复用原 ID。客户端不得猜测新 revision 自动覆盖冲突。
3. `sourceRef` 复用 `worldSampleSourceRoute(worldId)`；`expectedDecisionRevision=0`、`selectedPatchIds=[]` 继续遵守 S3-02b1 兼容合同。request hash 由目标、操作身份、expected revision、来源路由与原提交意图的 `structure/bindingSupport` 计算，不能包含每次调用新生成的时间戳或模型输出。沿用现有维护门面已验证的 A→B→A receipt 重放，不新增 preflight API；调用方可重建候选但不能用当前 World 派生的字段计算原始请求 hash。
4. 以当前世界行为基线构造完整 candidate；仅替换经现有结构归一化与引用检查的结构、binding support 及对应 legacy 投影，其余字段保持原值。内容、兼容投影、`contentRevision`、operation 和 receipt 同事务；不得保留直接 `world.update` 旁路。`409 CONTENT_REVISION_CONFLICT` 与 `409 OPERATION_ID_REUSED` 均零内容写入。
5. `structure-saved` snapshot 仅在首次 `committed` 尝试，`replayed` 不复制或自动补建；不承诺 exactly-once 历史快照。结构保存成功响应的数据新增 `snapshotStatus: "created" | "failed" | "unknown"`：首次快照成功为 `created`，首次快照失败仍 HTTP 200 且为 `failed`，来源页显示“世界内容已保存，历史快照未完成”；重放为 `unknown`，不声称快照存在。CAS 内容与 receipt 始终是已保存事实，不把快照失败误报为内容失败。RAG 刷新失败只留下既有资料债，不回滚已提交内容。不能将独立 snapshot 成功误称为 CAS 事务的一部分。

## 可观察验收条件

1. 现有手册和高级结构两种视图保存同一世界时，服务端收到同一形态的受保护请求；保存成功刷新后显示提交的结构、兼容字段和递增一次的 `contentRevision`，不额外生成内容。
2. 缺任一保护字段返回 428，旧式请求不更新内容、版本、operation、snapshot 或 RAG；两个不同操作基于同一 revision 并发保存仅一个成功，另一个 409 且不覆盖较新内容。
3. 同 operationId、同请求意图在响应丢失后重放，若根据原始 `structure/bindingSupport` 重建的候选通过确定性校验，则返回同一 receipt，不重复递增内容版本或尝试 snapshot；候选校验失败则返回确定性校验错误且零写入，不宣称无条件 replay。候选通过确定性校验时，同 ID 携带不同结构/支持数据返回 `OPERATION_ID_REUSED`；校验失败按确定性校验错误处理，两种情况均零写入。
4. 候选结构或实体引用无效时沿用维护门面的确定性拒绝，不能先写 legacy 字段；事务失败不留下结构/投影/revision/receipt 半状态。首次 `committed` 后快照成功返回 `snapshotStatus=created`；快照失败仍 HTTP 200、内容/receipt 保留且返回 `failed` 与来源页提示；`replayed` 不建快照并返回 `unknown`，不虚报快照存在。
5. 来源页在 409 或结果未知时保留当前视图的编辑草稿，不把失败误报为成功、不自动刷新成服务器内容；明确告诉作者当前内容已变化或保存状态待确认。同一 world 的后台 query refresh 也不得覆盖脏草稿；只有当前 operation 成功、作者显式重读或切换 world 才采用服务器结构。结果未知重试复用原 payload/ID；409 后必须先查看当前保存结果，由作者决定重新提交。切换 world 时旧响应不得改变新 world 的草稿或成功反馈。本卡不承诺手册/高级视图切换后共享未保存草稿。
6. S3-02b2 不改 backfill、单区块生成、分层等其他写入口；它们仍可能绕开此 CAS，不能以本卡测试推断世界样本全部写入安全。

## Owner 与最窄验证

- 一个 Luna xhigh 全栈 owner 独占 `server/src/services/world/worldStructureWorkspace.ts`、`WorldService.ts` 中 `updateStructure` 适配、`client/src/api/world.ts`、`client/src/pages/worlds/WorldWorkspace.tsx` 与两处现有结构编辑组件的必要保存反馈及聚焦测试。根集成人是 `worldHttpContext.ts` 请求 schema、`worldStructureRoutes.ts` 错误映射等共享 HTTP 文件的唯一集成 owner；实施前须明确顺序，不能并发抢改。`shared/types/world.ts`、schema/migration 不在本卡范围。
- 服务端聚焦测试复用 `worldMaintenanceCommit.test.js`，扩展 `worldStructure.test.js` 或同 owner 新增结构保存测试，覆盖 428/409、并发、同 ID 重放/异 payload、完整 candidate/legacy 投影、snapshot 一次、事务失败、RAG 失败和跨 world。客户端以现有 WorldWorkspace/API 行为测试覆盖双视图相同 payload、网络重试 ID 稳定、409/未知结果草稿保留、切书旧响应隔离；不以源码字符串匹配代替行为。
- 按实际 diff 执行 shared/server build、client typecheck 与上述聚焦测试、`git diff --check`；测试只用 mock 或隔离 SQLite，不触及用户库、真实模型、迁移或破坏性命令。现有 UI 的保存与冲突交互由用户在来源页验收；自动化不能代签 UI Done。
- 完成时审视世界维护恢复 Wiki 是否需补稳定边界；如有用户可见保存行为，再依仓库发布记录流程更新 README/release notes。阶段提交、beta 组合验证与 Sprint Review 属实施后的独立门，不由本 Refinement 文档冒充。

## DoR 签认

1. [S3-02b2s 限时 Spike](./s3-02b2s-structure-save-feasibility-spike.md) 已完成重放、独立快照及两视图草稿证据；稳定原始请求 hash、候选先校验、快照三态和本视图脏草稿边界均已冻结。
2. 独立 Terra QA/QC 对最终 AC3、5 点、验收与 owner 边界给出 DoR PASS。根 PM 独占 `worldHttpContext.ts`、`worldStructureRoutes.ts` 并在 Runtime owner 完成后串行接线；测试由对应生产文件 owner 维护。

DoR 通过不等于 Done。AI backfill、同步及其他旧入口仍属原 S3-02b 父项 Refinement，且不计入本卡。

## 完成验收证据

- Terra QA 对 AC1～6 代码级 PASS，独立 Terra QC 无 P0/P1/P2 代码阻断。shared/server build、client typecheck、结构 PUT HTTP 428/409、隔离 SQLite A 成功→B 成功→A replay 与自定义使用建议投影、客户端保存状态机测试及 `git diff --check` 已通过。
- `beta@d7df4af2` 组合验证通过：shared/server build、client typecheck、结构保存 HTTP/隔离 SQLite 5/5、客户端状态机 4/4，beta 工作树干净。
- 2026-09-22 在独立 SQLite `/tmp/ai-novel-s3c-ui.CDE9eE/app.db` 和独立 Chrome profile 中完成来源页验收，全程未访问用户数据库或真实模型：
  - 世界手册编辑和高级结构维护均实际调用同一结构 PUT；高级视图保存返回 `committed`、`snapshotStatus=created`，revision `3→4`，刷新后调性和核心冲突仍显示。
  - 外部操作先提交 revision 5 后，旧页面保存得到真实 409；页面保留“冲突时保留的本地草稿”，显示冲突说明和“放弃当前草稿并读取已保存内容”。点击后同时重读结构与世界详情，采用服务端内容并清除恢复按钮。
  - 浏览器在服务端已提交 revision 6 后丢弃响应，来源页显示保存状态待确认、保留原草稿和显式重读入口；重读后显示服务端已保存的同一内容，证明未知结果没有被误报为失败或自动覆盖。
  - 服务端快照失败行为由聚焦测试证明内容与 receipt 仍保留；浏览器把成功提交响应的 `snapshotStatus` 隔离注入为 `failed` 后，来源页显示“世界内容已保存，历史快照未完成”，服务端内容仍已提交至 revision 7。该注入只验证 UI 投影，未修改生产代码。
- Story 完成不代表 AI backfill、单区块生成或其他旧入口已受保护；这些范围仍按父项 Refinement 单独拆分。
