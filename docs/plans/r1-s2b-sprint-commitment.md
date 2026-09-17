# R1-S2B：主动诊断与可信装配 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2B；R1-S2 的第二个 1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：作者进入设置或知识库只读取已有诊断并主动决定何时检测；单书各阶段完成稳定展示装配，模型解析同步产出可信且脱敏的选择来源，为下一窗口的建议应用、推荐动作和实际调用展示解除依赖。
- 开发基线：`codex/r1-s1-config-safety@90cc73cb`；R1-S2A 已完成 14/14 点。
- 承诺容量：9 点；Stretch：无。
- 容量依据：前三轮完成速度为 16、15、14 点；本轮同时包含诊断 UI 行为验收、接近硬阈值的页面模块收敛和模型平台合同，宁可保留集成余量，也不以未满足 DoR 的卡补满容量。
- 产品边界：只做 Release 1 本机设置/知识库诊断消费、单书展示装配和模型解析来源合同；不引入账号、MFA、MySQL、LAN、真人协作、实际调用历史展示或公开发布。

## 承诺 Backlog

| Story | 点数 | 当前状态 | Owner | 依赖 | 用户结果 |
| --- | ---: | --- | --- | --- | --- |
| S1-02b 设置与知识库诊断状态消费 | 3 | In Progress | 诊断 UI Agent；根集成人负责共享 API/query keys | S1-00/02a Done | 页面自动读取零模型/embedding 调用，作者显式点击后才检测，并能区分未知、过期、失败与读取错误 |
| S2-01b 阶段装配与页面组合收敛 | 3 | In Progress | 单书 Presentation Agent | S2-01a Done | 桌面与移动视图消费同一装配结果，后续调整不再继续膨胀总控或复制任务解释 |
| S2-04a 模型选择来源与有效参数合同 | 3 | In Progress | 模型平台 Agent；根集成人负责共享类型/出口 | 无生产实现依赖 | 模型解析按字段说明请求值、有效值、来源和能力调整原因，且不泄露凭证 |

三张卡均在承诺前完成 DoR 复核。`S2-04a` 只交付解析来源合同，不把实际调用记录、持久化或用户界面冒充为已完成能力。

## Definition of Ready 与边界

### S1-02b

