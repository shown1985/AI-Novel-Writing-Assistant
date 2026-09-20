# R1-S2G：调用身份读投影与世界写入口 CAS Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2G；1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：让自动导演、本书世界生成和章节改稿预览的模型调用证据拥有明确、不可猜测的内部身份归属与读投影，同时让 `WorldService.updateWorld` 与公理保存复用已有世界 CAS 提交边界；保留运行记录只读和普通世界维护的既有范围。
- 开发基线：`codex/r1-s2g-attribution-world-writes@32b2e9c7`；R1-S2F 已完成 `8/8` 点。
- 承诺容量：8 点；Stretch：无。
- 容量依据：本窗口只承诺一张 5 点跨模块平台接线卡和一张 3 点世界写入口兼容卡。两张卡分别覆盖内部 provenance 归因与真实世界来源页保存；保留并发隔离、428/409、重放和回归证据空间，不把公开 API/UI、schema/migration 或其他旧入口压进本窗口。
- 产品边界：只做 S2-04b4、S3-02b1；不做 S2-04c 只读 UI、不新增模型调用历史 API、不做新的数据库 schema/migration、不接管世界提案/评估/同步/快照恢复或其他普通编辑入口，不引入 Release 2 能力。原 S3-02b 父项的其余写入口留在 Refinement。

## 承诺 Backlog

| Story | 点数 | 状态 | Owner / 文件域 | 依赖 | 验收边界 |
| --- | ---: | --- | --- | --- | --- |
| [S2-04b4 首批身份归因与内部读投影](./s2-04b4-attribution-read-projection-contract.md) | 5 | Done | 单一模型平台全栈 owner；`server/src/platform/llm/provenance/attempts/`、三个明确调用入口及定向测试 | S2-04b3 Done；现有 attempt store/repository 可用 | Terra 最终 PASS：shared/server build、三文件定向检查 20/20；无 UI。三入口 attribution context；director 完整 frame 优先；内部 read service；`reconstructRequest=null` 仅 `not_found`；归因另用 `attributionStatus=complete|partial|unattributed`，execution `evidenceStatus` 只透传；无 API/UI/schema/migration |
| [S3-02b1 世界编辑与公理保存的最小 CAS 兼容接线](./s3-02b1-world-edit-axiom-cas-contract.md) | 3 | Done | 世界 Runtime 全栈 owner；`WorldService.updateWorld`、既有 world HTTP/API、`client/src/api/world.ts` 与公理来源页 | S3-02a Done；已有 `contentRevision`、operation/receipt 和 CAS 门面 | Terra 代码级 PASS：maintenance/runtime/migration/service/route 25/25、client CAS 3/3，shared/server/client build/typecheck PASS；Computer Use PASS。隔离路径 `/tmp/ai-novel-qc-s3-runtime-20260920000000` 中真实保存 `revision 1→2` 并刷新持久；并发合法写 `2→3`，旧页面保存得到 `CONTENT_REVISION_CONFLICT`，草稿即时保留、数据库保留较新内容，仅两条 committed operation；client retry harness `3/3`。只接 `updateWorld` 兼容 HTTP/API 与 `updateAxioms` 真实 UI；无新迁移、无普通编辑新 UI；原 S3-02b 其余旧入口留 Refinement/非范围 |

两张卡均具备稳定 ID、Release、用户价值、范围/非范围、依赖、AC、owner、文件边界和最窄验证；均不把后续卡提前标为 Ready。计划冻结后立即按单 owner 派发，不以规划文档或 mock 联调代替业务 Done。

## Definition of Ready（两张卡共同门）

