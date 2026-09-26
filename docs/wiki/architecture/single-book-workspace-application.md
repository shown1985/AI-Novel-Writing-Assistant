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
14. 三层进度、严重度、质量债数量和主动作候选必须先收敛为同一个只读 `SingleBookDisplayModel`，再由桌面与移动端消费。视图不能各自重算章数、目标、任务严重度或动作。
15. 来源页执行主动作前必须再次校验当前 `novelId`、书级投影 `novelId`、`latestTask.id`、动作 target 与 command payload 中的任务身份；动作 label 只用于展示，不能参与命令路由。
16. 同一本书同一请求只能持有一个 pending lock；切到另一部作品后可以发起新作品动作，但旧作品的成功、失败和锁释放都不能覆盖当前作品反馈。
17. `continue`、`auto_execute_range` 等动作必须复用既有来源页命令。成功反馈只能表示请求已提交并已重新读取正式投影，不能宣称后台步骤已经完成；后台随后失败时，应保留成果并显示服务端给出的恢复动作。
18. 动作反馈与动作本体在同一来源页位置呈现，至少包含影响范围、已保存成果保留说明、pending、提交成功或明确错误。任务抽屉与运行记录可以展示事实、诊断和来源导航，但不得从书级投影复制第二个主动作。

## 失败模式

- 直接在页面回调中写状态而不校验作品 epoch，会让旧作品的迟到结果污染当前作品。
- 用 `workspaceTaskId` 回退导演任务身份，会把手工作品任务误当成自动导演任务并错误恢复。
- 只信任最新轮询状态而忽略 `pendingManualRecovery`，会绕过质量优先策略的人工暂停。
- 在查询 hook 初始化时调用 continue/recover，会让打开页面变成写操作并可能重复生产正文。
- 把装配迁到新组件时改变父组件 Hook 顺序，会让后续 effect、mutation 或 SSE 失去稳定身份；派生值应保留原 Hook 位置并显式传给 presentation。
- 桌面与移动分别组装任务事实，会逐渐形成两套恢复解释；两者必须继续消费同一个 `NovelEditViewProps`。
- 从多个 action 字段或按钮文案仲裁“最像下一步”的动作，会形成第二套产品语义；应先检查书级投影身份和 freshness，不满足时宁可无动作并保留只读事实。
- 用局部 task progress、规划章节数或 UI 默认值补造整书目标，会把单次任务成功误报成作品完成；三个进度层必须分别呈现。
- 只在 mutation `onSuccess` 显示“已完成”，会把后台接收命令误报为业务完成；提交后必须失效并重读当前书的正式投影。
- 用全局 boolean 保存 pending，或由旧书 settled 无条件清锁，会让 A → B → A 切换后的按钮与反馈串书；锁和反馈都必须带作品与请求身份。

## 相关模块

- `client/src/pages/novels/workspace/application/`
- `client/src/pages/novels/workspace/presentation/`
- `client/src/pages/novels/NovelEdit.tsx`
- `client/src/pages/novels/hooks/novelEditWorkflowParams.ts`
- `client/src/pages/novels/novelEditAutomationStatus.ts`
- `client/src/pages/novels/novelWorkspaceNavigation.ts`

## 来源文档

- [独立发行版 Sprint 记录](../../fork/history.md)（S2-01a/b、S2-03a0、S2-03b，原合同见 Git 历史）
