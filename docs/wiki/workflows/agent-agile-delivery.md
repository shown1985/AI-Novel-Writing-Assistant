# Agent 敏捷开发与交付规范

## 背景

项目同时存在长链创作、桌面运行、AI Prompt、数据库迁移和多Agent并行工作。若只维护功能清单，Agent容易跳过依赖、在一张卡中扩大范围、多人同时修改共享文件，或用typecheck代替业务验收。本规范将敏捷流程变成所有开发Agent的强制执行合同。

## 决策

所有功能、修复、架构调整和发布准备都必须归属于 `Roadmap → Release → Epic → Sprint → Story → Task`。紧急修复可以走Hotfix泳道，但仍需要Story、验收、验证、阶段提交和回填。

计划文档不等于承诺，代码合并不等于发布，类型检查不等于Done。只有满足状态门、证据门和发布门后，Story才能前移。

## 层级与权威来源

| 层级 | 回答的问题 | 权威位置 |
| --- | --- | --- |
| Roadmap | 先交付哪个产品结果 | `docs/plans/project-release-roadmap.md` |
| Release | 哪些能力共同形成一个可发布结果 | Roadmap与Release gate |
| Epic | 哪组用户能力属于同一业务目标 | 对应模块计划 |
| Sprint | 本验收窗口承诺什么结果 | 根 `TASK.md` 与Sprint记录 |
| Story | 用户得到什么、怎样验收 | `docs/plans/`详细卡或Issue |
| Task | 为完成Story需要执行的具体工作 | Agent工作记录，不可替代Story |

同一内容只保留一个Story ID和点数。父路线只做映射，不重复计点。

## Story 格式

每张Story必须包含：

- ID、名称、所属Release/Epic、相对点数、优先级和状态。
- 用户价值，使用“作为/我希望/从而”或等价的结果表达。
- 范围与非范围；不得在实现中静默扩大。
- 前置依赖、数据/接口来源、共享文件owner和并发边界。
- 可观察的验收条件，覆盖成功、权限/安全、失败、重试/并发和恢复。
- 最窄充分验证、UI验收责任、Wiki/发布记录判断。
- 涉及数据迁移时的备份、恢复和回退要求。

单张实现Story不超过5点；超过5点必须按可独立验收的纵向结果拆分。Spike通常不超过3点，只交付决策、证据和解锁条件，不交付伪生产能力。

## Definition of Ready

Story进入 `Ready` 前必须同时满足：

1. 用户价值、范围、非范围和Release归属明确。
2. 验收条件可由外部行为验证，不依赖“代码看起来完成”。
3. 依赖、接口、数据来源、迁移和安全风险已识别。
4. 文件/模块owner明确；共享文件只有一个集成人。
5. 验证命令、fixture与用户UI验收边界明确。
6. 未决问题不会改变核心方案；会改变方案的只能保持`Refinement`或`Spike`。
7. 生产数据、付费模型、外部账号或破坏性动作有独立授权边界。

不满足DoR的卡不能进入Sprint承诺，也不能通过先写代码倒逼合同。

## Sprint Planning

- Sprint是1～2周或等价的单一验收窗口，必须有一个可读的Sprint Goal。
- 初始承诺容量不超过25点；连续两个Sprint取得真实velocity后才能调整。
- Stretch不计承诺容量，核心Story未Done时不得抢做Stretch。
- 一个Agent同时最多一张`In Progress` Story；并行上限还受环境Agent槽位限制。
- 同一文件、schema、registry、共享类型、路由入口、README和发布记录不能分给多个Agent同时修改。
- Sprint开始前在`TASK.md`记录承诺Story、owner、依赖顺序、风险和退出门。

## 状态流转

```text
Backlog → Refinement → Ready → In Progress → In Review → User Acceptance → Done
                                ↘ Blocked / Returned to Backlog
```

- `Backlog`：方向候选，未承诺。
- `Refinement`：正在冻结合同或拆卡。
- `Ready`：满足DoR，可进入Planning。
- `In Progress`：已分配唯一owner并实际开发。
- `In Review`：实现完成，等待差异、测试、架构和安全复核。
- `User Acceptance`：仅用于需要用户视觉/交互验收的Story；未验收不得伪装Done。
- `Done`：满足DoD并已有阶段提交。
- `Blocked`：存在明确外部阻断；说明证据、影响和解锁条件。阻断卡退出承诺容量，不能无限占用WIP。

