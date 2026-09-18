# S2-03b：来源现场推荐动作与反馈完成证据

## Story 合同

- Release：Release 1 单机成书版。
- Sprint：R1-S2E。
- 用户价值：作者在当前小说页看到推荐动作的影响范围，提交时获得原位反馈，并在失败后继续从同一创作现场恢复。
- 点数：3。
- 状态：Done。
- 依赖：S2-03a、S2-01b 已完成。
- Owner：单书交互；共享 API、任务类型和服务端策略未改动。

## 范围与非范围

本卡把 S2-03a 的只读 `SingleBookDisplayModel.primaryAction` 接到既有来源页命令。桌面与移动端共用同一动作面板、身份校验、pending lock 和反馈状态；任务抽屉不再复制书级投影主动作。

本卡没有新增 continue/recovery API，没有修改自动导演 issue policy，没有给 Creative Hub 或运行记录增加任务写操作，也没有用动作 label、关键词或正则决定命令。

## 行为结果

1. 执行前同时校验当前小说、书级投影、最近导演任务、action target 与 command payload 的小说/任务身份；任一不一致即不产生命令。
2. `continue` 和 `auto_execute_range` 复用既有 `continueNovelWorkflow`；确认候选、打开章节、质量修复、详情与普通导航继续走已有来源页入口。
3. 同一作品同一请求的 pending lock 拒绝第二次提交；切书允许新作品建立自己的锁，旧书 settled 不释放或覆盖新书状态。
4. mutation 接收后先失效并等待当前作品的任务、书级投影、任务详情与运行记录查询，再显示“请求已提交，已重新读取本书最新任务状态”。该反馈不宣称后台步骤完成。
5. API 错误在动作原位显示，并保留输入与已保存成果说明；刷新重新读取服务端投影，本地 pending 不作为成功事实。
6. 桌面与移动端共用 `SingleBookPrimaryActionPanel`；任务抽屉只展示进度、产物、排查与来源导航，不渲染 `bookAutomationProjection.primaryAction`。

## 自动验证

- `pnpm --filter @ai-novel/client typecheck`：通过。
- 41/41 定向行为检查通过：动作身份与类型映射、同书防重、跨书锁、03a 展示矩阵、A → B → A 会话隔离、workflow params、来源导航与 presentation 装配。
- `git diff --check`：通过。

## Computer Use 验收

验收使用 `/tmp/ai-novel-s2-03b.pPO9UP/ui.db` 隔离 SQLite 副本和本地 `127.0.0.1` 前后端，不写用户数据库。隔离小说与任务为 `ui-s2-03b-novel` / `ui-s2-03b-task`；没有真实模型调用。

- 桌面：来源页顶部显示“建议下一步：确认并继续”、服务端原因、当前任务影响范围与“已保存正文会保留”；执行详情抽屉不显示第二个书级投影主动作，并直接说明继续或恢复应回到当前创作页面。
- 400×800：移动端显示与桌面相同的推荐解释、影响范围和动作，没有出现横向溢出或嵌套抽屉。
- 真实提交：点击移动端推荐动作后，服务端只收到一次 `POST /api/novel-workflows/ui-s2-03b-task/continue`，响应为 202；动作原位显示“请求已提交，已重新读取本书最新任务状态”。
- 后台失败：隔离夹具因缺少导演恢复上下文进入可恢复失败；页面保留“已保存正文 0 章”，重新读取正式投影并给出“从进度点继续”，未把 HTTP 202 误报成业务完成。

## 文档与发布判断

动作身份、锁、正式投影回读和运行记录边界是长期维护规则，已更新单书工作台 application Wiki。该能力对用户可见，需要更新 Release Notes 与 README 最新摘要。
