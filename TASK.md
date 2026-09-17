# 当前项目看板：Release 1 单机成书版

更新时间：2026-09-18
当前分支：`codex/r1-s1-config-safety`
当前里程碑：Release 1（单机成书版）
当前状态：R1-S2A 已完成；下一窗口待 Sprint Planning

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

## 已完成 Sprint：R1-S0

### Sprint Goal

以最新`main`为事实重新核对既有Story，冻结单机运行和数据边界，建立第一本书长链验收基线，并只承诺一个满足DoR的首轮实现窗口。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 结果 |
| --- | --- | --- | --- | --- |
| R1-00 上游实现与计划重对账 | 3 | Done | 根集成人 | [69张独立候选卡已按 v0.4.25 证据对账](./docs/plans/r1-00-implementation-reconciliation.md) |
| R1-01 单机运行与数据边界冻结 | 3 | Done | 根集成人 | [本机监听与本地数据边界已冻结并通过配置测试](./docs/plans/r1-01-local-runtime-data-boundary.md) |
| R1-02 第一本书与十章连续创作基线 | 5 | Done | R1-02 验收owner | [临时 SQLite 十章、恢复、质量债与 TXT 基线已通过](./docs/plans/r1-02-first-book-ten-chapter-baseline.md) |
| R1-03 Release 1验证矩阵 | 3 | Done | R1-03 验证owner | [平台、迁移、主链、包装与发布触发门已形成可执行矩阵](./docs/plans/r1-03-release-verification-matrix.md) |
| R1-04 首个实施Sprint承诺 | 2 | Done | PO/根集成人 | [15点、无Stretch的 R1-S1 已冻结](./docs/plans/r1-s1-sprint-commitment.md) |

承诺容量：16点。Stretch：无。

### R1-S0 Review

- 最新源码与所有Release 1候选Story完成证据对账。
- R1默认仅回环访问、SQLite本地事实源和零隐式上传成为稳定合同。
- 第一本书/十章长链fixture和平台验证矩阵可执行。
- 首个实施Sprint不超过25点，所有承诺卡满足DoR。
- Review与 Retrospective 见 [R1-S1 Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)；承诺/完成 `16/16` 点，无 carryover。

## 已完成 Sprint：R1-S1

### Sprint Goal

先解除 SQLite 升级阻断，再让作者获得可恢复的简易阅读现场和跨世界零误写；同时冻结诊断共享门与世界维护恢复合同。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 依赖 / 结果 |
| --- | ---: | --- | --- | --- |
| R1-MIG01 视觉资产双迁移历史兼容 | 5 | Done | 根数据集成人 | [空库、双历史、部分 schema 与 pending record 已通过](./docs/plans/r1-mig01-visual-asset-migration-compatibility.md) |
| S1-00 诊断共享接线与存储契约门 | 2 | Done | 根集成人 | [DTO、存储/CAS/迁移方案与兼容矩阵已冻结](./docs/plans/s1-00-diagnostics-contract.md) |
| S1-04 简易书架阅读现场恢复 | 3 | Done | 阅读体验 Agent | [代码级检查与隔离环境 Computer Use 五项交互验收均通过](./docs/plans/s1-04-simple-shelf-reading-resume.md) |
| S1-05 世界问题归属校验 | 2 | Done | 世界安全 Agent | [跨世界与不存在请求均零行写入](./docs/plans/s1-05-world-issue-ownership.md) |
| S1-06 世界维护与恢复契约 Spike | 3 | Done | 世界契约 Agent | [Runtime / Prompt / UI 合同已签认，不代表生产能力已实现](./docs/plans/s1-06-world-maintenance-recovery-contract.md) |

承诺容量：15 点。Stretch：无。权威合同见 [R1-S1 Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)。

当前 Release 静态门：`PASS=9 / BLOCKED=2 / REVIEW=1`；迁移历史共存已由行为测试保护，剩余静态阻断为公开发布触发和 macOS 工作流。

S1-05 聚焦证据：server build 通过，世界问题归属行为测试 6/6；S1-06 依赖已解除。

S1-00 聚焦证据：shared build、诊断合同测试 3/3、client typecheck 通过；S1-02a 已具备后续 Sprint 的 Ready 合同，S1-02b/03 仍等待实现依赖，三者均未进入本 Sprint。

S1-04 聚焦证据：阅读状态行为测试 8/8、简易创作治理回归 5/5、client typecheck 通过；隔离 SQLite 下的刷新、普通重进、跨作品隔离、浏览器前进/后退和暂停态阅读均通过 Computer Use 验收，浏览器无告警或错误。

