# R1-G02：独立发行版桌面版本线与数据隔离合同

## Backlog Refinement 结论

- Release / Epic：Release 1 / R1-RC 桌面发布候选。
- 父项：`R1-G02` 独立发行版桌面身份；父项不重复计点，也不作为一张混合实现卡进入 Sprint。
- 当前状态：**Refinement / Not Ready**。全部子卡等待下文 PO 开放问题答复后才可进入 Sprint；本合同只规划，不修改代码、配置或版本号。
- 背景：本仓库（`fork` = shown1985/AI-Novel-Writing-Assistant）是长期独立产品线，周期性把上游（`origin` = ExplosiveCoderflome，桌面产品 “Biz Novel Studio”，`0.4.x`，tag `vX.Y.Z`）合入 `beta`。PO 已决定独立发行版桌面使用**自己的版本号线**。当前 `desktop/package.json` 的 `0.4.28` 是上次同步继承的上游版本。
- 约束继承：G01 严格标签门不变——`desktop/package.json.version` 为稳定 `X.Y.Z`，公开 tag 严格为 `vX.Y.Z` 且与之相等；不引入 `-rc`、`desktop-v*` 或分支名版本。

## 一、现状：两个安装共享了什么

以下身份字段目前与上游完全相同。上游与本发行版同时安装时，二者会互相覆盖安装位置、读写同一份 SQLite，并且本发行版的自动更新会拉取上游安装包。

| 共享项 | 当前值 | 位置 | 后果 |
| --- | --- | --- | --- |
| 用户数据目录名 | `AI-Novel-Writing-Assistant-v2` | `desktop/src/runtime/paths.ts:5`（解析 `:32-58`），`server/src/runtime/appPaths.ts:6` | Windows `%LOCALAPPDATA%\AI-Novel-Writing-Assistant-v2`、macOS `~/Library/Application Support/AI-Novel-Writing-Assistant-v2` 被两个应用共用 |
| userData 挂载 | `app.setPath("userData", resolveDesktopAppDataDir())` | `desktop/src/main.ts:630` | 单实例锁 `desktop/src/main.ts:635` 也落在同一目录，两个应用无法同时启动 |
| SQLite 与附属数据 | `<数据目录>/data/dev.db`，生成图片 `storage/generated-images`，日志 `logs` | `desktop/src/runtime/dataImport.ts:8,59,63`；`desktop/src/runtime/server.ts:17,245`；`server/src/runtime/appPaths.ts:51,57,63` | 同一本小说库被两个不同 schema 演进的应用交替迁移，存在迁移漂移与数据损坏风险 |
| appId / Windows AUMID | `com.ai-novel.desktop` | `desktop/electron-builder.config.cjs:79`；`desktop/src/main.ts:33,631` | NSIS 安装/卸载登记与 macOS Bundle ID 相同，后装的应用覆盖或冒充先装的应用 |
| productName | `Biz Novel Studio` | `desktop/package.json:8`；`desktop/electron-builder.config.cjs:80`；窗口文案 `desktop/src/main.ts:341,360` | 安装目录、`.app` 名、产物文件名（`${productName}-${version}-…`）相同 |
| 发布 / 更新目标 | owner 默认 `ExplosiveCoderflome` | `desktop/electron-builder.config.cjs:15-16,128-135`；`desktop/scripts/stage-desktop.cjs:62-63`（写入 `app-update.yml`）；`.github/workflows/desktop-release.yml:67-68`；`.github/workflows/desktop-beta-release.yml:17-18` | 本发行版安装包会从上游 Release 检查并安装更新，被上游版本替换 |
| 更新缓存目录 | `ai-novel-writing-assistant-v2-updater` | `desktop/scripts/stage-desktop.cjs:70` | 两个应用的下载缓存互相污染 |
| 发布推送 remote | 默认 `origin` / `main` | `scripts/trigger-desktop-release.cjs:10-11` | 按默认参数执行会把本发行版 tag 推到上游仓库 |
| 版本 / tag 命名空间 | `0.4.28`，本地已有上游 `v0.4.24…v0.4.28` 等 71 个 tag | `desktop/package.json:3`；`git fetch origin` 带入 | 本发行版若沿用 `0.4.x`，版本和 tag 会与上游直接碰撞 |

## 二、版本号线决定建议

**推荐方案 A：独立发行版从 major 1 起步，Release 1 GA = `1.0.0`，之后按 semver 递增。**