跨Sprint未完成的Story回到Backlog重新评估剩余范围，不自动把原点数全部结转，也不把部分实现标Done。

## Agent 执行循环

每个Agent按以下顺序工作：

1. **领取**：复述Story ID、Goal、范围、owner文件和验证方式。
2. **审计**：先读实际代码和现有测试，确认计划未过期。
3. **实现**：只改Story范围；发现相邻问题登记Backlog，不顺手扩张。
4. **更新**：持续工作超过60秒时给根集成人简短进度；冲突、数据风险和合同变化立即报告。
5. **自检**：运行最窄充分检查，记录未运行项和原因。
6. **交付**：提供差异摘要、验收证据、残余风险和Wiki价值判断；不自行宣称发布。
7. **集成**：根集成人检查完整Git范围、共享合同、发布记录和分支门后阶段提交。

子Agent不得自行切分支、合并、提交、迁移用户库、修改云资源或晋级beta/main，除非根集成人对该动作和范围有明确授权。

## Definition of Done

Story只有同时满足以下条件才能Done：

- 验收条件的成功、拒绝、失败、重试/并发和恢复路径均有相称证据。
- 实现通过真实应用边界；mock页面、静态文案或隐藏按钮不算业务完成。
- 数据、权限、任务状态、Prompt和运行时合同没有旁路。
- 定向测试/typecheck/build按风险通过；未做的浏览器、真实模型、包装或迁移验证明确记录。
- 用户可见UI完成用户验收，或状态停在`User Acceptance`。
- 稳定知识进入Wiki；用户可见变化进入发布记录；纯内部变化明确跳过发布说明。
- Git差异只包含本Story/阶段范围，阶段提交主题符合`新增/优化/修复`格式。
- feature尚未进入beta时只标“Story Done”，不能标“Release Done”。

## Review、Retrospective 与指标

### Sprint Review

- 按Sprint Goal演示可观察结果，不按文件列表汇报。
- 逐Story核验AC和证据；未通过的回Backlog。
- 更新Roadmap风险、Release gate和下一步，不在Review现场静默追加范围。

### Retrospective

每个Sprint结束必须记录：

- 完成点数、结转点数和阻断原因。
- 返工来源：合同不清、代码认知错误、依赖冲突、测试不足或范围扩张。
- 哪一条流程需要保留、停止或调整。
- 最多选择1～2个可执行流程改进进入下一Sprint。

### 指标

使用指标改善预测，不考核Agent“产量”：

- Sprint Goal达成率、承诺/完成点数、Story周期和返工率。
- 逃逸缺陷、数据/权限回归、重复模型调用和恢复重复执行。
- 用户完成第一本书、连续章节成功、人工决定次数和恢复成功。

禁止用代码行数、提交数、工具调用数或模型Token作为个人绩效指标。

## Hotfix

生产Hotfix可跳过常规Sprint排期，但不能跳过：问题复现、最小Story、回归验收、发布记录、阶段提交、main修复后同步beta。涉及数据破坏仍需备份和明确授权。

## 常见失败模式

- **先实现后补Story**：导致接口和范围由代码偶然决定。应退回Refinement。
- **一张卡跨UI、Runtime、Schema和迁移**：超过5点且无法独立验收，必须拆卡。
- **多人同时改共享schema/registry/router**：根集成人单owner接线。
- **typecheck通过即Done**：补行为、失败和恢复证据。
- **Sprint中不断插入“顺便修复”**：登记Backlog；只有Release阻断或安全缺陷由PO明确换入。
- **文档写了就声称可用**：计划、实现、用户验收和beta集成分别标状态。

## 来源文档

- [项目Release Roadmap](../../plans/project-release-roadmap.md)
- [作者协作交互与AI能力Sprint](../../plans/agent-collaboration-sprints.md)
- [MySQL中央主库存储计划](../../plans/mysql-primary-storage-sprints.md)
- 根目录 `AGENTS.md`、`TASK.md`
