# R1-G02：独立发行版桌面版本线与数据隔离合同

## Backlog Refinement 结论

- Release / Epic：Release 1 / R1-RC 桌面发布候选。
- 父项：`R1-G02` 独立发行版桌面身份；父项不重复计点，也不作为一张混合实现卡进入 Sprint。
- 当前状态：PO 已于 2026-09-25 答复全部开放问题，`R1-G02f` Done。`R1-G02a`、`R1-G02b` 为 **Ready-candidate**，已规划进 [R1-S3K](./r1-s3k-sprint-commitment.md)，须先通过独立 DoR。`R1-G02c/d/e` 取值已确定，但仍为 **Refinement**，不在 S3K。
- 背景：本仓库（`fork` = shown1985/AI-Novel-Writing-Assistant）是长期独立产品线，周期性把上游（`origin` = ExplosiveCoderflome，桌面产品 “Biz Novel Studio”，`0.4.x`，tag `vX.Y.Z`）合入 `beta`。独立发行版的桌面应用使用**自己的版本号线**。当前 `desktop/package.json` 的 `0.4.28` 是上次同步继承的上游版本。
- 约束继承：G01 严格标签门不变——`desktop/package.json.version` 为稳定 `X.Y.Z`，公开 tag 严格为 `vX.Y.Z` 且与之相等；不引入 `-rc`、`desktop-v*` 或分支名版本。

### 为什么“上游会覆盖本地”（面向 Owner 的说明）

这里说的覆盖**与 git 合并无关**。git 合并由我们在同步分支上逐项处理冲突，本地代码不会被悄悄替换。风险来自**已经装在用户电脑上的桌面应用**，有两条独立路径：

1. **自动更新器**：桌面应用启动后会按安装包里写死的 GitHub 仓库地址检查新版本。当前地址指向上游仓库，因此用户装的本发行版一旦检测到上游发布了更高版本，就会下载并安装上游安装包，本发行版随之被替换。G02a/G02b 负责解决这一条。
2. **共用数据目录**：两个应用使用同一个数据目录名和同一个 appId，所以用户电脑上的小说库（SQLite）、生成图片和安装登记是同一份。同时安装两者时，两个应用会交替读写、迁移同一本库。G02c/d/e 负责解决这一条。

## PO 决定（2026-09-25）

| 问题 | 决定 |
| --- | --- |
| Q1 显示名称 | `Biz Novel Studio Next`：保留现有品牌并稍作区分；GA 前仍可更名 |
| Q2 appId | `io.github.shown1985.biz-novel-studio-next` |
| Q3 数据目录名 | `biz-novel-studio-next`；永不复用 `AI-Novel-Writing-Assistant-v2` |
| Q4 版本线 | 独立发行版从 major 1 起步；公开 tag 从 Release 1 GA 的 `v1.0.0` 开始，GA 前不打任何公开 tag |
| Q5 旧数据 | 首次启动显式引导，用户确认后先备份，再复制（不移动） |
| Q6 生成图片 | 一并复制（G02e） |

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
| beta 预发布上传 | `workflow_dispatch` 与 `desktop-beta-v*` 均可触发，`contents: write`，无版本门 | `.github/workflows/desktop-beta-release.yml:3-10` | electron-builder 以 `v${version}` 创建预发布；在 fork 中运行会在 GA 前生成 `v0.4.28` 等 tag，违反 Q4 |
| 更新缓存目录 | `ai-novel-writing-assistant-v2-updater` | `desktop/scripts/stage-desktop.cjs:70` | 两个应用的下载缓存互相污染 |
| 发布推送 remote | 默认 `origin` / `main` | `scripts/trigger-desktop-release.cjs:10-11` | 按默认参数执行会把本发行版 tag 推到上游仓库 |
| 版本 / tag 命名空间 | `0.4.28`，本地已有上游 `v0.4.24…v0.4.28` 等 tag | `desktop/package.json:3`；`git fetch origin` 带入 | 本发行版若沿用 `0.4.x`，版本和 tag 会与上游直接碰撞 |

## 二、版本号线（Q4 已决定）

