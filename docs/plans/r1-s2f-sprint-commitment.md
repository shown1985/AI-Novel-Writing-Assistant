# R1-S2F：真实调用证据与世界安全提交 Sprint 承诺

## Sprint 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2F；1～2 周等价验收窗口，不承诺具体发布日期。
- Sprint Goal：让真实模型调用的每次物理尝试可追溯，同时为世界内容写入建立原子、可重放的版本保护边界。
- 开发基线：`codex/r1-s2f-attempts-world-cas@045f35cf`；R1-S2E 已完成 `8/8` 点。
- 承诺容量：8 点；Stretch：无。
- 容量依据：最近六个实现窗口完成 15、14、9、8、9、8 点；本窗口包含真实 transport 接线和双数据库持久化边界，保留集成与故障路径验证空间。
- 产品边界：只做 S2-04b3、S3-02a；不做调用历史 API/UI、身份读投影、世界提案/评估、现有世界写入口全面收敛或 Release 2 能力。

## 承诺 Backlog

| Story | 点数 | 状态 | Owner / 文件域 | 依赖 | 验收边界 |
| --- | ---: | --- | --- | --- | --- |
| S2-04b3 真实 transport attempt 接线 | 5 | In Progress | 模型平台 Agent；`platform/llm/provenance/attempts/runtime/`、Prompt/text/structured transport hooks | S2-04b1、04b2、R1-PROMPT01 Done | [每次物理调用、lineage、采用结果和 best-effort 证据状态](./s2-04b3-production-attempt-wiring-contract.md)；不做读 API/UI |
| S3-02a 世界样本安全提交边界 | 3 | In Progress | 世界 Runtime Agent；`services/world/maintenance/`；根集成人独占 schema、迁移、共享合同 | S1-06、S3-01 Done；本 Sprint 冻结提交合同 | [World 样本 CAS、幂等回执、原子证据和结果查询](./s3-02a-world-sample-safe-commit-contract.md)；不收敛全部旧写入口 |

两张卡均有稳定 ID、Release、用户价值、范围/非范围、依赖、AC、owner 与最窄验证，满足 Definition of Ready。实现开始后不得把依赖刚解除的后续卡顺手换入。

## 波次与 ownership

```text
Wave 1（并行）
  模型平台 Agent：S2-04b3 transport attempt 接线
  世界 Runtime Agent：S3-02a maintenance 模块与隔离行为测试
  根集成人：S3-02a 双 schema、增量迁移、共享合同

Wave 2
  根集成人：集成 review、最窄验证、Wiki/发布判断、阶段提交
```

- `TASK.md`、Roadmap、README/Release Notes、共享类型、两个 Prisma schema 和迁移由根集成人单 owner。
- S2-04b3 不修改既有 attempt repository/store 语义，不新增 schema 或迁移；04a 只复用现有 `provider/model/modelRoute/strategy` 来源字段。
- S3-02a 只提供内部 `World` 样本提交门面；不会自动接管旧 HTTP/手动编辑/AI 整理/快照恢复入口。
- recorder 与 RAG 后处理失败必须留证据或资料债，但不得改变已完成的模型结果或已提交的世界内容；本条不扩展为新的恢复系统。
- UI 验收不适用；本窗口以真实 adapter、隔离数据库和故障注入行为证据验收。

## 未承诺与退出门

- S2-04b4 / 04c：继续等待真实接线 Done 后的身份归属与读取投影；不提前做 API/UI。
- S3-02b：继续等待 S3-02a Done；不在本窗口盘点并改造全部旧写入口。
- S3-03～06、S4+、S5+、Release 2：保持 Backlog/依赖状态。
- 退出需记录 Sprint Goal、`8/8` 或实际完成点数、两张 Story 的失败/并发/重放证据、迁移兼容、carryover、逸出缺陷、Wiki/发布判断和最多两项流程改进。
