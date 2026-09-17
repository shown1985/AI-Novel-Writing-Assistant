# R1-S2A：可信单书现场 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2A；R1-S2 的首个 1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：作者查看 AI 状态时不会产生模型调用，未配置参数采用可靠默认值；进入单书工作台后以正文为中心，切书、恢复和导演状态不会串书或误恢复。
- 开发基线：`codex/r1-s1-config-safety@8d1423ab`；R1-S1 已完成 15/15 点。
- 承诺容量：14 点；Stretch：无。
- 容量依据：前两轮实际速度为 16、15 点；本轮含诊断持久化、超长总控拆分与 UI 验收，承诺低于两轮平均速度，不以未满足依赖的卡补满容量。
- 产品边界：只做 Release 1 本机 SQLite、被动诊断、单书工作台和专业章节编辑；不引入账号、MFA、MySQL、LAN、真人协作或公开发布。

## 承诺 Backlog

| Story | 点数 | 当前状态 | Owner | 依赖 | 用户结果 |
| --- | ---: | --- | --- | --- | --- |
| S1-01 缺省数值配置正确生效 | 3 | Done | 配置 Agent | [7 项输入矩阵与零副作用检查通过](./s1-01-numeric-settings-defaults.md) | 未配置、空白和坏值使用声明默认，合法低值与允许的 0 保持 |
| S1-02a 诊断读取、显式探测与持久化 | 3 | Done | 诊断 Agent；根集成人负责共享接线 | [后端读/检分离、持久化与迁移证据通过](./s1-02a-diagnostic-readiness-backend.md) | 服务端被动读取零 transport，显式检测结果跨重启可追溯 |
| S2-01a 单书查询与导演编排归属 | 5 | Done | 单书总控 Agent | [application facade、边界说明与 36 项检查通过](./s2-01a-single-book-application-facade.md) | 当前作品、导演任务、暂停与恢复状态进入 owned application facade，不串书、不误恢复 |
| S2-02 专业章节辅助区域按需展开 | 3 | Done | 章节编辑 Agent；根集成人负责外部身份接线 | [10 项行为检查与隔离 UI 验收通过](./s2-02-professional-chapter-assist-panels.md) | 正文默认优先，章节参考和 AI 协作按需展开，折叠与同章刷新不丢草稿或候选 |

`S1-01/02a` 是未进入 R1-S1 的 Backlog，不是 carryover；沿用原 Story ID 与点数。`S2-01` 父 ID 只作路线图映射，本窗口只承诺已满足 DoR 的 `S2-01a`，不把被其阻断的 `S2-01b` 提前计入。

## Definition of Ready 与边界

### S1-01

