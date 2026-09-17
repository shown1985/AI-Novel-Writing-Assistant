# S2-01b：单书 presentation 装配完成证据

## 交付结论

- Release / Sprint：Release 1 / R1-S2B。
- Story：S2-01b 阶段装配与页面组合收敛（3 点）。
- 状态：Done。
- 用户结果：基础信息、世界、角色、卷章规划、章节生产与运行记录继续消费同一作品现场；后续调整展示时不必继续扩大总控，也不会因为装配迁移交换手动/系统动作或改变恢复语义。

## 模块边界

`client/src/pages/novels/workspace/presentation/` 只把页面已有状态、application 事实和显式事件回调装配成 `NovelEditViewProps`：

- `planningTabs.ts` 负责基础信息、世界、卷规划与结构化拆章的展示合同；
- `NovelEditPresentation.tsx` 负责章节、流水线、角色、接管入口、任务抽屉和生产体验交接；
- `workspaceViewAssembly.ts` 保存有条件的纯装配策略，生产组件和行为测试消费同一实现；
- `index.ts` 是唯一公开入口，旧 `novelEditPlanningTabs.ts` 只保留兼容导出。

presentation 不拥有查询、URL/任务身份、checkpoint、人工恢复或质量策略，也不在渲染时调用生成、恢复、审批、重试、取消等命令。桌面与移动继续消费同一 `NovelEditViewProps`。

## 行为与架构证据

- `NovelEdit` 顶层 Hook 调用序列与实施基线完全一致；章节待确认资源仍在原位置通过 `useMemo` 派生，并以稳定引用传给 presentation。
- 真实装配矩阵覆盖 planning 的 manual 保存与 system 生成、任务抽屉动作/能力/取消投影、生产体验交接、最终 tabs/shell 和章节/角色导航隔离；测试直接执行生产 builder，不读取源码或复制一套期望实现。
- 页面挂载、切换阶段和装配任务抽屉只传递既有事实与回调，没有新增命令副作用。
- `NovelEdit.tsx` 770 行，`NovelEditPresentation.tsx` 636 行，`planningTabs.ts` 307 行，`workspaceViewAssembly.ts` 195 行，均低于 1300 行硬阈值。
- 外部只从 presentation `index.ts` 导入；presentation 通过 application facade 消费编排结果，没有跨模块深导入。

## 验证

```text
node --experimental-strip-types --test \
  client/src/pages/novels/workspace/presentation/workspaceViewAssembly.test.mjs \
  client/src/pages/novels/workspace/application/workspaceSessionPolicy.test.mjs \
  client/src/pages/novels/novelEditAutomationStatus.test.mjs \
  client/src/pages/novels/novelWorkspaceNavigation.test.mjs \
  client/src/pages/novels/hooks/novelEditWorkflowParams.test.mjs \
  client/src/pages/novels/components/novelExistingProjectTakeoverViewModel.test.mjs
pnpm --filter @ai-novel/client typecheck
git diff --check
```

- 身份、导航、暂停、接管与真实装配回归：43/43 通过。
- client typecheck 与 scoped diff check：通过。
- 独立复审使用 TypeScript AST 比对 Hook 序列，并复核命令副作用、Desktop/Mobile 合同、facade 与行数；无 P0～P3 问题。
- 本 Story 是无可见变化的责任迁移；按项目验证规则不重复浏览器、截图或 Playwright 验收。

## 文档与发布判断

application → presentation 的依赖方向、事实源和命令边界属于长期维护知识，已更新[单书工作台 application 边界](../wiki/architecture/single-book-workspace-application.md)。本 Story 不新增用户能力或产品行为，因此不写 Release Notes。