S1-06 聚焦证据：世界维护门面、五类 revision、CAS/幂等、lease 恢复、旧数据、Prompt 与来源页边界完成三方签认；S3-01 仍受静态 Prompt 版本登记漂移阻断，未被误标 Ready。

R1-S1 Review 与 Retrospective 见 [Sprint 承诺](./docs/plans/r1-s1-sprint-commitment.md)：Sprint Goal 达成，承诺/完成 `15/15` 点，无 carryover；S1-04 五项 UI 验收通过，后续 UI 数值证据先锁定真实滚动容器。

## 已完成 Sprint：R1-S2A

### Sprint Goal

作者查看 AI 状态时不会产生模型调用，未配置参数采用可靠默认值；进入单书工作台后以正文为中心，切书、恢复和导演状态不会串书或误恢复。

### 承诺 Backlog

| Story | 点数 | 状态 | Owner | 依赖 / 结果 |
| --- | ---: | --- | --- | --- |
| S1-01 缺省数值配置正确生效 | 3 | Done | 配置 Agent | [默认值、合法低值与零副作用 7 项行为检查通过](./docs/plans/s1-01-numeric-settings-defaults.md) |
| S1-02a 诊断读取、显式探测与持久化 | 3 | Done | 诊断 Agent + 根集成人 | [被动读取、显式探测、跨重启持久化与双库增量迁移通过](./docs/plans/s1-02a-diagnostic-readiness-backend.md) |
| S2-01a 单书查询与导演编排归属 | 5 | Done | 单书总控 Agent | [作品身份、暂停保持与零自动命令 36 项检查通过](./docs/plans/s2-01a-single-book-application-facade.md) |
| S2-02 专业章节辅助区域按需展开 | 3 | Done | 章节编辑 Agent + 根集成人 | [正文优先、按需模型调用、状态保持与隔离 Computer Use 验收通过](./docs/plans/s2-02-professional-chapter-assist-panels.md) |

承诺容量：14 点。Stretch：无。权威合同见 [R1-S2A Sprint 承诺](./docs/plans/r1-s2a-sprint-commitment.md)。

未承诺：S1-02b/03、S2-01b、S2-03a/03b、S2-04a/04b/04c。Ready 的 S2-04a 因容量顺延，其他卡保持依赖状态；本 Sprint 未在实现中顺手带入。

完成 `14/14` 点，无 Story carryover。Sprint Goal 部分达成：可靠默认值、单书状态隔离、正文优先和诊断后端均完成，知识库旧状态读取已被动化；模型设置页仍会自动调用旧 POST，须由下一窗口的 S1-02b 切换到被动 GET 后，才能宣称“查看 AI 状态零模型调用”在 UI 全面达成。

Review 与 Retrospective 见 [R1-S2A Sprint 承诺](./docs/plans/r1-s2a-sprint-commitment.md)。S2-02 已完成 Computer Use 验收；S1-02a 的 shared/server 构建与 32 项聚焦检查通过，测试数据库全部位于 `/tmp` 隔离目录。

## Release 1 后续队列

1. R1-S1：配置、诊断、阅读恢复和世界归属安全（已完成，15/15 点）。
2. R1-S2：R1-S2A 可信单书现场已结束（14/14 点，Goal 部分达成）→ 下一窗口优先完成诊断 UI 消费、建议应用、单书装配和模型来源窗口。
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

## R1-S0 完成证据

- R1-00 对账结果：69张独立候选卡中 `Done 0 / Partial 23 / Ready 6 / Not Ready 40`；另有不重复计点的 `S1-X` 已由 `S2-02` 接管。
- 已识别发布阻断：当前分支与 v0.4.25 存在重叠的视觉资产迁移历史；空库全迁移和新增部分迁移 fixture 均失败，须在 R1-03 验证矩阵和后续明确 Story 中处理。
- R1-01 已强制服务端、Vite 和桌面入口只使用回环地址；LAN、wildcard、私网主机和非回环 CORS 配置会在迁移及后台恢复前失败。
- R1-02 的确定性长链在隔离临时 SQLite 中完成十章，验证一次人工恢复、前五章正文哈希不变、第八章质量债继续、显式世界/人物编辑和 TXT 顺序完整；公共 idea→导演交接、真实模型和 UI 仍不在该证据范围内。
- R1-03 静态审计为 `PASS=8 / BLOCKED=3 / REVIEW=1`；当前硬阻断是重叠 SQLite 迁移、非标准 tag/手动触发可公开发布、公开工作流无 macOS job，另须冻结 macOS x64 是否进入支持范围。
- R1-04 已冻结 15 点 R1-S1；新增 R1-MIG01 独立承接迁移阻断，四张既有 Ready 卡进入明确波次，未满足依赖的诊断生产卡未被提前承诺。
