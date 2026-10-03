# 自动导演开书任务恢复与创建边界

## 背景

自动导演开书页可以通过 URL 中的任务 ID 恢复候选、想法和创作偏好。归档任务对普通详情查询不可见；如果恢复请求同时承担“找不到就创建”的职责，旧链接就会被误解成新建意图，产生没有 Seed、没有模型调用的空白运行记录。React StrictMode 在开发模式下会重放页面 effect，因此恢复请求还必须允许安全重复。

## 决策

恢复和创建是两种不同的用户意图，必须使用不同的 HTTP 操作。恢复走无副作用的任务详情读取；创建只在没有提供任务 ID 时发生。显式任务 ID 不存在、已归档或不可见时返回 404，不能静默退化成创建。

## 当前规则

- 开书页从 `GET /api/novel-workflows/:id` 读取恢复数据。此读取通过任务投影生成详情，但必须关闭状态 healing，不能因打开页面而改写任务状态。
- `POST /api/novel-workflows/bootstrap` 在收到可见的任务 ID 时只复用该任务；显式 ID 查不到时返回 404。只有未提供任务 ID 的请求才能进入创建分支。
- 开书页只有确认读到同一条 `auto_director` 任务后才清理本地开书草稿。失效任务回退时要保留草稿，并恢复想法、基础信息、生产模式、世界模式、写法选择和步骤进度。
- 失效任务回退只移除任务 ID 等旧路由标记，保留市场简报、参考作品和其他开书来源参数。
- 详情读取可以被 StrictMode 或查询缓存重复触发；重复读取不得新增任务或运行状态。

## 示例

- 推荐：页面打开 `/novels/auto-director?taskId=...` 后请求任务详情；读到有效任务才恢复候选和表单。
- 推荐：详情返回 404 时保留本地草稿、清除失效任务 ID，并让作者从开书入口继续。
- 禁止：恢复 effect 调用 bootstrap，并依赖“任务不存在时创建一个”来初始化页面。
- 禁止：把任务中心的详情接口当作无副作用恢复读取；它可能执行自动状态修复。

## 失败模式

- 恢复旧或归档链接后出现新的 `queued` 记录，但任务没有 Seed、`startedAt`、运行尝试或模型调用：检查是否有恢复页面调用 bootstrap，以及是否把不可见任务当作新建请求。
- 开书草稿在恢复请求返回前消失：检查页面是否在确认任务存在前清理草稿。
- 恢复了手工创建任务的 Seed 或候选：确认前端和控制器只接受 `meta.lane === "auto_director"`。
- 排查任何历史空白记录时，先确认状态与全部子记录，再按数据保护规则备份；禁止为了清理运行记录而重置整库。

## 相关模块

- `client/src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx`
- `client/src/pages/novels/autoDirector/useAutoDirectorCreateController.ts`
- `client/src/api/novelWorkflow.ts`
- `server/src/services/novel/director/http/novelWorkflows.ts`
- `server/src/services/novel/workflow/NovelWorkflowApplicationService.ts`
- `server/src/services/task/adapters/NovelWorkflowTaskAdapter.ts`

## 来源文档

- [自动导演 Runtime 与恢复边界](./auto-director-runtime.md)
- [Task Center 只读职责](../product/task-center-role.md)
