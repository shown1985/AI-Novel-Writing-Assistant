# S2-01a：单书 application facade 完成证据

## 交付结论

- Release / Sprint：Release 1 / R1-S2A。
- Story：S2-01a 单书查询与导演编排归属（5 点）。
- 状态：Done。
- 用户结果：切换作品、导演任务或阶段时，查询与命令结果只属于当前作品；人工恢复暂停不会被轮询清除，打开工作台不会自动执行生成、恢复、审批或重试。

## 模块边界

`client/src/pages/novels/workspace/application/` 通过 `index.ts` 提供以下 owned 能力：

- 按阶段启用的资源查询与只读派生；
- 导演任务身份、书级自动化投影、快照与暂停事实；
- 继续、恢复、审批、重试、取消与来源页导航命令；
- 接管提醒、运行记录抽屉动作和导出编排；
- 作品 epoch 隔离，阻止 A → B → A 后旧 mutation 回调写入新会话。

阶段展示 props 与 `NovelEditView` 装配仍属于 S2-01b；本卡没有改变 API、query key、continue 参数、质量优先暂停或服务端权限。

## 行为证据

- 查询启用矩阵只加载当前阶段所需的大资源，作品 ID 为空时禁用全部作品域查询。
- URL `directorTaskId`、真实当前导演任务与书级投影保持既有优先级；`workspaceTaskId` 不会成为导演任务 ID。
- 旧作品的迟到 mutation 回调不能更新当前作品的本地状态、URL 或提示，包括 A → B → A。
- `waiting_recovery` 与任务 `pendingManualRecovery` 任一成立时保持人工恢复暂停。
- 页面启动只返回查询启用状态，生产与恢复命令必须由来源页显式动作触发。
- `NovelEdit.tsx` 从约 2871 行降至 1263 行；application 最大文件 648 行，均低于 1300 行硬阈值。

## 验证

```text
node --experimental-strip-types --test \
  client/src/pages/novels/workspace/application/workspaceSessionPolicy.test.mjs \
  client/src/pages/novels/novelEditAutomationStatus.test.mjs \
  client/src/pages/novels/novelWorkspaceNavigation.test.mjs \
  client/src/pages/novels/hooks/novelEditWorkflowParams.test.mjs \
  client/src/pages/novels/components/novelExistingProjectTakeoverViewModel.test.mjs
pnpm --filter @ai-novel/client typecheck
```

- 定向身份、导航、暂停与接管回归：36/36 通过。
- client typecheck：通过。
- 按项目规则，纯 application 重构未执行浏览器或截图验收。

扩大检查时另发现 `novelAutoDirectorProgressPanelQueryKeys.test.mjs` 的一项源码镜像断言在当前 `HEAD` 已过期；它匹配未修改组件的旧变量名，不是本 Story 回归，也未混入本卡修复。发布候选全量测试前需以独立范围修正该测试。

## 文档判断

作品身份、导演任务选择、人工暂停保持和命令触发边界是长期维护规则，已写入 [单书工作台 application 边界](../wiki/architecture/single-book-workspace-application.md)。