1. Story ID、Release 1 归属、用户结果和 5 点以内估点已固定；本窗口容量为 `5 + 3 = 8`，无 Stretch。
2. 依赖证据已存在：S2-04b3 已完成生产 attempt recorder 接线；S3-02a 已完成 `World.contentRevision`、operation/receipt、CAS 冲突与重放合同。
3. 范围、非范围和跨模块 owner 已写入详细合同；每个 Agent 只领取一张 In Progress 卡，不抢改另一张卡的 owner 文件。
4. 共享边界已冻结：S2-04b4 不新增 public/shared DTO、HTTP/API、UI、Prisma schema 或 migration；S3-02b1 不新增 migration，不创建新的普通世界编辑入口。原 S3-02b 父项其余入口不因本卡进入 Sprint。
5. 验收可由隔离 repository/SQLite fixture、既有 server/client 构建和行为检查证明；不写用户桌面库、不 reset/drop/truncate、不调用真实付费模型作为通过条件。
6. 失败、并发、重放、旧记录和请求身份均有明确 AC；UI 仅 S3-02b1 的既有公理来源页接线需要用户/QC 验收，S2-04b4 不新增 UI。
7. 规划不修改生产实现；实现期间发现的其他旧入口、batch、公开读 API、schema/migration 或 UX 需求一律回 Backlog/Refinement，由 PO 另行换入。

## 波次与 ownership

```text
Wave 1（文件域互不重叠，可并行）
  模型平台全栈 owner：S2-04b4；先接 director 完整 runtime frame，再接 world/chapter 两个显式 context
  世界 Runtime 全栈 owner：S3-02b1；先接 WorldService.updateWorld/API，再接 updateAxioms 来源页与客户端 CAS 重试

Wave 2
  根集成人/PO/QC：审阅两张卡的合同与 diff，运行最窄组合检查，确认 UI 验收与发布/Wiki判断；不夺取 owner 文件
```

- S2-04b4 的单一模型平台 owner 覆盖必要的 server 跨模块 wiring、内部 context/read service 和测试；不拆出第二个平台 Agent，也不把共享 API 或前端显示偷偷加入本卡。
- S3-02b1 的世界 Runtime owner 覆盖 `WorldService`、world HTTP/API 兼容映射以及公理来源页的客户端 request/retry 接线；CAS 只有一个业务门面，不能在客户端或路由复制版本判断。
- `TASK.md`、Roadmap、两个 Sprint 规划页、README/Release Notes、Wiki、Prisma schema/migration 和阶段提交仍由根集成人单一管理；子 Agent 不修改这些文件、不 commit/switch/merge。
- 运行记录与 Creative Hub 仍为只读；任何恢复、编辑或重试动作仍在来源页完成。S2-04c 只能在 04b4 的内部 read DTO/状态语义稳定后重新 Refinement，不在本 Sprint 自动变 Ready。

## Sprint Review 与 Retrospective

- Sprint Goal 达成：调用身份读投影与世界写入口 CAS 均完成真实行为验收，R1-S2G 完成 `8/8` 点，无 Story carryover。
- S2-04b4 证据：Terra 最终 PASS，shared/server build 与三文件定向检查 `20/20`；本卡无 UI。
- S3-02b1 证据：Terra 代码级 PASS，maintenance/runtime/migration/service/route `25/25`、client CAS `3/3`，shared/server/client build/typecheck PASS；Computer Use PASS。隔离路径 `/tmp/ai-novel-qc-s3-runtime-20260920000000` 中保存 `revision 1→2` 后刷新仍持久；并发合法写使 `2→3`，旧页面保存返回 `CONTENT_REVISION_CONFLICT`，草稿即时保留、数据库保留较新内容，且仅两条 committed operation；client retry harness `3/3`。服务已停止，UI QC 结束时工作树干净。
- 缺陷返修经过：初始代码级证据已通过但缺真实来源页验收，S3-02b1 暂保持 User Acceptance；完成隔离运行时 UI QC 后补齐成功保存、刷新持久化、并发冲突、草稿保留和重试证据，故升级为 Done。无新增生产代码、测试或迁移。
- UI 验收：Computer Use PASS；验收仅使用上述隔离路径，未写用户桌面库。
- Retrospective：carryover `0`。流程改进（最多两项）：(1) 将来源页 Computer Use 与并发冲突场景列为 CAS Story 的必备退出证据；(2) 固定隔离运行路径并同时记录持久化、草稿、operation 计数和服务清理结果，减少“代码通过但 UI 未闭环”的返修往返。
- 文档判断：本次是既有 CAS 合同的验收闭环，没有新增长期架构或工作流规则，Wiki 无需更新；README 与 release notes 已记录用户行为，本次不重复新增条目。

