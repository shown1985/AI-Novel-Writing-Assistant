# 单书工作台 application 边界

## 责任

本目录负责把单书工作台的查询、导演任务身份、恢复命令与导出命令组织成页面可消费的 application facade。

- `useWorkspaceResources`：按当前作品、阶段和选中章节加载资源，并派生页面所需的只读事实。
- `useWorkspaceDirectorState`：选择当前作品的导演任务、书级自动化投影、快照与后续动作事实。
- `useWorkspaceDirectorCommands`：封装继续、恢复、审批、重试、取消与来源页导航；命令只能由显式用户动作触发。
- `useWorkspaceDirectorInteraction`：把导演事实和命令投影为接管提醒与任务抽屉动作，不创建第二套任务身份。
- `useBookScopedMutation`：阻止切书前发起的迟到 mutation 回调写入新作品会话，包括 A → B → A。
- `useWorkspaceExport`：封装当前阶段与整书导出及其 pending 状态。
- `workspaceSessionPolicy`：集中查询启用、导演任务选择、暂停保持与作品请求身份的纯策略。

页面外部只从 `index.ts` 使用 facade；目录内部可以直接引用同目录策略。

## 事实源与依赖方向

```text
NovelEdit.tsx
  -> workspace/application/index.ts
      -> queryKeys + novel/task/director API
      -> existing navigation/status policies
      -> React Query cache
```

- URL `directorTaskId`、真实当前导演任务和书级投影共同决定导演任务身份；`workspaceTaskId` 不进入该选择链。
- 查询 key 继续由既有 `queryKeys` 提供，本模块不复制 key 或服务端合同。
- `pendingManualRecovery` 取任务事实与 `waiting_recovery` 投影的并集；轮询不得把暂停清空。
- 页面挂载只启用查询，不生成、恢复、审批或重试；这些命令必须由来源页上的显式动作调用。

## 查询启用矩阵

| 阶段 | 大资源 |
| --- | --- |
| `basic` / `world` | 世界切片 |
| `story_macro` | 故事宏观结构 |
| `outline` / `structured` | 卷与拆章工作区 |
| `character` | 角色资源 |
| `chapter` | 最新状态、伏笔、角色资源；有选中章节时再加载章节上下文与时间线 |
| `pipeline` | 质量报告、最新状态、伏笔与角色资源 |

作品 ID 为空时，所有作品域查询均禁用。阶段切换不得预载其他阶段的大资源。

## 非范围

- 不装配 `NovelEditView` 的各阶段展示 props；那属于 S2-01b 的 presentation 收敛。
- 不改变 API、query key、continue 参数、质量优先暂停或任务选择优先级。
- 不自动恢复任务，不在页面打开时启动章节生产。
- 不操作数据库、迁移、章节重置或用户创作数据。