- 满足严格标签门：`desktop/package.json` 为稳定 `1.Y.Z`，tag 严格为 `v1.Y.Z`，G01 审计与 workflow guard 无需放宽。
- 与上游 `0.x` 在同一本地 tag 命名空间中不重叠；electron-updater 视 `1.0.0` 为高于任何 `0.4.x` 的版本。
- 残余风险：上游将来也可能发布 `1.x`。因此版本线之外必须加碰撞门（G02a）：推送前若 `vX.Y.Z` 已存在于本地 tag 或 `origin` 远端，发布脚本拒绝执行；PO 届时决定跳号。
- GA 前候选不打公开 tag：候选 SHA 可预先把版本设为 `1.0.0`，但只通过 G01 已允许的无上传验证运行留证；公开发布失败后按既有规则继续 bump 到 `1.0.1`，不复用 tag。

备选方案 B：跳到明显更高的 major（如 `10.0.0`）以“永久”避开上游。碰撞概率更低，但对新手用户显得随意、无法说明含义，且碰撞门仍然需要。因此不推荐。

**fork tag 只推向 `fork`：** 发布脚本默认 remote 改为 `fork`，并拒绝向 URL 指向上游仓库的 remote 推送；只推送单个 `vX.Y.Z`，禁止 `git push --tags`。这样本地从 `origin` 获得的上游 tag 不会被转推到 fork 触发发布。另外，fork 仓库的 `v*` 触发 guard 要求 major ≥ 1，即便误推上游 `v0.x` tag 也不能发布。可选的本地卫生做法是把上游 tag 取到独立命名空间（`remote.origin.tagOpt=--no-tags` 加 `+refs/tags/*:refs/tags/upstream/*`）；这属于个人 clone 配置，只写入 Wiki 建议，不作为仓库强制。

## 三、上游合并规则

每次上游同步，以下字段**必须保留本发行版的值**，上游侧改动一律视为冲突并丢弃：`desktop/package.json` 的 `version`、`productName`、`description`/`author` 中的品牌文字；`electron-builder.config.cjs` 的 `appId`、`productName`、publish owner/repo 默认值；`stage-desktop.cjs` 的 owner/repo 与更新缓存目录名；两个桌面 workflow 的 `AI_NOVEL_GITHUB_OWNER/REPO`；`paths.ts`/`appPaths.ts` 的数据目录名；`main.ts` 的 AUMID 与窗口品牌文案。

执行方式不靠记忆：在既有 `scripts/release/r1-03-static-gate-audit.cjs` 中增加 `FORK-VERSION-LINE`、`FORK-PUBLISH-TARGET`、`FORK-DESKTOP-IDENTITY` 三个 finding。上游同步的验证清单要求 `--strict` 运行结果中这三项不得为 `BLOCKED`；任何一项被上游值覆盖，同步分支不能合入 `beta`。规则已写入 [上游同步流程](../wiki/workflows/upstream-sync.md)。

## 四、身份拆分与数据迁移立场

- 拆分目标：新 appId、新 productName、新数据目录名（同时替换 `paths.ts` 和 `appPaths.ts`，二者必须一致）、新 AUMID、新更新缓存目录。具体取值依赖 PO 的品牌决定，本合同使用占位符 `<FORK_PRODUCT_NAME>`、`<FORK_APP_ID>`、`<FORK_DATA_DIR>`，不预设品牌。
- 旧目录 `AI-Novel-Writing-Assistant-v2` **永远不移动、不改名、不删除**。它可能同时属于上游安装和本发行版的早期本地构建。
- 首次启动时，如果新数据目录没有数据库而旧目录存在 `data/dev.db`，应用给出显式引导，由用户选择“从旧版本复制我的小说数据”或“从空白开始”。只有在用户明确确认后才复制：先在新目录下 `backups/` 记录备份，再**复制**（不是移动）数据库组（`dev.db`、`-wal`、`-shm`），然后校验文件存在性和大小，最后运行既有运行时迁移。复用 `desktop/src/runtime/dataImport.ts` 已有的备份加复制链路，不新写第二套导入器。
- 复制后两份数据各自演进。引导文案必须直接告诉用户：旧应用里的内容保持不变，之后在新应用中写的内容不会回到旧应用。
- 不做跨 appId 的原地自动升级：本发行版 `1.0.0` 为全新安装，可与旧安装并存，由用户自行卸载旧安装。`AI_NOVEL_APP_DATA_DIR` 覆盖入口保持不变，作为高级用户的逃生通道。