## beta 组合验证

- beta 合并提交：`eaa8cce8`，双亲 `32b2e9c7` / `21c7642e`，merge tree 一致。
- Terra 权威证据：shared/server/client build/typecheck PASS；服务端 8 文件 `45/45`、client `3/3`，合计 `48/48`；验证前后工作树均 clean。Computer Use 证据复用既有隔离路径与 Sprint/Story 合同。
- R1-S2G beta 集成：PASS。Release 1 尚未完成；R1-03 当前仍为 `PASS=9 / BLOCKED=2 / REVIEW=1`，公开发布 workflow 触发规则、macOS 打包 workflow、macOS x64 支持范围仍待处理。

## Sprint 级验收与退出门

- S2-04b4：三入口均以显式 attribution context 写入同一 request scope；director 以完整 runtime frame 为最高优先级；两个小说并发不串线；内部 read service 只把 `reconstructRequest=null` 映射为 `not_found`，以 `attributionStatus=complete|partial|unattributed` 表示归因，只有真实 execution evidence 才透传 `evidenceStatus=complete|partial|missing`；无读取模型调用，无公共 API/UI/schema/migration。
- S3-02b1：`updateWorld` 与 `updateAxioms` 都经过已有 CAS 提交门面；缺 `expectedContentRevision` 或 `operationId` 在业务层返回 428 且零写入；revision 冲突或 operationId 复用冲突返回 409 且零错误覆盖；公理客户端重试复用同一 operationId；既有来源页真实保存可通过 QC。原 S3-02b 其余入口继续 Refinement。
- 最窄验证：两张卡各自的定向行为测试、受影响 package typecheck/build、必要的隔离 SQLite/runtime migration 检查，以及 `git diff --check`。不以静态 grep、仅 build 或 hidden button 作为业务 Done。
- 每张卡完成时记录行为级证据、失败/重放/并发结果、文档判断和 UI 验收状态。S2-04b4 与 S3-02b1 均已 Done。
- R1-S2G 已关闭为 `8/8`；不启动或承诺下一 Story。S2-04c、S3-03～06、S4+ 及所有未覆盖旧入口仍保持 Refinement/依赖状态，不因本窗口完成自动标为 Ready。

## 明确不承诺的范围

- S2-04c 模型来源只读 UI、运行记录/全局面板公开读取、任何调用历史 API。
- batch、多小说推断、从 URL/label/当前设置/live interaction 反推身份、对旧 unattributed 记录回填归因。
- `WorldService` 之外的普通编辑、结构编辑、深化、导入、素材使用、快照恢复、样本/本书同步、提案采用、AI 评估和问题历史。
- 新 Prisma migration、schema 字段、数据库 reset 或用户库修复；Release gate 的 PostgreSQL apply 仍按既有计划处理。
- 新公理编辑器或普通世界编辑 UI；本卡只把既有公理保存控件接到 CAS 合同。

退出判断：`S2-04b4=5` 与 `S3-02b1=3` 均完成真实行为证据及必要 UI 验收，R1-S2G 计为 `8/8` 并关闭 Sprint Review/Retrospective；beta 组合验证已通过（`eaa8cce8`，merge tree 一致，48/48 定向检查与 shared/server/client build/typecheck PASS），但 Release 1 仍未完成；不等同于自动启动下一 Story。