**独立发行版从 major 1 起步，Release 1 GA = `1.0.0`，之后按 semver 递增。**

- 满足严格标签门：`desktop/package.json` 为稳定 `1.Y.Z`，tag 严格为 `v1.Y.Z`，G01 审计与 workflow guard 无需放宽。
- 与上游 `0.x` 在同一本地 tag 命名空间中不重叠；electron-updater 视 `1.0.0` 为高于任何 `0.4.x` 的版本。
- 残余风险：上游将来也可能发布 `1.x`。因此版本线之外必须加碰撞门（G02a）：推送前若 `vX.Y.Z` 已存在于本地 tag 或 `origin` 远端，发布脚本拒绝执行；PO 届时决定跳号。
- GA 前不打公开 tag：候选 SHA 可预先把版本设为 `1.0.0`，但只通过 G01 已允许的无上传验证运行留证。版本 bump 属于 R1-RC 发布卡，不在 G02。公开发布失败后按既有规则继续 bump 到 `1.0.1`，不复用 tag。
- 曾考虑的备选：跳到 `10.0.0` 等高 major。对新手用户显得随意，且碰撞门仍然需要，因此不采用。

**fork tag 只推向 `fork`：** 发布脚本默认 remote 改为 `fork`，并拒绝向 URL 指向上游仓库的 remote 推送；只推送单个 `vX.Y.Z`，禁止 `git push --tags`。这样本地从 `origin` 获得的上游 tag 不会被转推到 fork 触发发布。另外，fork 仓库的 `v*` 触发 guard 要求 major ≥ 1，即便误推上游 `v0.x` tag 也不能发布。可选的本地卫生做法是把上游 tag 取到独立命名空间（`remote.origin.tagOpt=--no-tags` 加 `+refs/tags/*:refs/tags/upstream/*`）；这属于个人 clone 配置，只写入 Wiki 建议，不作为仓库强制。

## 三、上游合并规则

每次上游同步，以下字段**必须保留本发行版的值**，上游侧改动一律视为冲突并丢弃：`desktop/package.json` 的 `version`、`productName`、`description`/`author` 中的品牌文字；`electron-builder.config.cjs` 的 `appId`、`productName`、publish owner/repo 默认值；`stage-desktop.cjs` 的 owner/repo 与更新缓存目录名；两个桌面 workflow 的 `AI_NOVEL_GITHUB_OWNER/REPO` 与 beta 无上传状态；`paths.ts`/`appPaths.ts` 的数据目录名；`main.ts` 的 AUMID 与窗口品牌文案。

执行方式不靠记忆：在既有 `scripts/release/r1-03-static-gate-audit.cjs` 中增加 `FORK-VERSION-LINE`（G02a）、`FORK-PUBLISH-TARGET`（G02b）、`FORK-DESKTOP-IDENTITY`（G02c）三个 finding。上游同步的验证清单要求 `--strict` 运行结果中这三项不得为 `BLOCKED`；任何一项被上游值覆盖，同步分支不能合入 `beta`。规则已写入 [上游同步流程](../wiki/workflows/upstream-sync.md)。

## 四、身份拆分与数据迁移立场

- 拆分取值（Q1-Q3）：productName `Biz Novel Studio Next`；appId 与 Windows AUMID `io.github.shown1985.biz-novel-studio-next`；数据目录名 `biz-novel-studio-next`（同时替换 `paths.ts` 和 `appPaths.ts`，二者必须一致）；更新缓存目录 `biz-novel-studio-next-updater`。由于显示名称在 GA 前仍可能更改，G02c 应把名称集中在最少的常量处，审计只断言“不等于上游值且各处一致”，更名时不必重写审计规则。
- 旧目录 `AI-Novel-Writing-Assistant-v2` **永远不移动、不改名、不删除**。它可能同时属于上游安装和本发行版的早期本地构建。
- 首次启动时，如果 `biz-novel-studio-next` 中没有数据库而旧目录存在 `data/dev.db`，应用给出显式引导，由用户选择“从旧版本复制我的小说数据”或“从空白开始”。只有在用户明确确认后才复制：先在新目录下 `backups/` 记录备份，再**复制**（不是移动）数据库组（`dev.db`、`-wal`、`-shm`）与 `storage/generated-images`，然后校验文件存在性和大小，最后运行既有运行时迁移。复用 `desktop/src/runtime/dataImport.ts` 已有的备份加复制链路，不新写第二套导入器。
- 复制后两份数据各自演进。引导文案必须直接告诉用户：旧应用里的内容保持不变，之后在新应用中写的内容不会回到旧应用。
- 不做跨 appId 的原地自动升级：本发行版 `1.0.0` 为全新安装，可与旧安装并存，由用户自行卸载旧安装。`AI_NOVEL_APP_DATA_DIR` 覆盖入口保持不变，作为高级用户的逃生通道。

