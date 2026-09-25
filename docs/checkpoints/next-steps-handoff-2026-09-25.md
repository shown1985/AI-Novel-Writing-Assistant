# 本地接续开发指引（2026-09-25）

> 读者：在本机新开对话的开发者或 AI Agent。
> 用途：接手云端会话完成的收尾工作，知道下一步做什么、按什么顺序做、做到什么程度算完成。
> 开始前先读：根目录 `AGENTS.md`、`TASK.md`，以及本文件。

---

## 1. 当前状态（一句话）

所有有效代码都在分支 **`claude/confident-cori-w3ctnw`**（`f8018d32` 及之后），它包含 `main`、`beta` 和上游 `ExplosiveCoderflome/main`（桌面 0.4.28）的全部内容；全量测试 0 失败（服务端 fast 1427、integration 146、客户端 210），四个包类型检查通过。`main`、`beta` 尚未合入这些改动。

云端会话已完成（详情见 `TASK.md` 的“当前执行顺序”第 1～2d 项）：

- 进度审查与纠偏文档：`docs/checkpoints/codex-progress-audit-2026-09-24.md`
- 容器化热更开发环境：`pnpm docker:dev`（说明见 `docs/wiki/workflows/docker-dev-environment.md`）
- 修复 `main` 与上游自身的全部既有测试失败，其中包括真实缺陷（写法原作实体脱敏、拆书用量统计、旧项目迁移伏笔同步、提示词注册版本漂移、网络错误误判为空返回等）
- 合并上游 63 个提交并解决模型调用层冲突
- 拆分超限文件 `world.prompts.ts`、`promptRunner.ts`
- 落地三项产品决定：全书自动可关闭自动审校与修复；接管选定的章节范围在开始正文后保留为停止边界；确认流程依赖注入已排期

云端**没有做**、必须在本机完成的：删除远程旧分支、界面验收、真实模型运行、合并到 `beta`/`main`。

---

## 2. 下一步执行顺序

严格按顺序，每步完成后再进行下一步。

### 第 1 步：拉取分支并备份数据

```bash
git fetch origin
git checkout -B claude/confident-cori-w3ctnw origin/claude/confident-cori-w3ctnw
```

- **先备份数据库再启动**。本分支相对你本机可能运行过的版本新增了多次数据库迁移（本仓库的世界生成检查点，以及上游 09-04～09-22 的 12 个迁移）。备份方法见 `docs/checkpoints/user-acceptance-checklist.md` 开头“升级前先备份数据库”。
- `server/.backups/` 不得修改、删除或提交。

### 第 2 步：清理远程旧分支（一次性）

这 23 个分支的内容都已包含在本分支中（云端已逐个核对），PR 也已关闭：

```bash
git push origin --delete \
  codex/agent-runtime-control-plane codex/desktop-native-isolation codex/llm-selection-hydration \
  codex/macos-runtime-acceptance codex/macos-wgr-acceptance codex/opencode-glm-thinking-toggle \
  codex/opencode-header-transport-test codex/server-authoritative-task-selection \
  codex/world-assessment-score-contract codex/world-generation-budget-observability \
  codex/world-generation-budget-runtime codex/world-generation-opencode-capability \
  codex/world-generation-opencode-session codex/world-location-prompt-contract \
  codex/world-presentation-context-contract fix/world-generation-adaptive-retry \
  fix/world-generation-budget-preflight fix/world-generation-budget-telemetry \
  fix/world-generation-checkpoints fix/world-generation-prisma-harness \
  fix/world-generation-runtime fix/world-generation-staged mac
```

完成后远程只应保留 `main`、`beta` 和 `claude/confident-cori-w3ctnw`。

### 第 3 步：启动并做界面验收

```bash
pnpm docker:dev        # 推荐：容器热更，数据在独立卷中
# 或
pnpm install && pnpm dev
```

- 前端 `http://localhost:5173`，后端 `http://localhost:3000/api`。
- 按 `docs/checkpoints/user-acceptance-checklist.md` 逐项勾选（A～E 共 8 条）。
- 云端没有做浏览器验收，以下几处需要重点看：手机端“运行记录”筛选区（两行布局，640～767px 宽度也要看）、手机端“更多”菜单、“热门题材雷达”与 5 个设置子页在手机端无横向滚动。

### 第 4 步：真实模型连续运行 10 章（`TASK.md` P2-2）

- 在设置页配置一个默认模型供应商后，用自动导演从一句灵感开始，连续生成至少 10 章。
- 需要确认：局部质量问题只记录为质量债、不中断整本生产；中途停止服务再启动后能从源页面恢复，且不重复写已完成章节；“运行记录”只读显示状态。
- 结果写入 `docs/checkpoints/`（章节数、质量债数量、暂停次数与原因、是否重复写章、使用的模型）。