## R1-G02a 独立版本线与 tag 碰撞门（3 点）

- 状态 / 依赖：Refinement / Not Ready；等待开放问题 4。依赖 G01a/G01b 已合入的严格标签门。
- 用户价值：本发行版的安装包版本不会与上游混淆，也不会误把 tag 推到上游或把上游 tag 发成本发行版。
- 文件边界：`.github/workflows/desktop-release.yml`（validate guard 增加 major ≥ 1）、`scripts/trigger-desktop-release.cjs`（默认 remote 为 `fork`、拒绝上游 URL、碰撞检查、单 tag 推送）、`scripts/release/r1-03-static-gate-audit.cjs`（`FORK-VERSION-LINE`）、新增 `scripts/release/r1-g02a-fork-version-line.test.cjs`。`r1-g01a-release-trigger.test.cjs` 只允许把正例 fixture 改为 major ≥ 1 的版本，其余断言保留。不改 `desktop/package.json`。
- 验收条件：
  1. `v0.Y.Z` push tag 在 fork workflow 中只能走无上传验证；`v1.Y.Z` 等于包版本时才放行；G01 的 `desktop-v*`、`-rc`、手动触发负例仍然成立。
  2. 发布脚本在 dry-run 中拒绝：remote URL 指向上游、tag 已在本地存在、tag 已在 `origin` 远端存在。
  3. 包版本 major 为 0 时审计把 `FORK-VERSION-LINE` 标为 `REVIEW`（继承的上游版本线），guard 缺失时标为 `BLOCKED`。
- 最窄验证：`node --check` 两个脚本；`node --test scripts/release/r1-g01a-release-trigger.test.cjs scripts/release/r1-g01b-macos-candidate.test.cjs scripts/release/r1-g02a-fork-version-line.test.cjs`；`node scripts/release/r1-03-static-gate-audit.cjs --strict`，按 finding ID 对账。不创建或推送 tag，不包装、不上传。
- 非范围：把版本 bump 到 `1.0.0`（属于 R1-RC 发布卡，需 PO 批准）、beta 通道、身份字段。

## R1-G02b 发布与自动更新目标指向本发行版（3 点）

- 状态 / 依赖：Refinement / Not Ready；依赖 G02a（先有 major 门，再切换可写的发布目标，避免上游 `v0.4.x` tag 在 fork 被发布）。
- 用户价值：本发行版用户只收到本发行版的更新，不会被上游安装包替换。
- 文件边界：`desktop/electron-builder.config.cjs`（owner/repo 默认值）、`desktop/scripts/stage-desktop.cjs`（`app-update.yml` owner/repo）、`.github/workflows/desktop-release.yml` 与 `.github/workflows/desktop-beta-release.yml` 的 owner/repo env、审计器 `FORK-PUBLISH-TARGET`、新增 `scripts/release/r1-g02b-fork-publish-target.test.cjs`。
- 验收条件：四处 owner 均为 `shown1985`，repo 一致；审计在任一处回到上游 owner 时报 `BLOCKED`；beta workflow 也不得指向上游。
- 最窄验证：`node --test` 本卡测试与 G01/G02a 测试；审计 `--strict`。不运行 `stage`/`dist`/`publish`。
- 非范围：签名、真实 Release、身份字段、更新 UI。

## R1-G02c 桌面身份拆分：appId、productName、数据目录（5 点）

- 状态 / 依赖：Refinement / Not Ready；等待开放问题 1-3；依赖 G02b。**必须与 G02d 同批进入 beta**，否则已有本发行版数据的用户升级后会看到空库。
- 用户价值：同时安装上游与本发行版时，两边的小说数据、安装位置和更新缓存完全隔离。
- 文件边界：`desktop/package.json` 的 `productName`/`description`/`author`（不改 `version`）、`desktop/electron-builder.config.cjs` 的 `appId`/`productName`、`desktop/src/main.ts` 的 AUMID 与品牌文案、`desktop/src/runtime/paths.ts`、`server/src/runtime/appPaths.ts`、`stage-desktop.cjs` 更新缓存目录名、审计器 `FORK-DESKTOP-IDENTITY` 与路径单元测试。
- 验收条件：
  1. 两处数据目录名一致且不等于 `AI-Novel-Writing-Assistant-v2`；appId、AUMID、productName、更新缓存目录都不等于上游值。
  2. `AI_NOVEL_APP_DATA_DIR` 与 portable 路径优先级不变。
  3. 审计在任一字段回到上游值或两处目录名不一致时报 `BLOCKED`。