## R1-G02a 独立版本线与 tag 碰撞门（3 点）

- 状态 / Owner / 依赖：**Ready-candidate**（待独立 DoR）；优先级 P0；R1-S3K 唯一发布脚本工程师；依赖已合入 beta 的 G01a/G01b。
- 用户价值：本发行版的安装包版本不会与上游混淆，不会误把 tag 推到上游，也不会把上游 tag 当成本发行版发布。
- 生产文件边界（独占）：`.github/workflows/desktop-release.yml` 仅 `validate-release` 的 guard 步骤；`scripts/trigger-desktop-release.cjs`；`scripts/release/r1-03-static-gate-audit.cjs` 新增 `FORK-VERSION-LINE`，既有 finding 语义不变。
- 测试文件边界：新增 `scripts/release/r1-g02a-fork-version-line.test.cjs`；`scripts/release/r1-g01a-release-trigger.test.cjs` 只允许让 guard 在临时目录中读取 major ≥ 1 的 fixture `desktop/package.json` 来完成正例，其余断言原样保留。不改 `desktop/package.json`、builder、stage 脚本或 beta workflow。

### 验收条件

1. guard 在“严格 `vX.Y.Z` 且等于包版本”之外再要求 major ≥ 1；`v0.Y.Z` push tag（包括与当前 `0.4.28` 相等的 tag）只输出 `allowed=false`。审计器现有的 guard 文本检查继续成立，`PUBLIC-RELEASE-TRIGGER` 与 `MACOS-WORKFLOW` 保持 PASS。
2. 发布脚本默认 remote 为 `fork`；remote URL 指向 `ExplosiveCoderflome/AI-Novel-Writing-Assistant` 时拒绝；tag 已在本地存在或已在 `origin` 远端存在时拒绝；major 为 0 时拒绝；只推送单个 tag，不使用 `--tags`。拒绝都发生在 dry-run 阶段之前或期间，dry-run 不写任何 ref。
3. 审计 `FORK-VERSION-LINE`：guard 缺少 major 门或脚本默认 remote 不是 `fork` 时为 `BLOCKED`；包版本 major 为 0（继承上游版本线）时为 `REVIEW`；major ≥ 1 时为 `PASS`。
4. G01a 的 `desktop-v*`、`-rc1`、版本不符、手动触发负例和三 job 白名单全部保留且通过。

### 最窄验证与非范围

- 验证：`node --check scripts/trigger-desktop-release.cjs scripts/release/r1-03-static-gate-audit.cjs`；`node --test scripts/release/r1-g01a-release-trigger.test.cjs scripts/release/r1-g01b-macos-candidate.test.cjs scripts/release/r1-g02a-fork-version-line.test.cjs`。发布脚本测试只使用临时 git 仓库和本地 bare remote，不访问网络。最后运行 `node scripts/release/r1-03-static-gate-audit.cjs --strict`，按 finding ID 对账，预期新增 `FORK-VERSION-LINE=REVIEW`。
- 非范围：把版本 bump 到 `1.0.0`；创建、推送或删除任何 tag；运行包装、签名或上传；运行真实 Actions；修改发布 owner、beta workflow 或身份字段。

## R1-G02b 发布与自动更新目标指向本发行版（3 点）

