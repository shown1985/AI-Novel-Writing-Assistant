# 独立发行版 Agent 规则

本文件是 Biz Novel Studio Next 发行版的专属规则。根 `AGENTS.md` 保持上游版本；两者冲突时以本文件为准，其余情况仍遵守根 `AGENTS.md`（数据保护、AI-first、质量门、运行记录只读、UI 文案、Prompt 治理、发布说明等）。

## 定位与文档归属

- 本仓库（remote `fork`）是长期独立发行版，定期合入上游（remote `origin`）。不向上游提 PR，除非 Owner 重新决定。
- 发行版自有的路线、看板、待办、历史和流程只写在 `docs/fork/`。`TASK.md`、`AGENTS.md`、`docs/README.md` 与上游 `docs/plans/` 保持上游版本；`AGENTS.md` 只额外保留一行指向本文件。
- 稳定的设计规则写 `docs/wiki/`；尽量新建发行版专属页面，少改上游已有页面，以减少同步冲突。
- 当前看板是 [board.md](./board.md)，替代根 `TASK.md` 的看板职责。

## 上游同步

- 在从 `beta` 切出的短期分支（如 `codex/r1-sync-upstream-*`）上执行 `git merge origin/main --no-ff`，验证后合入 `beta`。只 merge，禁止 rebase、force 或改写已发布提交。
- 桌面身份与发布字段一律保留本发行版的值：`desktop/package.json` 的 version/productName，builder 的 appId/productName 与发布 owner/repo，`app-update.yml` 的 owner/repo，更新缓存与数据目录名，发布脚本默认 remote `fork`，beta workflow 只验证不上传。
- 合并后逐项比对 `desktop/package.json` 的 `version` 与合并前相同；`r1-03-static-gate-audit.cjs --strict` 中 `FORK-VERSION-LINE` 不为 `BLOCKED`，`FORK-PUBLISH-TARGET` 为 `PASS`。
- 迁移顺序检查：不重命名上游迁移；上游迁移时间戳早于本地已有迁移时，用临时 SQLite 验证“全新库”和“先本地 beta 再合并”两条路径，最终结构一致；PostgreSQL 至少做静态审查。只用临时库，不碰用户库。
- 发布说明按日期合并两侧历史；Prompt 版本以资产源文件为准；测试冲突保留两侧用例。
- 详细步骤与失败模式见 [上游同步流程](../wiki/workflows/upstream-sync.md)。

## 发行版发布规则

以下规则在根 `AGENTS.md` 的 Desktop Packaging Upload Rules 基础上收紧：

- 只发布到本发行版仓库 `shown1985/AI-Novel-Writing-Assistant`（remote `fork`）；永不向上游推 tag 或触发上游发布。只推单个 `vX.Y.Z`，禁止 `git push --tags`。
- `desktop/package.json` 的 major 必须 ≥ 1，公开 tag 严格为 `vX.Y.Z` 且等于包版本。
- 公开 tag 只从 Release 1 GA 的 `v1.0.0` 开始；GA 前不打任何公开 tag，也不产生预发布。tag 与本地、`fork` 或上游同名时停止，由 PO 跳号。
- 身份与数据目录取值见 [roadmap.md](./roadmap.md#桌面身份与版本线r1-g02)；旧数据只能在用户确认并完成备份后复制，不得移动或改写旧目录。

## 分级流程

优先级来自真实端到端试跑，而不是预先写好的 Story 列车。按改动风险分两级：

| 级别 | 适用范围 | 流程 |
| --- | --- | --- |
| 完整流程 | 数据/迁移、发布/打包、运行时或 Prompt 合同（运行时状态、任务恢复、结构化输出 schema、Prompt Registry、共享类型） | DoR → 实现 → 独立 QA → 合并 → 简短 Review |
| 普通流程 | 普通缺陷、体验问题、试跑中发现的问题、文案与局部 UI | 实现 → 一次评审 → 合并；不写 Sprint 或 Story 合同 |

完整流程要求：

- DoR：写明用户价值、范围与非范围、依赖、验收条件、文件边界和最窄验证；未满足时只能 Refinement 或限时 Spike。
- 单张实现卡不超过 5 点；更大的工作拆成可独立验收的纵向切片。
- 共享 schema、迁移、Registry、共享类型、路由挂载只有一个集成 owner，其他人提交修改请求。
- 独立 QA 负责验收条件、失败/重试/并发/恢复证据；typecheck 或 build 通过不算完成。
- 合并后在 [history.md](./history.md) 追加一行：目标、点数、结果、返工。

两级共同要求：

- 每个改动一个范围明确的阶段提交，主题用 `新增：`/`优化：`/`修复：`；按根 `AGENTS.md` 判断是否更新发布说明与 Wiki。
- 用户可见 UI 明确写出验收状态：已由用户验收，或留给用户验收。
- 实现中发现的相邻问题记入 [backlog.md](./backlog.md)，不顺手扩大范围。
- 数据保护规则不因流程分级放宽：任何破坏性操作仍需备份与 Owner 明确批准。

## 多 Agent 协作

- 主线程负责协调、派发和最终评审，不直接承担大块实现；子 Agent 负责实现。
- 派发给子 Agent 的提示要自包含：确切范围、可改文件、验证命令、简短报告格式。按任务复杂度选择模型与推理强度。
- 每个 Agent 同一时间只做一件事；多个 Agent 不同时改同一文件或共享契约。
- 只有完整流程的改动需要独立 QA Agent；普通流程由主线程做一次评审即可。
- 子 Agent 不切分支、不合并、不提交、不迁移用户库、不晋级 beta/main，除非主线程针对该动作明确授权。
- 琐碎的一行 git 操作由主线程直接完成，不为此派发子 Agent。
