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
| R1-PROMPT01 结构化调用瞬态传输失败重试 | 2 | Ready | Prompt 平台 owner；`structuredOutput.ts` 与 `structuredInvoke.test.js` | 既有失败基线已复现 | [分类与重试合同](./r1-prompt01-structured-transport-retry.md)；不改 retry/fallback 策略 |
| S2-03b 来源现场推荐动作与反馈接线 | 3 | Ready | 单书交互 owner；单书 desktop/mobile 展示消费点与 `useWorkspaceDirectorCommands` | S2-03a、S2-01b Done | 同 taskId、pending 防重、失败/刷新/跨书、来源页动作；运行记录保持只读 |
| S3-01 世界 Prompt 维护能力边界 | 3 | Ready | 世界 Prompt owner；`prompting/prompts/world/` | S1-06、S3-00 Done | 14 个既有资产按责任拆分、旧门面兼容、Registry 元数据等价；无业务语义变化 |

三张卡均有稳定 ID、Release、用户价值、范围/非范围、依赖、AC、owner 与最窄验证。`S2-04b3` 因 `R1-PROMPT01` 基线失败暂回 Not Ready；本 Sprint 修复完成后也只进入下一次 Planning，不顺手接线。

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
- S3-01 不修改 `worldDraft.prompts.ts`，不新增业务 Prompt，不改变资产 id/version/schema。
- S2-03b 只消费 S2-03a 已验证的唯一动作，禁止在展示层另建动作分支表；现有来源页命令是唯一执行路径。
- 子 Agent 额度不可用时由根集成人串行推进，不降低 AC，也不把失败委托计为进展。

## 未承诺与退出门

- S2-04b3：等待 R1-PROMPT01 Done 后重新确认 transport retry 基线，再进入后续 Sprint Planning。
- S2-04b4 / 04c：继续等待 04b3 与读投影，不提前做 UI mock。
- S3-02a/b 及后续世界 Runtime：不因 S3-01 提前完成而换入。
- R1-S2E 退出需记录 Goal、`8/8` 或实际完成点数、S2-03b Computer Use 状态、Prompt 资产映射与兼容证据、retry 分类矩阵、carryover、逸出缺陷、Wiki/发布判断和最多两项流程改进。