- 权威合同：[Sprint 1 实施卡](./agent-collaboration-sprint-1.md#s1-01缺省数值配置正确生效)。
- Owned：`server/src/config/rag.ts`、三个 settings runtime/service 文件及直接配置解析测试。
- 非范围：不开启 RAG、不改模型、不重建索引、不回写读取到的用户配置。
- 最窄验证：server build；env/数据库输入矩阵；读取零配置写入、零索引任务；只用 mock Prisma 或隔离 SQLite。

### S1-02a

- 权威合同：[Sprint 1 实施卡](./agent-collaboration-sprint-1.md#s1-02a诊断读取显式探测与持久化)与 [S1-00 合同门](./s1-00-diagnostics-contract.md)。
- 诊断 Agent Owned：owned diagnostics application/infrastructure、`server/src/llm/connectivity.ts`、LLM/RAG 诊断 routes 与聚焦测试。
- 根集成人保留：两份 Prisma schema、SQLite/PostgreSQL 增量迁移、共享 diagnostics types、client API/query keys、route mounting 与最终集成提交。
- 非范围：前端状态展示、建议应用、任务模型优先级、自动路由写入、真实付费模型调用。
- 最窄验证：被动 GET 零 transport/零 route upsert；同指纹并发合并；配置变化后 stale；失败保留上一报告；重启可读与错误脱敏；双库迁移仅在隔离环境演练。
- 退出门：若 HMAC 指纹、并发 claim 或双库迁移需要超出现有冻结合同的新安全方案，返回 Refinement 拆卡，不能把 02b/03 或相邻清理塞入 3 点。

### S2-01a

- 权威合同：[Sprint 2 实施卡](./agent-collaboration-sprint-2.md#s2-01a单书查询与导演编排归属)。
- Owned：`client/src/pages/novels/NovelEdit.tsx`、列出的 workflow hooks 与新 `novels/workspace/application/`；该 Agent 独占，根集成人同期不改这些文件。
- 非范围：不改变查询/API 合同、任务优先级、continue 参数、quality-first 暂停、表单内容或服务端权限，不新增第二任务或自动恢复。
- 最窄验证：现有身份/导航/自动化状态 20/20 基线；新增查询启用、跨书迟到响应、任务身份、暂停保持与零命令启动测试；client typecheck。
- 完成边界：01a 只完成 application 归属，不能宣称 `NovelEdit.tsx` 已最终低于 1300 行；01b 完成前总控不得扩展新功能。

### S2-02

- 权威合同：[Sprint 2 实施卡](./agent-collaboration-sprint-2.md#s2-02专业章节辅助区域按需展开)。
- 章节编辑 Agent Owned：`client/src/pages/novels/components/chapterEditor/`；根集成人单独处理 `NovelChapterEdit.tsx` 的稳定 session 身份与外部正文变化接线。
- 非范围：不开放简易页改稿，不新增生成服务，不改修订权限、审校判定或章节版本回退。
- 最窄验证：开关/session、折叠恢复、选区唤起、零额外请求、同章刷新、外部冲突与切章清理行为测试；client typecheck；Computer Use 完成宽屏、窄屏、键盘和失败保持验收。

## 并行波次与集成所有权

```text
Wave 1
  单书总控 Agent：S2-01a
  诊断 Agent：S1-02a（根集成人并行完成共享 schema/迁移接线）
  章节编辑 Agent：S2-02（根集成人完成 NovelChapterEdit 外部接线）

Wave 2
  首个空闲 Agent：S1-01
```

- 每个 Agent 同时最多一张 `In Progress` Story；交回 review 后才能领取 S1-01。
- 根集成人独占 `TASK.md`、Roadmap、README、Release Notes、Wiki、共享 schema/迁移/types/API/query keys、route mounting 与阶段提交。
- Agent 不切分支、不提交、不修改其他 Owner 文件；发现邻接缺陷先交回根集成人，不扩展 Story。
- S2-01a 与 S2-02 文件域不重叠；S1-02a 与 S1-01 串行领取可避免 settings/诊断边界在同一 Agent 上并行。

## 未承诺与发布阻断

- `S1-02b`、`S1-03`：依赖 S1-02a，继续 Backlog；不得用 mock UI 冒充业务 Done。
- `S2-01b`、`S2-03a/03b`：依赖 S2-01a/01b，继续 Blocked。
- `S2-04a`：当前 Ready，但加入后为 17 点；顺延到下一窗口优先承诺，`04b/04c` 仍受其阻断。
- Release 静态门仍为 `PASS=9 / BLOCKED=2 / REVIEW=1`。公开发布触发需先形成独立 Story 再进入后续承诺；macOS 工作流属于 R1-RC，不抢占本窗口。
- 本窗口不 push、tag、晋级 beta/main、打包或上传公开 Release。

## 验收顺序与 DoD

1. S1-02a 先由根集成人冻结并验证增量 schema/迁移接线，再接受业务实现；不得接触用户数据库。
2. S2-01a 先冻结 application facade 与模块 README，再重新 refinement S2-01b；不能在当前承诺中自动拉入 01b。
3. S2-02 行为检查通过后进入 User Acceptance，由 Computer Use 留下真实交互证据；未完成 UI 验收不得标 Done。
4. S1-01 在 Wave 1 任一卡交回 review 后开工；读取零副作用是 DoD，不以默认值常量存在替代行为证据。
5. 每张 Story 需行为级证据、适用失败/并发/恢复检查、Wiki 判断、发布说明判断和阶段提交；typecheck 或文档不能单独建立业务 Done。
6. Sprint 结束记录 Goal、承诺/完成点数、carryover、返工/逸出缺陷、UI 验收与最多两项流程改进。

R1-S2A 完成只解锁下一窗口的装配、推荐动作和模型透明度；Release 1 仍须经过后续 Sprint、R1-RC、beta 组合验证和最终用户验收。

## 完成证据

- S1-01：env 与数据库的未配置、空白、坏值、合法低值和允许的 `0` 共 7 项行为检查通过；读取零设置写入、零事务和零索引任务。
- S1-02a：shared/server build、诊断 6/6、路由 2/2、路由 revision 与迁移 19/19、共享 DTO 5/5，共 32 项聚焦检查通过；SQLite/PGlite PostgreSQL 增量迁移只在隔离环境演练。
- S2-01a：单书 application facade、导演任务身份、迟到 mutation 隔离、人工恢复暂停保持和零自动命令共 36 项检查通过；`NovelEdit.tsx` 降至 1263 行。
- S2-02：行为检查 10/10、client typecheck 和 Computer Use 通过；覆盖宽屏、720px 窄屏、键盘、失败保持、切章清理与请求次数。
- 所有承诺卡均有独立完成证据，完成 `14/14` 点；没有把 S1-02b/03、S2-01b、S2-03 或 S2-04 偷带入本 Sprint。

## Sprint Review

- Sprint Goal：**部分达成**。可靠默认值、正文优先、跨书隔离、人工恢复保持和后端诊断读/检分离均已达成；知识库旧 GET 已改为被动读取。
- 尚未完全达成的 Goal 语句：设置概览和模型路由页仍把旧 POST 作为自动 query，打开页面仍可能探测模型。该 UI 消费明确属于未承诺的 S1-02b，不以保留兼容响应掩盖缺口。
- 承诺 / 完成：`14 / 14` 点。Story carryover：0；S1-02b 是既有 Backlog，不是本 Sprint 未完成 Story。
- UI 验收：S2-02 已完成 Computer Use；S1-01、S2-01a 和 S1-02a 以行为/合同检查收口。诊断 UI 的 Computer Use 验收等待 S1-02b。
- 返工与逸出：集成审查发现直接替换 POST 响应会破坏旧设置页，已补旧结构投影和路由回归；未出现用户数据写入或付费模型调用。
- 已知发布门：旧 SQLite 原生 `prisma migrate deploy` 历史仍会在既有视觉迁移处重复添加字段；桌面受控 runtime migration 和本 Story 新增迁移通过，未在 3 点 Story 内越界改写历史迁移。

## Retrospective

- 做得有效：在实现阶段冻结共享 DTO、schema 和迁移 owner，使后端、前端后续卡和双数据库合同保持同源；Computer Use 用于有实际交互风险的章节编辑 Story，而后端卡使用隔离行为证据。
- 流程改进 1：替换已有 HTTP 响应前，先枚举全部仓库消费者并增加兼容测试；不能只验证新接口本身。
- 流程改进 2：Prisma schema 只做局部补丁和双 schema validate；避免无关的全文件格式化扩大 diff。

R1-S2A 到此结束。下一窗口必须重新 Sprint Planning；不得把“14/14 点”解释为 Release 1 或完整 R1-S2 已完成。