- 权威合同：[Sprint 1 实施卡](./agent-collaboration-sprint-1.md#s1-02b设置与知识库诊断状态消费)与 [诊断就绪度架构](../wiki/architecture/diagnostic-readiness.md)。
- 诊断 UI Agent Owned：`SettingsOverviewPage.tsx`、`ModelRoutesPage.tsx`、`SettingsReadinessCard.tsx`、`modelRoutes.utils.ts`、`KnowledgePage.tsx`、`KnowledgeOpsTab.tsx` 及聚焦测试。
- 根集成人保留：`client/src/api/settings.ts`、`knowledge.ts`、`queryKeys.ts`、共享诊断 DTO 与最终集成提交。
- 状态合同：`not_checked / healthy / failed / stale / loading / error / pending` 分离；未知和过期不是失败；读取错误不能伪装成未配置；基础配置有效但未检测或过期时不新增创作阻断。
- 命令合同：GET 自动查询只读；POST 只由显式检测触发；同一 pending 防重复；其他窗口持有 lease 时有限轮询直至完成或租约到期；迟到 POST 不能把新指纹状态覆盖成旧结果。
- 非范围：应用诊断建议、改变开书流程、RAG 自动启用、默认模型替换、服务端诊断存储重写。
- 最窄验证：状态消费与事件调用行为测试、GET/POST 调用计数、迟到响应/目标切换、client typecheck；随后使用隔离配置完成 Computer Use 的设置与知识库 UI 验收。

### S2-01b

- 权威合同：[Sprint 2 实施卡](./agent-collaboration-sprint-2.md#s2-01b阶段装配与页面组合收敛)与 [S2-01a application facade](./s2-01a-single-book-application-facade.md)。
- Owned：`NovelEdit.tsx`、`novelEditPlanningTabs.ts`、`NovelEditView.types.ts`、`NovelEditView.tsx`、`MobileNovelEditView.tsx` 与新建 `novels/workspace/presentation/`。
- 冻结：`workspace/application/**`、业务 hooks、导航/自动化合同、client API/query keys/shared types、服务端 Runtime，以及任务抽屉和导演进度面板的动作语义。
- 架构门：`NovelEdit.tsx` 当前 1263 行，实施先建立有职责名称的 presentation 子模块，再替换内联装配；退出时目标约 1100～1200 行，所有触及源文件必须低于 1300 行；外部只能经模块 facade 导入。
- 非范围：专业表单优化、阶段枚举、世界写权限、推荐动作、恢复语义或任何生成命令变化。
- 最窄验证：装配输入矩阵、复用 S2-01a 身份/导航/暂停/查询/接管回归、移动页面合同、client typecheck、行数与 facade 导入检查。纯机械装配无可见变化时不重复浏览器验收；出现可见差异则进入用户验收。

### S2-04a

- 权威合同：[Sprint 2 实施卡](./agent-collaboration-sprint-2.md#s2-04a模型选择来源与有效参数合同)。
- 模型平台 Agent Owned：`server/src/llm/factory.ts`、`modelRouter.ts`、`capabilities.ts`、聚焦测试；新增代码只能进入有明确归属的 `server/src/platform/llm/provenance/`，不得继续增加 `server/src/llm` 同级拥挤文件。
- 根集成人保留：`shared/types/llm.ts` 及共享出口。`ResolvedLLMClientOptions` 含秘密/连接字段，禁止直接作为外发 DTO。
- 合同：分别记录 provider/model/temperature/maxTokens 的 requested/effective 来源；能力层固定、截断、provider 限制、legacy 4096 未设置、结构化输出 cap/omit 均给出结构化 adjustment；保留 routeKey、降级原因与 attempt lineage 类型，旧调用缺证据显示 unknown。
- 行为边界：由真实 resolver 产生来源，不改变现有选择优先级、参数结果、重试或备用策略；只读、零模型调用、零配置写入、零 schema/迁移。
- 非范围：实际调用持久化、usage/live、API/UI、历史回填、付费探测和委托策略。
- 最窄验证：shared/server build、`modelRouter.test.js` 与 resolver 聚焦测试；mock secret/settings/provider，断言投影脱敏、零 transport、零写入。

## 并行波次与集成所有权

```text
Wave 1（并行）
  诊断 UI Agent：S1-02b
  单书 Presentation Agent：S2-01b
  模型平台 Agent：S2-04a
  根集成人：共享 API/query keys/types、评审、Wiki/发布判断与阶段提交
```

- 每个 Agent 同时只有一张 `In Progress` Story；不得领取未承诺卡。
- 根集成人独占 `TASK.md`、Roadmap、README、Release Notes、Wiki、共享类型/API/query keys 和阶段提交。
- Agent 不切分支、不提交、不修改其他 Owner 文件；需要越界时先返回精确接线请求。
- 三张卡文件域互不重叠。S1-03 与 S1-02b 会共同修改模型路由页面，S1-03 必须等 02b 完成并独立验收后再进入未来 Sprint。

## 未承诺与 DoR 阻断

- `S1-03`：重新估为 5 点，状态 `Refinement / Not Ready`。进入 Ready 前必须冻结事务内当前指纹计算与 PostgreSQL 隔离、revision=0 的 CAS 创建、PUT 判别联合与 409、canonical request hash、服务端诊断目标/建议校验和 UI operationId 生命周期。
- `S2-03a`：纯展示模型合同已可冻结，但仍受 S2-01b 阻断；01b 完成后重新 Sprint Planning，不作为本轮条件承诺或隐藏 Stretch。
- `S2-03b`：受 S2-03a/01b 阻断；不提前接线动作。
- `S2-04b/04c`：受 S2-04a 及持久化/API 合同阻断；本轮不实现历史证据或 UI。
- 本窗口不 push、tag、晋级 beta/main、执行桌面包装或公开上传。

## 验收顺序与 DoD

1. S1-02b 先通过行为测试和 typecheck，再用 Computer Use 检查首次进入/刷新零自动检测、显式按钮 pending/防重复，以及 unknown/stale/failed/error 的可理解呈现。
2. S2-01b 必须保持 S2-01a 的身份、暂停和命令零副作用证据；任何 hook 重挂载或可见行为变化均退回修复，不能以行数达标替代行为验收。
3. S2-04a 先以矩阵证明解析结果完全不变，再验脱敏来源投影；不能把预计来源或当前设置伪装成历史实际调用。
4. 每张 Story 都需行为级证据、适用失败/并发/恢复检查、Wiki 判断、发布说明判断和独立阶段提交；typecheck 或文档不能单独建立业务 Done。
5. Sprint 结束记录 Goal、承诺/完成点数、carryover、返工/逸出缺陷、UI 验收与最多两项流程改进。

R1-S2B 完成只解除建议应用、推荐动作和实际调用来源链的前置依赖；Release 1 仍须经过后续 Sprint、R1-RC、beta 组合验证和最终用户验收。
