# 世界维护运行时边界

本模块拥有世界维护命令的领域校验、应用编排和持久化适配。外部调用只依赖 `maintenance/index.ts` 导出的 `WorldMaintenanceWorkflowService`；不得深链 `infrastructure`。

S3-02a 只覆盖 `World` 样本的完整结构化候选提交：操作幂等、内容版本 CAS、兼容投影、提交回执和提交后的 RAG 刷新。旧写入口收敛、`NovelWorld`、AI 提案/评估、HTTP 和 UI 均不属于本模块当前阶段。

内容、版本、operation 与 receipt 必须在同一事务完成。RAG 是事务后的 best-effort 派生资料；失败只形成 `ragRefreshPending`，不能回滚已保存内容。作者决定在持久化能力落地前通过 `EmptyWorldDecisionRevisionPort` 固定返回 `0 / empty_compat`。
