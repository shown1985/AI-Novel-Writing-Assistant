# 当前项目看板：Release 1 单机成书版

更新时间：2026-09-16
当前分支：`codex/agent-collaboration-plan`
当前里程碑：Release 1（单机成书版）
当前状态：R1-S0 路线重整与Backlog refinement

## 权威文档

- 发布路线：[项目Roadmap](./docs/plans/project-release-roadmap.md)
- 敏捷规则：[Agent敏捷开发与交付规范](./docs/wiki/workflows/agent-agile-delivery.md)
- Release 1详细Backlog：[作者协作交互与AI能力Sprint](./docs/plans/agent-collaboration-sprints.md)
- Release 2数据底座：[MySQL中央主库存储计划](./docs/plans/mysql-primary-storage-sprints.md)
- Release 2认证：[本地首次管理员、MFA与账号权限](./docs/plans/local-auth-bootstrap-sprints.md)
- Release 2多人能力：[真人多人协作](./docs/plans/human-collaboration-sprints.md)

## 发布顺序

| 顺序 | 里程碑 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | Release 1：单机成书版 | Active | SQLite、本机回环、无需账号；优先完成整本创作、恢复和桌面发布 |
| 2 | Release 2：MySQL与多人协作版 | Backlog | MySQL中央主库、Owner+MFA、账号权限、工作区和多人协作 |

Release 2只允许做不抢占R1产能的只读Spike/Refinement。账号、LAN登录、MySQL迁移和协作入口不得以半成品进入Release 1。

## 当前 Sprint：R1-S0

### Sprint Goal

以最新`main`为事实重新核对既有Story，冻结单机运行和数据边界，建立第一本书长链验收基线，并只承诺一个满足DoR的首轮实现窗口。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 结果 |
| --- | --- | --- | --- | --- |
| R1-00 上游实现与计划重对账 | 3 | Ready | 根集成人 | 每张候选卡有证据状态，不重复开发 |
| R1-01 单机运行与数据边界冻结 | 3 | Ready | Runtime审计owner | loopback/SQLite/文件/Qdrant边界明确 |
| R1-02 第一本书与十章连续创作基线 | 5 | Ready | 验收owner | 固定成功、失败和恢复fixture |
| R1-03 Release 1验证矩阵 | 3 | Ready | 桌面/验证owner | 平台、升级、主链和包装门明确 |
| R1-04 首个实施Sprint承诺 | 2 | 待R1-00～03 | PO/根集成人 | ≤25点、owner和依赖冻结 |

承诺容量：16点。Stretch：无。

### R1-S0 退出门

- 最新源码与所有Release 1候选Story完成证据对账。
- R1默认仅回环访问、SQLite本地事实源和零隐式上传成为稳定合同。
- 第一本书/十章长链fixture和平台验证矩阵可执行。
- 首个实施Sprint不超过25点，所有承诺卡满足DoR。
- Review与Retrospective完成，文档阶段提交，工作区干净。

## Release 1 后续队列

1. R1-S1：配置、诊断、阅读恢复和世界归属安全。
2. R1-S2：单书工作台、正文优先和模型来源。
3. R1-S3～4：可信世界、提案采用和失败复核。
4. R1-S5～6：本机Agent委托、预算、记忆和资产。
5. R1-S7：十章长链、有限撤回和导航收束。
6. R1-RC：桌面升级、备份恢复、包装与用户验收。

## 强制敏捷门

- 没有Story ID、用户价值、AC、非范围和验证方式，不开始开发。
- 未满足DoR的卡不进入Sprint；单张实现卡超过5点必须拆分。
- 一个Agent同时最多一张In Progress Story；共享文件单owner。
- Sprint中新增范围先进入Backlog，由PO明确换入/换出，不能“顺手做”。
- 通过DoD只代表Story完成；beta组合验证和Release gate通过后才代表可发布。
- 每个完成阶段必须提交；提交前检查Wiki与用户可见发布记录。