- 最窄验证：路径解析单元测试（Windows/macOS/portable/显式覆盖）、`pnpm --filter @ai-novel/desktop typecheck` 与 server 定向 typecheck、审计 `--strict`。UI 验收交给用户。
- 非范围：旧数据复制（G02d）、图标重绘、官网与 README 品牌替换。

## R1-G02d 旧数据目录显式复制引导（5 点）

- 状态 / 依赖：Refinement / Not Ready；等待开放问题 5；与 G02c 同批。
- 用户价值：已有小说的用户在新应用首次启动时，按一步引导安全带走自己的书，旧数据原样保留。
- 文件边界：`desktop/src/runtime/dataImport.ts`（增加旧目录探测入口，复用已有的备份加复制）、首次启动引导所在的 desktop 主进程与启动页、定向测试。
- 验收条件：
  1. 仅当新目录无数据库且旧目录有 `data/dev.db` 时出现引导；默认不复制，必须经用户点击确认。
  2. 复制前完成备份，复制后校验文件存在性和大小，失败时新目录回到空白状态并提示，旧目录任何文件的 mtime 和内容都不变。
  3. 文案按 UI Copy Rules 面向用户说明两份数据此后独立，不出现“迁回/升级为”之类的过程叙述。
- 最窄验证：临时目录中的单元测试，覆盖有旧库、无旧库、拒绝、复制失败、WAL 组完整性和旧目录只读断言。绝不指向真实用户目录。
- 非范围：生成图片复制（G02e）、双向同步、删除或改名旧目录。

## R1-G02e 旧目录生成图片复制（2 点）

- 状态 / 依赖：Refinement / Not Ready；等待开放问题 6；依赖 G02d。
- 内容：在用户同意的同一次复制中，把 `storage/generated-images` 一并复制到新目录，并做失败回滚与只读断言；不复制日志。
- 验证：临时目录单元测试。非范围：图片去重和压缩。

## R1-G02f 品牌与身份取值决定（1 点，PO）

- 状态：Not Ready；PO / 根集成人。
- 决定内容：开放问题 1-3 的最终取值，写回本合同第四节占位符。验收：本合同、Roadmap 与 G02c 取值一致，`git diff --check` 通过。

## PO 开放问题

1. 本发行版显示名称（productName / 窗口标题 / 产物名）：当前占位 `<FORK_PRODUCT_NAME>`。推荐默认：由 PO 命名，不沿用 “Biz Novel Studio”；未答复前 G02c 保持 Not Ready，不使用临时品牌上线。
2. appId：推荐 `io.github.shown1985.<slug>`，其中 `<slug>` 来自问题 1。
3. 数据目录名：推荐与 `<slug>` 同名的新目录，永不复用 `AI-Novel-Writing-Assistant-v2`。
4. 版本起点：推荐 Release 1 GA = `1.0.0`，GA 前不打公开 tag。
5. 旧数据处理：推荐“首次启动显式引导 + 先备份 + 复制不移动”；备选是只保留既有手动导入入口，不主动提示。
6. 生成图片是否随引导一并复制：推荐是（G02e），若压缩 Sprint 容量可延后。

## 依赖与进入 Sprint 规则

```text
R1-G02f 品牌与取值决定（PO）
R1-G02a 版本线与碰撞门（3）
  └─ R1-G02b 发布/更新目标（3）
       └─ R1-G02c 身份拆分（5）══ 同批 ══ R1-G02d 旧数据复制引导（5）
                                            └─ R1-G02e 生成图片复制（2）
```

- G02a/G02b 与 G01 共用 workflow 和审计器，必须串行，一个 Agent 只持有一张卡。
- G02c 与 G02d 可由两名 owner 分别实现，但必须同批合入 beta 并联合验收。
- 所有卡只做静态审计和单元测试；包装、签名、打 tag 与上传属于 R1-RC 发布阶段。

## 文档与发布记录判断

本合同只做规划，不改变任何用户可见行为，因此不更新 README 或 release notes。G02c/G02d 实现后，用户会看到新的应用名称和首次启动引导，届时需要更新发布记录，并把“fork 身份字段与数据目录隔离”的长期规则补入 [桌面版本号与发布标识规则](../wiki/workflows/desktop-release-versioning.md)。
