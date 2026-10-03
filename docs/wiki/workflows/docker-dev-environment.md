# 容器化热更开发环境

## 背景

项目同时有人在 Windows、macOS（Apple Silicon）和 Linux 上开发，依赖里包含 `better-sqlite3`、Prisma 引擎、esbuild 等平台相关的原生模块。直接在本机装依赖时，Node 版本、原生 ABI 和 Windows shell 配置经常导致 `pnpm install` 或服务端启动失败；桌面打包后宿主机原生模块还可能被 Electron ABI 覆盖（见桌面分平台构建边界）。

容器化开发环境的目标是：本机只需要 Docker，源码以挂载方式进入 Linux 容器，保持与 `pnpm dev` 相同的热更体验和端口。

## 决策

- 开发容器只负责运行 `shared` / `server` / `client` 三条现有开发流，不引入新的启动逻辑；后端仍通过 `server/scripts/ensure-dev-prisma.cjs` 做 Prisma generate 与 SQLite 初始化。
- 源码用 bind mount 挂载到 `/app`；所有 `node_modules` 与 pnpm store 放在容器命名卷中。原因：宿主机的 `node_modules` 里是 macOS/Windows 的原生模块，不能在 Linux 容器里运行；反过来容器安装的 Linux 模块也不能污染宿主机。
- 开发数据库固定为命名卷中的 `file:/data/dev.db`，不复用宿主机的 `server/dev.db`。原因：容器首次启动会执行 `prisma db push`，不能在未备份的情况下作用于用户已有的小说数据；同时避免宿主机和容器两个进程同时写同一个 SQLite 文件。
- `api` 服务必须等待 `shared` 的 `tsc --watch` 首次编译完成（就绪标记 `/tmp/shared-ready`）后再启动。原因：首次 watch 编译会重写 `shared/dist`，如果此时后端正在启动，`ts-node-dev` 会在启动中途重启，实测曾出现重启后的进程占满 CPU、始终不监听端口的情况。
- 容器内不设置 `NODE_ENV=development`。原因：`server/src/db/prisma.ts` 在该值下打开 Prisma 查询日志，后台轮询会刷满日志；本机 `pnpm dev` 同样不设置该值，容器需保持一致。
- 前端容器通过 `HOST=api`、`PORT=3000` 让 Vite 开发代理把 `/api` 转发到 `api` 服务，并把 `VITE_API_BASE_URL` 置空，使浏览器统一走同源 `/api`，不受宿主机 `client/.env` 影响。

## 当前规则

- 入口文件：`infra/docker-compose.dev.yml`、`infra/docker/dev.Dockerfile`、`infra/docker/dev-*.sh`；根目录命令 `pnpm docker:dev`、`pnpm docker:dev:down`、`pnpm docker:dev:logs`。
- 服务顺序：`deps`（一次性 `pnpm install`）→ `shared`（watch，就绪后 healthy）→ `api`；`web` 只依赖 `deps`，因为 Vite 通过别名直接读取 `shared` 源码。
- 修改 `docker-compose.dev.yml` 时，不得把宿主机 `server/dev.db` 或宿主机 `node_modules` 挂进容器。
- 文件变更无法触发热更时（常见于 Windows 挂载），使用 `AI_NOVEL_DEV_POLLING=true` 与 `AI_NOVEL_DEV_TSC_WATCHFILE=DynamicPriorityPolling` 切换为轮询，不要修改各包的 `dev` 脚本。
- `down -v` 会删除开发数据库卷。文档与脚本不得把 `down -v` 作为日常停止命令；需要把已有数据带进容器时，先备份再复制到卷中。
- 生产镜像仍使用根目录 `Dockerfile.api` / `Dockerfile.web`，开发镜像不参与发布或桌面打包。

## 示例

- 推荐：`pnpm docker:dev` 启动后修改 `server/src/**`，`api` 日志出现 `Restarting: ... has been modified` 并重新监听；修改 `shared/types/llm.ts`，`shared` 重新编译后 `api` 自动重启；修改 `client/src/**`，Vite 直接推送更新。
- 注意：只包含类型定义的 `shared` 文件（例如 `types/api.ts`）在运行时不会被加载，修改后后端不重启属于正常现象。
- 不推荐：为了“省一次安装”把宿主机 `node_modules` 挂进容器；为了“看到已有数据”直接挂载宿主机 `server/dev.db`。

## 失败模式

- `api` 进程存在但端口不监听、CPU 占满：多为启动过程中被 watch 重启。先 `docker compose -f infra/docker-compose.dev.yml restart api`；如果反复出现，检查是否有外部进程在持续改写 `shared/dist` 或 `server/src`。
- `deps` 失败：查看 `docker compose ... logs deps`，通常是 `pnpm-lock.yaml` 与 `package.json` 不一致（`--frozen-lockfile`）或网络无法访问 npm registry。
- 构建开发镜像时 apt 失败：本机网络无法访问 Debian 软件源，需要配置代理或镜像源；这一步只用于在缺少预编译包时编译原生模块。
- 修改后不热更：先确认使用了轮询变量；再确认修改的文件确实在运行时被加载。

## 相关模块

- `infra/docker-compose.dev.yml`
- `infra/docker/dev.Dockerfile`、`infra/docker/dev-bootstrap.sh`、`infra/docker/dev-shared.sh`、`infra/docker/dev-api.sh`
- `server/scripts/ensure-dev-prisma.cjs`
- `server/src/db/prisma.ts`
- `client/vite.config.ts`（开发代理目标解析）

## 来源文档

- 桌面客户端分平台构建边界：`./desktop-cross-platform-build.md`
