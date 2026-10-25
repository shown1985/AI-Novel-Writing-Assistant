# 创作入口模型选择修复边界

## 用户价值与证据

用户在顶部选择模型后，新发起的创作应使用该模型。创作工作室与短篇调用没有传递厂商和模型，导致规划、正文、审校与修复采用任务路由。长篇交接直接调用导演确认服务，也绕过了命令入口的当前选择解析。

## 范围（5 点）

1. 创作工作室理解、重生成、替换方向与派生入口，在服务端捕获当前模型身份，交给该次动作的 Prompt 和创作底座推荐。
2. 确认创作时捕获模型身份；短篇保存到任务 seed，长篇显式传给导演交接，原导演与新版导演都使用该身份。新版导演开 run 时把它冻结为本次创作的模型配置。
3. 短篇生产的计划、正文、审校与修复读取同一任务快照。
4. 显式重试、修订预览与确认修订使用动作发生时的选择；后台恢复保留已存快照。
5. 无当前选择或旧任务无快照时保留既有路由行为；使用隔离测试验证模型来源与恢复边界。

## 非范围

- 不修改全局 factory 的模型路由优先级，不批量改写任务路由或历史任务。
- 不调整各阶段温度、输出预算、结构化安全约束或备用模型策略。
- 不增加模型管理 UI、数据库字段或迁移，不修订后台恢复的其他状态规则。

## 依赖与文件边界

- 当前选择事实源：`LLMSelectionSettingsService`。模型身份仅包含 provider/model；解析与捕获复用该服务。
- 实现：`CreationStudioService`、`ShortStoryProductionService`、`ShortStoryStudioService`。
- 测试：独立模型选择回归文件。数据库与 LLM 均使用替身，禁止访问用户库或实际供应商。
- 文档：短篇模块边界、模型选择 wiki、发布说明。客户端和 Prompt 资产保持既有合同。

## 验收条件

- 顶部选择与路由配置不同时，新创作动作与底座推荐采用顶部选择。
- 确认后保存的短篇任务与长篇交接都携带所选模型身份；新版导演新建的 run 冻结同一模型，后续步骤不回读顶部选择。
- 后台任务执行中切换顶部模型，不改变该次生产剩余步骤的模型；恢复消费保存的快照。
- 显式重试更新模型快照，保留任务创作意图和既有正文；当前模型读取失败时不得悄悄采用另一模型。
- 无快照的旧任务兼容既有路由；默认值与 malformed seed 的处理有验证。
- 各阶段温度与 Token 预算保持原有策略。

## 最窄验证与验收状态

服务端 TypeScript 构建；隔离行为回归；已有模型来源和短篇合同测试。独立 QA 检查上述条件与失败、恢复证据。页面交互由用户验收，不默认运行浏览器测试。修复分支阶段提交后保持待集成，未经请求不晋级 beta/main 或推送。

### 本阶段验证

- `pnpm --filter @ai-novel/shared build`、服务端类型检查与 `pnpm --filter @ai-novel/server build` 通过；后续复用该构建。
- `node --test server/tests/creationModelSelection.test.js`：19 项隔离行为测试通过，含新版导演交接场景。
- `node --test server/tests/directorNext/steps/newBookSelectedModel.test.js`：2 项通过，覆盖确认时捕获的模型写入 run 合同、无捕获入口沿用顶部选择。
- `node --test server/tests/modelCatalog.test.js server/tests/settingsModelCatalog.test.js`：8 项目录读取回归通过。
- `node --test server/tests/modelRouter.test.js server/tests/modelSelectionProvenance.test.js server/tests/novelWorldModelSelection.test.js server/tests/shortStoryWorkflowContracts.test.js`：29 项相关回归通过。
- `pnpm --filter @ai-novel/server test:quality`：613 项中 611 项通过、2 项跳过、0 失败。
- 测试未访问用户数据库或实际供应商，均使用替身或临时库。恢复证据覆盖生产任务的保存快照；异步修订通过捕获身份保证本次执行一致，既有修订重启机制未扩展。
- 页面交互留给用户验收；未运行浏览器、完整测试套件或桌面打包。
