# S3-02b3s：AI 结构补全幂等与费用边界 Spike

## 身份与决定范围

- Release / Epic：Release 1 / S3 可信世界；稳定 ID：`S3-02b3s`；2 点，Refinement Spike，未进入任何 Sprint 承诺。
- 用户价值：作者点击“AI 补全世界结构”后，即使响应丢失或世界内容同时变化，也不会重复付费、误覆盖较新内容，且能知道模型结果是否已保存。
- 依赖：S3-02a、S3-02b1、S3-02b2 已 Done。Spike 可进入下一次 Sprint Planning，但后续实施卡仍须等待本 Spike 决策和独立 DoR，不因前置完成自动启动。
- Owner：一名 Luna xhigh 全栈工程师负责只读主链审计和隔离 seam proof；根 PM/PO 冻结合同。若 Luna 额度不可用，由根 PM 继续只读证据，不改为低能力模型直接实施。

## 为什么不能直接复用 S3-02b2

`POST /worlds/:id/structure/backfill` 先调用已登记的 `world.structure.backfill` Prompt，再以模型输出构造完整结构，随后直接 `prisma.world.update`、创建 `structure-backfill` 快照并排队 RAG。客户端每次点击都会重新发起请求，当前请求没有 `operationId`、`expectedContentRevision` 或可查询结果身份。

手动结构保存的 request hash 可以由作者提交的固定 `structure/bindingSupport` 计算；AI 补全在模型调用前并没有最终 candidate。若只把生成结果交给既有 commit 门面，响应在模型完成后、提交前丢失时仍可能再次调用模型和重复计费；若 hash 包含每次模型输出，相同用户意图也无法稳定重放。现有模型 attempt store 记录物理调用证据，不持久化可直接复用的结构化输出，也不是世界内容 operation receipt，不能自动解决这一缺口。

## Spike 必须回答的三个问题

1. **调用前幂等**：客户端保存意图应冻结哪些输入（world、基线 revision、Prompt/version、provider/model 与 operationId）；服务端在模型调用前如何判断 committed、in-flight、failed-retryable 或未知结果，确保相同 operation 不重复触发付费调用？
2. **生成后提交**：模型输出如何与冻结的基线 revision 绑定，并以同一 operation 身份进入世界 CAS；若世界在生成期间被作者修改，应返回冲突、保留哪份生成结果，以及是否允许显式重新生成？不得用最新世界自动合并来掩盖冲突。
3. **响应丢失与恢复**：模型成功但提交未开始、提交成功但 HTTP 响应丢失、模型调用状态未知三种情况各由什么持久事实判断；来源页应显示“生成中、已保存、未保存结果可处理、状态待确认”中的哪一种，且重试何时复用结果、何时允许新 operation？

## 范围、证据与退出

- 只检查 `POST /worlds/:id/structure/backfill`、`WorldService.backfillStructure`、`worldStructureWorkspace.backfillWorldStructure`、`world.structure.backfill` Prompt、模型 attempt evidence、既有世界 CAS/operation/receipt 与两处来源页的“AI 补全结构”动作。
- 产出：时序图或状态表、operation/request hash 合同、是否需要持久化生成结果或租约的决定、单张实现 Story 是否可保持 5 点、owner/文件边界和行为 AC。
- 最窄 seam proof：mock 模型与隔离 SQLite，证明同 operation 并发/重放最多一次模型调用；生成期间 revision 冲突零世界写入；提交成功响应丢失可读回原 receipt；不得调用真实模型或用户数据库。
- 非范围：`POST /structure/generate` 单区块建议、手动 PUT、分层/深化/导入/同步/评估/提案、Prompt 内容改写、新模型路由策略、通用任务中心动作、Release 2 或额外安全体系。
- 若不新增持久状态便无法区分“模型未调用”和“模型已调用但结果未保存”，Spike 必须明确最小 owned store/既有表扩展及迁移影响，并据此拆分；不得为了守住 5 点而宣称模型调用天然幂等。

## 当前 DoR 结论

S3-02b3 实施卡保持 **Refinement / Not Ready**。最大未决项是模型调用前的 durable claim 与生成结果恢复合同，它会改变核心数据方案，符合敏捷规范中必须先 Spike 的条件。当前 S3-02b3s 只冻结调查范围，不代表 backfill 已受版本保护，也不计入 R1-S3C 的 5 点承诺。
