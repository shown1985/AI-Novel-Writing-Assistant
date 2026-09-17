# 当前项目看板：Release 1 单机成书版

更新时间：2026-09-17
当前分支：`codex/r1-s0-release-readiness`
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
| R1-00 上游实现与计划重对账 | 3 | Done | 根集成人 | [69张独立候选卡已按 v0.4.25 证据对账](./docs/plans/r1-00-implementation-reconciliation.md) |
| R1-01 单机运行与数据边界冻结 | 3 | Done | 根集成人 | [本机监听与本地数据边界已冻结并通过配置测试](./docs/plans/r1-01-local-runtime-data-boundary.md) |
| R1-02 第一本书与十章连续创作基线 | 5 | Done | R1-02 验收owner | [临时 SQLite 十章、恢复、质量债与 TXT 基线已通过](./docs/plans/r1-02-first-book-ten-chapter-baseline.md) |
| R1-03 Release 1验证矩阵 | 3 | Done | R1-03 验证owner | [平台、迁移、主链、包装与发布触发门已形成可执行矩阵](./docs/plans/r1-03-release-verification-matrix.md) |
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

## R1-S0 当前证据

- R1-00 对账结果：69张独立候选卡中 `Done 0 / Partial 23 / Ready 6 / Not Ready 40`；另有不重复计点的 `S1-X` 已由 `S2-02` 接管。
- 已识别发布阻断：当前分支与 v0.4.25 存在重叠的视觉资产迁移历史；空库全迁移和新增部分迁移 fixture 均失败，须在 R1-03 验证矩阵和后续明确 Story 中处理。
- R1-01 已强制服务端、Vite 和桌面入口只使用回环地址；LAN、wildcard、私网主机和非回环 CORS 配置会在迁移及后台恢复前失败。
- R1-02 的确定性长链在隔离临时 SQLite 中完成十章，验证一次人工恢复、前五章正文哈希不变、第八章质量债继续、显式世界/人物编辑和 TXT 顺序完整；公共 idea→导演交接、真实模型和 UI 仍不在该证据范围内。
- R1-03 静态审计为 `PASS=8 / BLOCKED=3 / REVIEW=1`；当前硬阻断是重叠 SQLite 迁移、非标准 tag/手动触发可公开发布、公开工作流无 macOS job，另须冻结 macOS x64 是否进入支持范围。
- R1-04 已解锁，由根集成人冻结首个实施 Sprint 的 Goal、容量、依赖和 ownership。
