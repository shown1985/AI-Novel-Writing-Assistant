# R1-S2E：来源页动作、世界 Prompt 与重试可靠性 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2E；1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：让作者在单书来源现场安全执行唯一推荐动作，同时清理世界 Prompt 的能力边界，并恢复结构化模型调用对瞬态传输失败的既有重试保障。
- 开发基线：`codex/r1-s2e-actions-world-prompts-retry@c5ce7f7b`；R1-S2D 已完成 `9/9` 点。
- 承诺容量：8 点；Stretch：无。
- 容量依据：最近五个窗口完成 15、14、9、8、9 点。本窗口包含一张 UI/命令接线卡、一张 Prompt 架构卡和一张定向可靠性修复；保持 8 点为 UI 验收和兼容回归留出空间。
- 产品边界：只做 S2-03b、S3-01、R1-PROMPT01；不接 attempt recorder、不增加调用历史 API/UI、不开始 S2-04b3/04b4/04c、不实现世界维护 Runtime、schema 或迁移。

## 承诺 Backlog

| Story | 点数 | 状态 | Owner / 文件域 | 依赖 | 验收边界 |
| --- | ---: | --- | --- | --- | --- |
| R1-PROMPT01 结构化调用瞬态传输失败重试 | 2 | Done | Prompt 平台 owner；`structuredOutput.ts` 与 `structuredInvoke.test.js` | 既有失败基线已复现 | [分类、retry/空响应/取消回归通过](./r1-prompt01-structured-transport-retry.md)；不改 retry/fallback 策略 |
| S2-03b 来源现场推荐动作与反馈接线 | 3 | Done | 单书交互 owner；单书 desktop/mobile 展示消费点与 `useWorkspaceDirectorCommands` | S2-03a、S2-01b Done | [41 项定向检查与隔离环境 Computer Use 通过](./s2-03b-source-action-feedback.md)；运行记录保持只读 |
| S3-01 世界 Prompt 维护能力边界 | 3 | Done | 世界 Prompt owner；`prompting/prompts/world/` | S1-06、S3-00 Done | 14 个资产逐字等价迁移；兼容门面、Registry loader、模型选择与 schema 合同通过 |

三张卡均有稳定 ID、Release、用户价值、范围/非范围、依赖、AC、owner 与最窄验证。`S2-04b3` 的 `R1-PROMPT01` 基线阻断已解除并回到 Ready，但本 Sprint 仍不顺手接线，只能进入下一次 Planning。

## 波次与 ownership

```text
Wave 1（互不重叠）
  Prompt 平台 owner：R1-PROMPT01
  单书交互 owner：S2-03b
  世界 Prompt owner：S3-01

Wave 2
  根集成人：共享接线审查、窄验证、Wiki/发布判断、逐阶段提交
```

- `server/src/prompting/registry/`、共享类型/API、根计划、README/Release Notes 由根集成人单 owner。
- 当前完成 `8/8` 点：R1-PROMPT01、S2-03b 与 S3-01 均 Done；Sprint Goal 达成。
- S3-01 不修改 `worldDraft.prompts.ts`，不新增业务 Prompt，不改变资产 id/version/schema。
- S2-03b 只消费 S2-03a 已验证的唯一动作，禁止在展示层另建动作分支表；现有来源页命令是唯一执行路径。
- 子 Agent 额度不可用时由根集成人串行推进，不降低 AC，也不把失败委托计为进展。

## 未承诺与退出门

- S2-04b3：transport retry 基线已重新确认并回到 Ready；保持未承诺，等待后续 Sprint Planning。
- S2-04b4 / 04c：继续等待 04b3 与读投影，不提前做 UI mock。
- S3-02a/b 及后续世界 Runtime：不因 S3-01 提前完成而换入。
- R1-S2E 退出需记录 Goal、`8/8` 或实际完成点数、S2-03b Computer Use 状态、Prompt 资产映射与兼容证据、retry 分类矩阵、carryover、逸出缺陷、Wiki/发布判断和最多两项流程改进。

## Sprint Review

- Sprint Goal 达成：作者可以在单书来源现场安全执行唯一书级推荐动作；世界 Prompt 资产进入明确能力模块；结构化调用恢复瞬态传输失败重试。
- 承诺/完成：`8/8` 点；三张承诺 Story 全部 Done；carryover 0；未带入 Stretch。
- R1-PROMPT01：瞬态 transport retry、空响应、取消与策略不变回归通过。
- S3-01：14 个 Prompt 资产逐字等价迁移，33 行兼容门面、Registry loader 与消费合同通过；全量治理门只保留既有 ComicFactService 内联 Prompt 债。
- S2-03b：client typecheck 与 41/41 定向行为检查通过；桌面和 400×800 Computer Use 证明同一动作解释、一次真实 POST、原位提交反馈、正式投影回读和可恢复失败语义。
- UI 验收：S2-03b PASS；R1-PROMPT01 与 S3-01 为内部可靠性/架构卡，不适用生产 UI 验收。
- 逸出缺陷：0。验收中确认 HTTP 202 只代表命令接收，后台失败后页面会读取正式恢复状态；该语义已写入 Wiki。

## Sprint Retrospective

- 保留：对任务动作卡使用隔离数据库和真实来源页 POST，把纯策略测试与 Computer Use 证据合并，既验证请求次数，也避免写用户数据或调用真实模型。
- 改进：后续 UI Story 在实现前先冻结“HTTP 接收成功”和“业务执行完成”的不同反馈文案，并为测试服务提供显式禁用后台 worker 的隔离开关，减少夹具验收噪声。
