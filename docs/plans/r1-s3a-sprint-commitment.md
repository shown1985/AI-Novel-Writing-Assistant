# R1-S3A Sprint 承诺：本书世界实例版本基础

## Sprint Goal 与承诺

旧作品继续按既有兼容路径读取；本书世界实例在现有创建和显式替换路径拥有准确的独立内容版本，缓存读取与世界库样本更新不误增版本。

- Release / Epic：Release 1 / S3 可信世界。
- 基线：`beta@072cdfd9`；DoR 冻结于 `codex/r1-s3a1-world-revision@fe91908f`。
- 承诺：仅 [S3-03a1 实例内容版本与兼容迁移](./s3-03a1-novel-world-content-revision-contract.md)，5 点；Stretch：无。
- 当前状态：Ready / Sprint 已承诺，尚未开始实施；完成点数 `0/5`。
- 容量：单卡 5 点，不把后继 a2 或同步旧入口算作本 Sprint 产出。

## 依赖、Owner 与顺序

- `S1-06` 内容版本原则、`S3-02a` 世界样本 CAS 已完成；PO 与独立 QC 已复核 a1 DoR。
- 单一 Luna xhigh 全栈 Runtime owner 负责 `NovelWorldInstanceService.ts`、`NovelWorldManualService.ts` 和必要的内部版本投影/聚焦测试；一次只做本 Story。
- 根 PM/集成人独占双 Prisma schema、PostgreSQL/SQLite 增量 migration、migration completeness 和共享合同；先冻结字段/默认值，再由 Runtime owner 接四个写入口，避免多人同时改共享文件。
- Terra medium QA 做 AC/失败与旧数据场景验收；Terra medium QC 独立复核差异、范围、迁移合同与验证证据。根 PM 负责 Sprint 门、阶段提交和 beta 集成。
- 任何用户真实数据库均不用于开发验证；本卡不执行 reset、drop、truncate 或真实库升级。

## 验收与退出门

1. a1 合同 AC1～6 逐条有行为证据：独立实例版本、四类 legacy 输入（含旧 World 仅扁平字段）、显式替换 `1→2`、lazy 初始化幂等、失败时内容与版本原子、缓存和样本变化不误增版本。
2. SQLite 隔离 fixture、双 schema validate、migration completeness、服务端聚焦测试和 build/typecheck 按变更范围通过；PostgreSQL apply 保持 Release gate，不以 schema validate 冒充真实 apply。
3. a2 可消费内部版本字段；同步 pull、旧切片双读/双写和 Gateway 主读切换仍归后续 Story，不声称全部内容写入口已受版本保护。
4. QA/QC 复核通过，Wiki 长期价值已判断，阶段提交范围只包含本 Story；本卡无新增 UI，UI 交互验收不适用。功能分支合入 beta 后再做组合验证，不直接晋级 main。

## 明确不承诺

- `S3-03a2` 切片消费、`S3-03b` 双侧同步、原 `S3-02b` 父项其余旧入口。
- 新的普通实例编辑 UI、提案、评估、作者决定、章节回写或全局安全体系。
- 用户真实库迁移、PostgreSQL apply、桌面包装、公开发布或 Release 2 MySQL/认证/多人协作。

## Review 与 Retrospective 出口

- Review：按 AC1～6 展示四类旧数据、重复初始化、替换与事务失败；核对未覆盖入口、a2 依赖、beta 集成和 Release gate。未通过项回到 Refinement，不用 build 代替业务验收。
- Retrospective：记录 Sprint Goal、承诺/完成点数、carryover/原因、返工或逸出缺陷；最多保留 1～2 条可执行改进。当前尚未举行。