- 状态 / Owner / 依赖：**Ready-candidate**（待独立 DoR）；优先级 P0；与 G02a 同一名工程师，在 G02a 自检通过后开始。先有 major 门，再切换可写的发布目标，避免上游 `v0.4.x` tag 在 fork 被发布。
- 用户价值：本发行版用户只从本发行版仓库接收更新，不会被上游安装包替换；GA 前 fork 不会产生任何公开预发布 tag。
- 生产文件边界（独占）：`desktop/electron-builder.config.cjs` 仅 owner/repo 默认值；`desktop/scripts/stage-desktop.cjs` 仅 `app-update.yml` 的 owner/repo 默认值；`.github/workflows/desktop-release.yml` 仅 `publish-release` 的 owner/repo env；`.github/workflows/desktop-beta-release.yml`；`scripts/release/r1-03-static-gate-audit.cjs` 新增 `FORK-PUBLISH-TARGET`。
- 测试文件边界：新增 `scripts/release/r1-g02b-fork-publish-target.test.cjs`。

### 验收条件

1. builder 默认值、stage 默认值、公开发布 job env、beta workflow env 四处 owner/repo 均为 `shown1985/AI-Novel-Writing-Assistant`。
2. beta workflow 在 fork 中变为只验证、不上传：workflow 级与 job 级权限为 `contents: read`，不调用 `publish:desktop:beta` 或任何 `--publish`，保留构建、迁移与包装布局校验步骤。不新增 workflow。
3. 审计 `FORK-PUBLISH-TARGET`：任一处 owner 回到上游、owner/repo 不一致、beta workflow 恢复写权限或上传步骤时为 `BLOCKED`，否则 `PASS`。聚焦测试对每一种回退做突变断言。
4. `PUBLIC-RELEASE-TRIGGER`、`MACOS-WORKFLOW`、`FORK-VERSION-LINE` 状态不退化；Windows 发布 job 仍是唯一有写权限、唯一有发布副作用的 job。

### 最窄验证与非范围

- 验证：`node --check` 改动的脚本和配置（`desktop/electron-builder.config.cjs` 需设置 `AI_NOVEL_RELEASE_CHANNEL=beta` 来绕过签名检查，再 `require` 以读取 publish 配置）；`node --test` 运行 G01a、G01b、G02a、G02b 四份测试；审计 `--strict`。不运行 `stage`、`dist`、`publish`。
- 非范围：appId、productName、数据目录、更新缓存目录名（G02c）；应用内 GitHub 链接 `client/src/components/layout/ProjectGithubLink.tsx`、官网 `site/`、`NOTICE` 上游版权声明（保留）；更新器在 fork 暂无 Release 时的提示行为；签名与真实 Release。

## R1-G02c 桌面身份拆分：appId、productName、数据目录（5 点）

- 状态 / 依赖：Refinement；取值已由 Q1-Q3 确定；依赖 G02b。**必须与 G02d/G02e 同批进入 beta**，否则已有数据的用户升级后会看到空库。
- 用户价值：同时安装上游与本发行版时，两边的小说数据、安装位置和更新缓存完全隔离。
- 文件边界：`desktop/package.json` 的 `productName`/`description`/`author`（不改 `version`）、`desktop/electron-builder.config.cjs` 的 `appId`/`productName`、`desktop/src/main.ts` 的 AUMID 与品牌文案、`desktop/src/runtime/paths.ts`、`server/src/runtime/appPaths.ts`、`stage-desktop.cjs` 更新缓存目录名、审计器 `FORK-DESKTOP-IDENTITY` 与路径单元测试。
- 验收条件：
  1. productName 为 `Biz Novel Studio Next`，appId 与 AUMID 为 `io.github.shown1985.biz-novel-studio-next`，两处数据目录名为 `biz-novel-studio-next`，更新缓存目录为 `biz-novel-studio-next-updater`。
  2. `AI_NOVEL_APP_DATA_DIR` 与 portable 路径优先级不变。
  3. 审计在任一字段回到上游值或两处目录名不一致时报 `BLOCKED`。
