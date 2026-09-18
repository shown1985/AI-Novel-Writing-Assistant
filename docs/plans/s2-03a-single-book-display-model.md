# S2-03a：单书成果、进度与推荐动作展示模型证据

## Story 结果

- Release / Sprint：Release 1 / R1-S2D。
- 状态：Done。
- 用户价值：作者在同一作品现场能区分已保存正文、本轮任务范围和全书目标，并看到结构化严重度、局部质量项与至多一个可信的下一步建议。
- 依赖：[S2-03a0 权威合同](./s2-03a-single-book-display-authority-contract.md)已完成。

## 已交付范围

1. `singleBookDisplayModel` 只读取当前小说持久章节、有效的 `estimatedChapterCount`、同书同任务的 task/snapshot/runtime、书级自动化投影和查询 freshness。
2. 已保存正文只统计当前 `novelId` 下正文非空的持久章节；任务范围不会补算全书目标，局部任务完成不会显示为整书完成。
3. 身份验证要求书级投影、任务详情和 snapshot 指向同一导演任务与当前小说；`workspaceTaskId` 不在输入合同中，也不能补足缺失导演身份。
4. 严重度按结构化 replan、人工恢复、质量优先暂停、阻塞、运行、局部质量债和局部完成顺序确定，不读取自由文案、关键词或正则推断语义。
5. 唯一动作候选只能是 fresh 且通过身份验证的 `bookAutomationProjection.primaryAction`。dashboard、runtime、secondary action 与局部 callback 不参与仲裁；本 Story 只读展示，不调用命令。
6. stale/error 可保留同书已保存事实，但 loading/stale/error/empty 或身份不匹配均输出零动作。
7. 桌面和移动端消费同一 `SingleBookDisplayModel`，共同展示三层进度、严重度、局部质量项数量和只读建议，不各自重算任务语义。

## 非范围确认

- 未绑定继续、恢复、审批、重试或修复命令；S2-03b 继续保持 Blocked。
- 未修改 API、query key、共享 Runtime、checkpoint、issue policy 或数据库。
- 未新增 Prompt 或模型调用，也未把任务抽屉/运行记录改成新的操作入口。

## 行为证据

执行：

```text
node --experimental-strip-types --test \
  client/src/pages/novels/workspace/presentation/singleBookDisplayModel.test.mjs \
  client/src/pages/novels/workspace/presentation/workspaceViewAssembly.test.mjs
```

结果：21/21 通过。覆盖局部成功、running 范围、运行中质量债、replan、quality-first 人工暂停、无 URL 的真实失败任务、跨书/跨任务、只统计本书保存正文、loading/stale/error/empty、目标未知、`workspaceTaskId` 不替代导演身份、动作依据 freshness 和多动作源冲突。

执行：

```text
pnpm --filter @ai-novel/client typecheck
```

结果：通过。

静态审查：`git diff --check` 通过；展示模型未出现 `workspaceTaskId`、secondary/dashboard/next action 仲裁、`includes`、正则或文案分类；相关文件均低于 1,300 行。

## UI 验收证据

2026-09-18 使用 Computer Use 在隔离环境完成验收。服务端使用 `/tmp/ai-novel-s2-03a-ui.zTbTbD/ui3.db`，应用数据目录同样位于 `/tmp`；未读取或修改用户数据库，也未触发模型调用。

1. 桌面端失败态显示“已保存正文 2 章”“全书目标 10 章”和唯一只读建议“查看失败原因”；失败不会清除已保存正文。
2. 将同一隔离任务置为 `succeeded` 后，桌面端明确显示“最近一次任务已完成”“本轮任务完成，不代表整本书已经完成”，同时保留 `2/10` 的正文与目标事实。
3. Chrome 响应式视口 `400 × 800` 下，移动端显示相同的“最近一次任务已完成”、`已保存正文 2 章 · 全书目标 10 章`和唯一建议“进入章节执行”。
4. 切换到第二本作品后显示“已保存正文 1 章”“没有可验证的导演任务”“全书目标 6 章”，未残留第一本作品的任务范围或建议。
5. 只浏览页面和切换作品后，隔离库中的 `DirectorRunCommand`、`DirectorRuntimeCommand`、`DirectorRun` 均保持 0 行，证明只读展示未自动执行导演命令。

结构化运行中质量债、replan、quality-first 人工暂停、stale/error/empty 等状态由 21/21 table-driven 行为测试覆盖；UI 验收不重复制造真实模型或恢复副作用。隔离 fixture 缺少卷章节摘要时出现既有 `volumes/versions` 参数校验提示，不影响本 Story 的展示模型结论，也未作为无错误基线宣称。

## 文档判断

这次工作形成了长期有效的桌面/移动单一展示模型边界，已更新 `workspace/presentation/README.md` 与单书工作台架构 Wiki。用户可见变化需要写入发布说明；阶段提交前按仓库 Release Notes Workflow 处理。