### 第 5 步：合入 `beta` → 验证 → 进入 `main`

项目规则要求功能分支先进 `beta`，验证后再进 `main`：

```bash
git checkout beta && git pull
git merge --no-ff origin/claude/confident-cori-w3ctnw
git push origin beta
```

在 `beta` 上重跑第 6 节的验证命令和第 3、4 步的关键项，通过后再把 `beta` 合入 `main`。桌面打包与发布遵守 `AGENTS.md` 的 Desktop Packaging Upload Rules（版本号与 `vX.Y.Z` 标签必须一致）。

合入 `beta` 后，从 `beta` 为下一项工作新建分支，并删除 `claude/confident-cori-w3ctnw`。

---

## 3. 之后的开发排期（按优先级）

每项一个独立分支，从 `beta` 切出，完成后合回 `beta`。

1. **确认流程改为显式依赖注入**（`TASK.md` 2b）
   - 范围：`server/src/services/novel/director/runtime/novelDirectorConfirmRuntime.ts` 直接引用的 `novelCreateResourceRecommendationService`、`writingPlatformProfileService`、`directorIssuePolicyService`、`novelFramingSuggestionService`，以及直接运行的 `writingPlatformRecommendationPrompt`。
   - 做法：并入构造函数已有的 `deps`，默认装配注入现有实例，不改变行为。
   - 验收：`novelDirectorConfirmDedup.test.js` 改用注入替身；全量测试无新增失败。
2. **降级资产同步的补偿同步**（`TASK.md` 2c，先设计后改代码）
   - 问题：资产同步标记为 `degraded` 的章节被视为已完成，之后没有任务再补抽取，该章角色状态、资源变化可能长期缺失。
   - 需先确定：补偿触发时机、幂等键、与质量债展示的关系；同时澄清统一资产抽取是否需要裁剪超出上限的条目（目前保留全部）。
3. **简易创建页是否传“战力体系偏好”**（`TASK.md` 2d 待定）：开书接口已支持该字段，页面未接入；属于新的产品/界面决定，先征求产品意见。

在 `docs/checkpoints/codex-progress-audit-2026-09-24.md` 第 6.2 节的“主线完成”六条标准满足之前，不开新的创作能力，也不为新模型供应商单独开条目。

---

## 4. 工作规则提醒

- **提交标题**必须以 `新增：`、`优化：` 或 `修复：` 开头，描述用户可感知的结果（上游合入 `AGENTS.md` 的新规则）。
- 有用户可见变化时同步更新 `docs/releases/release-notes.md` 和 `README.md` 的 `## 最新更新`（只保留最新日期块）；纯内部改动说明跳过原因。
- 产生稳定知识时更新 `docs/wiki/`，不要写成变更记录。
- 单文件超过 1300 行必须先拆分；修改 `PromptAsset.version` 时同步修改注册 key（`server/tests/promptRegistryKeys.test.js` 会检查）。
- 修测试的原则：测试过时就改测试，代码缺陷就修代码；不得跳过、删除测试或放宽断言。
- “运行记录”页只读，不放任何会改变任务状态的操作。

---

## 5. 已知限制与说明

- 云端的所有“测试通过”都基于临时 SQLite 库；没有真实模型调用，也没有浏览器验收。
- 合并上游前已推送的少量提交标题未采用 `新增/优化/修复` 前缀，未改写已推送历史。
- 上游 `main` 自身仍有 46 个失败测试；本分支已全部修复，如向上游回馈，可按提交逐个提 PR。

---

## 6. 验证命令

测试依赖已建表的数据库，使用临时库，不要指向真实数据：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @ai-novel/shared build
cd server
export DATABASE_URL="file:/tmp/ai-novel-test.db"
node node_modules/prisma/build/index.js generate --config prisma.config.ts
node node_modules/prisma/build/index.js db push --config prisma.config.ts
pnpm run build
node scripts/run-tests.cjs fast          # 期望 0 失败
node scripts/run-tests.cjs integration   # 期望 0 失败
cd ../client
bash -O globstar -c 'node --experimental-strip-types --test tests/*.test.js src/**/*.test.mjs'   # 期望 0 失败
```

`src/**` 需要开启 `globstar` 才会递归到子目录，否则只会跑到部分客户端测试。

---

## 7. 给本机新对话的开场提示（可直接粘贴）

```
这是 AI 小说写作系统仓库。请先阅读 AGENTS.md、TASK.md 和
docs/checkpoints/next-steps-handoff-2026-09-25.md，然后：
1. 确认当前在分支 claude/confident-cori-w3ctnw 且与 origin 同步；
2. 按指引第 2 节从“第 1 步”开始执行，每完成一步向我汇报结果；
3. 涉及删除分支、合并到 beta/main、数据库操作前先征求我确认；
4. 不开新功能，未在 TASK.md 中的事情先记录再问我。
```
