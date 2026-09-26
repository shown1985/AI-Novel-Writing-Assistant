# 独立发行版文档：Biz Novel Studio Next

## 定位

本仓库（remote `fork`，`shown1985/AI-Novel-Writing-Assistant`）是上游项目（remote `origin`，ExplosiveCoderflome）的长期独立发行版，关系类似 Roo Code 之于 Cline：

- 持续吸收上游的模型兼容、稳定性修复和新功能，但产品路线、发布节奏和桌面身份独立。
- 桌面产品名 `Biz Novel Studio Next`（GA 前仍可更名），独立版本线从 major 1 起步。
- 目前不向上游提交 PR；如需回馈，由 Owner 另行决定。

## 文档分工

为了让每次上游同步尽量少冲突，本发行版自有的规划与流程文档只放在 `docs/fork/`；`TASK.md`、`AGENTS.md`（除一行指针）、`docs/README.md` 和上游 `docs/plans/` 保持上游版本。

| 文件 | 内容 |
| --- | --- |
| [board.md](./board.md) | 当前看板：现阶段在做什么、下一步是什么 |
| [roadmap.md](./roadmap.md) | Release 1/2 目标与范围、平台决定、桌面身份决定 |
| [backlog.md](./backlog.md) | 所有未完成事项，一行一项 |
| [history.md](./history.md) | 已完成 Sprint R1-S0～R1-S3L 与经验 |
| [AGENTS-fork.md](./AGENTS-fork.md) | 本发行版专属的 Agent 规则，与根 `AGENTS.md` 冲突时以它为准 |

稳定的设计规则仍写入 `docs/wiki/`；本目录只记录路线、待办和流程。原有的逐卡 Story 合同与 Sprint 承诺已汇总进本目录并从仓库删除，原文可在 Git 历史中查阅（删除前最后一个提交为 `af803b36`）。

## 上游同步

同步流程、冲突处理、必须保留的发行版字段和迁移顺序检查见 [上游同步流程](../wiki/workflows/upstream-sync.md)。
