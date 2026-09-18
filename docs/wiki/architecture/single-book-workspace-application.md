# 单书工作台 application 边界

## 背景

单书工作台同时承载基础信息、世界、角色、卷章规划、章节生产和自动导演恢复。如果页面组件直接拥有全部查询、任务身份和命令回调，切书、轮询和迟到响应很容易把上一部作品的状态带到当前作品，也会让后续展示调整误触生产流程。

## 决策

单书工作台的查询与导演编排归 `client/src/pages/novels/workspace/application/` 所有，页面只通过模块 `index.ts` 消费 facade。阶段展示 props 和页面组合属于 presentation 层，不反向拥有查询、任务身份或恢复规则。

## 当前规则

1. 所有作品域查询必须带当前 `novelId`，并按阶段启用；非当前阶段不得预载大资源。
2. 导演任务身份只来自 URL `directorTaskId`、真实当前导演任务和书级自动化投影。手工作品任务的 `workspaceTaskId` 不能替代导演任务 ID。
3. mutation 回调必须绑定发起时的作品 epoch。切书或卸载后，迟到成功、失败和 settled 回调都不能更新新作品会话；A → B → A 也视为不同 epoch。
4. `pendingManualRecovery` 与书级投影 `waiting_recovery` 任一成立时都保持人工暂停。后台轮询和普通模块装载不得清除它，只有显式恢复命令可以推进。
5. 页面挂载只能读取事实和启用查询。继续、恢复、审批、重试、取消等命令必须来自来源创作页上的显式用户动作。
6. query key 和 API 合同继续由既有公共 facade 提供，application 模块不得复制服务端合同或创建第二套任务身份。
7. `workspace/presentation/` 只把页面本地状态、application 事实和显式事件回调装配为桌面与移动共用的 `NovelEditViewProps`；不能直接查询 API、选择任务身份或评判恢复/质量状态。
8. 有条件的任务抽屉、生产体验交接和阶段 props 映射应由生产组件与行为测试消费同一纯装配策略；测试不得通过读取源码或复制对象展开来冒充接线覆盖。
9. presentation 中的命令只能存在于显式事件回调。构建 props、渲染页面、切换阶段或显示最近任务不得调用生成、恢复、审批、重试或取消。
10. 单书成果与进度必须分成三个互不代算的层次：已保存正文数只来自当前小说的持久章节；当前任务范围只来自同一导演任务的 runtime/fact projection；整书目标只来自有效的 `Novel.estimatedChapterCount`。局部任务成功或范围分母不能被解释为整书完成。
11. 页面至多展示一个可执行导演主动作。唯一候选是通过同 `novelId`、同 `directorTaskId` 和 fresh 查询验证的 `bookAutomationProjection.primaryAction`；dashboard、runtime、局部 callback 和自由文案只能提供说明或既有命令适配，不能按 label、关键词或正则重新推断动作。
12. stale、loading、error、empty 或身份不匹配都输出零可执行动作。相同小说与已验证任务的旧保存成果可以继续只读并明确标记刷新或读取失败，但另一小说、另一任务的旧事实不得复用。
13. 明确 `replan_required`、`pendingManualRecovery` 和 quality-first `pause_for_manual` 优先于普通 running/completed；`defer_and_continue` 等局部质量债仍是可继续警告，不能在展示层升级为全书失败或重规划。
14. 三层进度、严重度、质量债数量和主动作候选必须先收敛为同一个只读 `SingleBookDisplayModel`，再由桌面与移动端消费。视图不能各自重算章数、目标、任务严重度或动作；03a 的动作只展示，不绑定命令。

## 失败模式

- 直接在页面回调中写状态而不校验作品 epoch，会让旧作品的迟到结果污染当前作品。
- 用 `workspaceTaskId` 回退导演任务身份，会把手工作品任务误当成自动导演任务并错误恢复。
- 只信任最新轮询状态而忽略 `pendingManualRecovery`，会绕过质量优先策略的人工暂停。
- 在查询 hook 初始化时调用 continue/recover，会让打开页面变成写操作并可能重复生产正文。
- 把装配迁到新组件时改变父组件 Hook 顺序，会让后续 effect、mutation 或 SSE 失去稳定身份；派生值应保留原 Hook 位置并显式传给 presentation。
- 桌面与移动分别组装任务事实，会逐渐形成两套恢复解释；两者必须继续消费同一个 `NovelEditViewProps`。
- 从多个 action 字段或按钮文案仲裁“最像下一步”的动作，会形成第二套产品语义；应先检查书级投影身份和 freshness，不满足时宁可无动作并保留只读事实。
- 用局部 task progress、规划章节数或 UI 默认值补造整书目标，会把单次任务成功误报成作品完成；三个进度层必须分别呈现。

## 相关模块

- `client/src/pages/novels/workspace/application/`
- `client/src/pages/novels/workspace/presentation/`
- `client/src/pages/novels/NovelEdit.tsx`
- `client/src/pages/novels/hooks/novelEditWorkflowParams.ts`
- `client/src/pages/novels/novelEditAutomationStatus.ts`
- `client/src/pages/novels/novelWorkspaceNavigation.ts`

## 来源文档

- [S2-01a 完成证据](../../plans/s2-01a-single-book-application-facade.md)
- [S2-01b 完成证据](../../plans/s2-01b-single-book-presentation.md)
- [S2-03a0 单书展示事实与动作权威合同](../../plans/s2-03a-single-book-display-authority-contract.md)
- [R1-S2A Sprint 承诺](../../plans/r1-s2a-sprint-commitment.md)
- [Agent Sprint 2 实施卡](../../plans/agent-collaboration-sprint-2.md)
