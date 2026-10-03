# 单书工作台 presentation 边界

## 责任

本目录把单书工作台已有的 application 事实、业务 hook 结果和页面本地状态装配成桌面与移动视图共同消费的 `NovelEditViewProps`。

- `planningTabs`：基础信息、世界、卷规划与结构化拆章的展示合同。
- `NovelEditPresentation`：章节、流水线、角色、接管入口与任务抽屉的页面组合。
- `singleBookDisplayModel`：把已验证的书级/任务级结构化事实转换为桌面与移动端共用的三层进度、严重度和只读主动作候选。
- `workspaceViewAssembly`：阶段映射和最终视图 props 的纯转换，供输入矩阵测试。
- `index.ts`：presentation 唯一公开入口。

## 依赖方向

```text
NovelEdit.tsx
  -> workspace/application/index.ts
  -> workspace/presentation/index.ts
      -> existing business hook results and view prop types
      -> NovelEditView (desktop and mobile share the same props)
```

presentation 不发起查询或命令，不拥有 URL 导演身份的选择权，也不改变人工恢复、checkpoint 或质量策略。它可以按冻结合同校验 application 提供的结构化书/任务身份与 freshness，并做确定性展示转换；不能从 label、headline、detail 或按钮文案重新判断语义。打开页面、切换阶段或显示任务不能因此新增生成、恢复、审批或重试。

## 事实源

- URL 与任务身份：`workspace/application` 和既有导航策略。
- 已保存作品、章节和资源：`useWorkspaceResources` 的查询结果。
- 未保存表单与流式内容：`NovelEdit.tsx` 保持原有 state 与 hook 生命周期。
- 导演命令：`useWorkspaceDirectorCommands` 与 `useWorkspaceDirectorInteraction`。
- 桌面和移动展示：同一个 `NovelEditViewProps`，不得在移动视图复制任务解释。

## 非范围

- 不从自由文案重新评判推荐动作、审校结论或质量债；只消费服务端已治理的结构化结论。
- 不改变 manual/system 动作、恢复参数或任务状态。
- 不调用小说 API、query keys 或服务端 Runtime。
- 不重置章节、清理草稿、迁移数据或扩展世界写权限。