- 最窄验证：路径解析单元测试（Windows/macOS/portable/显式覆盖）、`pnpm --filter @ai-novel/desktop typecheck` 与 server 定向 typecheck、审计 `--strict`。UI 验收交给用户。
- 非范围：旧数据复制（G02d/e）、图标重绘、官网与 README 品牌替换。

## R1-G02d 旧数据目录显式复制引导（5 点）

- 状态 / 依赖：Refinement；决定见 Q5；与 G02c 同批。
- 用户价值：已有小说的用户在新应用首次启动时，按一步引导安全带走自己的书，旧数据原样保留。
- 文件边界：`desktop/src/runtime/dataImport.ts`（增加旧目录探测入口，复用已有的备份加复制）、首次启动引导所在的 desktop 主进程与启动页、定向测试。
- 验收条件：
  1. 仅当 `biz-novel-studio-next` 中没有数据库且旧目录 `AI-Novel-Writing-Assistant-v2` 有 `data/dev.db` 时出现引导；默认不复制，必须经用户点击确认。
  2. 复制前完成备份，复制后校验文件存在性和大小，失败时新目录回到空白状态并提示；旧目录中任何文件的 mtime 和内容都不变。
  3. 文案按 UI Copy Rules 面向用户说明两份数据此后独立，不出现“迁回/升级为”之类的过程叙述。
- 最窄验证：临时目录中的单元测试，覆盖有旧库、无旧库、拒绝、复制失败、WAL 组完整性和旧目录只读断言。绝不指向真实用户目录。
- 非范围：双向同步、删除或改名旧目录。

## R1-G02e 旧目录生成图片复制（2 点）

- 状态 / 依赖：Refinement；决定见 Q6；依赖 G02d，同批进入 beta。
- 内容：在用户同意的同一次复制中，把 `storage/generated-images` 一并复制到新目录，并做失败回滚与旧目录只读断言；不复制日志。
- 验证：临时目录单元测试。非范围：图片去重和压缩。

## R1-G02f 品牌与身份取值决定（1 点，PO）

- 状态：**Done**（2026-09-25）。PO 已答复 Q1-Q6，取值写入上文“PO 决定”与第四节。显示名称在 GA 前仍可能更改，更名只影响 G02c 的常量与文案。

## 剩余开放问题

1. GA 之后，本发行版是否保留 beta 预发布通道？如果保留，预发布 tag 如何与严格 `vX.Y.Z` 公开 tag 区分？推荐默认：Release 1 期间 beta workflow 保持只验证（G02b）；GA 后再单独立卡决定。
2. 应用内 GitHub 链接和官网仍指向上游仓库，由谁负责、何时处理？推荐默认：与 G02c 同批另立 1 点小卡，把应用内链接改为本发行版仓库；`NOTICE` 中的上游版权声明保留。

## 依赖与进入 Sprint 规则

```text
R1-G02f 品牌与取值决定（PO，Done）
R1-G02a 版本线与碰撞门（3，S3K）
  └─ R1-G02b 发布/更新目标（3，S3K）
       └─ R1-G02c 身份拆分（5）══ 同批 ══ R1-G02d 旧数据复制引导（5）
                                            └─ R1-G02e 生成图片复制（2）
```

- G02a/G02b 与 G01 共用 workflow 和审计器，必须串行，由同一名工程师持有，一次只做一张卡。
- G02c 与 G02d/e 可由两名 owner 分别实现，但必须同批合入 beta 并联合验收。
- 所有卡只做静态审计和单元测试；包装、签名、打 tag 与上传属于 R1-RC 发布阶段。

## 文档与发布记录判断

本合同只做规划，不改变任何用户可见行为，因此不更新 README 或 release notes。G02a/G02b 改的是内部发布目标与发布门，在 GA 前没有新安装包，也不更新用户发布记录。G02c/d/e 实现后，用户会看到新的应用名称和首次启动引导，届时需要更新发布记录，并把“fork 身份字段与数据目录隔离”的长期规则补入 [桌面版本号与发布标识规则](../wiki/workflows/desktop-release-versioning.md)。
