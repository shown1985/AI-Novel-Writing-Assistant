# R1-S2D：单书展示与调用证据底座 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2D；1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：让单书页面先形成可信、可测试的成果/进度/唯一推荐动作展示模型，同时建立真实模型 attempt 的双库持久底座并拆清 Prompt 执行边界，为下一窗口的来源页动作和 transport 接线解除实现依赖。
- 开发基线：`codex/r1-s2d-evidence-foundations@63762d9f`；R1-S2C 已完成 `8/8` 点。
- 承诺容量：9 点；Stretch：无。
- 容量依据：最近四个窗口完成 15、14、9、8 点。三张卡均为 Ready 且互不依赖，但分别涉及单书 presentation、双库 schema/migration 和超长核心文件等价拆分；保持 9 点，给迁移兼容与回归留出验证空间。
- 产品边界：只做 S2-03a、S2-04b1、S2-04b2；不绑定来源页写动作、不接真实 attempt recorder、不增加公开调用历史 API/UI、不开始 04b3/04b4/04c、不改变重试/备用/repair/semantic 策略、不带入 S3-01 或 Release 2。

## 承诺 Backlog

| Story | 点数 | 当前状态 | Owner / 文件域 | 依赖 | 交付结果 |
| --- | ---: | --- | --- | --- | --- |
| S2-03a 单书成果、进度与推荐动作展示模型 | 3 | Ready | 单书 Presentation owner；`client/src/pages/novels/workspace/presentation/` 及经授权的既有单书展示消费点 | S2-01a/b、S2-03a0 Done | 三层进度、结构化严重度、freshness 和至多一个 verified primaryAction 的纯 ViewModel；不执行命令 |
| S2-04b1 通用 attempt store 与 repository | 3 | Ready | 根数据集成人独占两套 Prisma schema/migration；模型平台 repository 位于 `server/src/platform/llm/provenance/attempts/` | S2-04a、S2-04b0 Done | 双库增量表、幂等 start/finalize、唯一 adopted、重建读取、脱敏与隔离持久化证据 |
| S2-04b2 Prompt execution 边界拆分 | 3 | Ready | Prompt 平台 owner 独占 `promptRunner.ts` 与拟建 `prompting/core/execution/` | S2-04b0 Done | facade/import/运行行为等价，text/structured execution 有明确归属，`promptRunner.ts` 回到 1300 行以下 |

三张卡均满足稳定 ID、用户价值、范围/非范围、依赖、AC、owner 和最窄验证。`S2-03b`、`S2-04b3` 虽可在本 Sprint 完成后转 Ready，但不是本窗口承诺，也不能因前置卡提前结束而顺手实施。

## Story 验收门

### S2-03a

- 输入只采用 [S2-03a0 合同](./s2-03a-single-book-display-authority-contract.md) 的当前小说持久章节、有效整书目标、同任务 runtime/fact、书级投影和 freshness；`workspaceTaskId` 永不进入导演身份。
- 每个状态至多一个 action，且只能是同 `novelId`、同 `directorTaskId`、所有动作依据 fresh 的 `bookAutomationProjection.primaryAction`。展示转换不读取 label/自由文案判定语义，不调用命令。
- 明确 replan、pendingManualRecovery、quality-first 人工暂停优先；局部 `defer_and_continue` 仍是可继续质量债。stale/error 保留同书已保存成果但输出零动作。
- table-driven 行为测试覆盖合同十种完整情形、跨书/跨任务污染、目标未知、局部成功不等于整书完成、多动作源冲突；运行 client typecheck。生产 UI 消费点只接只读 ViewModel，本卡不声明点击动作已联通。

### S2-04b1

- PostgreSQL 与 SQLite 同步增加独立通用 attempt 表及增量 migration，不修改/回填导演 Token 表，不创建 Cascade 删除，不执行 reset、drop、truncate 或用户库写测试。
- repository 在事务边界保证 `(requestId, attemptIndex)` 唯一和单 request 至多一个 adopted；start/finalize 相同 payload 幂等，冲突 terminal 不改写，崩溃 started 行保留。
- usage=null 仍保存；持久字段不含 API key、Base URL、auth/header、Prompt/上下文/正文、模型输出、reasoning 或 provider 错误 body。
- 在临时 SQLite 与可用的 PostgreSQL 隔离环境验证增量迁移、重启重建、并发 adopted、两个 novel 隔离和 legacy unknown；若 PostgreSQL 环境不可用，明确记录未通过的发布门，不以 SQLite 结果冒充双库完成。

### S2-04b2

- 拆分前列清 `promptRunner.ts` 的 context/准备、text invoke/stream、structured parse/postValidate/semantic retry、live/usage 协调与 facade exports；按责任提取到 `prompting/core/execution/`，不建 generic utils/helper。
- 所有既有 public exports 和调用 import 保持；不新增 attempt store 引用，不修改模型选择、budget、retry/fallback、repair/semantic、live 或 usage 语义。
- `promptRunner.ts` 必须低于 1300 行，目标 1000～1200；新增文件各自保持责任内聚并经 execution facade 消费，外部不深导入内部实现。
- server build 与 Prompt/structured invoke/live/semantic retry 相关回归通过；若同一最终源码已有覆盖，不重复昂贵全套测试，但须记录可复用证据。

## 波次与集成 ownership

```text
Wave 1（文件域互不重叠，可并行）
  单书 Presentation owner：S2-03a
  根数据/模型平台 owner：S2-04b1
  Prompt 平台 owner：S2-04b2

Wave 2
  根集成人：逐卡审阅、窄验证、Wiki/发布判断、独立阶段提交
```

- 一个 Agent 同时最多一张 In Progress Story；Agent 不切分支、不提交、不修改 `TASK.md`、Roadmap、README/Release Notes 或其他 owner 文件。
- Prisma schema/migration、共享 DTO/API/HTTP、根计划与 Wiki 由根集成人单一 ownership。04b1 与 04b2 不共享生产文件；04b2 不导入 04b1 repository。
- 当前协作 Agent 运行受外部用量上限影响时，由根集成人串行推进，不降低 AC、不把未执行委托计为进展。
- 本窗口不 push、tag、晋级 beta/main、发布桌面包或操作用户数据库。

## 未承诺与退出门

- S2-03b：等待 S2-03a Done 与既有命令清单冻结；下一 Planning 再决定是否承诺。
- S2-04b3：等待 S2-04b1 与 04b2 Done；不得在本 Sprint 把 recorder hook 顺手接进真实 transport。
- S2-04b4 / 04c：继续依赖 04b3 和读 DTO；不提前做 UI mock 冒充实际来源。
- S3-01：Ready 但按 Release 顺序留在后续窗口，不与本轮 Prompt Runner 拆分并写。

Sprint 退出时记录 Goal、`9/9` 或实际完成点数、carryover、迁移双库结果、`promptRunner` 行数与等价证据、S2-03a UI 消费/验收边界、文档/发布判断、逸出缺陷和最多两项流程改进。
